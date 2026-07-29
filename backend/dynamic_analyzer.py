# src/modules/dynamic_analyzer.py
from __future__ import annotations

import ast
import contextlib
import io
import json
import math
import os
import tarfile
import threading
import time
from pathlib import Path
from typing import Any

import docker


# --- Constants ---
CONTAINER_WORKING_DIR = "/usr/src/app"
CONTAINER_TEMP_DIR = "/tmp"
INPUT_FILE_NAME = "input.txt"
RUNNER_FILE_NAME = "runner.py"

PYTHON_IMAGE = "python:3.10-slim"
C_IMAGE = "gcc:13-bookworm"
JAVA_IMAGE = "eclipse-temurin:21-jdk"

EXECUTION_TIMEOUT_SECONDS = 5


class DynamicAnalyzer:
    def __init__(self):
        self.client = None
        try:
            self.client = docker.from_env()
            self.client.ping()
            print("[DYNAMIC] Docker client initialized.")
        except Exception as e:
            print(f"[DYNAMIC] Docker init error: {e}")

    # ----------------------------
    # Common helpers
    # ----------------------------
    def _teardown(self, container):
        """Idempotently stop/remove a container. Safe if it already auto-removed
        (remove=True) — swallows docker.errors.NotFound and any teardown error."""
        if not container:
            return
        try:
            container.kill()
        except Exception:
            # Already stopped / auto-removed / not found — nothing to do.
            pass

    def _create_tar_from_string(self, content_str: str, filename: str) -> io.BytesIO:
        tar_stream = io.BytesIO()
        with tarfile.open(fileobj=tar_stream, mode="w:") as tar:
            data = content_str.encode("utf-8", errors="ignore")
            tarinfo = tarfile.TarInfo(name=filename)
            tarinfo.size = len(data)
            tar.addfile(tarinfo, io.BytesIO(data))
        tar_stream.seek(0)
        return tar_stream

    def _normalize_output(self, output: str):
        output = (output or "").strip()
        if not output:
            return ""
        # Try JSON
        try:
            return json.loads(output)
        except Exception:
            pass
        # Try Python literal
        try:
            return ast.literal_eval(output)
        except Exception:
            pass
        # Try numeric
        try:
            if "." in output:
                return float(output)
            return int(output)
        except Exception:
            pass
            
        # Try Space-separated numbers (LeetCode style) validation
        # e.g. "5 1 2 3 4 5" -> [5, 1, 2, 3, 4, 5]
        parts = output.split()
        if len(parts) > 1 and all(p.replace('.', '', 1).isdigit() or (p.startswith('-') and p[1:].isdigit()) for p in parts):
            try:
                return [float(p) if '.' in p else int(p) for p in parts]
            except ValueError:
                pass

        return output

    def _compare_outputs(self, actual, expected) -> bool:
        """Comparison tolerant to floats, dict key types, and unordered list-of-lists.

        A raw string-equality fast path runs first so literal-string answers
        (e.g. "007", "True", "1 2") are never lost to numeric/list coercion."""
        # Fast path: exact string equality on the raw values (before any coercion).
        if str(actual).strip() == str(expected).strip():
            return True

        # numbers
        if isinstance(actual, (int, float)) and isinstance(expected, (int, float)):
            return math.isclose(float(actual), float(expected), rel_tol=1e-6, abs_tol=1e-6)

        # Normalize dicts: JSON forces string keys; Python may produce int/float keys.
        # Recursively coerce both to a canonical form for comparison.
        def _canon(obj):
            if isinstance(obj, dict):
                # Try to coerce string keys to int/float where possible
                canon = {}
                for k, v in obj.items():
                    try:
                        k = int(k)
                    except (ValueError, TypeError):
                        try:
                            k = float(k)
                        except (ValueError, TypeError):
                            pass
                    canon[k] = _canon(v)
                return canon
            if isinstance(obj, list):
                return [_canon(x) for x in obj]
            return obj

        ca, ce = _canon(actual), _canon(expected)
        if isinstance(ca, dict) and isinstance(ce, dict):
            if set(ca.keys()) != set(ce.keys()):
                return False
            return all(self._compare_outputs(ca[k], ce[k]) for k in ca)

        # Unordered list-of-lists (e.g. anagram groups): sort inner lists then outer
        if isinstance(ca, list) and isinstance(ce, list) and len(ca) == len(ce):
            # First try ordered match
            if all(self._compare_outputs(a, b) for a, b in zip(ca, ce)):
                return True
            # Try sorting inner lists and outer list (for group_anagrams etc.)
            try:
                def _sort_key(x):
                    if isinstance(x, list):
                        return sorted(str(i) for i in x)
                    return str(x)
                sa = sorted(([sorted(str(i) for i in x)] if isinstance(x, list) else [str(x)]) for x in ca)
                se = sorted(([sorted(str(i) for i in x)] if isinstance(x, list) else [str(x)]) for x in ce)
                return sa == se
            except Exception:
                pass

        # strings
        return str(ca).strip() == str(ce).strip()

    def _outputs_match(self, raw_actual, raw_expected) -> bool:
        """Single comparison entry point used by every language path.

        1. Exact raw-string equality (preserves literal answers like "007",
           "True", "1 2" that coercion would otherwise mangle).
        2. Fall back to type-tolerant comparison on normalized values.
        """
        if str(raw_actual).strip() == str(raw_expected).strip():
            return True
        return self._compare_outputs(
            self._normalize_output(raw_actual),
            self._normalize_output(raw_expected),
        )


    def _exec_with_timeout(self, container, cmd: list[str], timeout: float = EXECUTION_TIMEOUT_SECONDS) -> tuple[int | None, str, str, int]:
        exit_code_ref = [None]
        out_ref = [(b"", b"")]
        err_ref = [None]
        duration_ref = [0]

        def target():
            try:
                start = time.time()
                ec, out = container.exec_run(cmd, demux=True)
                end = time.time()
                duration_ref[0] = int((end - start) * 1000)
                exit_code_ref[0] = ec
                out_ref[0] = out if out else (b"", b"")
            except Exception as e:
                err_ref[0] = e

        t = threading.Thread(target=target, daemon=True)
        t.start()
        t.join(timeout)

        if t.is_alive():
            # Force kill the container if it's still running
            try:
                container.kill()
            except Exception:
                pass
            return None, "", "Execution timed out.", int(timeout * 1000)

        if err_ref[0]:
            return None, "", f"System exec error: {err_ref[0]}", 0

        stdout_b, stderr_b = out_ref[0]
        stdout = (stdout_b or b"").decode("utf-8", errors="ignore").strip()
        stderr = (stderr_b or b"").decode("utf-8", errors="ignore").strip()
        return exit_code_ref[0], stdout, stderr, duration_ref[0]

    # ----------------------------
    # Python runner (program + function mode)
    # ----------------------------
    # ----------------------------
    # Batch Execution Runner (Hybrid Engine)
    # ----------------------------
    def _read_structures_code(self) -> str:
        try:
            structures_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'utils', 'structures.py')
            with open(structures_path, 'r') as f:
                return f.read()
        except Exception as e:
            print(f"Warning: Could not read structures.py: {e}")
            return ""

    def _generate_batch_runner(self, module_name: str, entry_point: str, timeout: float = 2.0, input_types: list = None) -> str:
        """
        Generates a runner script that executes multiple test cases in separate processes
        (forked) to ensure state isolation, reporting results as JSON.
        """
        structures_code = self._read_structures_code()
        input_types_repr = repr(input_types) if input_types else "None"
        
        return f"""
import sys
import os
import json
import importlib
import contextlib
import io
import time
import multiprocessing
import queue
import traceback
import ast
import inspect
import collections

# --- Helper Functions for Data Structures ---
def deserialize_list_node(arr, node_cls):
    # input: [1,2,3], node_cls=ListNode
    # output: ListNode(1) -> ListNode(2) ...
    if not arr or not node_cls:
        return None
    head = node_cls(arr[0])
    current = head
    for val in arr[1:]:
        current.next = node_cls(val)
        current = current.next
    return head

def deserialize_tree_node(arr, node_cls):
    # input: [1,2,3,None,4], node_cls=TreeNode
    # output: TreeNode root
    if not arr or not node_cls:
        return None
    
    iter_arr = iter(arr)
    try:
        root_val = next(iter_arr)
        if root_val is None: return None
        root = node_cls(root_val)
    except StopIteration:
        return None
        
    queue = collections.deque([root])
    while queue:
        node = queue.popleft()
        
        # Left
        try:
            val = next(iter_arr)
            if val is not None:
                node.left = node_cls(val)
                queue.append(node.left)
        except StopIteration: break
            
        # Right
        try:
            val = next(iter_arr)
            if val is not None:
                node.right = node_cls(val)
                queue.append(node.right)
        except StopIteration: break
    return root

def serialize_list_node(head):
    arr = []
    current = head
    while current:
        arr.append(current.val)
        current = current.next
    return arr

def serialize_tree_node(root):
    if not root: return []
    res = []
    queue = collections.deque([root])
    while queue:
        node = queue.popleft()
        if node:
            res.append(node.val)
            queue.append(node.left)
            queue.append(node.right)
        else:
            res.append(None)
    while res and res[-1] is None:
        res.pop()
    return res
# --------------------------------

WORKDIR = {CONTAINER_WORKING_DIR!r}
MODULE_NAME = {module_name!r}
ENTRY_POINT = {entry_point!r}
TIMEOUT = {timeout!r}

if WORKDIR not in sys.path:
    sys.path.insert(0, WORKDIR)

# Worker function to run a single test case
def worker(test_case, result_queue):
    out_buf = io.StringIO()
    result = {{'actual': '', 'error': '', 'status': 'run_success', 'duration': 0}}
    
    start_time = time.time()
    try:
        # Redirect stdout
        with contextlib.redirect_stdout(out_buf):
            # Import module (fresh in this process if forked, or at least state isolated)
            mod = importlib.import_module(MODULE_NAME)
            
            # Use Student's Data Structures if available
            ListNode = getattr(mod, 'ListNode', None)
            TreeNode = getattr(mod, 'TreeNode', None)
            
            # Get function
            if not hasattr(mod, ENTRY_POINT):
                raise AttributeError(f"Function '{{ENTRY_POINT}}' not found in module '{{MODULE_NAME}}'")
            func = getattr(mod, ENTRY_POINT)
            
            # Get function signature to know expected arg count. Exclude 'self'
            # (bound methods), and treat *args/**kwargs/defaulted params sanely:
            # `expected_args` is the number of REQUIRED positional params.
            try:
                sig = inspect.signature(func)
                required = 0
                has_varargs = False
                for name, p in sig.parameters.items():
                    if name == 'self':
                        continue
                    if p.kind in (inspect.Parameter.VAR_POSITIONAL, inspect.Parameter.VAR_KEYWORD):
                        has_varargs = True
                        continue
                    if p.default is inspect.Parameter.empty and p.kind in (
                        inspect.Parameter.POSITIONAL_ONLY,
                        inspect.Parameter.POSITIONAL_OR_KEYWORD,
                    ):
                        required += 1
                expected_args = required if required > 0 else (1 if not has_varargs else 1)
            except (ValueError, TypeError):
                expected_args = 1  # Fallback

            # Prepare input
            inp_raw = test_case.get('input')
            args = []
            
            # --- Advanced Parsing Logic ---
            if isinstance(inp_raw, str):
                inp_raw = inp_raw.strip()
                
                # Strategy 1: Try Multi-line Split (Argument per line) if args > 1 expected
                # Attempt to split input by newlines to separate arguments
                lines = [l.strip() for l in inp_raw.split('\\n') if l.strip()]
                
                parsed_lines = []
                if len(lines) > 1:
                    for line in lines:
                        val = line
                        # Parse line
                        try:
                            val = json.loads(line)
                        except:
                            try:
                                val = ast.literal_eval(line)
                            except:
                                # Try "key = value" pattern (common in some competitive programming inputs)
                                if '=' in line:
                                    try:
                                        _, value_part = line.split('=', 1)
                                        val = ast.literal_eval(value_part.strip())
                                    except:
                                        pass
                                
                                # Try space-separated integers
                                parts = line.split()
                                if parts and all(p.replace('.', '', 1).isdigit() or (p.startswith('-') and p[1:].isdigit()) for p in parts):
                                    try:
                                        val = [float(p) if '.' in p else int(p) for p in parts]
                                    except: pass
                        parsed_lines.append(val)
                    
                    # Smart Mapping
                    if len(parsed_lines) == expected_args:
                        args = parsed_lines
                    elif len(parsed_lines) == expected_args + 1:
                        if isinstance(parsed_lines[0], int) and isinstance(parsed_lines[1], list) and parsed_lines[0] == len(parsed_lines[1]):
                            args = parsed_lines[1:] # Drop count
                        else:
                            args = parsed_lines 
                    else:
                        args = [parsed_lines] 

                # Strategy 2: Single Block Parse (Legacy / Standard)
                if not args:
                    try:
                        val = json.loads(inp_raw)
                        if isinstance(val, list) and expected_args > 1 and len(val) == expected_args:
                            args = val
                        else:
                            args = [val]
                    except:
                        try:
                            val = ast.literal_eval(inp_raw)
                            if isinstance(val, (list, tuple)) and expected_args > 1 and len(val) == expected_args:
                                args = list(val)
                            else:
                                args = [val]
                        except:
                            parts = inp_raw.split()
                            if parts and all(p.replace('.', '', 1).isdigit() or (p.startswith('-') and p[1:].isdigit()) for p in parts):
                                val = [float(p) if '.' in p else int(p) for p in parts]
                                if len(val) > 1 and isinstance(val[0], int) and val[0] == len(val) - 1: val = val[1:]
                                if expected_args > 1 and len(val) == expected_args:
                                    args = val
                                else:
                                    args = [val]
                            else: args = [inp_raw]
            else:
                # Smart List unpacking if function expects multiple args
                # e.g. input=[1, 2] for add(a, b) -> args=[1, 2]
                # e.g. input=[1, 2] for sum(lst)  -> args=[[1, 2]]
                if isinstance(inp_raw, list) and expected_args > 1 and len(inp_raw) == expected_args:
                    args = inp_raw
                else:
                    args = [inp_raw]
            
            # --- Smart Type Conversion (Data Structures) ---
            INPUT_TYPES = {input_types_repr}
            if INPUT_TYPES and len(args) == len(INPUT_TYPES):
                new_args = []
                for val, type_name in zip(args, INPUT_TYPES):
                    if type_name == 'ListNode' and isinstance(val, list):
                        new_args.append(deserialize_list_node(val, ListNode))
                    elif type_name == 'TreeNode' and isinstance(val, list):
                        new_args.append(deserialize_tree_node(val, TreeNode))
                    else:
                        new_args.append(val)
                args = new_args
            
            kwargs = {{}}
                
            # Execute
            ret = func(*args, **kwargs)

            # --- Robust Output Capturing ---
            # In-place mutation heuristic: ONLY when the function returned None,
            # produced NO stdout, an expected answer exists, AND the first arg is
            # a mutable container (list/dict/set). This avoids corrupting void /
            # print-only functions (which legitimately return None and print).
            printed_so_far = out_buf.getvalue().strip()
            expected_nonempty = str(test_case.get('expected_output', '')).strip() != ''
            if (ret is None and args and not printed_so_far and expected_nonempty
                    and isinstance(args[0], (list, dict, set))):
                ret = args[0]

            # Print result if not printed
            if ret is not None:
                # Auto-Serialize Data Structures
                # Check Duck Typing: has 'val' and 'next' -> ListNode
                # has 'val', 'left', 'right' -> TreeNode
                
                is_list_node = hasattr(ret, 'val') and hasattr(ret, 'next')
                is_tree_node = hasattr(ret, 'val') and hasattr(ret, 'left')
                
                if is_list_node and not is_tree_node:
                    ret = serialize_list_node(ret)
                elif is_tree_node:
                    ret = serialize_tree_node(ret)
                
                print(ret)
                
        result['actual'] = out_buf.getvalue().strip()
        result['duration'] = int((time.time() - start_time) * 1000)
        
    except Exception:
        result['status'] = 'runtime_error'
        result['error'] = traceback.format_exc()
        result['actual'] = out_buf.getvalue().strip()
        result['duration'] = int((time.time() - start_time) * 1000)

    result_queue.put(result)

def main():
    try:
        with open('/tmp/tests.json', 'r') as f:
            tests = json.load(f)
    except Exception as e:
        print(json.dumps([{{'status': 'system_error', 'error': f"Failed to load tests: {{e}}"}}]))
        return

    results = []

    for i, test in enumerate(tests):
        name = test.get('name', f'test_{{i+1}}')
        q = multiprocessing.Queue()
        # Create a process for isolation
        p = multiprocessing.Process(target=worker, args=(test, q))
        p.start()

        # Drain the result queue with a timeout BEFORE join. Reading first avoids
        # the classic mp.Queue deadlock where a child blocks flushing a large
        # payload to the pipe and therefore never exits (so join() would hang /
        # time out and we'd lose a valid result).
        res = None
        try:
            res = q.get(timeout=TIMEOUT)
        except queue.Empty:
            res = None

        # Now reap the process. If it's still running after we already have (or
        # gave up waiting for) a result, WE terminate it → that's a timeout, not
        # a crash. A process that exited on its own with no result is a crash.
        p.join(timeout=1.0)
        killed_by_us = False
        if p.is_alive():
            killed_by_us = True
            p.terminate()
            p.join(timeout=1.0)
            if p.is_alive():
                p.kill()
                p.join(timeout=1.0)

        if res is not None:
            res['name'] = name
            results.append(res)
        elif killed_by_us:
            # Still running when we reaped it → exceeded the time budget.
            results.append({{
                'name': name,
                'status': 'timeout',
                'error': 'Execution timed out',
                'actual': '',
                'execution_time': int(TIMEOUT * 1000)
            }})
        else:
            # Exited on its own but produced no result (segfault / OOM / crash).
            results.append({{
                'name': name,
                'status': 'runtime_error',
                'error': f'Process crashed (exit code {{p.exitcode}})',
                'actual': '',
                'execution_time': 0
            }})

    print(json.dumps(results))

if __name__ == "__main__":
    main()
"""

    def _run_python_batch_tests(self, code_path: Path, entry_point: str, test_cases: list, 
                                timeout: float = 2.0, config: dict = None) -> list[dict]:
        """
        Runs all test cases in a SINGLE container using the batch runner.
        Injects data structures (ListNode, TreeNode) directly into student code.
        """
        module_name = code_path.stem
        container = None

        try:
            # 1. Start Container (Background) - No Volume Mount
            container = self.client.containers.run(
                PYTHON_IMAGE,
                command=["/bin/sh", "-c", "sleep infinity"],
                detach=True,
                # volumes=volume_mount, # Removed to allow code modification (prepend structures)
                working_dir=CONTAINER_WORKING_DIR,
                mem_limit="256m",
                nano_cpus=500_000_000,  # cap at 0.5 CPU so a submission burst can't starve the platform tier
                network_disabled=True,
                pids_limit=100,
                remove=True,
            )
            
            # 2. Prepare Code Payload (Prepend structures)
            structures_code = self._read_structures_code()
            try:
                with open(code_path, 'r') as f:
                    student_code = f.read()
            except Exception as e:
                return [{"name": "all", "status": "system_error", "error": f"Failed to read source code: {e}"}]
            
            # Combine: Structures + Student Code
            # Adding # --- End of Structures --- comment for clarity
            combined_code = f"{structures_code}\n\n# --- Student Code ---\n{student_code}"
            
            # Copy combined code to container
            container.put_archive(CONTAINER_WORKING_DIR, self._create_tar_from_string(combined_code, code_path.name))

            # 3. Prepare Runner Payload
            input_types = None
            if config:
                input_types = config.get('input_types')
                
            runner_script = self._generate_batch_runner(module_name, entry_point, timeout, input_types=input_types)
            tests_json = json.dumps(test_cases)

            # Copy runner + tests into the container.
            container.put_archive(CONTAINER_TEMP_DIR, self._create_tar_from_string(runner_script, "batch_runner.py"))
            container.put_archive(CONTAINER_TEMP_DIR, self._create_tar_from_string(tests_json, "tests.json"))

            # 4. Execute Batch Runner
            exec_start = time.time()
            # We give the batch runner enough time for ALL tests + overhead
            total_timeout_s = (len(test_cases) * timeout) + 5 
            
            cmd = ["python3", f"{CONTAINER_TEMP_DIR}/batch_runner.py"]
            
            # Use _exec_with_timeout to prevent infinite hangs
            ec, output_str, err_str, _ = self._exec_with_timeout(container, cmd, timeout=total_timeout_s)
            
            if ec is None:
                return [{"name": "all", "status": "timeout", "error": f"Batch runner hard timeout: {err_str}"}]

            # 5. Parse Results
            try:
                # The main logic uses print(json.dumps) only.
                # But if system error, we might catch it here.
                return json.loads(output_str)
            except json.JSONDecodeError:
                return [{"name": "all", "status": "system_error", "error": f"Invalid runner output: {output_str}"}]

        except Exception as e:
             return [{"name": "all", "status": "system_error", "error": f"Container error: {str(e)}"}]
        finally:
            self._teardown(container)


    def _run_python_test_case(self, code_path: Path, mode_config: dict, input_str: str) -> tuple[int | None, str, str, int]:
        """
        Runs one test case for Python using a runner in a container.
        Keeps the same concept you already use (runner + input file per test).
        """
        module_name = code_path.stem
        volume_mount = {str(code_path.parent.resolve()): {"bind": CONTAINER_WORKING_DIR, "mode": "ro"}}
        container = None

        try:
            container = self.client.containers.run(
                PYTHON_IMAGE,
                command=["/bin/sh", "-c", "sleep infinity"],
                detach=True,
                volumes=volume_mount,
                working_dir=CONTAINER_WORKING_DIR,
                mem_limit="256m",
                nano_cpus=500_000_000,  # cap at 0.5 CPU so a submission burst can't starve the platform tier
                network_disabled=True,
                pids_limit=1024,
                remove=True,  # Auto-remove container when it stops
            )

            input_target = f"{CONTAINER_TEMP_DIR}/{INPUT_FILE_NAME}"
            runner_target = f"{CONTAINER_TEMP_DIR}/{RUNNER_FILE_NAME}"

            runner_code = self._generate_python_runner(module_name, mode_config, input_target)

            # Copy runner.py and input.txt into container /tmp
            container.put_archive(CONTAINER_TEMP_DIR, self._create_tar_from_string(input_str, INPUT_FILE_NAME))
            container.put_archive(CONTAINER_TEMP_DIR, self._create_tar_from_string(runner_code, RUNNER_FILE_NAME))

            # Execute runner
            cmd = ["bash", "-lc", f"python3 -u {runner_target}"]
            return self._exec_with_timeout(container, cmd)

        except Exception as e:
            return None, "", f"Container runtime error: {str(e)}", 0
        finally:
            self._teardown(container)

    def _generate_python_runner(self, module_name: str, mode: dict, input_path: str) -> str:
        """
        Runner reads input_path. If program mode: redirects stdin and executes module as __main__.
        If function mode: loads JSON input and calls entry_point.
        """
        exec_type = mode.get("type", "program")
        entry_point = mode.get("entry_point")
        output_map = mode.get("output_map", None)

        # We keep this runner self-contained (no external deps)
        return f"""\
import sys
import os
import json
import importlib
import runpy
import contextlib
import io

WORKDIR = {CONTAINER_WORKING_DIR!r}
INPUT_PATH = {input_path!r}
MODULE = {module_name!r}
EXEC_TYPE = {exec_type!r}
ENTRY = {entry_point!r}
OUTPUT_MAP = {output_map!r}

if WORKDIR not in sys.path:
    sys.path.insert(0, WORKDIR)

def _read_input_text():
    try:
        with open(INPUT_PATH, "r", encoding="utf-8", errors="ignore") as f:
            return f.read()
    except Exception:
        return ""

def _read_input_json():
    txt = _read_input_text().strip()
    if not txt:
        return None
    try:
        return json.loads(txt)
    except Exception:
        # If not JSON, pass raw string
        return txt

def _call_function(func, inp):
    # Common conventions:
    # - dict => **kwargs
    # - list/tuple => *args
    # - other => single argument
    if isinstance(inp, dict):
        return func(**inp)
    if isinstance(inp, (list, tuple)):
        return func(*inp)
    return func(inp)

error_occurred = False

try:
    if EXEC_TYPE == "program":
        # redirect stdin from input file
        txt = _read_input_text()
        buf_in = io.StringIO(txt)
        sys.stdin = buf_in
        runpy.run_module(MODULE, run_name="__main__")
        # Any prints from student program are already on stdout
    else:
        if not ENTRY:
            raise ValueError("Function mode requires execution_mode.entry_point in config.")
        mod = importlib.import_module(MODULE)
        if not hasattr(mod, ENTRY):
            raise AttributeError(f"Function '{{ENTRY}}' not found in module '{{MODULE}}'")
        func = getattr(mod, ENTRY)

        inp = _read_input_json()

        out_buf = io.StringIO()
        with contextlib.redirect_stdout(out_buf):
            result = _call_function(func, inp)

        printed = out_buf.getvalue().strip()

        if result is not None:
            if isinstance(result, bool) and OUTPUT_MAP:
                print(OUTPUT_MAP.get("true_value","True") if result else OUTPUT_MAP.get("false_value","False"))
            else:
                print(result)
        else:
            if printed:
                print(printed)

except Exception as e:
    print(f"[RUNNER ERROR] {{e.__class__.__name__}}: {{e}}", file=sys.stderr)
    error_occurred = True

sys.exit(1 if error_occurred else 0)
"""

    # ----------------------------
    # C / Java (compile once per submission, run many tests)
    # ----------------------------
    def _analyze_c_submission(self, submission: dict) -> list[dict]:
        config = submission["config"]
        code_path = Path(submission["code_path"])
        volume_mount = {str(code_path.parent.resolve()): {"bind": CONTAINER_WORKING_DIR, "mode": "ro"}}
        results: list[dict] = []
        container = None

        try:
            container = self.client.containers.run(
                C_IMAGE,
                command=["bash", "-lc", "sleep infinity"],
                detach=True,
                volumes=volume_mount,
                working_dir=CONTAINER_WORKING_DIR,
                mem_limit="256m",
                nano_cpus=500_000_000,  # cap at 0.5 CPU so a submission burst can't starve the platform tier
                network_disabled=True,
                pids_limit=1024,
                remove=True,  # Auto-remove container when it stops
            )

            container_src = f"{CONTAINER_WORKING_DIR}/{code_path.name}"

            # Compile once
            build_cmd = [
                "bash",
                "-lc",
                "set -e; mkdir -p /tmp/work; "
                f"cp {container_src} /tmp/work/main.c; "
                "gcc -std=c11 -O2 -pipe /tmp/work/main.c -o /tmp/work/a.out -lm",
            ]
            ec, so, se, _ = self._exec_with_timeout(container, build_cmd)
            if ec is None:
                return [{"name": "build", "status": "timeout", "error": se or "Build timed out"}]
            if ec != 0:
                return [{"name": "build", "status": "compile_error", "error": se or so or "C compilation failed"}]

            # Run tests
            for test in config.get("test_cases", []):
                name = test.get("name", "test")
                input_raw = test.get("input", "")
                expected = test.get("expected_output", "")
                expected_str = str(expected).strip()

                input_str = json.dumps(input_raw) if isinstance(input_raw, (list, dict)) else str(input_raw)

                # Put input
                container.put_archive(CONTAINER_TEMP_DIR, self._create_tar_from_string(input_str, INPUT_FILE_NAME))
                input_target = f"{CONTAINER_TEMP_DIR}/{INPUT_FILE_NAME}"

                run_cmd = ["bash", "-lc", f"/tmp/work/a.out < {input_target}"]
                ec, out, err, duration = self._exec_with_timeout(container, run_cmd)

                if ec is None:
                    results.append({"name": name, "status": "timeout", "error": err or "Timed out", "execution_time": duration})
                    continue
                if ec != 0:
                    results.append({"name": name, "status": "runtime_error", "error": err or "Runtime error", "execution_time": duration})
                    continue

                if self._outputs_match(out, expected_str):
                    results.append({"name": name, "status": "pass", "actual": out, "execution_time": duration})
                else:
                    results.append(
                        {
                            "name": name,
                            "status": "fail",
                            "expected": expected_str,
                            "actual": out,
                            "stderr_on_fail": err,
                            "execution_time": duration
                        }
                    )

            return results

        except Exception as e:
            return [{"name": "error", "status": "error", "error": f"Container runtime error: {str(e)}"}]
        finally:
            self._teardown(container)

    def _analyze_java_submission(self, submission: dict) -> list[dict]:
        config = submission["config"]
        code_path = Path(submission["code_path"])
        volume_mount = {str(code_path.parent.resolve()): {"bind": CONTAINER_WORKING_DIR, "mode": "ro"}}
        results: list[dict] = []
        container = None

        try:
            container = self.client.containers.run(
                JAVA_IMAGE,
                command=["bash", "-lc", "sleep infinity"],
                detach=True,
                volumes=volume_mount,
                working_dir=CONTAINER_WORKING_DIR,
                mem_limit="256m",
                nano_cpus=500_000_000,  # cap at 0.5 CPU so a submission burst can't starve the platform tier
                network_disabled=True,
                pids_limit=1024,
                remove=True,  # Auto-remove container when it stops
            )

            container_src = f"{CONTAINER_WORKING_DIR}/{code_path.name}"

            # Determine the (public) class name so we compile/run the right class.
            # Java requires a public class to live in <ClassName>.java, so hardcoding
            # Main.java breaks submissions whose public class isn't Main.
            class_name = self._detect_java_class(submission.get("code", ""), code_path)

            # Compile once: copy the source to <Class>.java and javac it.
            build_cmd = [
                "bash",
                "-lc",
                "set -e; mkdir -p /tmp/work; "
                f"cp {container_src} /tmp/work/{class_name}.java; "
                f"javac -encoding UTF-8 -d /tmp/work /tmp/work/{class_name}.java",
            ]
            ec, so, se, _ = self._exec_with_timeout(container, build_cmd)
            if ec is None:
                return [{"name": "build", "status": "timeout", "error": se or "Build timed out"}]
            if ec != 0:
                return [{"name": "build", "status": "compile_error", "error": se or so or "Java compilation failed"}]

            # Run tests
            for test in config.get("test_cases", []):
                name = test.get("name", "test")
                input_raw = test.get("input", "")
                expected = test.get("expected_output", "")
                expected_str = str(expected).strip()

                input_str = json.dumps(input_raw) if isinstance(input_raw, (list, dict)) else str(input_raw)

                container.put_archive(CONTAINER_TEMP_DIR, self._create_tar_from_string(input_str, INPUT_FILE_NAME))
                input_target = f"{CONTAINER_TEMP_DIR}/{INPUT_FILE_NAME}"

                run_cmd = ["bash", "-lc", f"java -cp /tmp/work {class_name} < {input_target}"]
                ec, out, err, duration = self._exec_with_timeout(container, run_cmd)

                if ec is None:
                    results.append({"name": name, "status": "timeout", "error": err or "Timed out", "execution_time": duration})
                    continue
                if ec != 0:
                    results.append({"name": name, "status": "runtime_error", "error": err or "Runtime error", "execution_time": duration})
                    continue

                if self._outputs_match(out, expected_str):
                    results.append({"name": name, "status": "pass", "actual": out, "execution_time": duration})
                else:
                    results.append(
                        {
                            "name": name,
                            "status": "fail",
                            "expected": expected_str,
                            "actual": out,
                            "stderr_on_fail": err,
                            "execution_time": duration
                        }
                    )

            return results

        except Exception as e:
            return [{"name": "error", "status": "error", "error": f"Container runtime error: {str(e)}"}]
        finally:
            self._teardown(container)

    @staticmethod
    def _detect_java_class(code: str, code_path: Path) -> str:
        """Best-effort detection of the runnable Java class name.

        Prefer the `public class X`; else the first `class X`; else the file
        stem. This lets submissions whose public class isn't `Main` compile and
        run (Java requires the public class file to be named after the class)."""
        import re
        code = code or ""
        m = re.search(r'\bpublic\s+(?:final\s+|abstract\s+)?class\s+([A-Za-z_$][\w$]*)', code)
        if m:
            return m.group(1)
        m = re.search(r'\bclass\s+([A-Za-z_$][\w$]*)', code)
        if m:
            return m.group(1)
        stem = code_path.stem
        return stem if stem else "Main"

    # ----------------------------
    # Main entry
    # ----------------------------
    def analyze(self, submission: dict) -> dict:
        student_id = submission.get("student_id", "Unknown")
        print(f"\n[🔍] Dynamic analysis for: {student_id}")

        if not self.client:
            submission["analysis"]["dynamic"] = [{"name": "all_tests", "status": "skipped", "error": "Docker unavailable"}]
            return submission

        config = submission.get("config", {})
        language = (config.get("language") or submission.get("language") or "python").strip().lower()
        mode_config = config.get("execution_mode", {"type": "program"})

        # --- Multilingual dispatch (Python remains program + function mode) ---
        if language == "c":
            submission["analysis"]["dynamic"] = self._analyze_c_submission(submission)
            print(f"[✅] Completed dynamic analysis for {student_id}")
            return submission

        if language == "java":
            submission["analysis"]["dynamic"] = self._analyze_java_submission(submission)
            print(f"[✅] Completed dynamic analysis for {student_id}")
            return submission

        # --- Python path ---
        code_path = Path(submission["code_path"])
        # Resolve the function entry point. Real configs nest it under
        # execution_mode.entry_point; older/top-level configs may put it at the
        # top. Honor both (execution_mode takes precedence) so function-mode
        # questions actually reach the batch runner.
        entry_point = mode_config.get("entry_point") or config.get("entry_point")
        results: list[dict] = []

        if entry_point:
             # Use Batch Runner (Hybrid Engine)
             print(f"  [BATCH] Running Python tests for {entry_point}")
             # We need to format test cases to match what batch runner expects (list of dicts)
             # config['test_cases'] might be the right format.
             test_cases = config.get("test_cases", [])
             
             try:
                 # Run batch tests
                 batch_results = self._run_python_batch_tests(code_path, entry_point, test_cases, config=config)
                 
                 # Analyze results (normalize output, check pass/fail) which batch runner handles partly but 
                 # _run_python_batch_tests returns raw results.
                 # Wait, _run_python_batch_tests returns the list of results from the runner?
                 # Yes, and the runner does normalization? No, runner returns 'actual'.
                 
                 # _run_python_batch_tests returns: [{'name':..., 'status':..., 'actual':..., 'error':...}]
                 # We need to do the comparison here to be consistent.
                 
                 for i, res in enumerate(batch_results):
                     # Match with original test case to get expected output
                     # The runner tries to preserve order/index corresponding to input list.
                     
                     tc = test_cases[i] if i < len(test_cases) else {}
                     name = res.get('name', tc.get('name', f'test_{i+1}'))
                     
                     if res['status'] == 'run_success':
                         actual = res.get('actual', '')
                         expected = str(tc.get('expected_output', '')).strip()

                         if self._outputs_match(actual, expected):
                             res['status'] = 'pass'
                         else:
                             res['status'] = 'fail'
                             res['expected'] = expected
                             res['actual'] = actual # Raw output
                             
                     # Append to results
                     results.append(res)
                     
             except Exception as e:
                 results.append({"name": "batch_error", "status": "system_error", "error": str(e)})

        else:
            # Legacy Loop Mode
            for test in config.get("test_cases", []):
                name = test.get("name", "test")
                input_data_raw = test.get("input", "")
                expected = test.get("expected_output", "")
                expected_str = str(expected).strip()

                # Input becomes text; for dict/list we JSON dump (works for both program stdin and function JSON)
                try:
                    input_str = json.dumps(input_data_raw) if isinstance(input_data_raw, (list, dict)) else str(input_data_raw)
                except Exception:
                    input_str = str(input_data_raw)

                print(f"  [TEST] {name} (python, mode={mode_config.get('type','program')})")

                ec, out, err, duration = self._run_python_test_case(code_path, mode_config, input_str)

                if ec is None:
                    results.append({"name": name, "status": "timeout", "error": err or "Timed out", "execution_time": duration})
                    continue
                if ec != 0:
                    results.append({"name": name, "status": "runtime_error", "error": err or "Runtime error", "execution_time": duration})
                    continue

                if self._outputs_match(out, expected_str):
                    results.append({"name": name, "status": "pass", "actual": out, "execution_time": duration})
                else:
                    results.append(
                        {
                            "name": name,
                            "status": "fail",
                            "expected": expected_str,
                            "actual": out,
                            "stderr_on_fail": err,
                            "execution_time": duration
                        }
                    )

        submission["analysis"]["dynamic"] = results
        print(f"[✅] Completed dynamic analysis for {student_id}")
        return submission
