#!/usr/bin/env python3
"""
PILAR 2 + 3 — OS-level Autonomy: watchdog, notification, scheduler, self-repair watchdog
"""

import os, sys, json, shutil, subprocess, tempfile
from datetime import datetime, UTC
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
OPS = REPO / "ops"
STATE = OPS / "os_autonomy_state.json"

def utcnow_iso():
    return datetime.now(UTC).isoformat()

def read_json(path, default):
    try:
        return json.loads(path.read_text())
    except Exception:
        return default

def write_json(path, data):
    path.write_text(json.dumps(data, indent=2))

def touch_heartbeat(name):
    p = OPS / f"{name}.heartbeat"
    p.write_text(utcnow_iso())

def append_audit(ev):
    p = OPS / "audit.jsonl"
    try:
        with p.open("a") as f:
            f.write(json.dumps({"ts": utcnow_iso(), **ev}) + "\n")
    except Exception:
        pass

def run(cmd, **kw):
    return subprocess.run(cmd, capture_output=True, text=True, **kw)

def deploy_service_files():
    """Salin systemd unit + timer ke /etc jika belum ada."""
    etc = Path("/etc/systemd/system")
    etc.mkdir(parents=True, exist_ok=True)
    units = {
        "1ai-ads-supervisor.service": (OPS / "systemd" / "1ai-ads-supervisor.service"),
        "1ai-ads-reporter.timer": (OPS / "systemd" / "1ai-ads-reporter.timer"),
        "1ai-ads-reporter.service": (OPS / "systemd" / "1ai-ads-reporter.service"),
        "1ai-ads-watchdog.service": (OPS / "systemd" / "1ai-ads-watchdog.service"),
        "1ai-ads-watchdog.timer": (OPS / "systemd" / "1ai-ads-watchdog.timer"),
    }
    deployed = []
    for name, src in units.items():
        if not src.exists():
            return {"error": f"Missing unit file: {src}", "deployed": deployed}
        dst = etc / name
        if not dst.exists():
            shutil.copy2(src, dst)
            run(["systemctl", "daemon-reload"])
            deployed.append(name)
    return {"deployed": deployed}

def ensure_running(name):
    r = run(["systemctl", "is-active", "--quiet", name])
    if r.returncode != 0:
        run(["systemctl", "start", name])

def enable_timers():
    for t in ["1ai-ads-reporter.timer", "1ai-ads-watchdog.timer"]:
        run(["systemctl", "enable", "--now", t])

def main():
    os.makedirs(OPS, exist_ok=True)
    touch_heartbeat("os_autonomy")
    state = read_json(STATE, {"bootstrapped": False, "last_run": None})
    res = deploy_service_files()
    if not res["deployed"]:
        for t in ["1ai-ads-reporter.timer", "1ai-ads-watchdog.timer"]:
            ensure_running(t)
    else:
        enable_timers()
    state.update({"bootstrapped": True, "last_run": utcnow_iso(), "deployed": res["deployed"]})
    write_json(STATE, state)
    append_audit({"action": "os_autonomy_bootstrap", "deployed": res["deployed"]})
    print("OK", json.dumps(state, indent=2))

if __name__ == "__main__":
    main()
