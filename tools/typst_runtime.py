"""Locate and run the Typst binary used by the overlay/reading renderers.

Resolution order:
  1. MATH_DESK_TYPST (explicit path; what the tests and a portable install use)
  2. tools/typst/typst.exe or tools/typst/typst (a per-install copy)
  3. `typst` on PATH (a system install)
"""
import os
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
MIN_VERSION = (0, 13, 0)


def typst_path():
    """Absolute path to a Typst executable, or "" when none is installed."""
    explicit = os.environ.get("MATH_DESK_TYPST", "").strip()
    if explicit != "" and os.path.isfile(explicit):
        return os.path.abspath(explicit)
    for name in ("typst.exe", "typst"):
        candidate = os.path.join(HERE, "typst", name)
        if os.path.isfile(candidate):
            return candidate
    found = shutil.which("typst")
    return found if found is not None else ""


def typst_available():
    return typst_path() != ""


def run_typst(arguments, cwd=None, timeout=180, check=True):
    """Run `typst <arguments>`; returns CompletedProcess with UTF-8 text."""
    binary = typst_path()
    if binary == "":
        raise SystemExit(
            "找不到 typst。请安装 Typst（winget install --id Typst.Typst）、把 typst.exe 放到 "
            "tools/typst/，或设置 MATH_DESK_TYPST 指向它。"
        )
    result = subprocess.run(
        [binary, *arguments],
        cwd=cwd,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=timeout,
    )
    if check and result.returncode != 0:
        detail = ((result.stderr or "") + (result.stdout or ""))[-1200:]
        # A Typst process whose image inherits a Low integrity label (for example a
        # copy inside a sandboxed workspace) cannot write into ordinary Medium
        # folders such as %TEMP% or a book directory; the raw "os error 5" is not
        # actionable on its own.
        if "failed to write PDF file" in detail:
            detail += (
                "\n提示：Typst 无法写入目标目录。常见原因是 typst.exe 的完整性级别低于目标目录"
                "（例如它位于被沙箱标为 Low 的目录），或目标目录只读。把 typst.exe 放到 "
                "%LOCALAPPDATA%\\dsh-pdf-workbench\\typst\\ 后重启，或改用 LaTeX 引擎"
                "（MATH_DESK_ENGINE=latex）。"
            )
        raise SystemExit("typst failed: " + detail)
    return result


def typst_version():
    """Version tuple, or None when Typst is not installed or too old to parse."""
    if not typst_available():
        return None
    try:
        result = run_typst(["--version"], check=False, timeout=30)
    except (OSError, subprocess.SubprocessError):
        return None
    text = (result.stdout or "").strip().split()
    for word in text:
        if word[:1].isdigit():
            parts = word.split(".")
            try:
                return tuple(int(part) for part in parts[:3])
            except ValueError:
                return None
    return None


def main():
    path = typst_path()
    if path == "":
        print("typst: not installed")
        return 1
    print("typst:", path)
    print("version:", typst_version())
    return 0


if __name__ == "__main__":
    sys.exit(main())
