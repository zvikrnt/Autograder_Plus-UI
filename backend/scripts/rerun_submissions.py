"""
rerun_submissions.py
====================
Re-executes all student submissions for "Practice Sheet - Whole Syllabus"
against the newly defined 6 real test cases per question.

Steps per attempt:
  1. Write source_code to a temp file
  2. Call DynamicAnalyzer.analyze() — uses Docker batch runner
  3. Delete old TestResult rows
  4. Create 6 new TestResult rows (one per test case)
  5. Update attempt.manual_score = (passed / 6) * 100  and status
  6. Recalculate gradebook

Run as:
    python manage.py shell < scripts/rerun_submissions.py

Progress is printed live. Safe to re-run (idempotent).
"""

import os, sys, tempfile, time, traceback
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "autograder.settings")

import django
django.setup()

from assignments.models import Assignment
from submissions.models import SubmissionAttempt, TestResult
from submissions.services import update_gradebook

# Import the backend DynamicAnalyzer
sys.path.insert(0, str(Path(__file__).parent.parent))  # backend/
from dynamic_analyzer import DynamicAnalyzer

ASSIGNMENT_ID = "1474b14a-7944-4486-a21e-a85420c9710c"

# ---------------------------------------------------------------------------
print("Initializing Docker client...")
da = DynamicAnalyzer()
if not da.client:
    print("ERROR: Docker is not available. Aborting.")
    sys.exit(1)
print("Docker OK.\n")

a = Assignment.objects.get(id=ASSIGNMENT_ID)
aqs = list(a.assignmentquestion_set.select_related("question").order_by("order"))

total_ok = 0
total_err = 0
total_skip = 0
grand_total = 0

start_time = time.time()

for aq_idx, aq in enumerate(aqs):
    q = aq.question
    config = q.config or {}
    test_cases = q.test_cases or []
    entry_point = config.get("entry_point")

    if not entry_point:
        print(f"\n[{q.slug}] SKIP — no entry_point in config")
        continue
    if not test_cases:
        print(f"\n[{q.slug}] SKIP — no test cases")
        continue

    # Build the pipeline config dict that DynamicAnalyzer expects
    pipeline_config = {
        "language": "python",
        "entry_point": entry_point,
        "execution_mode": {"type": "function"},
        "test_cases": test_cases,
        **config,
    }

    attempts = list(
        SubmissionAttempt.objects
        .filter(assignment_question=aq)
        .select_related("student")
    )

    print(f"\n[{aq_idx+1:02d}/30] {q.slug} | entry={entry_point} | tcs={len(test_cases)} | attempts={len(attempts)}")

    q_ok = q_err = q_skip = 0
    students_to_update_gradebook = set()

    for i, attempt in enumerate(attempts):
        grand_total += 1
        code = attempt.source_code or ""
        if not code.strip():
            q_skip += 1
            total_skip += 1
            continue

        # Write code to a temp file
        with tempfile.NamedTemporaryFile(
            suffix=".py", mode="w", encoding="utf-8", delete=False
        ) as tf:
            tf.write(code)
            tmp_path = tf.name

        try:
            submission_dict = {
                "student_id": attempt.student.username,
                "code": code,
                "code_path": tmp_path,
                "config": pipeline_config,
                "analysis": {},
            }

            result_dict = da.analyze(submission_dict)
            dynamic_results = result_dict.get("analysis", {}).get("dynamic", [])

            # ── Rebuild TestResult rows ──────────────────────────────────
            TestResult.objects.filter(attempt=attempt).delete()

            passed = 0
            tr_rows = []
            for idx, res in enumerate(dynamic_results):
                status = res.get("status", "fail")
                is_pass = status == "pass"
                if is_pass:
                    passed += 1

                tr_rows.append(TestResult(
                    attempt=attempt,
                    test_case_id=str(idx),
                    status="pass" if is_pass else "fail",
                    score=1 if is_pass else 0,
                    actual_output=str(res.get("actual", "")),
                    error_message=str(res.get("error", "")),
                    execution_time_ms=int(res.get("execution_time", res.get("duration", 0))),
                ))
            TestResult.objects.bulk_create(tr_rows)

            # ── Update attempt score & status ───────────────────────────
            total_tcs = len(dynamic_results) or len(test_cases)
            new_score = round((passed / total_tcs) * 100, 2) if total_tcs else 0.0
            attempt.manual_score = new_score
            attempt.status = "graded"
            attempt.save(update_fields=["manual_score", "status"])

            students_to_update_gradebook.add(attempt.student)
            q_ok += 1
            total_ok += 1

            if (i + 1) % 50 == 0:
                elapsed = time.time() - start_time
                print(f"   ... {i+1}/{len(attempts)} done ({elapsed:.0f}s elapsed) | passed so far: {q_ok}")

        except Exception as e:
            q_err += 1
            total_err += 1
            print(f"   ✗ {attempt.student.username}: {e}")
        finally:
            try:
                os.unlink(tmp_path)
            except Exception:
                pass

    # ── Re-compute gradebook for all affected students ───────────────────
    print(f"   Updating gradebook for {len(students_to_update_gradebook)} students...")
    for student in students_to_update_gradebook:
        try:
            update_gradebook(student, a)
        except Exception as e:
            print(f"   Gradebook error for {student.username}: {e}")

    elapsed = time.time() - start_time
    print(f"   ✅ {q.slug}: ok={q_ok} skip={q_skip} err={q_err}  ({elapsed:.0f}s total)")

# ── Summary ──────────────────────────────────────────────────────────────────
print(f"\n{'='*60}")
print(f"DONE in {time.time()-start_time:.1f}s")
print(f"Total: {grand_total} | OK: {total_ok} | Skipped (empty): {total_skip} | Errors: {total_err}")
