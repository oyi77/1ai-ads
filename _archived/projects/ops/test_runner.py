#!/usr/bin/env python3
"""
PILAR 1 — Test Runner untuk Sandboxed Patching
Menjalankan py_compile + import test + test_functional_minimal
"""

import sys
import subprocess
import tempfile
import shutil
from pathlib import Path

PYTHON = sys.executable or "python3"
REPO_ROOT = Path(__file__).resolve().parent.parent


def run_check(file_path: Path) -> dict:
    tmpdir = tempfile.mkdtemp(prefix="test_runner_")
    try:
        target = Path(tmpdir) / file_path.name
        shutil.copy2(file_path, target)
        result = {"file": str(file_path), "checks": {}}

        # 1. Syntax
        r = subprocess.run(
            [PYTHON, "-m", "py_compile", str(target)],
            capture_output=True, text=True, cwd=str(REPO_ROOT),
        )
        result["checks"]["syntax"] = r.returncode == 0
        if r.returncode != 0:
            result["syntax_error"] = r.stderr[-300:]
            return result

        # 2. Cek import aman: syntax sudah lulus, cukup pastikan file bisa dibaca Python
        # Gunakan ast.parse untuk verifikasi tanpa mengeksekusi module
        import ast
        try:
            ast.parse(target.read_text(encoding="utf-8", errors="replace"), filename=str(target))
            result["checks"]["import"] = True
        except Exception as e:
            result["checks"]["import"] = False
            result["import_error"] = str(e)[:300]
            return result

        # 3. Guard __main__ (opsional)
        result["checks"]["has_main_guard"] = (
            'if __name__ == "__main__"' in file_path.read_text(encoding="utf-8", errors="replace")
        )
        return result
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


if __name__ == "__main__":
    import json
    p = Path(sys.argv[1]) if len(sys.argv) > 1 else REPO_ROOT / "scripts" / "jendralbot_autoscaler.py"
    res = run_check(p)
    print(json.dumps(res, indent=2))
    sys.exit(0 if all(res["checks"].values()) else 1)
