import logging
import os
import json
import shutil
import subprocess
from pathlib import Path

from celery import shared_task
from django.db.models import F
from django.utils import timezone

from .models import SubmissionAttempt, TestResult
from .services import (
    execute_code,
    update_gradebook,
    award_assignment_points,
    SubmissionConfigGenerator,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helper: resolve the Autograder_plus python binary (prefers venv)
# ---------------------------------------------------------------------------

def _resolve_python_bin(autograder_plus_root: Path) -> str:
    """
    Return the python executable to use for Autograder_plus.
    Priority:
      1. venv at <root>/newgrade/bin/python
      2. system python3
    A quick --version probe ensures the interpreter actually works.
    """
    venv_python = autograder_plus_root / "newgrade" / "bin" / "python"
    candidate = str(venv_python) if venv_python.exists() else "python3"

    try:
        subprocess.run(
            [candidate, "--version"],
            capture_output=True,
            timeout=5,
            check=True,
        )
        return candidate
    except (OSError, subprocess.TimeoutExpired, subprocess.CalledProcessError) as exc:
        logger.warning(
            f"Autograder_plus venv python failed ({exc}), falling back to python3. "
            "Recreate the venv: cd Autograder_plus && python3 -m venv newgrade && "
            "newgrade/bin/pip install -r requirements.txt"
        )
        return "python3"


# ---------------------------------------------------------------------------
# Regular code-execution task (unchanged logic, kept here for completeness)
# ---------------------------------------------------------------------------

@shared_task
def execute_submission_task(attempt_id, language="python"):
    """
    Background task to execute student code.
    Ensures terminal status updates via robust try/except/finally block.
    """
    attempt = None
    try:
        attempt = SubmissionAttempt.objects.get(id=attempt_id)
        attempt.status = "processing"
        attempt.save(update_fields=["status"])

        logger.info(f"--- [TASK START] Submission {attempt_id} for {attempt.student.username} ---")

        aq = attempt.assignment_question
        question = aq.question
        config = question.config or {}
        test_cases = question.test_cases or []
        code = attempt.source_code

        logger.info(f"[{attempt_id}] Executing {language} code in sandbox...")
        results = execute_code(code, language, test_cases, config=config)
        logger.info(f"[{attempt_id}] Sandbox execution finished.")

        passed_count = 0
        test_results_data = []
        attempt.test_results.all().delete()

        for idx, res in enumerate(results):
            status_res = res.get("status", "fail")
            if status_res == "pass":
                passed_count += 1

            test_result = TestResult.objects.create(
                attempt=attempt,
                test_case_id=str(idx),
                status=status_res,
                score=1 if status_res == "pass" else 0,
                actual_output=res.get("console_output", ""),
                error_message=res.get("error_message", ""),
                execution_time_ms=res.get("execution_time", 0),
            )
            test_results_data.append({"status": status_res, "score": test_result.score})

        attempt.status = "success" if results and passed_count == len(results) else "fail"

        try:
            award_assignment_points(attempt, test_results_data)
        except Exception as exc:
            logger.error(f"[{attempt_id}] Points failed: {exc}")

        try:
            artifact_path = SubmissionConfigGenerator.save_artifacts(attempt, language)
            attempt.code_blob_ref = artifact_path
        except Exception as exc:
            logger.error(f"[{attempt_id}] Artifacts failed: {exc}")

        try:
            update_gradebook(attempt.student, aq.assignment)
        except Exception as exc:
            logger.error(f"[{attempt_id}] Gradebook failed: {exc}")

        return attempt.status

    except SubmissionAttempt.DoesNotExist:
        logger.error(f"SubmissionAttempt {attempt_id} not found in DB")
        return "not_found"
    except Exception as exc:
        logger.error(f"--- [TASK CRASHED] {attempt_id}: {exc} ---", exc_info=True)
        if attempt:
            attempt.status = "error"
        return "error"
    finally:
        if attempt:
            attempt.save()
            logger.info(f"--- [TASK END] {attempt_id}: status={attempt.status} ---")


# ---------------------------------------------------------------------------
# MASTER TASK — splits work per-question and spawns one worker per question
# ---------------------------------------------------------------------------

def _ai_question_is_complete(aq):
    """A question is 'done' when every student's latest attempt already has
    ai_analysis_data. Used to resume a stopped run without re-analyzing it.
    Returns (is_complete, latest_attempt_ids)."""
    latest_ids = list(
        SubmissionAttempt.objects
        .filter(assignment_question=aq)
        .order_by("student_id", "-created_at")
        .distinct("student_id")
        .values_list("id", flat=True)
    )
    if not latest_ids:
        return False, []
    missing = (
        SubmissionAttempt.objects
        .filter(id__in=latest_ids, ai_analysis_data__isnull=True)
        .exists()
    )
    return (not missing), latest_ids


@shared_task(bind=True)
def analyze_assignment_ai_task(self, assignment_id, ai_task_id, resume=True):
    """
    MASTER TASK: For each question in the assignment, collects the latest
    submission from every student and dispatches a single `analyze_question_ai_task`
    worker.  One worker = one question = one pipeline run (the heavy model is
    loaded only once per question batch).

    When ``resume`` is True (the default), questions that are already fully
    analyzed (every latest attempt has ai_analysis_data) are skipped, so a
    stopped/failed run continues from the last unfinished question instead of
    restarting the whole assignment. Force-restart passes resume=False.
    """
    from django.conf import settings
    from assignments.models import Assignment
    from .models import AIAnalysisTask

    def _log(msg: str):
        logger.info(msg)
        _append_logs_to_task(ai_task_id, [msg])

    try:
        assignment = Assignment.objects.get(id=assignment_id)
        ai_task = AIAnalysisTask.objects.get(id=ai_task_id)
        ai_task.status = "running"
        ai_task.save(update_fields=["status"])

        _log(f"[MASTER] Starting analysis for assignment: {assignment.title} "
             f"({'resume' if resume else 'full restart'})")

        autograder_plus_root = Path(settings.BASE_DIR).parent.parent / "Autograder_plus"
        main_script = str(autograder_plus_root / "main.py")
        python_bin = _resolve_python_bin(autograder_plus_root)

        question_task_ids = []
        total_questions = 0
        already_done = 0

        for aq in assignment.assignmentquestion_set.select_related("question"):
            question = aq.question

            is_complete, attempt_ids = _ai_question_is_complete(aq)

            if not attempt_ids:
                _log(f"[MASTER] Skipping question '{question.slug}' (no submissions).")
                continue

            # Resume: skip questions already fully analyzed from a prior run.
            if resume and is_complete:
                already_done += 1
                total_questions += 1
                _log(f"[MASTER] Resume — '{question.slug}' already analyzed, skipping.")
                continue

            # Build the config that Autograder_plus expects — use question.config directly.
            q_config = question.config or {}
            pipeline_config = {
                "assignment_id": f"{assignment_id}_{question.slug}",
                "language": q_config.get("language", "python").lower(),
                "question": question.description,
                "test_cases": question.test_cases or [],
                **q_config,
            }

            staging_dir = str(
                Path(settings.MEDIA_ROOT) / "ai_staging" / str(assignment_id) / question.slug
            )

            task = analyze_question_ai_task.apply_async(
                kwargs=dict(
                    assignment_id=str(assignment_id),
                    ai_task_id=str(ai_task_id),
                    attempt_ids=[str(x) for x in attempt_ids],
                    pipeline_config=pipeline_config,
                    staging_dir=staging_dir,
                    python_bin=python_bin,
                    main_script=main_script,
                    question_slug=question.slug,
                ),
                queue="ai_analysis",
            )
            question_task_ids.append(task.id)
            total_questions += 1
            _log(f"[MASTER] Dispatched worker for question: {question.slug}")

        # Update task record with totals. Questions skipped as already-complete
        # (resume) are pre-counted into completed_batches, since no worker will
        # run for them.
        ai_task.task_ids = question_task_ids
        ai_task.total_batches = total_questions
        ai_task.completed_batches = already_done
        ai_task.total_submissions = SubmissionAttempt.objects.filter(
            assignment_question__assignment_id=assignment_id
        ).count()
        ai_task.save(update_fields=["task_ids", "total_batches",
                                    "completed_batches", "total_submissions"])

        dispatched = len(question_task_ids)
        if total_questions == 0:
            ai_task.status = "completed"
            ai_task.save(update_fields=["status"])
            _log(f"[MASTER] Completed (no submissions found).")
        elif dispatched == 0:
            # Everything was already analyzed — nothing to dispatch, so finish now.
            ai_task.status = "completed"
            ai_task.save(update_fields=["status"])
            _log(f"[MASTER] Resume — all {already_done} question(s) already analyzed. Done.")
        else:
            _log(f"[MASTER] Dispatched {dispatched} worker(s); "
                 f"{already_done} already complete.")

        return f"Spawned {dispatched} question workers ({already_done} skipped)"

    except Exception as exc:
        logger.error(f"[MASTER] Failed for {assignment_id}: {exc}", exc_info=True)
        try:
            ai_task = AIAnalysisTask.objects.get(id=ai_task_id)
            ai_task.status = "failed"
            ai_task.error_message = str(exc)
            ai_task.save(update_fields=["status", "error_message"])
        except Exception:
            pass
        return "failed"


# ---------------------------------------------------------------------------
# QUESTION WORKER — stages files, runs pipeline once, persists results
# ---------------------------------------------------------------------------

@shared_task
def analyze_question_ai_task(
    assignment_id,
    ai_task_id,
    attempt_ids,
    pipeline_config,
    staging_dir,
    python_bin,
    main_script,
    question_slug,
):
    """
    WORKER TASK: Runs the Autograder+ pipeline for all submissions of ONE question.
    - Stages student files under <staging_dir>/submissions/<username>/
    - Writes a single config.json (built directly from the DB question config)
    - Invokes Autograder+ once (with the newgrade venv python)
    - Reads results.json and bulk-updates SubmissionAttempt.ai_analysis_data
    """
    from .models import AIAnalysisTask

    import time
    staging_path = Path(staging_dir)
    log_lines = []  # collected for the admin UI
    saved_count = 0  # must be initialized before try so finally can always read it
    result = None

    def _log(msg: str, flush=False):
        """Log to Django logger AND accumulate for DB."""
        logger.info(msg)
        log_lines.append(msg)
        if flush:
            _append_logs_to_task(ai_task_id, [msg])

    try:
        # ── Cancellation guard ─────────────────────────────────────────────
        ai_task = AIAnalysisTask.objects.get(id=ai_task_id)
        if ai_task.status == "cancelled":
            _log(f"[{question_slug}] Skipped — task was cancelled.", flush=True)
            return "cancelled"

        # ── Language / file naming ─────────────────────────────────────────
        language = pipeline_config.get("language", "python").lower()
        ext_map = {"python": ".py", "c": ".c", "java": ".java"}
        target_ext = ext_map.get(language, ".py")
        target_filename = "Main.java" if language == "java" else f"main{target_ext}"

        # ── Set up clean staging directory ─────────────────────────────────
        if staging_path.exists():
            shutil.rmtree(staging_path, ignore_errors=True)
        staging_path.mkdir(parents=True, exist_ok=True)
        submissions_dir = staging_path / "submissions"
        submissions_dir.mkdir()

        # ── Write student submission files ─────────────────────────────────
        attempts = (
            SubmissionAttempt.objects
            .filter(id__in=attempt_ids)
            .select_related("student")
        )
        id_to_attempt = {str(a.id): a for a in attempts}

        for attempt_id in attempt_ids:
            attempt = id_to_attempt.get(attempt_id)
            if not attempt:
                continue
            student_dir = submissions_dir / attempt.student.username
            student_dir.mkdir(exist_ok=True)
            (student_dir / target_filename).write_text(attempt.source_code or "")

        staged_count = len([a for a in id_to_attempt.values()])
        _log(f"[{question_slug}] Staged {staged_count} submissions.", flush=True)

        # ── Write config.json (from DB — no manual re-mapping) ────────────
        config_path = staging_path / "config.json"
        config_path.write_text(json.dumps(pipeline_config, indent=2))

        # ── Build and run the pipeline subprocess ─────────────────────────
        output_dir = staging_path / "reports"
        output_dir.mkdir(exist_ok=True)

        base_timeout = int(os.environ.get("AI_TIMEOUT_SECONDS", "900"))
        ai_timeout = max(base_timeout, len(attempt_ids) * 60)

        mem_limit_mb = int(os.environ.get("AI_MEMORY_LIMIT_MB", "0"))

        def _limit_memory():
            if mem_limit_mb > 0:
                import resource
                limit = mem_limit_mb * 1024 * 1024
                resource.setrlimit(resource.RLIMIT_AS, (limit, limit))

        cmd = [
            python_bin, main_script, "grade",
            "--assignment-config", str(config_path),
            "--submissions-dir", str(submissions_dir),
            "--output-dir", str(output_dir),
            "--level", "full",
        ]

        _log(f"[{question_slug}] Starting pipeline process...", flush=True)

        subprocess_env = os.environ.copy()
        subprocess_env["PYTORCH_CUDA_ALLOC_CONF"] = os.environ.get(
            "PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True"
        )
        subprocess_env["PYTHONUNBUFFERED"] = "1"  # Ensure real-time output

        try:
            # Popen allows us to read output line-by-line while process is running
            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                preexec_fn=_limit_memory if mem_limit_mb > 0 else None,
                cwd=str(Path(main_script).parent),
                env=subprocess_env,
                bufsize=1,  # Line buffered
            )

            import select
            start_time = time.time()
            full_stdout = []
            full_stderr = []

            # We use select for non-blocking read from both stdout and stderr
            while True:
                reads = [process.stdout, process.stderr]
                ret = select.select(reads, [], [], 1.0)

                # Check for timeout manually during the loop
                if time.time() - start_time > ai_timeout:
                    process.terminate()
                    _log(f"[{question_slug}] TIMEOUT — exceeded {ai_timeout}s. Terminating.", flush=True)
                    break

                for fd in ret[0]:
                    line = fd.readline()
                    if line:
                        clean_line = line.strip()
                        _log(f"  {clean_line}", flush=True)
                        if fd == process.stdout:
                            full_stdout.append(line)
                        else:
                            full_stderr.append(line)

                if process.poll() is not None:
                    # Final read of remaining output
                    for line in process.stdout:
                        _log(f"  {line.strip()}", flush=True)
                        full_stdout.append(line)
                    for line in process.stderr:
                        _log(f"  {line.strip()}", flush=True)
                        full_stderr.append(line)
                    break

            # Create a mock result object for downstream consistency
            class MockResult:
                def __init__(self, returncode, stdout, stderr):
                    self.returncode = returncode
                    self.stdout = "".join(stdout)
                    self.stderr = "".join(stderr)
            
            result = MockResult(process.returncode, full_stdout, full_stderr)

        except OSError as oserr:
            _log(
                f"[{question_slug}] OSError launching subprocess: {oserr}. "
                "If 'bad interpreter' — recreate venv: cd Autograder_plus && "
                "python3 -m venv newgrade && newgrade/bin/pip install -r requirements.txt",
                flush=True
            )
            result = None
        # ── Parse and persist results ──────────────────────────────────────
        if result is not None:
            if result.returncode != 0:
                _log(
                    f"[{question_slug}] Pipeline exited with code {result.returncode}. "
                    f"stderr: {result.stderr[:800]}"
                )
            else:
                # Capture pipeline stdout for admin viewer
                if result.stdout:
                    for line in result.stdout.splitlines():
                        _log(f"  {line}")

                results_file = output_dir / "results.json"
                if results_file.exists():
                    results_data = json.loads(results_file.read_text())

                    # Bulk update using a mapping for efficiency
                    update_map = {
                        item["student_id"]: item.get("analysis", {})
                        for item in results_data
                        if item.get("student_id")
                    }
                    if item_error := {
                        item["student_id"]: item["error_processing"]
                        for item in results_data
                        if item.get("error_processing") and item.get("student_id")
                    }:
                        for sid, err in item_error.items():
                            if sid in update_map:
                                update_map[sid]["error"] = err

                    for attempt in attempts:
                        uname = attempt.student.username
                        if uname in update_map:
                            attempt.ai_analysis_data = update_map[uname]
                            attempt.save(update_fields=["ai_analysis_data"])
                            saved_count += 1

                    _log(f"[{question_slug}] Saved {saved_count}/{len(attempt_ids)} results to DB.")
                else:
                    _log(
                        f"[{question_slug}] results.json not found in {output_dir}. "
                        "Pipeline ran but produced no output — check Autograder_plus logs."
                    )

                # Persist the interactive UMAP HTML plot if generated
                try:
                    from django.conf import settings
                    from django.utils.text import slugify
                    from assignments.models import AssignmentQuestion, Assignment

                    assignment = Assignment.objects.select_related('module__class_obj').get(id=assignment_id)
                    class_obj = assignment.module.class_obj
                    
                    class_slug = slugify(class_obj.name)
                    assignment_slug = slugify(assignment.title)
                    
                    # Persistent location: MEDIA_ROOT/ai_reports/<class_slug>/<assignment_slug>/<question_slug>_umap.html
                    reports_dir = Path(settings.MEDIA_ROOT) / "ai_reports" / class_slug / assignment_slug
                    reports_dir.mkdir(parents=True, exist_ok=True)
                    
                    # Search for the interactive output (usually interactive_embeddings_*.html)
                    html_files = list(output_dir.glob("*.html"))
                    # Filter for the one that looks like a UMAP/embedding plot
                    plot_files = [f for f in html_files if "embedding" in f.name or "umap" in f.name or "tsne" in f.name]
                    
                    if plot_files:
                        html_src = plot_files[0]
                        html_dest = reports_dir / f"{question_slug}_umap.html"
                        _log(f"[{question_slug}] Found UMAP plot at {html_src}. Copying to {html_dest}...")
                        shutil.copy2(html_src, html_dest)
                        
                        relative_url = f"/media/ai_reports/{class_slug}/{assignment_slug}/{html_dest.name}"
                        _log(f"[{question_slug}] Successfully saved interactive map and updated relative_url to {relative_url}")
                        
                        # Update the specific AssignmentQuestion record
                        updated = AssignmentQuestion.objects.filter(
                            assignment_id=assignment_id,
                            question__slug=question_slug
                        ).update(umap_url=relative_url)
                        
                        if updated == 0:
                            _log(f"[{question_slug}] WARNING: UMAP saved to file but DB update failed (AQ record not found for assignment={assignment_id}, question_slug={question_slug}).")
                    else:
                        _log(f"[{question_slug}] No UMAP plot found in {output_dir}. Total HTML files searched: {len(html_files)}. Checked names: {[f.name for f in html_files]}")

                except Exception as eval_exc:
                    _log(f"[{question_slug}] ERROR: Failed to persist interactive map: {eval_exc}")
                    logger.error(f"[{question_slug}] UMAP Save Error: {eval_exc}", exc_info=True)

        if saved_count == 0 and result is not None and result.returncode == 0:
            _log(f"[{question_slug}] WARNING: saved_count=0 despite successful run.")

    except Exception as exc:
        logger.error(f"[{question_slug}] Worker crashed: {exc}", exc_info=True)
        _log(f"[{question_slug}] CRASH: {exc}")
    finally:
        # ── Always update progress + append logs ──────────────────────────
        try:
            AIAnalysisTask.objects.filter(id=ai_task_id).update(
                completed_batches=F("completed_batches") + 1,
                analyzed=F("analyzed") + saved_count,
            )

            # Append logs to the JSONField so admin UI can display them
            _append_logs_to_task(ai_task_id, log_lines)

            # Check if all question workers have finished
            ai_task.refresh_from_db()
            if (
                ai_task.completed_batches >= ai_task.total_batches
                and ai_task.status == "running"
            ):
                ai_task.status = "completed"
                ai_task.save(update_fields=["status"])
                logger.info(f"[{question_slug}] All question workers done — marked completed.")

        except Exception as db_exc:
            logger.error(f"[{question_slug}] DB update in finally block failed: {db_exc}")

        # ── Clean up staging directory ─────────────────────────────────────
        shutil.rmtree(staging_path, ignore_errors=True)


# ---------------------------------------------------------------------------
# Helper: append log lines atomically using a PostgreSQL array append
# ---------------------------------------------------------------------------

def _append_logs_to_task(ai_task_id: str, lines: list[str]):
    """
    Appends log_lines to AIAnalysisTask.log_output using a PostgreSQL
    JSONField array concat so concurrent workers don't overwrite each other.
    Falls back to a read-modify-write if the DB doesn't support the shorthand.
    """
    from .models import AIAnalysisTask
    from django.db.models.expressions import RawSQL

    if not lines:
        return

    try:
        # PostgreSQL-specific: concatenate arrays at DB level
        # Use COALESCE to handle NULL initial log_output
        AIAnalysisTask.objects.filter(id=ai_task_id).update(
            log_output=RawSQL(
                "COALESCE(log_output, '[]'::jsonb) || %s::jsonb",
                [json.dumps(lines)],
            )
        )
    except Exception:
        # Fallback for non-Postgres or any error
        try:
            task = AIAnalysisTask.objects.get(id=ai_task_id)
            new_logs = (task.log_output or []) + lines
            task.log_output = new_logs[-10000:] # Keep last 10k lines
            task.save(update_fields=["log_output"])
        except Exception as exc:
            logger.warning(f"Could not append logs to task {ai_task_id}: {exc}")


# ---------------------------------------------------------------------------
# Ensure cluster grading tasks are registered with Celery.
# autodiscover_tasks() only imports each app's tasks.py, so importing the
# cluster_tasks module here makes its @shared_task functions discoverable.
# ---------------------------------------------------------------------------
from . import cluster_tasks  # noqa: E402,F401

