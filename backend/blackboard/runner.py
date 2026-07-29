"""
Blackboard runner — a Docker-free "online compiler" for free practice.

Runs arbitrary student code (Python / C / C++ / Java / JavaScript) with optional
stdin, returning stdout/stderr. Nothing is persisted.

Sandboxing uses POSIX resource limits applied to the child via preexec_fn:
CPU 5s, file size 10MB, and a process cap. The address-space (memory) limit is
deliberately generous (1.5GB) because runtimes like the JVM and Node.js reserve a
large virtual address space at startup and crash under a tight RLIMIT_AS — the
256MB limit used by the Docker-side executor is too small for them. Wall-clock is
bounded separately via the subprocess timeout, so a big RLIMIT_AS is safe here.

Each run happens in its own temp working directory (compiled binaries / .class
files stay isolated) which is deleted afterwards.
"""
import os
import resource
import shutil
import subprocess
import tempfile
import time

SUPPORTED = ("python", "c", "cpp", "java", "javascript")

MAX_CODE_BYTES = 200_000
MAX_STDIN_BYTES = 100_000
CPU_SECONDS = 5
WALL_TIMEOUT = 6          # subprocess.communicate timeout (> CPU limit)
COMPILE_TIMEOUT = 15
MEM_BYTES = 1536 * 1024 * 1024   # 1.5GB address space — fits JVM / Node startup
FSIZE_BYTES = 10 * 1024 * 1024


def _make_limits(cap_address_space: bool):
    """Build a preexec_fn applying CPU + file-size limits, and (only when
    `cap_address_space`) an RLIMIT_AS memory cap.

    The JVM and Node.js cannot start under an RLIMIT_AS cap (metaspace / V8
    reservations fail), so for those we rely on the runtime's own heap flags
    (-Xmx / --max-old-space-size) plus the CPU and wall-clock limits instead of
    RLIMIT_AS. Python/C/C++ get the hard RLIMIT_AS cap."""
    def _apply():
        try:
            resource.setrlimit(resource.RLIMIT_CPU, (CPU_SECONDS, CPU_SECONDS + 1))
        except (ValueError, OSError):
            pass
        try:
            resource.setrlimit(resource.RLIMIT_FSIZE, (FSIZE_BYTES, FSIZE_BYTES))
        except (ValueError, OSError):
            pass
        if cap_address_space:
            try:
                resource.setrlimit(resource.RLIMIT_AS, (MEM_BYTES, MEM_BYTES))
            except (ValueError, OSError):
                pass
    return _apply


def _prepare(language, code, workdir):
    """Write the source and return (compile_cmd_or_None, run_cmd) or an error str."""
    if language == "python":
        (workdir / "program.py").write_text(code)
        return None, ["python3", "program.py"]
    if language == "javascript":
        (workdir / "program.js").write_text(code)
        # A modest old-space cap keeps Node memory sane without a tiny RLIMIT_AS.
        return None, ["node", "--max-old-space-size=512", "program.js"]
    if language == "c":
        (workdir / "program.c").write_text(code)
        return (["gcc", "-O2", "-w", "program.c", "-o", "program", "-lm"],
                ["./program"])
    if language == "cpp":
        (workdir / "program.cpp").write_text(code)
        return (["g++", "-O2", "-w", "-std=c++17", "program.cpp", "-o", "program"],
                ["./program"])
    if language == "java":
        # Java requires the public class file to match the class name.
        import re
        m = re.search(r'public\s+(?:final\s+|abstract\s+)?class\s+([A-Za-z_$][\w$]*)', code)
        cls = m.group(1) if m else "Main"
        (workdir / f"{cls}.java").write_text(code)
        # Cap JVM heap; the JVM still needs a big address space (RLIMIT_AS above).
        return (["javac", f"{cls}.java"],
                ["java", "-Xmx256m", "-XX:-UsePerfData", cls])
    return None, None


def run_code(language, code, stdin=""):
    """Run `code` with `stdin`. Returns { success, output, error, execution_time,
    language }. Never raises for user errors."""
    language = (language or "python").strip().lower()
    language = {"js": "javascript", "c++": "cpp"}.get(language, language)

    if language not in SUPPORTED:
        return {"success": False, "output": "",
                "error": f"Unsupported language: {language}. Supported: {', '.join(SUPPORTED)}.",
                "execution_time": 0, "language": language}

    code, stdin = code or "", stdin or ""
    if len(code.encode("utf-8", "ignore")) > MAX_CODE_BYTES:
        return {"success": False, "output": "", "error": "Code too large.", "execution_time": 0, "language": language}
    if len(stdin.encode("utf-8", "ignore")) > MAX_STDIN_BYTES:
        return {"success": False, "output": "", "error": "Input too large.", "execution_time": 0, "language": language}

    from pathlib import Path
    workdir = Path(tempfile.mkdtemp(prefix="blackboard_"))
    try:
        compile_cmd, run_cmd = _prepare(language, code, workdir)
        if run_cmd is None:
            return {"success": False, "output": "", "error": "Unsupported language.",
                    "execution_time": 0, "language": language}

        # Compile step (C/C++/Java).
        if compile_cmd:
            try:
                cp = subprocess.run(compile_cmd, cwd=workdir, capture_output=True,
                                    text=True, timeout=COMPILE_TIMEOUT)
                if cp.returncode != 0:
                    return {"success": False, "output": "",
                            "error": "Compilation Error:\n" + (cp.stderr or cp.stdout or ""),
                            "execution_time": 0, "language": language}
            except subprocess.TimeoutExpired:
                return {"success": False, "output": "", "error": "Compilation timed out.",
                        "execution_time": 0, "language": language}

        # Run step. Java/JS can't tolerate an RLIMIT_AS cap (they self-limit heap
        # via -Xmx / --max-old-space-size); Python/C/C++ get the hard memory cap.
        cap_as = language not in ("java", "javascript")
        start = time.time()
        try:
            proc = subprocess.Popen(
                run_cmd, cwd=workdir,
                stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                text=True, preexec_fn=_make_limits(cap_as),
            )
            out, err = proc.communicate(input=stdin, timeout=WALL_TIMEOUT)
            elapsed = int((time.time() - start) * 1000)
            return {"success": proc.returncode == 0, "output": out,
                    "error": err if proc.returncode != 0 else "",
                    "execution_time": elapsed, "language": language}
        except subprocess.TimeoutExpired:
            proc.kill()
            try:
                proc.communicate(timeout=2)
            except Exception:
                pass
            return {"success": False, "output": "",
                    "error": f"Time Limit Exceeded ({WALL_TIMEOUT}s).",
                    "execution_time": WALL_TIMEOUT * 1000, "language": language}
    except Exception as exc:
        return {"success": False, "output": "", "error": f"System error: {exc}",
                "execution_time": 0, "language": language}
    finally:
        shutil.rmtree(workdir, ignore_errors=True)
