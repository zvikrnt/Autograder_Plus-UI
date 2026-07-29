"""
Local (Docker-free) function-mode grader for adaptive practice.

The main autograder's batch runner requires Docker; in environments where the
Docker daemon isn't reachable it can't grade. Adaptive practice needs to grade
reliably, so this module runs the student's Python code in a short-lived,
resource-limited subprocess and calls the entry-point function with the test
inputs. Inputs are the normalized one-arg-per-line form produced at import time
(each line is a JSON/py-literal argument); expected outputs are compared by
value after literal-eval where possible.

Only Python function-mode is handled here (the adaptive bank is Python). If the
student picks another language later, wire that language's runner similarly.
"""
import ast
import json
import subprocess
import sys
import tempfile
from pathlib import Path

_RUNNER = r'''
import sys, json, ast, io, contextlib, resource

def _lim():
    try:
        resource.setrlimit(resource.RLIMIT_CPU, (5, 6))
        resource.setrlimit(resource.RLIMIT_AS, (512*1024*1024, 512*1024*1024))
    except Exception:
        pass

_lim()

payload = json.load(sys.stdin)
entry = payload["entry_point"]
cases = payload["cases"]

# Preamble: LeetCode-style solutions rely on typing (List, Optional, …) and
# common stdlib names without importing them. Inject them so code compiles.
_PREAMBLE = (
    "from typing import *\n"
    "import collections, math, heapq, bisect, itertools, functools, re, string\n"
    "from collections import *\n"
)

ns = {}
try:
    exec(compile(_PREAMBLE + payload["code"], "<student>", "exec"), ns, ns)
except Exception as e:
    print(json.dumps({"fatal": "compile: %s" % e}))
    sys.exit(0)

# Resolve the entry point. LeetCode-style solutions define the method inside a
# `class Solution`, so fall back to Solution().<entry> if there's no top-level fn.
fn = ns.get(entry)
if not callable(fn):
    sol = ns.get("Solution")
    if sol is not None:
        try:
            inst = sol()
            method = getattr(inst, entry, None)
            if callable(method):
                fn = method
        except Exception:
            fn = None

def _parse_arg(line):
    line = line.strip()
    try:
        return ast.literal_eval(line)
    except Exception:
        try:
            return json.loads(line)
        except Exception:
            return line

def _norm(v):
    # normalize for comparison: try literal-eval strings, else str
    if isinstance(v, str):
        try:
            return _parse_arg(v)
        except Exception:
            return v
    return v

results = []
for tc in cases:
    inp = tc.get("input", "")
    expected = tc.get("expected_output", "")
    if not callable(fn):
        results.append({"status": "fail", "actual": "", "error": "function '%s' not defined" % entry})
        continue
    lines = [l for l in str(inp).split("\n")] if str(inp) != "" else []
    args = [_parse_arg(l) for l in lines if l.strip() != ""]
    try:
        with contextlib.redirect_stdout(io.StringIO()):
            out = fn(*args)
    except Exception as e:
        results.append({"status": "error", "actual": "", "error": "%s: %s" % (type(e).__name__, e)})
        continue
    exp_val = _norm(expected)
    ok = (out == exp_val) or (str(out) == str(expected).strip())
    results.append({"status": "pass" if ok else "fail",
                    "actual": repr(out), "error": ""})

print(json.dumps({"results": results}))
'''


def grade_python_function(code, entry_point, test_cases, timeout=10):
    """
    Returns a list of {status: pass|fail|error, actual_output, error_message}
    aligned with `test_cases`. Docker-free.
    """
    payload = {
        "entry_point": entry_point or "solution",
        "code": code or "",
        "cases": test_cases or [],
    }
    with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False) as f:
        f.write(_RUNNER)
        runner_path = f.name
    try:
        proc = subprocess.run(
            [sys.executable, runner_path],
            input=json.dumps(payload),
            capture_output=True, text=True, timeout=timeout,
        )
        out = (proc.stdout or "").strip().splitlines()
        data = json.loads(out[-1]) if out else {}
    except subprocess.TimeoutExpired:
        return [{"status": "error", "actual_output": "", "error_message": "Time limit exceeded"}
                for _ in (test_cases or [])]
    except Exception as exc:
        return [{"status": "error", "actual_output": "", "error_message": f"runner: {exc}"}
                for _ in (test_cases or [])]
    finally:
        try:
            Path(runner_path).unlink()
        except OSError:
            pass

    if data.get("fatal"):
        return [{"status": "error", "actual_output": "", "error_message": data["fatal"]}
                for _ in (test_cases or [])]

    results = data.get("results", [])
    # Align length with test_cases.
    out_results = []
    for i, tc in enumerate(test_cases or []):
        r = results[i] if i < len(results) else {"status": "error", "actual": "", "error": "no result"}
        out_results.append({
            "status": r.get("status", "error"),
            "actual_output": r.get("actual", ""),
            "error_message": r.get("error", ""),
        })
    return out_results
