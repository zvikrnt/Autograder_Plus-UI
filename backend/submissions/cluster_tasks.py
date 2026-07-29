"""
Cluster-assisted grading tasks.

This mirrors the Autograder+ AI-analysis flow in ``submissions/tasks.py`` but,
instead of producing per-student AI tags, it runs
``Autograder_plus/cluster_grade.py`` to group students into behavior-aware
clusters. One representative per SAFE cluster is graded and the mark propagates
to every member of that cluster.

Flow (all on the ``ai_analysis`` Celery queue, concurrency=1 → sequential GPU):
    run_cluster_grading_task (MASTER)
        └── for each question → cluster_grade_question_task (WORKER)
                stages submissions, runs cluster_grade.py, parses
                cluster_info_<slug>.csv + metadata, stores results, copies the
                interactive Plotly HTML into MEDIA for iframe embedding.
"""

import csv
import json
import logging
import os
import shutil
import subprocess
import time
from pathlib import Path

from celery import shared_task
from django.db.models import F

from .models import SubmissionAttempt
from .tasks import _resolve_python_bin

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Log helper (JSONField array append, Postgres-friendly with fallback)
# ---------------------------------------------------------------------------

def _append_cluster_logs(task_id: str, lines: list) -> None:
    from .models import ClusterGradingTask
    from django.db.models.expressions import RawSQL

    if not lines:
        return
    try:
        ClusterGradingTask.objects.filter(id=task_id).update(
            log_output=RawSQL(
                "COALESCE(log_output, '[]'::jsonb) || %s::jsonb",
                [json.dumps(lines)],
            )
        )
    except Exception:
        try:
            task = ClusterGradingTask.objects.get(id=task_id)
            task.log_output = ((task.log_output or []) + lines)[-10000:]
            task.save(update_fields=["log_output"])
        except Exception as exc:
            logger.warning(f"Could not append cluster logs to task {task_id}: {exc}")


# ---------------------------------------------------------------------------
# CSV → structured clusters + insights
# ---------------------------------------------------------------------------

SAFE_SAFETIES = {"SAFE", "SAFE_SINGLETON"}


def _to_float(value, default=None):
    try:
        if value is None or value == "":
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _parse_cluster_csv(csv_path: Path) -> list:
    """Parse cluster_info_<slug>.csv into a list of cluster dicts with members."""
    if not csv_path.exists():
        return []

    rows = []
    with csv_path.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append(row)

    if not rows:
        return []

    clusters = {}
    for row in rows:
        cid = row.get("cluster_id")
        if cid is None or cid == "":
            continue
        try:
            cid = int(float(cid))
        except (TypeError, ValueError):
            continue

        member = {
            "student_id": row.get("student_id", ""),
            "pass_percentage": _to_float(row.get("pass_percentage"), 0.0),
            "status_tier": row.get("status_tier", ""),
            "is_representative": str(row.get("needs_representative_grading", "")).strip().lower()
            in ("true", "1", "yes"),
            "signature_similarity": _to_float(row.get("signature_similarity_to_representative")),
            "distance_to_representative": _to_float(row.get("distance_to_representative")),
        }

        if cid not in clusters:
            clusters[cid] = {
                "cluster_id": cid,
                "size": int(_to_float(row.get("cluster_size"), 0) or 0),
                "safety": row.get("cluster_safety", ""),
                "unsafe_reason": row.get("unsafe_reason", ""),
                "recommended_action": row.get("recommended_action", ""),
                "avg_pass_percentage": _to_float(row.get("cluster_avg_pass_percentage"), 0.0),
                "min_pass_percentage": _to_float(row.get("cluster_min_pass_percentage"), 0.0),
                "max_pass_percentage": _to_float(row.get("cluster_max_pass_percentage"), 0.0),
                "score_range": _to_float(row.get("cluster_score_range"), 0.0),
                "num_unique_behavior_signatures": int(
                    _to_float(row.get("num_unique_behavior_signatures"), 1) or 1
                ),
                "representative_student_id": row.get("representative_student_id", ""),
                "representative_pass_percentage": _to_float(
                    row.get("representative_pass_percentage"), 0.0
                ),
                "failed_test_signature": row.get("failed_test_signature", ""),
                # Engine's suggested grade (percentage). Teacher can override.
                "proposed_grade": _to_float(row.get("proposed_cluster_grade_percentage")),
                # cluster_grade_percentage is blank for UNSAFE clusters by design.
                "cluster_grade": _to_float(row.get("cluster_grade_percentage")),
                "members": [],
            }
        clusters[cid]["members"].append(member)

    # Stable ordering: SAFE first, then by size desc, then id.
    ordered = sorted(
        clusters.values(),
        key=lambda c: (c["safety"] not in SAFE_SAFETIES, -c["size"], c["cluster_id"]),
    )
    return ordered


def _build_insights(clusters: list, total_students: int) -> dict:
    num_clusters = len(clusters)
    num_safe = sum(1 for c in clusters if c["safety"] in SAFE_SAFETIES)
    num_unsafe = num_clusters - num_safe
    num_singletons = sum(1 for c in clusters if c["safety"] == "SAFE_SINGLETON")

    # Workload reduction: normally you grade `total_students` submissions.
    # With cluster grading you grade one representative per SAFE non-singleton
    # cluster + every member of UNSAFE clusters + every singleton.
    reps_to_grade = 0
    for c in clusters:
        if c["safety"] == "SAFE":
            reps_to_grade += 1                 # grade one representative
        else:
            reps_to_grade += c["size"]         # grade each member individually

    workload_reduction = 0.0
    if total_students > 0:
        workload_reduction = round((1 - reps_to_grade / total_students) * 100, 1)

    largest = max((c["size"] for c in clusters), default=0)

    return {
        "num_clusters": num_clusters,
        "num_safe": num_safe,
        "num_unsafe": num_unsafe,
        "num_singletons": num_singletons,
        "total_students": total_students,
        "submissions_to_grade": reps_to_grade,
        "workload_reduction_percent": max(workload_reduction, 0.0),
        "largest_cluster_size": largest,
    }


# ---------------------------------------------------------------------------
# WORKER — one question: stage → run cluster_grade.py → parse → persist
# ---------------------------------------------------------------------------

@shared_task
def cluster_grade_question_task(
    assignment_id,
    task_id,
    attempt_ids,
    pipeline_config,
    staging_dir,
    python_bin,
    cluster_script,
    question_slug,
    question_id,
    question_title,
    config_options,
):
    from django.conf import settings
    from django.utils.text import slugify
    from assignments.models import Assignment
    from .models import ClusterGradingTask

    staging_path = Path(staging_dir)
    log_lines = []
    analyzed_count = 0

    def _log(msg, flush=False):
        logger.info(msg)
        log_lines.append(msg)
        if flush:
            _append_cluster_logs(task_id, [msg])

    try:
        cg_task = ClusterGradingTask.objects.get(id=task_id)
        if cg_task.status == "cancelled":
            _log(f"[{question_slug}] Skipped — task cancelled.", flush=True)
            return "cancelled"

        # ── Language / filenames ───────────────────────────────────────────
        language = str(pipeline_config.get("language", "python")).lower()
        ext_map = {"python": ".py", "c": ".c", "java": ".java"}
        target_filename = "Main.java" if language == "java" else f"main{ext_map.get(language, '.py')}"

        # ── Clean staging ──────────────────────────────────────────────────
        if staging_path.exists():
            shutil.rmtree(staging_path, ignore_errors=True)
        staging_path.mkdir(parents=True, exist_ok=True)
        submissions_dir = staging_path / "submissions"
        submissions_dir.mkdir()

        attempts = (
            SubmissionAttempt.objects.filter(id__in=attempt_ids).select_related("student")
        )
        id_to_attempt = {str(a.id): a for a in attempts}
        for aid in attempt_ids:
            attempt = id_to_attempt.get(aid)
            if not attempt:
                continue
            student_dir = submissions_dir / attempt.student.username
            student_dir.mkdir(exist_ok=True)
            (student_dir / target_filename).write_text(attempt.source_code or "")

        _log(f"[{question_slug}] Staged {len(id_to_attempt)} submissions.", flush=True)

        # ── config.json for the Ingestor ───────────────────────────────────
        config_path = staging_path / "config.json"
        config_path.write_text(json.dumps(pipeline_config, indent=2))

        output_dir = staging_path / "reports"
        output_dir.mkdir(exist_ok=True)

        # ── Build cluster_grade.py command ─────────────────────────────────
        opts = config_options or {}
        cmd = [
            python_bin, cluster_script,
            "--assignment-config", str(config_path),
            "--submissions-dir", str(submissions_dir),
            "--output-dir", str(output_dir),
            "--level", str(opts.get("level", "embedding")),
            "--method", str(opts.get("method", "agglomerative")),
            "--distance-threshold", str(opts.get("distance_threshold", 0.55)),
            "--plot-reducer", str(opts.get("plot_reducer", "umap")),
            "--grade-strategy", str(opts.get("grade_strategy", "representative_score")),
        ]
        if opts.get("n_clusters"):
            cmd += ["--n-clusters", str(opts["n_clusters"])]

        _log(f"[{question_slug}] Running cluster grading pipeline...", flush=True)

        base_timeout = int(os.environ.get("CLUSTER_TIMEOUT_SECONDS", "900"))
        cluster_timeout = max(base_timeout, len(attempt_ids) * 60)

        subprocess_env = os.environ.copy()
        subprocess_env["PYTORCH_CUDA_ALLOC_CONF"] = os.environ.get(
            "PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True"
        )
        subprocess_env["PYTHONUNBUFFERED"] = "1"

        returncode = None
        stderr_tail = ""
        try:
            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                cwd=str(Path(cluster_script).parent),
                env=subprocess_env,
                bufsize=1,
            )
            import select
            start_time = time.time()
            stderr_lines = []
            while True:
                ret = select.select([process.stdout, process.stderr], [], [], 1.0)
                if time.time() - start_time > cluster_timeout:
                    process.terminate()
                    _log(f"[{question_slug}] TIMEOUT after {cluster_timeout}s.", flush=True)
                    break
                for fd in ret[0]:
                    line = fd.readline()
                    if line:
                        _log(f"  {line.strip()}", flush=True)
                        if fd is process.stderr:
                            stderr_lines.append(line)
                if process.poll() is not None:
                    for line in process.stdout:
                        _log(f"  {line.strip()}", flush=True)
                    for line in process.stderr:
                        _log(f"  {line.strip()}", flush=True)
                        stderr_lines.append(line)
                    break
            returncode = process.returncode
            stderr_tail = "".join(stderr_lines)[-800:]
        except OSError as oserr:
            _log(
                f"[{question_slug}] OSError launching cluster_grade.py: {oserr}. "
                "If 'bad interpreter' — recreate venv: cd Autograder_plus && "
                "python3 -m venv newgrade && newgrade/bin/pip install -r requirements.txt",
                flush=True,
            )
            returncode = -1

        # ── Parse output ───────────────────────────────────────────────────
        if returncode not in (0, None):
            _log(f"[{question_slug}] Pipeline exited with code {returncode}. stderr: {stderr_tail}", flush=True)

        # cluster_grade.py sanitizes the assignment_id into the filename.
        safe_id = "".join(
            ch if ch.isalnum() or ch in ("-", "_") else "_"
            for ch in str(pipeline_config.get("assignment_id", question_slug))
        ).strip("_") or "unknown_assignment"

        csv_path = output_dir / f"cluster_info_{safe_id}.csv"
        html_path = output_dir / f"cluster_map_{safe_id}.html"

        clusters = _parse_cluster_csv(csv_path)
        analyzed_count = sum(len(c["members"]) for c in clusters)
        insights = _build_insights(clusters, total_students=len(id_to_attempt))

        # ── Persist interactive HTML plot for iframe embedding ─────────────
        plot_url = ""
        try:
            assignment = Assignment.objects.select_related("module__class_obj").get(id=assignment_id)
            class_slug = slugify(assignment.module.class_obj.name)
            assignment_slug = slugify(assignment.title)
            reports_dir = Path(settings.MEDIA_ROOT) / "cluster_reports" / class_slug / assignment_slug
            reports_dir.mkdir(parents=True, exist_ok=True)
            if html_path.exists():
                dest = reports_dir / f"{question_slug}_cluster_map.html"
                shutil.copy2(html_path, dest)
                plot_url = f"/media/cluster_reports/{class_slug}/{assignment_slug}/{dest.name}"
                _log(f"[{question_slug}] Saved cluster map → {plot_url}", flush=True)
            else:
                _log(f"[{question_slug}] No cluster_map HTML produced (need ≥2 submissions with embeddings).", flush=True)
        except Exception as exc:
            _log(f"[{question_slug}] Failed to persist cluster map: {exc}", flush=True)

        # ── Store results on the task (merge into results JSON) ────────────
        question_result = {
            "question_id": str(question_id),
            "question_title": question_title,
            "question_slug": question_slug,
            "plot_url": plot_url,
            "clusters": clusters,
            "insights": insights,
            "config": opts,
        }
        # Read-modify-write of the results dict under the question slug key.
        cg_task.refresh_from_db()
        results = cg_task.results or {}
        results[question_slug] = question_result
        cg_task.results = results
        cg_task.save(update_fields=["results"])

        _log(
            f"[{question_slug}] Built {len(clusters)} clusters "
            f"({insights['num_safe']} safe / {insights['num_unsafe']} unsafe), "
            f"~{insights['workload_reduction_percent']}% workload reduction.",
            flush=True,
        )

    except Exception as exc:
        logger.error(f"[{question_slug}] Cluster worker crashed: {exc}", exc_info=True)
        _log(f"[{question_slug}] CRASH: {exc}")
    finally:
        try:
            from .models import ClusterGradingTask
            ClusterGradingTask.objects.filter(id=task_id).update(
                completed_batches=F("completed_batches") + 1,
                analyzed=F("analyzed") + analyzed_count,
            )
            _append_cluster_logs(task_id, log_lines)

            cg_task = ClusterGradingTask.objects.get(id=task_id)
            if cg_task.completed_batches >= cg_task.total_batches and cg_task.status == "running":
                cg_task.status = "completed"
                cg_task.save(update_fields=["status"])
                logger.info(f"[{question_slug}] All cluster workers done — completed.")
        except Exception as db_exc:
            logger.error(f"[{question_slug}] Cluster finally-block DB update failed: {db_exc}")

        shutil.rmtree(staging_path, ignore_errors=True)


# ---------------------------------------------------------------------------
# MASTER — dispatch one worker per question
# ---------------------------------------------------------------------------

@shared_task(bind=True)
def run_cluster_grading_task(self, assignment_id, task_id, config_options=None, resume=True):
    """MASTER: dispatch one cluster worker per question.

    When ``resume`` is True (default), results from the most recent prior run
    are carried forward and questions already clustered are skipped, so a
    stopped run continues from the last unfinished question. Force-restart
    passes resume=False.
    """
    from django.conf import settings
    from assignments.models import Assignment
    from .models import ClusterGradingTask

    def _log(msg):
        logger.info(msg)
        _append_cluster_logs(task_id, [msg])

    try:
        assignment = Assignment.objects.get(id=assignment_id)
        cg_task = ClusterGradingTask.objects.get(id=task_id)
        cg_task.status = "running"

        # Resume: carry forward results from the latest prior task so already
        # clustered questions can be skipped.
        carried = {}
        if resume:
            prior = (
                ClusterGradingTask.objects
                .filter(assignment_id=assignment_id)
                .exclude(id=task_id)
                .exclude(results={})
                .order_by("-created_at")
                .first()
            )
            if prior and prior.results:
                carried = dict(prior.results)
        cg_task.results = carried
        cg_task.save(update_fields=["status", "results"])

        _log(f"[MASTER] Starting cluster grading for: {assignment.title} "
             f"({'resume' if resume else 'full restart'})")

        autograder_plus_root = Path(settings.BASE_DIR).parent.parent / "Autograder_plus"
        cluster_script = str(autograder_plus_root / "cluster_grade.py")
        python_bin = _resolve_python_bin(autograder_plus_root)

        question_task_ids = []
        total_questions = 0
        already_done = 0

        for aq in assignment.assignmentquestion_set.select_related("question"):
            question = aq.question

            attempt_ids = list(
                SubmissionAttempt.objects
                .filter(assignment_question=aq)
                .order_by("student_id", "-created_at")
                .distinct("student_id")
                .values_list("id", flat=True)
            )
            if not attempt_ids:
                _log(f"[MASTER] Skipping '{question.slug}' (no submissions).")
                continue

            # Resume: skip questions already clustered in a prior run.
            if resume and question.slug in carried:
                already_done += 1
                total_questions += 1
                _log(f"[MASTER] Resume — '{question.slug}' already clustered, skipping.")
                continue

            q_config = question.config or {}
            pipeline_config = {
                "assignment_id": f"{assignment_id}_{question.slug}",
                "language": q_config.get("language", "python").lower(),
                "question": question.description,
                "test_cases": question.test_cases or [],
                **q_config,
            }
            staging_dir = str(
                Path(settings.MEDIA_ROOT) / "cluster_staging" / str(assignment_id) / question.slug
            )

            task = cluster_grade_question_task.apply_async(
                kwargs=dict(
                    assignment_id=str(assignment_id),
                    task_id=str(task_id),
                    attempt_ids=[str(x) for x in attempt_ids],
                    pipeline_config=pipeline_config,
                    staging_dir=staging_dir,
                    python_bin=python_bin,
                    cluster_script=cluster_script,
                    question_slug=question.slug,
                    question_id=str(question.id),
                    question_title=question.title,
                    config_options=config_options or {},
                ),
                queue="ai_analysis",
            )
            question_task_ids.append(task.id)
            total_questions += 1
            _log(f"[MASTER] Dispatched cluster worker for: {question.slug}")

        cg_task.task_ids = question_task_ids
        cg_task.total_batches = total_questions
        cg_task.completed_batches = already_done   # skipped questions count as done
        cg_task.total_submissions = SubmissionAttempt.objects.filter(
            assignment_question__assignment_id=assignment_id
        ).count()
        cg_task.save(update_fields=["task_ids", "total_batches",
                                    "completed_batches", "total_submissions"])

        dispatched = len(question_task_ids)
        if total_questions == 0:
            cg_task.status = "completed"
            cg_task.save(update_fields=["status"])
            _log("[MASTER] Completed (no submissions found).")
        elif dispatched == 0:
            cg_task.status = "completed"
            cg_task.save(update_fields=["status"])
            _log(f"[MASTER] Resume — all {already_done} question(s) already clustered. Done.")
        else:
            _log(f"[MASTER] Dispatched {dispatched} cluster worker(s); "
                 f"{already_done} already complete.")

        return f"Spawned {dispatched} cluster workers ({already_done} skipped)"

    except Exception as exc:
        logger.error(f"[MASTER] Cluster grading failed for {assignment_id}: {exc}", exc_info=True)
        try:
            cg_task = ClusterGradingTask.objects.get(id=task_id)
            cg_task.status = "failed"
            cg_task.error_message = str(exc)
            cg_task.save(update_fields=["status", "error_message"])
        except Exception:
            pass
        return "failed"
