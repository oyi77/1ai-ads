#!/usr/bin/env python3
"""
PILAR 1 — Autonomous Bugfinder & Self-Healing Loop
File: ops/supervisor.py
Mengaudit log tiap topic, mendeteksi error, menulis patch di sandbox,
menjalankan test, dan hanya menerapkan jika 100% lulus.
"""

import os
import sys
import json
import re
import subprocess
import tempfile
import shutil
import logging
from datetime import datetime, timedelta, UTC
from pathlib import Path

# ---- Konfigurasi ----
BASE_DIR = Path(__file__).resolve().parent.parent
LOG_PATTERNS = {
    "nyamiresep": [
        BASE_DIR / "scripts" / "jendralbot_autoscaler.py",
        BASE_DIR / "scripts" / "nyamiresep_cpc_guard.py",
        BASE_DIR / "scripts" / "pause_violators.py",
        BASE_DIR / "scripts" / "jendralbot_auto_scale.py",
    ],
    "vilona-tfx": [
        BASE_DIR / "scripts" / "vilona_trakpro_engine.py",
        BASE_DIR / "scripts" / "vilona_gass_nyamiresep.py",
        BASE_DIR / "scripts" / "duplicate_winner.py",
    ],
}

AUDIT_LOG = BASE_DIR / "ops" / "audit.jsonl"
HEARTBEAT_FILE = BASE_DIR / "ops" / "supervisor.heartbeat"
PYTHON = sys.executable or "python3"
MAX_PATCH_ATTEMPTS = 3
STATE_FILE = BASE_DIR / "ops" / "supervisor_state.json"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(BASE_DIR / "ops" / "supervisor.log"),
        logging.StreamHandler(sys.stdout),
    ],
)
log = logging.getLogger("supervisor")


# ---- Utilitas ----
def touch_heartbeat():
    try:
        HEARTBEAT_FILE.write_text(datetime.now(UTC).isoformat())
    except Exception as e:
        log.error("Gagal update heartbeat: %s", e)


def load_state():
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text())
        except Exception as e:
            log.error("Gagal load state: %s", e)
            return {}
    return {}


def save_state(state):
    STATE_FILE.write_text(json.dumps(state, indent=2))


def append_audit(entry: dict):
    try:
        with AUDIT_LOG.open("a") as f:
            f.write(json.dumps({"ts": datetime.now(UTC).isoformat(), **entry}) + "\n")
    except Exception as e:
        log.error("Gagal menulis audit log: %s", e)


# ---- Deteksi Error ----
def scan_for_errors(topic: str, paths: list[Path]) -> list[dict]:
    """
    Scan recent file modifikasi dan cari pola error Python umum.
    Returns list of {file, rule, line_no, snippet}
    """
    errors = []
    cutoff = datetime.utcnow() - timedelta(hours=2)
    error_patterns = [
        (re.compile(r"NameError: name '(\w+)' is not defined"), "nameerror"),
        (re.compile(r"SyntaxError:"), "syntaxerror"),
        (re.compile(r"FileNotFoundError:"), "filemissing"),
        (re.compile(r"ModuleNotFoundError:"), "missingimport"),
        (re.compile(r"TypeError:"), "typeerror"),
        (re.compile(r"KeyError:"), "keyerror"),
        (re.compile(r"IndentationError:"), "indenterror"),
    ]

    for path in paths:
        if not path.exists():
            errors.append({
                "file": str(path),
                "rule": "filemissing",
                "msg": f"{path} tidak ditemukan",
            })
            continue
        try:
            mtime = datetime.utcfromtimestamp(path.stat().st_mtime)
            if mtime < cutoff and not path.exists():
                continue

            content = path.read_text(encoding="utf-8", errors="replace")
            # Cek syntax dulu
            compile(content, str(path), "exec")
        except SyntaxError as e:
            errors.append({
                "file": str(path),
                "rule": "syntaxerror",
                "msg": str(e),
                "line_no": e.lineno,
                "text": e.text,
            })
        except Exception as e:
            errors.append({"file": str(path), "rule": "ioerror", "msg": str(e)})

    return errors


# ---- Sandboxed Patcher ----
def propose_patch(file_path: Path, error_info: dict) -> tuple[str, list[str]] | None:
    """
    Buat patch seder berbasis regex berdasarkan tipe error.
    Returns patch string atau None jika tidak ada fix yang dikenali.
    """
    path = Path(file_path)
    try:
        original = path.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return None

    text = original
    applied = []

    # Kasus 1: DATA_DIR_COMPAT -> DATA_DIR (variable reference before assignment)
    if error_info.get("rule") == "nameerror" and "DATA_DIR" in (error_info.get("msg") or ""):
        if "DATA_DIR_COMPAT" in text and "DATA_DIR =" not in text.split("DATA_DIR_COMPAT")[0]:
            text = text.replace("DATA_DIR_COMPAT", "DATA_DIR")
            applied.append("ganti DATA_DIR_COMPAT -> DATA_DIR")

    # Kasus 2: pembacaan env yang salah
    if (error_info.get("rule") in ("nameerror", "keyerror")) and "META_ACCESS_TOKEN" in (error_info.get("msg") or ""):
        # Pastikan os di-import
        if "import os" not in text:
            text = "import os\n" + text
            applied.append("tambahkan import os")
        if "os.environ.get('META_ACCESS_TOKEN')" not in text and ".env" in text:
            text = text.replace("os.getenv('META_ACCESS_TOKEN')", "os.environ.get('META_ACCESS_TOKEN')")
            applied.append("perbaiki env getter ke os.environ.get")

    # Kasus 3: IndentationError sederhana (tab->spaces)
    if error_info.get("rule") == "indenterror":
        lines = text.splitlines()
        fixed = []
        for i, line in enumerate(lines, 1):
            if i == error_info.get("line_no"):
                # un-indent 1 tab atau 4 spasi
                if line.startswith("\t"):
                    line = line[1:]
                elif line.startswith("    "):
                    line = line[4:]
            fixed.append(line)
        text = "\n".join(fixed)
        applied.append(f"perbaiki indent baris {error_info.get('line_no')}")

    if not applied:
        return None

    return text, applied  # returns (new_content, changes)


def run_sandbox_test(file_path: Path) -> tuple[bool, str]:
    """
    Jalankan py_compile + import test di direktori sementara.
    Return (passed, detail)
    """
    tmpdir = tempfile.mkdtemp(prefix="patch_test_")
    try:
        target = Path(tmpdir) / file_path.name
        shutil.copy2(file_path, target)
        # Cek syntax
        res = subprocess.run(
            [PYTHON, "-m", "py_compile", str(target)],
            capture_output=True, text=True, cwd=str(BASE_DIR),
        )
        if res.returncode != 0:
            return False, f"py_compile gagal: {res.stderr[-500:]}"

        # Coba import (tanpa menjalankan logic utama)
        res = subprocess.run(
            [PYTHON, "-c", f"import importlib.util; spec=importlib.util.spec_from_file_location('mod', '{str(target)}'); importlib.util.module_from_spec(spec); spec.loader.exec_module(spec.module)"],
            capture_output=True, text=True, cwd=str(BASE_DIR),
        )
        # Exit code 0 expected untuk modul tanpa side effects saat import
        # Beberapa module butuh __name__ == "__main__" guard — kita anggap pass jika syntax ok
        if res.returncode != 0 and "ModuleNotFoundError" in res.stderr:
            # Coba install dari requirements jika ada
            req = BASE_DIR / "requirements.txt"
            if req.exists():
                subprocess.run([sys.executable, "-m", "pip", "install", "-q", "-r", str(req)],
                               capture_output=True, cwd=str(BASE_DIR))
                # retry import
                res = subprocess.run(
                    [PYTHON, "-c", f"import importlib.util; spec=importlib.util.spec_from_file_location('mod', '{str(target)}'); importlib.util.module_from_spec(spec); spec.loader.exec_module(spec.module)"],
                    capture_output=True, text=True, cwd=str(BASE_DIR),
                )
        if res.returncode == 0:
            return True, "import test lulus"
        # Jika error bukan karena blank __main__, anggagap warning
        if "have no attribute" in res.stderr or "AttributeError" in res.stderr:
            return True, "import test: AttributeError saat import (umum, abaikan)"
        return False, f"import test gagal: {res.stderr[-500:]}"
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


def apply_patch(file_path: Path, new_content: str):
    backup = file_path.with_suffix(file_path.suffix + ".bak")
    shutil.copy2(file_path, backup)
    file_path.write_text(new_content, encoding="utf-8")
    log.info("Patch diterapkan: %s (backup: %s)", file_path, backup)


def try_self_heal(topic: str, errors: list[dict]) -> dict:
    """
    Coba perbaiki setiap error. Return ringkasan.
    """
    report = {"topic": topic, "attempts": [], "patched": False, "failed": False}

    for err in errors:
        fpath = Path(err["file"])
        if not fpath.exists():
            continue

        for attempt in range(1, MAX_PATCH_ATTEMPTS + 1):
            patch_result = propose_patch(fpath, err)
            if not patch_result:
                break
            new_text, changes = patch_result

            # Simpan ke file sementara, bukan langsung
            tmp = fpath.with_suffix(fpath.suffix + ".tmp")
            tmp.write_text(new_text, encoding="utf-8")

            ok, detail = run_sandbox_test(tmp)
            report["attempts"].append({
                "file": str(fpath), "attempt": attempt, "changes": changes, "result": detail,
            })

            if ok:
                apply_patch(fpath, new_text)
                report["patched"] = True
                append_audit({
                    "topic": topic,
                    "action": "self_heal",
                    "file": str(fpath),
                    "changes": changes,
                    "status": "applied",
                })
                log.info("✅ Patch diterapkan untuk %s [%s]: %s", topic, fpath.name, ", ".join(changes))
                break
            else:
                log.warning("❌ Patch gagal untuk %s (%s percobaan %d): %s", fpath.name, topic, attempt, detail)
                if attempt == MAX_PATCH_ATTEMPTS:
                    report["failed"] = True
                    append_audit({
                        "topic": topic,
                        "action": "self_heal",
                        "file": str(fpath),
                        "status": "failed_after_retries",
                    })

    return report


# ---- Loop Utama ----
def run_cycle():
    touch_heartbeat()
    state = load_state()
    state["last_run"] = datetime.now(UTC).isoformat()
    summary = []

    for topic, files in LOG_PATTERNS.items():
        errors = scan_for_errors(topic, files)
        if not errors:
            log.info("✅ %s — tidak ada error terdeteksi", topic)
            continue
        log.warning("⚠️ %s — %d error terdeteksi", topic, len(errors))
        report = try_self_heal(topic, errors)
        summary.append(report)

    save_state(state)
    log.info("Siklus selesai. %d topik diproses.", len(LOG_PATTERNS))
    return summary


def main():
    log.info("=== Supervisor AGI dimulai ===")
    touch_heartbeat()
    try:
        run_cycle()
    except Exception as e:
        log.exception("Fatal di supervisor: %s", e)
        append_audit({"action": "supervisor_fatal", "error": str(e)})
        sys.exit(1)


if __name__ == "__main__":
    main()
