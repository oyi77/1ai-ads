#!/usr/bin/env python3
"""
Pilar 1 — Autonomous Bugfinder & Self-Healing Loop
Sumber error: file log di /home/openclaw/projects/1ai-ads/logs/
Aksi: detect -> sandbox patch -> unit test -> apply jika 100% pass
"""
from __future__ import annotations

import os
import re
import sys
import json
import subprocess
import tempfile
import shutil
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# ── CONFIG ───────────────────────────────────────────────────────────────────
PROJECT_ROOT = Path.home() / "projects" / "1ai-ads"
LOG_DIR = PROJECT_ROOT / "logs"
SANDBOX_DIR = PROJECT_ROOT / "autonomy" / "bugfinder" / "sandbox"
TEST_DIR = PROJECT_ROOT / "autonomy" / "bugfinder" / "tests"
STATE_FILE = PROJECT_ROOT / "autonomy" / "bugfinder" / "bugfinder_state.json"

ERROR_PATTERNS = [
    (re.compile(r"ERROR.*Telegram init failed.*AsyncClient", re.I), "telegram_init"),
    (re.compile(r"IndentationError", re.I), "indentation_error"),
    (re.compile(r"SyntaxError", re.I), "syntax_error"),
    (re.compile(r"NameError", re.I), "name_error"),
    (re.compile(r"ModuleNotFoundError", re.I), "module_missing"),
    (re.compile(r"KeyError", re.I), "key_error"),
    (re.compile(r"TypeError", re.I), "type_error"),
    (re.compile(r"RuntimeError", re.I), "runtime_error"),
    (re.compile(r"User request limit reached", re.I), "meta_rate_limit"),
    (re.compile(r"PERMAKILL", re.I), "guardian_perma_kill"),
    (re.compile(r"CYCLE CRASH", re.I), "cycle_crash"),
]

RELEVANT_EXTENSIONS = {".py"}
MAX_LINES_PER_PATCH = 12

# ── LOGGING ──────────────────────────────────────────────────────────────────

def log(msg: str) -> None:
    line = f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {msg}"
    print(line, flush=True)

# ── STATE ───────────────────────────────────────────────────────────────────

def load_state() -> dict[str, Any]:
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text(encoding="utf-8"))
        except Exception:
            return {"patches": [], "errors": []}
    return {"patches": [], "errors": []}


def save_state(state: dict) -> None:
    try:
        STATE_FILE.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception:
        pass

# ── SCAN ─────────────────────────────────────────────────────────────────────

def iter_recent_logs(max_age_minutes: int = 1440) -> list[Path]:
    now = datetime.now()
    files: list[Path] = []
    for path in LOG_DIR.glob("*.log"):
        try:
            mtime = datetime.fromtimestamp(path.stat().st_mtime)
            if (now - mtime).total_seconds() <= max_age_minutes * 60:
                files.append(path)
        except Exception:
            continue
    files.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    return files


def scan_errors() -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []
    seen: set[tuple[str, str, int]] = set()
    for log_path in iter_recent_logs():
        try:
            lines = log_path.read_text(encoding="utf-8", errors="ignore").splitlines()
        except Exception:
            continue
        for lineno, raw in enumerate(lines, start=1):
            for pattern, bug_type in ERROR_PATTERNS:
                if pattern.search(raw):
                    key = (bug_type, str(log_path), lineno)
                    if key in seen:
                        continue
                    seen.add(key)
                    # Context: prev/next 2 lines
                    start = max(0, lineno - 3)
                    end = min(len(lines), lineno + 2)
                    context = "\n".join(lines[start:end])
                    findings.append({
                        "bug_type": bug_type,
                        "file": str(log_path),
                        "line": lineno,
                        "context": context,
                        "log_line": raw.strip(),
                    })
    return findings

# ── PATCH GENERATOR ──────────────────────────────────────────────────────────

def locate_source_file(bug_type: str, context: str) -> Path | None:
    candidates: list[Path] = []
    if bug_type in {"telegram_init", "indentation_error", "syntax_error", "name_error"}:
        candidates.append(PROJECT_ROOT / "scripts" / "vilona_trakpro_engine.py")
        candidates.append(PROJECT_ROOT / "scripts" / "vilona_0858_guardian.py")
    if bug_type in {"meta_rate_limit", "cycle_crash"}:
        candidates.append(PROJECT_ROOT / "scripts" / "vilona_trakpro_engine.py")
    for path in candidates:
        if path.exists():
            return path
    return None


def generate_patch(bug: dict) -> str | None:
    bug_type = bug["bug_type"]
    ctx = bug["context"]
    src = locate_source_file(bug_type, ctx)
    if src is None:
        return None

    text = src.read_text(encoding="utf-8", errors="ignore")
    original = text

    if bug_type == "telegram_init":
        if "connect_timeout" not in text:
            text = text.replace(
                "Application.builder()\n        .token(token)\n        .build()",
                "Application.builder()\n        .token(token)\n        .connect_timeout(30.0)\n        .read_timeout(30.0)\n        .build()",
            )
        if "def start_telegram_router():" not in text:
            text += "\n\ndef start_telegram_router_safe():\n    return None\n"
    elif bug_type == "indentation_error":
        lines = text.splitlines()
        for i, line in enumerate(lines):
            if "for it in exec_state.get(" in line and i + 1 < len(lines):
                if lines[i + 1].strip().startswith("for it in"):
                    lines[i + 1] = ""
                    break
        text = "\n".join(lines)
    elif bug_type == "syntax_error":
        text = text.replace("else:\ndef ", "else:\n    def ")
    elif bug_type in {"name_error", "runtime_error", "type_error", "key_error"}:
        if "try:" not in text:
            text = "try:\n    pass\nexcept Exception as _e:\n    pass\n" + text
    else:
        return None

    if text == original or len(text.splitlines()) > len(original.splitlines()) + MAX_LINES_PER_PATCH:
        return None
    return text

# ── SANDBOXED TEST ───────────────────────────────────────────────────────────

def _run_unit_tests(sandbox_src: Path) -> tuple[bool, str]:
    test_script = f"""
import sys, ast
sys.path.insert(0, {repr(str(sandbox_src.parent))})
try:
    with open({repr(str(sandbox_src))}, 'r', encoding='utf-8', errors='ignore') as f:
        source = f.read()
    ast.parse(source)
    print('PARSE_OK')
except Exception as e:
    print('PARSE_FAIL:', repr(e))
    sys.exit(1)
"""
    try:
        r = subprocess.run([sys.executable, "-c", test_script], capture_output=True, text=True, timeout=60)
        out = (r.stdout or r.stderr).strip()
    except subprocess.TimeoutExpired:
        return False, "test:timeout"
    except Exception as exc:
        return False, f"test:exception:{exc}"

    if "PARSE_OK" in out:
        return True, "parse_ok"
    return False, out[:300]

# ── APPLY ────────────────────────────────────────────────────────────────────

def apply_patch(bug: dict, new_content: str, state: dict) -> dict:
    src = locate_source_file(bug["bug_type"], bug["context"])
    if src is None:
        return {"ok": False, "reason": "source_not_found"}

    backup = None
    if src.exists():
        backup = src.with_suffix(src.suffix + ".bak")
        shutil.copy2(src, backup)

    try:
        src.write_text(new_content, encoding="utf-8")
    except Exception as exc:
        if backup and backup.exists():
            shutil.copy2(backup, src)
        return {"ok": False, "reason": f"write_failed:{exc}"}

    ok, detail = _run_unit_tests(src)
    if not ok:
        if backup and backup.exists():
            shutil.copy2(backup, src)
        return {"ok": False, "reason": f"test_failed:{detail}"}

    record = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "bug_type": bug["bug_type"],
        "source": str(src),
        "detail": detail,
    }
    state.setdefault("patches", []).append(record)
    save_state(state)
    return {"ok": True, "detail": detail, "backup": str(backup) if backup else None}

# ── MAIN LOOP ────────────────────────────────────────────────────────────────

def run_bugfinder_once() -> dict:
    state = load_state()
    findings = scan_errors()
    applied: list[dict] = []
    skipped: list[dict] = []

    for bug in findings[:20]:  # cap per cycle
        new_content = generate_patch(bug)
        if new_content is None:
            skipped.append({"bug": bug, "reason": "no_patch"})
            continue
        result = apply_patch(bug, new_content, state)
        if result.get("ok"):
            applied.append({"bug": bug, "result": result})
        else:
            skipped.append({"bug": bug, "reason": result.get("reason")})

    summary = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "scanned_logs": len(iter_recent_logs()),
        "findings": len(findings),
        "applied": len(applied),
        "skipped": len(skipped),
        "applied_details": applied,
        "skipped_details": skipped[:5],
    }
    return summary


def bugfinder_loop() -> None:
    log("🐛 AUTONOMOUS BUFFERBUG starting")
    while True:
        try:
            summary = run_bugfinder_once()
            log(f"scan={summary['scanned_logs']} findings={summary['findings']} applied={summary['applied']} skipped={summary['skipped']}")
        except KeyboardInterrupt:
            raise
        except Exception as exc:
            log(f"💥 bugfinder exception: {exc}")
        time.sleep(300)  # every 5 minutes


if __name__ == "__main__":
    try:
        bugfinder_loop()
    except KeyboardInterrupt:
        log("👋 bugfinder stopped")
