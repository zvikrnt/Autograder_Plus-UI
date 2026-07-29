# Creating Assignments & How Code Grading Works

This is the reference for creating coding assignments/questions and understanding exactly
how student submissions get executed and graded. It covers the data format the grader
actually consumes, so it stays accurate even if the UI changes.

## 1. The runner

All coding-question grading goes through **`backend/dynamic_analyzer.py`**
(`DynamicAnalyzer.analyze()`), invoked from `submissions/services.py`. It runs student code
inside ephemeral Docker containers (one per language image) and compares output against
each test case.

> Note: there is also a `backend/code_executor/` module (`docker_service.py`,
> `execute.py`, `python_runner.py`). **It is unused dead code** — nothing in the live
> backend imports it. Don't be misled by its name; `backend/dynamic_analyzer.py` is the
> real runner. It was recently synced with the hardened version from `Autograder_plus`
> (fixes: correct entry-point resolution, no more mp.Queue deadlock risk, no more
> print-only functions getting corrupted by the mutation heuristic, non-`Main` Java
> classes now compile, batch execution now has a hard timeout, literal-string answers
> like `"007"`/`"True"` are preserved instead of being coerced).

### Supported languages

| Language | Docker image | Mode(s) |
|---|---|---|
| Python | `python:3.10-slim` | function-mode **and** program-mode |
| C | `gcc:13-bookworm` | program-mode (stdin/stdout) only |
| Java | `eclipse-temurin:21-jdk` | program-mode (stdin/stdout) only |

`analyze()` dispatches purely on `config["language"]`. Anything other than `"c"` or
`"java"` falls through to the Python path — so `language` must be exactly `"c"`, `"java"`,
or `"python"` (or omitted, which defaults to Python).

JavaScript/C++ are **not** supported by this runner. (They exist only in the separate,
Docker-free **Blackboard** free-practice compiler and the **Adaptive Practice** grader —
different systems, not used for real assignments.)

## 2. Two execution modes

### Function mode (Python only) — recommended for most questions

The student writes a function; the runner calls it directly with parsed arguments and
compares the return value (or captured stdout, for print-only functions) to
`expected_output`.

Set this by including an `entry_point` — the exact name of the function the student must
define:

```json
{
  "language": "python",
  "execution_mode": { "type": "function", "entry_point": "add" },
  "entry_point": "add"
}
```

(`execution_mode.entry_point` takes precedence if both are present; either alone is
enough.)

### Program mode (Python, C, Java)

No `entry_point`. The student's whole program is compiled/run as-is; input is piped to
**stdin**, and **stdout** is compared to `expected_output`. Use this for C and Java, or for
Python questions written as full scripts (`input()`/`print()`).

## 3. `Question` model fields (`backend/assignments/models.py`)

Key fields on `Question`: `title`, `slug`, `description`, `starter_code`,
`reference_solution`, `question_type` (`coding`/`mcq`), `test_cases` (JSON list — see §4),
`tags`, `difficulty` (`Easy`/`Medium`/`Hard`), `category`, `point_value`, `config` (JSON —
see §2), `is_active`.

An `Assignment` is a `ContentItem` with `mode` (`practice`/`exam`), `points_total`,
`config`, and a list of `questions` (ordered via `AssignmentQuestion`, which also allows
`custom_points` per question per assignment).

## 4. Test case format

Each entry in `Question.test_cases` is:

```json
{
  "input": "2 3",
  "expected_output": "5",
  "explanation": "Basic addition",
  "concept": "Arithmetic",
  "is_hidden": false,
  "points": 10
}
```

- `input` and `expected_output` **must be strings** (even for numbers/lists — see §5 for
  how they get parsed).
- `explanation`, `concept` — optional, shown to students as hints.
- `is_hidden` — optional; hide the test case (and its input/expected output) from students,
  still used for grading.
- `points` — optional per-test-case weight.
- `name` — optional test label; auto-generated (`test_1`, `test_2`, …) if omitted.

Cap test cases at a reasonable count (10–20). Every test case launches inside the same
container in one batch call for Python function-mode (fast); C/Java run one container per
test case.

## 5. How `input` strings are parsed (function mode)

The runner figures out how many arguments your function needs from its signature
(`inspect.signature`, required positional params only, `self` excluded), then parses
`input` against that count:

- **One argument, plain value**: `"5"`, `"[1, 2, 3]"`, `"'hello'"`, `"{\"a\": 1}"` — parsed
  via JSON/`ast.literal_eval` and passed as the single argument.
- **Multiple arguments, space-separated numbers**: `"2 3"` for `def add(a, b)` →
  `add(2, 3)`.
- **Multiple arguments, one per line**: 
  ```
  [1, 2, 3]
  [4, 5, 6]
  ```
  for `def merge(a, b)` → `merge([1,2,3], [4,5,6])` (each line parsed independently).
- **LeetCode-style "count + array"**: a first line that's an integer equal to the length of
  the array on the second line is automatically dropped (so `"3\n[1,2,3]"` for a
  single-list-arg function still works).
- **Key=value style**: a line like `"n = 5"` is accepted; the right-hand side is
  literal-eval'd.
- Falls back to treating the whole string as one literal, then as a raw string if nothing
  else parses.

**Write test-case inputs as you'd write the literal Python argument(s)**, one line per
argument if there's more than one; simple space-separated numbers also work for
multi-arg numeric functions.

`expected_output` is compared with an exact-string fast path first (so `"007"`, `"True"`,
`"1 2"` are preserved literally), then falls back to type-tolerant comparison (numbers,
floats within tolerance, lists regardless of order-of-nesting, dict key types) if the raw
strings don't match exactly.

## 6. LeetCode-style linked lists / trees

`backend/utils/structures.py` is automatically prepended to student code in Python
function-mode, so students can use these without defining them:

- `ListNode(val=0, next=None)`, plus helpers `list_to_linked_list(arr)` /
  `linked_list_to_list(head)`
- `TreeNode(val=0, left=None, right=None)`, plus helpers `list_to_binary_tree(arr)` /
  `binary_tree_to_list(root)`

If a question takes a list/array that should arrive as a `ListNode`/`TreeNode` instead of a
raw Python list, set `input_types` in `config`, positionally matching the function's
parameters:

```json
{
  "entry_point": "reverse_list",
  "input_types": ["ListNode"]
}
```

Return values are auto-serialized back to a plain list for comparison: an object with
`val`/`next` is walked as a linked list; an object with `val`/`left` is walked breadth-first
as a tree (trailing `None`s trimmed) — so `expected_output` should just be the flat list
form, e.g. `"[1, 2, 3]"`.

## 7. Creating a question

**Via the UI**: Teacher → Create Assignment → question editor
(`QuestionEditorDialog`) — set title, function name (`entry_point`), difficulty,
description, and add test cases (`input` / `output` / optional `explanation`).

**Via bulk JSON import** — either the UI uploader (Bulk Import button, which also lets you
download a template) or:

```bash
python manage.py import_questions_from_json --file questions.json --user teacher@example.com
```

Both paths hit the same validator (`assignments/services.py: QuestionImportValidator`).
Required top-level key: `"questions"` (a list). Required per-question fields: `title`,
`description`, `question_type`, `test_cases`. Everything else is optional.

Full example:

```json
{
  "questions": [
    {
      "title": "Sum Two Numbers",
      "slug": "sum-two-numbers",
      "description": "Write a function that returns the sum of two numbers.",
      "difficulty": "Easy",
      "category": "Basics",
      "question_type": "coding",
      "entry_point": "add",
      "starter_code": "def add(a, b):\n    pass",
      "reference_solution": "def add(a, b):\n    return a + b",
      "point_value": 100,
      "test_cases": [
        {
          "input": "2 3",
          "expected_output": "5",
          "explanation": "Basic addition",
          "concept": "Arithmetic",
          "is_hidden": false,
          "points": 10
        }
      ]
    }
  ]
}
```

A top-level `entry_point` on a question is automatically merged into
`config["entry_point"]` when the question is created — you don't need to hand-write the
full `config`/`execution_mode` object unless you need `input_types` or a non-default
`timeout`/`memory`.

### Program-mode question example (C, Java, or a Python script)

Omit `entry_point` entirely; write the reference solution as a full program that reads
stdin and prints to stdout:

```json
{
  "title": "Echo Sum (C)",
  "description": "Read two integers from stdin, print their sum.",
  "question_type": "coding",
  "config": { "language": "c" },
  "starter_code": "#include <stdio.h>\nint main() {\n    int a, b;\n    scanf(\"%d %d\", &a, &b);\n    printf(\"%d\\n\", a + b);\n    return 0;\n}",
  "test_cases": [
    { "input": "2 3\n", "expected_output": "5" }
  ]
}
```

## 8. Result statuses students/graders will see

Each test case result has a `status`: `pass`, `fail`, `runtime_error`, `compile_error`
(C/Java), `timeout`, or `system_error`/`error` (infrastructure problem, e.g. Docker
unavailable). `pass`/`fail` also include `"actual"` (what the student's code produced) so
you can show a diff.

## 9. Practical tips

- Prefer **function mode** for Python — it's faster (all test cases run in one container
  call) and gives students a clear, testable contract (the entry-point signature).
- Keep `expected_output` as the literal printed/returned form — don't add extra
  formatting/whitespace beyond what the reference solution actually produces.
- For array/list problems, decide up front whether you want a plain list or a
  `ListNode`/`TreeNode`; mixing this up is the most common source of "my code is right but
  it fails" confusion (this happened once in Adaptive Practice — see `input_types` above).
- Test your question yourself: submissions call the exact same runner, so running the
  reference solution as a submission is a reliable sanity check before publishing.
