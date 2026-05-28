#!/usr/bin/env python3
"""
Veris Chat Monitor — Cek semua chat/thread tiap 15 menit
Runs as daemon, reports new activity via output log
"""

import asyncio
import json
import os
from datetime import datetime, timezone
from telethon import TelegramClient, events
from telethon.tl.types import User, Chat, Channel

API_ID = 23913448
API_HASH = "78d168f985edf365a5cd9679a917a0b2"
SESSION_PATH = os.path.expanduser("~/.openclaw/workspace/.vilona/sessions/veris.session")
STATE_FILE = os.path.expanduser("~/.openclaw/workspace/.vilona/veris_monitor_state.json")
LOG_FILE = os.path.expanduser("~/.openclaw/workspace/logs/veris_monitor.log")
INTERVAL_SECONDS = 15 * 60  # 15 menit
REPORT_GROUP_ID = -1003788883693  # Report Army Group

os.makedirs(os.path.dirname(LOG_FILE), exist_ok=True)
os.makedirs(os.path.dirname(STATE_FILE), exist_ok=True)

def log(msg: str):
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    line = f"[{ts}] {msg}"
    print(line)
    with open(LOG_FILE, "a") as f:
        f.write(line + "\n")

def load_state():
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE) as f:
            return json.load(f)
    return {"last_check": None, "dialogs_last_unread": {}, "total_unread_history": []}

def save_state(state):
    with open(STATE_FILE, "w") as f:
        json.dump(state, f, indent=2)

async def send_report(client, summaries, total_unread, total_mentions, new_activity, check_num):
    """Send formatted report to Report Army Group"""
    now = datetime.now(timezone.utc)
    wib = now.strftime("%H:%M WIB")
    
    # Build report message
    lines = [
        f"📊 **VERIS MONITOR REPORT #{check_num}**",
        f"🕐 {wib} | Interval: 15 menit",
        "",
        f"📈 **Total Unread:** {total_unread:,}",
        f"🔔 **Total Mentions:** {total_mentions:,}",
        f"💬 **Chat dengan Unread:** {len(summaries)}",
    ]
    
    if new_activity:
        lines.append("")
        lines.append(f"🆕 **NEW ACTIVITY ({len(new_activity)} chats):**")
        for a in new_activity[:10]:
            emoji = "🔔" if a["mentions"] > 0 else "📨"
            lines.append(f"  {emoji} {a['name']}: +{a['new_since_last']:,} msgs")
    
    lines.append("")
    lines.append("🔝 **TOP 10 ACTIVE:**")
    for i, s in enumerate(summaries[:10], 1):
        mention = " 🔔" if s["mentions"] > 0 else ""
        type_icon = "👤" if s["is_user"] else ("📢" if s["is_channel"] else "👥")
        lines.append(f"  {i}. {type_icon} {s['name']}: {s['unread']:,}{mention}")
    
    lines.append("")
    lines.append(f"⏳ _Next report in 15 menit_ | 🤖 Vilona Monitor")
    
    message = "\n".join(lines)
    
    try:
        await client.send_message(REPORT_GROUP_ID, message)
        log(f"📤 Report sent to Report Army Group")
    except Exception as e:
        log(f"⚠️ Failed to send report: {e}")

async def get_dialog_summary(client):
    """Get summary of ALL dialogs with unread counts"""
    summaries = []
    total_unread = 0
    total_mentions = 0
    
    async for d in client.iter_dialogs():
        total_unread += d.unread_count
        total_mentions += d.unread_mentions_count
        
        if d.unread_count > 0 or d.unread_mentions_count > 0:
            entity = d.entity
            name = d.name or "Unknown"
            if hasattr(entity, 'username') and entity.username:
                name = f"@{entity.username}"
            
            summaries.append({
                "id": d.id,
                "name": name,
                "unread": d.unread_count,
                "mentions": d.unread_mentions_count,
                "is_group": d.is_group,
                "is_channel": d.is_channel,
                "is_user": d.is_user,
            })
    
    # Sort by most unread first
    summaries.sort(key=lambda x: x["unread"] + x["mentions"], reverse=True)
    return summaries, total_unread, total_mentions

async def main_loop():
    client = TelegramClient(SESSION_PATH, API_ID, API_HASH)
    
    await client.connect()
    if not await client.is_user_authorized():
        log("❌ SESSION INVALID — need re-login")
        return
    
    me = await client.get_me()
    log(f"🚀 Veris Monitor started for @{me.username}")
    log(f"Interval: {INTERVAL_SECONDS}s (every 15 min)")

    state = load_state()
    
    while True:
        try:
            summaries, total_unread, total_mentions = await get_dialog_summary(client)
            
            now = datetime.now(timezone.utc).isoformat()
            
            # Track history
            state["total_unread_history"].append({
                "time": now,
                "total_unread": total_unread,
                "total_mentions": total_mentions,
                "unread_chats": len(summaries),
            })
            # Keep last 96 entries (24 hours)
            if len(state["total_unread_history"]) > 96:
                state["total_unread_history"] = state["total_unread_history"][-96:]
            
            # Detect new unread vs previous check
            prev_unread = state.get("dialogs_last_unread", {})
            new_activity = []
            
            for s in summaries:
                did = str(s["id"])
                prev = prev_unread.get(did, {})
                prev_count = prev.get("unread", 0)
                if s["unread"] > prev_count and prev_count >= 0:
                    new_msgs = s["unread"] - prev_count
                    new_activity.append({**s, "new_since_last": new_msgs})
            
            # Update state
            state["dialogs_last_unread"] = {
                str(s["id"]): {"unread": s["unread"], "mentions": s["mentions"], "name": s["name"]}
                for s in summaries
            }
            state["last_check"] = now
            save_state(state)
            
            # Report
            log(f"📊 Check #{len(state['total_unread_history'])} | Total unread: {total_unread} | Mentions: {total_mentions} | Chats w/ unread: {len(summaries)}")
            
            if new_activity:
                log(f"🆕 NEW ACTIVITY in {len(new_activity)} chats:")
                for a in new_activity[:15]:  # Max 15 shown
                    log(f"   📨 {a['name']}: +{a['new_since_last']} messages (total unread: {a['unread']}, mentions: {a['mentions']})")
            
            # Top 10 most active chats
            if summaries:
                log("🔝 TOP ACTIVE CHATS:")
                for s in summaries[:10]:
                    mention_flag = " 🔔" if s["mentions"] > 0 else ""
                    type_flag = "👤" if s["is_user"] else ("📢" if s["is_channel"] else "👥")
                    log(f"   {type_flag} {s['name']}: {s['unread']} unread{mention_flag}")
            
            # Send report to Report Army Group
            check_num = len(state["total_unread_history"])
            await send_report(client, summaries, total_unread, total_mentions, new_activity, check_num)
            
            log(f"⏳ Next check in 15 min...")
            await asyncio.sleep(INTERVAL_SECONDS)
            
        except Exception as e:
            log(f"⚠️ Error in check loop: {e}")
            await asyncio.sleep(60)  # Retry in 1 min if error

if __name__ == "__main__":
    log("=" * 60)
    log("🔍 VERIS CHAT MONITOR DAEMON STARTING")
    log("=" * 60)
    asyncio.run(main_loop())
