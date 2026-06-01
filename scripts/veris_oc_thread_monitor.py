#!/usr/bin/env python3
"""
OpenClaw Thread Monitor — Cek semua OpenClaw threads/sessions tiap 15 menit
Report dikirim ke Report Army Group via Telethon
"""

import asyncio
import json
import os
import glob
import time
from datetime import datetime, timezone, timedelta
from telethon import TelegramClient

API_ID = 23913448
API_HASH = "78d168f985edf365a5cd9679a917a0b2"
SESSION_PATH = os.path.expanduser(
    "~/.openclaw/workspace/.vilona/sessions/veris_oc_monitor.session"
)
REPORT_GROUP_ID = -1003788883693  # Report Army Group (OLD)
VERIS_CHAT_ID = 157228659  # Veris personal chat — kirim kesini bro, bukan ke paijo
SESSIONS_DIR = os.path.expanduser("~/.openclaw/agents/main/sessions")
INTERVAL_SECONDS = 15 * 60  # 15 menit

LOG_FILE = os.path.expanduser("~/.openclaw/workspace/logs/veris_oc_monitor.log")
os.makedirs(os.path.dirname(LOG_FILE), exist_ok=True)


def log(msg: str):
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    line = f"[{ts}] {msg}"
    print(line)
    with open(LOG_FILE, "a") as f:
        f.write(line + "\n")


def parse_transcript(path: str):
    """Parse a .jsonl transcript file to extract session info"""
    try:
        stat = os.stat(path)
        size_kb = stat.st_size / 1024
        mtime = datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc)

        # Read last few lines to find final status
        lines = []
        with open(path, "r") as f:
            # Read last 50 lines max
            f.seek(0, 2)
            fsize = f.tell()
            chunk_size = 4096
            read_pos = max(0, fsize - chunk_size * 3)
            f.seek(read_pos)
            lines = f.readlines()

        role = "unknown"
        status = "unknown"
        total_tokens = 0
        model = "unknown"
        agent_id = "unknown"

        for line in lines:
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
                if "role" in entry:
                    role = entry["role"]
                if "status" in entry:
                    status = entry["status"]
                if "totalTokens" in entry:
                    total_tokens = entry["totalTokens"]
                if "model" in entry:
                    model = entry["model"]
                if "agentId" in entry:
                    agent_id = entry["agentId"]
            except json.JSONDecodeError:
                continue

        # Determine session type from filename
        fname = os.path.basename(path).replace(".jsonl", "")

        return {
            "id": fname[:32],
            "agent": agent_id,
            "model": str(model)[:40],
            "status": status,
            "tokens": total_tokens,
            "size_kb": size_kb,
            "mtime": mtime,
            "path": path,
        }
    except Exception as e:
        return {"id": os.path.basename(path)[:32], "error": str(e), "status": "error"}


def get_all_sessions():
    """Scan all session transcript files"""
    pattern = os.path.join(SESSIONS_DIR, "*.jsonl")
    files = glob.glob(pattern)

    sessions = []
    for f in sorted(files, key=os.path.getmtime, reverse=True):
        info = parse_transcript(f)
        sessions.append(info)

    return sessions


def build_report(sessions, check_num):
    """Build a formatted report markdown message"""
    now = datetime.now(timezone.utc) + timedelta(hours=7)  # WIB
    wib = now.strftime("%H:%M WIB")

    # Group by status
    running = [s for s in sessions if s.get("status") == "running"]
    done = [s for s in sessions if s.get("status") == "done"]
    failed = [s for s in sessions if s.get("status") == "failed"]
    error = [s for s in sessions if s.get("status") == "error"]
    unknown = [
        s
        for s in sessions
        if s.get("status") not in ("running", "done", "failed", "error")
    ]

    # Recent activity (last 1 hour)
    cutoff = datetime.now(timezone.utc) - timedelta(hours=1)
    recent = [s for s in sessions if s.get("mtime") and s["mtime"] > cutoff]

    # Total tokens & cost estimate
    total_tokens = sum(s.get("tokens", 0) for s in sessions if s.get("tokens"))
    est_cost = total_tokens * 0.6 / 1_000_000  # rough $0.6/M tokens

    lines = [
        f"🧵 **OPENCLAW THREADS REPORT #{check_num}**",
        f"🕐 {wib} | Interval: 15 menit",
        "",
        f"📊 **Summary:**",
        f"  🟢 Running: **{len(running)}**",
        f"  ✅ Done: {len(done)}",
        f"  ❌ Failed: {len(failed)}",
        f"  ⚠️ Unknown: {len(unknown)}",
        f"  📁 Total sessions: {len(sessions)}",
        f"  🔥 Recent (1h): {len(recent)}",
        "",
        f"💰 **Usage:**",
        f"  Total tokens: {total_tokens:,}",
        f"  Est. cost: ${est_cost:.4f}",
    ]

    # Running sessions detail
    if running:
        lines.append("")
        lines.append("🟢 **RUNNING NOW:**")
        for s in running[:15]:
            mid = s.get("id", "?")[:12]
            agent = s.get("agent", "?")
            model = s.get("model", "?")
            tokens = s.get("tokens", 0)
            lines.append(f"  • `{mid}` [{agent}] {model} — {tokens:,} tokens")

    # Recent failures
    recent_failed = [s for s in failed if s.get("mtime") and s["mtime"] > cutoff]
    if recent_failed:
        lines.append("")
        lines.append(f"❌ **RECENT FAILURES ({len(recent_failed)}):**")
        for s in recent_failed[:10]:
            mid = s.get("id", "?")[:12]
            mtime = s.get("mtime")
            time_str = mtime.strftime("%H:%M") if mtime else "?"
            lines.append(f"  • `{mid}` @ {time_str}")

    lines.append("")
    lines.append(f"⏳ _Next check in 15 menit_ | 🤖 Vilona OC Monitor")

    return "\n".join(lines)


async def main_loop():
    client = TelegramClient(SESSION_PATH, API_ID, API_HASH)
    await client.connect()

    if not await client.is_user_authorized():
        log("❌ SESSION INVALID — need re-login")
        return

    me = await client.get_me()
    log(f"🚀 OpenClaw Thread Monitor started for @{me.username}")
    log(f"Interval: {INTERVAL_SECONDS}s | Report to: Report Army Group")

    check_num = 0

    while True:
        try:
            check_num += 1
            log(f"📊 Check #{check_num} — scanning sessions...")

            sessions = get_all_sessions()
            report = build_report(sessions, check_num)

            # Send to Report Army Group
            await client.send_message(VERIS_CHAT_ID, report)
            log(
                f"📤 Report #{check_num} sent to Report Army Group ({len(sessions)} sessions)"
            )

            log(f"⏳ Next check in 15 min...")
            await asyncio.sleep(INTERVAL_SECONDS)

        except Exception as e:
            log(f"⚠️ Error: {e}")
            await asyncio.sleep(60)


if __name__ == "__main__":
    log("=" * 60)
    log("🧵 OPENCLAW THREAD MONITOR STARTING")
    log("=" * 60)
    asyncio.run(main_loop())
