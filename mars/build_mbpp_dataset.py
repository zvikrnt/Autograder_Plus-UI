#!/usr/bin/env python3
"""
Build the BASIC adaptive-practice questions from nlile/mbpp (HuggingFace).

MBPP gives: text (problem), code (reference solution), test_list (assert stmts),
test_setup_code. It has NO elo rating, tags, or difficulty. This script:

  1. Parses the MBPP `test_list` asserts into our test-case format (function
     call → expected value). These are authoritative (from the dataset).
  2. Uses Ollama `gemma4:latest` to ADD the missing metadata — difficulty, tags,
     and a numeric Elo in the BASIC band (800-1300, below the easiest LeetCode).
  3. CORRECTNESS CHECK: runs MBPP's own reference solution against the parsed
     test cases and keeps a problem ONLY if the reference passes all of them.
     This filters out anything we couldn't parse/execute cleanly.

Output: JSON in the Autograder import format (same as build_dataset.py), so it
can be merged with the LeetCode dataset and imported the same way.

Usage (run with the Autograder_plus newgrade venv):
    cd Autograder_plus && ./newgrade/bin/python ../Autograder/mars/build_mbpp_dataset.py \
        --out ../Autograder/mars/mbpp_dataset.json --limit 200
"""
import argparse
import ast
import json
import re
import signal
import urllib.request
from pathlib import Path

OLLAMA_URL = "http://localhost:11434/api/generate"
OLLAMA_MODEL = "gemma4:latest"

ELO_MIN, ELO_MAX = 800, 1300
DIFF_ELO = {"Easy": (800, 1000), "Medium": (1000, 1150), "Hard": (1150, 1300)}


# --------------------------------------------------------------------------
# Parse MBPP asserts → our test-case format + a callable entry point
# --------------------------------------------------------------------------

_ASSERT_RE = re.compile(r"^\s*assert\s+(.+?)\s*==\s*(.+?)\s*$")


def _entry_point_from_code(code):
    """Return the name of the (last) top-level function defined in `code`."""
    try:
        tree = ast.parse(code)
    except SyntaxError:
        return None
    funcs = [n.name for n in tree.body if isinstance(n, ast.FunctionDef)]
    return funcs[-1] if funcs else None


def _starter_from_reference(entry, code):
    """Build a starter stub that carries the reference solution's SIGNATURE
    (parameter names) so students know which args to accept. Falls back to a
    param-less stub only if the signature can't be parsed."""
    m = re.search(
        r'^([ \t]*)def\s+' + re.escape(entry) + r'\s*\(([^)]*)\)\s*(->[^:]+)?:',
        code or '', re.MULTILINE,
    )
    if m:
        params = m.group(2).strip()
        ret = (m.group(3) or '').rstrip()
        sig = f"def {entry}({params}){(' ' + ret) if ret else ''}:"
        return f"{sig}\n    # write your solution\n    pass"
    return f"def {entry}():\n    # write your solution\n    pass"


def parse_tests(test_list, entry_point):
    """
    Turn ['assert f(1,2) == 3', ...] into our test-case dicts. We keep the raw
    call expression as `input` and the expected literal as `expected_output`.
    Cap at 10 (per adaptive rules). Returns (cases, raw_asserts_kept).
    """
    cases = []
    kept = []
    for a in test_list:
        m = _ASSERT_RE.match(a)
        if not m:
            continue
        call_expr, expected = m.group(1).strip(), m.group(2).strip()
        if entry_point and entry_point not in call_expr:
            # still keep — some tests wrap the call, entry_point may differ
            pass
        cases.append({
            "input": call_expr,
            "expected_output": expected,
            "explanation": "",
            "concept": "",
            "is_hidden": len(cases) >= 3,
            "points": 10,
        })
        kept.append(a)
        if len(cases) >= 10:
            break
    return cases, kept


# --------------------------------------------------------------------------
# Correctness check: run the reference solution against the asserts
# --------------------------------------------------------------------------

class _Timeout(Exception):
    pass


def _run_reference(code, setup_code, asserts, timeout=5):
    """Exec the reference solution + setup, then all asserts. True if all pass."""
    def _handler(signum, frame):
        raise _Timeout()

    src = (setup_code or "") + "\n" + code + "\n" + "\n".join(asserts)
    old = signal.signal(signal.SIGALRM, _handler)
    signal.alarm(timeout)
    try:
        ns = {}
        exec(compile(src, "<mbpp>", "exec"), ns, ns)  # noqa: S102 (trusted dataset)
        return True
    except Exception:
        return False
    finally:
        signal.alarm(0)
        signal.signal(signal.SIGALRM, old)


# --------------------------------------------------------------------------
# Ollama enrichment (difficulty, tags, elo)
# --------------------------------------------------------------------------

def _ollama(prompt, timeout=90):
    body = json.dumps({
        "model": OLLAMA_MODEL,
        "prompt": prompt,
        "stream": False,
        "options": {"temperature": 0.2},
    }).encode()
    req = urllib.request.Request(OLLAMA_URL, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode()).get("response", "")


def _extract_json(text):
    """Pull the first {...} JSON object out of a model response."""
    m = re.search(r"\{.*\}", text, re.DOTALL)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except json.JSONDecodeError:
        return None


def enrich(problem_text):
    """Ask gemma for difficulty/tags/elo (basic band). Returns dict or defaults."""
    prompt = (
        "You are labelling a BASIC beginner Python programming exercise for a "
        "practice bank. Return ONLY a JSON object, no markdown, no prose.\n"
        f'Problem: "{problem_text}"\n'
        "Fields:\n"
        '  "difficulty": one of "Easy","Medium","Hard" (most are Easy),\n'
        '  "tags": array of 2-4 short lowercase CS-topic strings '
        '(e.g. "loops","strings","math","lists","recursion"),\n'
        f'  "elo": integer between {ELO_MIN} and {ELO_MAX} '
        "(these are basic problems so keep it low).\n"
    )
    try:
        data = _extract_json(_ollama(prompt)) or {}
    except Exception:
        data = {}

    difficulty = data.get("difficulty")
    if difficulty not in ("Easy", "Medium", "Hard"):
        difficulty = "Easy"
    tags = data.get("tags")
    if not isinstance(tags, list) or not tags:
        tags = ["basics"]
    tags = [str(t).lower()[:30] for t in tags][:4]
    try:
        elo = int(data.get("elo"))
    except (TypeError, ValueError):
        lo, hi = DIFF_ELO[difficulty]
        elo = (lo + hi) // 2
    elo = max(ELO_MIN, min(ELO_MAX, elo))
    return {"difficulty": difficulty, "tags": tags, "elo": float(elo)}


def build(limit=None):
    from datasets import load_dataset

    print("[mbpp] Loading nlile/mbpp (streaming)…")
    ds = load_dataset("nlile/mbpp", split="train", streaming=True)

    questions = []
    checked = kept_ok = dropped = 0
    for row in ds:
        checked += 1
        code = (row.get("code") or "").strip()
        text = (row.get("text") or "").strip()
        test_list = row.get("test_list") or []
        setup = row.get("test_setup_code") or ""
        if not code or not text or not test_list:
            dropped += 1
            continue

        entry = _entry_point_from_code(code)
        if not entry:
            dropped += 1
            continue

        cases, kept_asserts = parse_tests(test_list, entry)
        if not cases:
            dropped += 1
            continue

        # Correctness check with the dataset's own reference solution.
        if not _run_reference(code, setup, kept_asserts):
            dropped += 1
            continue

        meta = enrich(text)
        slug = f"mbpp-{row.get('task_id')}"
        questions.append({
            "title": text[:80].rstrip(".") if text else slug,
            "slug": slug,
            "description": text,
            "difficulty": meta["difficulty"],
            "category": "Basics",
            "question_type": "coding",
            "entry_point": entry,
            "starter_code": _starter_from_reference(entry, code),
            "reference_solution": code,
            "point_value": 100,
            "tags": meta["tags"],
            "elo_rating": meta["elo"],
            "ref_time_sec": 120.0,
            "source": "mbpp+gemma4",
            "test_cases": cases,
        })
        kept_ok += 1
        print(f"[mbpp] +{slug}  elo={meta['elo']:.0f} diff={meta['difficulty']} tags={meta['tags']}")

        if limit and kept_ok >= limit:
            break

    print(f"[mbpp] Checked {checked}, kept {kept_ok}, dropped {dropped}.")
    questions.sort(key=lambda q: q["elo_rating"])
    return questions


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--limit", type=int, default=None)
    args = ap.parse_args()

    questions = build(limit=args.limit)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({"questions": questions}, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"[mbpp] Wrote {len(questions)} questions → {out}")


if __name__ == "__main__":
    main()
