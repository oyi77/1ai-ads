import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

PROJECT_ROOT = Path.home() / "projects" / "1ai-ads"
STATE_DIR = PROJECT_ROOT / "autonomy" / "reporter"
STATE_DIR.mkdir(parents=True, exist_ok=True)
STATE_FILE = STATE_DIR / "reporter_state.json"

LOG_DIR = PROJECT_ROOT / "logs"
WATCH_SERVICES = [
    "vilona-trakpro-0858.service",
    "vilona-0858-guardian.service",
    "vilona-trakpro-1134.service",
    "vilona-tradefx-bot.service",
    "vilona-trakpro.service",
    "vilona-guardian.service",
    "autonomous_watchdog.service",
]


def today_bounds():
    now_wib = datetime.now(timezone(timedelta(hours=7)))
    start = now_wib.replace(hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc)
    return start, now_wib.astimezone(timezone.utc)


def load_state():
    try:
        return json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {"reports": []}


def save_state(state):
    STATE_FILE.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")


def systemd_status(service):
    try:
        out = subprocess.run(["systemctl", "--user", "is-active", service], text=True, capture_output=True)
        return (out.stdout or out.stderr or "").strip()
    except Exception:
        return "unknown"


def recent_service_events(since):
    events = []
    try:
        out = subprocess.run(["journalctl", "--user", "--since", since.isoformat(), "-o", "short-iso"],
                             text=True, capture_output=True, check=False)
        for line in (out.stdout or "").splitlines():
            for svc in WATCH_SERVICES:
                if svc in line and any(k in line for k in ["Failed", "Starting", "Started", "Stopped", "Main process", "Failed with result"]):
                    events.append(line)
    except Exception:
        pass
    return events[-200:]


def bugfinder_summary(since):
    try:
        out = subprocess.run(["grep", "-h", "--binary-files=without-match", "-E", "applied=|skipped=|findings=",
                              str(LOG_DIR / "bugfinder.log")], text=True, capture_output=True)
        lines = []
        for line in (out.stdout or "").splitlines():
            try:
                ts_str = line.split("]", 1)[0].strip("[")
                ts = datetime.fromisoformat(ts_str)
                if ts >= since:
                    lines.append(line)
            except Exception:
                pass
        return lines[-50:]
    except Exception:
        return []


def commander_events(since):
    try:
        out = subprocess.run(["grep", "-h", "--binary-files=without-match", "-E",
                              "(WARN|ERROR|REPORT|PATCH|PING|PONG|restart-service|)",
                              str(LOG_DIR / "telegram_commander.log")], text=True, capture_output=True)
        lines = []
        for line in (out.stdout or "").splitlines():
            try:
                ts_str = line.split("]", 1)[0].strip("[")
                ts = datetime.fromisoformat(ts_str)
                if ts >= since:
                    lines.append(line)
            except Exception:
                pass
        return lines[-80:]
    except Exception:
        return []


def build_report():
    start, end = today_bounds()
    service_table = []
    for svc in WATCH_SERVICES:
        status = systemd_status(svc)
        service_table.append(f"- `{svc}`: {status}")

    svc_events = recent_service_events(start)
    bug_events = bugfinder_summary(start)
    cmd_events = commander_events(start)

    report = [
        "*📊 Harian Hermes — Autonomy Stack*",
        f"Tanggal: {start.astimezone(timezone(timedelta(hours=7))).strftime('%Y-%m-%d')}",
        "",
        "*Service Health*",
        *service_table,
        "",
        f"*Service Events (24h):* {len(svc_events)}",
    ]
    if svc_events:
        report.append("```")
        report.extend(svc_events[-8:])
        report.append("```")

    report.append(f"*Bugfinder Activity (24h):* {len(bug_events)}")
    if bug_events:
        report.append("```")
        report.extend(bug_events[-6:])
        report.append("```")

    report.append(f"*Commander Events (24h):* {len(cmd_events)}")
    if cmd_events:
        report.append("```")
        report.extend(cmd_events[-6:])
        report.append("```")

    report.append("")
    report.append("Generated: " + end.astimezone(timezone(timedelta(hours=7))).strftime("%Y-%m-%d %H:%M:%S WIB"))
    return "\n".join(report)


def send_telegram(text: str):
    try:
        import requests
        env_path = Path("/home/openclaw/projects/1ai-ads/.env")
        token = ""
        if env_path.exists():
            for line in env_path.read_text(encoding="utf-8", errors="ignore").splitlines():
                if line.startswith("TELEGRAM_BOT_TOKEN="):
                    token = line.split("=", 1)[1].strip().strip('"')
                    break
        token = token or os.getenv("TELEGRAM_BOT_TOKEN", "")
        if not token:
            print("reporter: telegram token missing", flush=True)
            return False
        chat = "157228659"
        url = f"https://api.telegram.org/bot{token}/sendMessage"
        payload = {
            "chat_id": chat,
            "text": text,
            "parse_mode": "Markdown",
            "disable_web_page_preview": True,
        }
        r = requests.post(url, json=payload, timeout=30)
        r.raise_for_status()
        data = r.json()
        return data.get("ok", False)
    except Exception as exc:
        print(f"reporter: telegram send failed: {exc}", flush=True)
        return False


def main():
    report = build_report()
    print(report)
    send_telegram(report)
    state = load_state()
    state.setdefault("reports", []).append({
        "ts": datetime.now(timezone.utc).isoformat(),
        "length": len(report),
    })
    state["reports"] = state["reports"][-30:]
    save_state(state)


if __name__ == "__main__":
    main()
