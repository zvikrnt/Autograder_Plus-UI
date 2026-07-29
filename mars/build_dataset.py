#!/usr/bin/env python3
"""
Build the adaptive-practice question dataset for MARS.

Merges:
  1. newfacade/LeetCodeDataset (HuggingFace) — problems, tags, test cases.
  2. Zerotrac leetcode_problem_rating (GitHub) — numeric Elo ratings.

Merge key: LeetCodeDataset.task_id  ==  Zerotrac "Title Slug".

Output: a single JSON file in the Autograder import format (a list of questions
under {"questions": [...]}), each carrying a numeric `elo_rating` used by MARS as
the item rating. Questions without an Elo rating are dropped (MARS needs it).

Usage:
    cd Autograder_plus && ./newgrade/bin/python ../Autograder/mars/build_dataset.py \
        --out ../Autograder/mars/adaptive_dataset.json

    # smaller sample for testing:
    ./newgrade/bin/python ../Autograder/mars/build_dataset.py --limit 60 \
        --out ../Autograder/mars/adaptive_dataset_sample.json
"""
import argparse
import json
import re
import sys
import urllib.request
from pathlib import Path

ZEROTRAC_URL = "https://raw.githubusercontent.com/zerotrac/leetcode_problem_rating/main/ratings.txt"


def load_zerotrac_ratings():
    """Return {slug: elo_rating_float} from Zerotrac ratings.txt (tab-separated)."""
    print(f"[dataset] Downloading Zerotrac ratings from {ZEROTRAC_URL}")
    data = urllib.request.urlopen(ZEROTRAC_URL, timeout=60).read().decode("utf-8", errors="replace")
    lines = data.splitlines()
    header = lines[0].split("\t")
    # Columns: Rating, ID, Title, Title ZH, Title Slug, Contest Slug, Problem Index
    idx_rating = header.index("Rating")
    idx_slug = header.index("Title Slug")
    ratings = {}
    for line in lines[1:]:
        parts = line.split("\t")
        if len(parts) <= max(idx_rating, idx_slug):
            continue
        try:
            ratings[parts[idx_slug].strip()] = round(float(parts[idx_rating]), 1)
        except ValueError:
            continue
    print(f"[dataset] Loaded {len(ratings)} rated problems.")
    return ratings


# ---- Parse the HF `test` check(candidate) asserts into input/expected pairs ----

_ASSERT_RE = re.compile(r"assert\s+candidate\((.*?)\)\s*==\s*(.+?)\s*$")


def parse_test_cases(row, max_cases=100):
    """
    Build Autograder-format test cases. Prefer the structured `input_output`
    field; fall back to parsing `check(candidate)` asserts. We store the raw
    argument string as `input` and the expected value as `expected_output`,
    plus keep the original for reference. The adaptive runner treats these as
    reference/behaviour signals (execution uses the reference solution to
    normalize where needed).
    """
    cases = []
    io = row.get("input_output")
    if isinstance(io, list) and io:
        for i, pair in enumerate(io[:max_cases]):
            cases.append({
                "input": str(pair.get("input", "")),
                "expected_output": str(pair.get("output", "")),
                "explanation": "",
                "concept": "",
                "is_hidden": i >= 3,      # first 3 visible, rest hidden
                "points": 10,
            })
    if not cases:
        test_src = row.get("test") or ""
        for i, m in enumerate(_ASSERT_RE.finditer(test_src)):
            if i >= max_cases:
                break
            cases.append({
                "input": m.group(1).strip(),
                "expected_output": m.group(2).strip(),
                "explanation": "",
                "concept": "",
                "is_hidden": i >= 3,
                "points": 10,
            })
    return cases


def difficulty_from(row, elo):
    d = (row.get("difficulty") or "").capitalize()
    if d in ("Easy", "Medium", "Hard"):
        return d
    # derive from elo if missing
    if elo < 1500:
        return "Easy"
    if elo < 2000:
        return "Medium"
    return "Hard"


def build(limit=None):
    try:
        from datasets import load_dataset
    except ImportError:
        print("ERROR: `datasets` not installed. Run this with the Autograder_plus "
              "newgrade venv: ./newgrade/bin/python ...", file=sys.stderr)
        sys.exit(1)

    ratings = load_zerotrac_ratings()

    print("[dataset] Loading newfacade/LeetCodeDataset (streaming)…")
    ds = load_dataset("newfacade/LeetCodeDataset", split="train", streaming=True)

    questions = []
    seen_slugs = set()
    scanned = 0
    for row in ds:
        scanned += 1
        slug = str(row.get("task_id") or "").strip()
        if not slug or slug in seen_slugs:
            continue
        elo = ratings.get(slug)
        if elo is None:
            continue  # MARS needs a numeric rating

        test_cases = parse_test_cases(row)
        if not test_cases:
            continue

        seen_slugs.add(slug)
        tags = row.get("tags") if isinstance(row.get("tags"), list) else []
        entry_point = (row.get("entry_point") or "").split(".")[-1] or "solution"

        questions.append({
            "title": slug.replace("-", " ").title(),
            "slug": f"adaptive-{slug}",
            "description": (row.get("problem_description") or "").strip()
                           or f"LeetCode problem: {slug}",
            "difficulty": difficulty_from(row, elo),
            "category": "Adaptive",
            "question_type": "coding",
            "entry_point": entry_point,
            "starter_code": (row.get("starter_code") or "").strip(),
            "reference_solution": (row.get("completion") or "").strip(),
            "point_value": 100,
            "tags": tags,
            "elo_rating": elo,             # <-- MARS item rating (numeric Elo)
            "source": "leetcode+zerotrac",
            "test_cases": test_cases,
        })

        if limit and len(questions) >= limit:
            break

    print(f"[dataset] Scanned {scanned} rows, kept {len(questions)} rated problems.")
    # Sort by elo so the file is browsable easy→hard.
    questions.sort(key=lambda q: q["elo_rating"])
    return questions


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True, help="Output JSON path")
    ap.add_argument("--limit", type=int, default=None, help="Cap number of questions (testing)")
    args = ap.parse_args()

    questions = build(limit=args.limit)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({"questions": questions}, indent=2, ensure_ascii=False), encoding="utf-8")

    if questions:
        elos = [q["elo_rating"] for q in questions]
        print(f"[dataset] Wrote {len(questions)} questions → {out}")
        print(f"[dataset] Elo range: {min(elos):.0f}–{max(elos):.0f} "
              f"(median {sorted(elos)[len(elos)//2]:.0f})")
    else:
        print("[dataset] WARNING: no questions written.")


if __name__ == "__main__":
    main()
