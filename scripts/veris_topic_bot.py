#!/usr/bin/env python3
"""
Veris Topic Bot — Telegram Userbot dengan fitur Thread/Topic Management
Menggunakan session Veris sendiri (veris.session), bukan paijo.session.
Dibuat berdasarkan request #53495.

Fitur:
  - List semua topic/thread di group
  - Kirim pesan ke topic spesifik
  - Create topic baru di group (forum-enabled groups)
  - Close/reopen topic
  - Monitor topic activity
  - Report ke Report Army Group

Usage:
  python3 veris_topic_bot.py daemon           # Loop 15 menit (monitor + report)
  python3 veris_topic_bot.py topics <group_id> # List topics di group
  python3 veris_topic_bot.py send <topic_id> <msg>  # Kirim ke topic
  python3 veris_topic_bot.py status           # Status bot
"""

import asyncio
import json
import os
import sys
import time
from datetime import datetime, timedelta
from typing import Optional

from telethon import TelegramClient
from telethon.tl.functions.messages import GetForumTopicsRequest
from telethon.tl.types import (
    InputChannel,
    Message,
)

# ═══════════════════════════════════════════════════════════════
# CONFIG — Veris's own session (bukan paijo.session)
# ═══════════════════════════════════════════════════════════════
API_ID = 23913448
API_HASH = "78d168f985edf365a5cd9679a917a0b2"
SESSION_PATH = os.path.expanduser(
    "~/.openclaw/workspace/.vilona/sessions/veris.session"
)
REPORT_GROUP_ID = -1003788883693  # Report Army Group (OLD)
VERIS_CHAT_ID = 157228659  # Veris personal chat — kirim kesini bro, bukan ke paijo

# Group/Channel tempat topic bot beroperasi
# Format: {name: group_id}
# Diambil dari scan forum groups Veris (51 total forum groups)
TARGET_GROUPS = {
    # ── AI/TECH ──
    "vip-ai-agent": -1002618823726,  # Member VIP AI Agent community
    "vidabot": -1002360202546,  # VIDABOT - Video AI Robot
    "markibot-labs": -1002535819394,  # M A R K I B O T Labs
    "tekno-ai": -1002646824083,  # TEKNO AI GLOBAL
    "ai-creative": -1002710114205,  # AI Creative Community by @abangtedy_
    # ── MARKETING / ADS / AFFILIATE ──
    "iklan-jos": -1002177884783,  # IKLAN JOS, ANTI BONCOS
    "fb-advertiser": -1001555356282,  # Facebook Advertiser Indonesia
    "markas-cuan": -1003591485885,  # Markas Cuan Affiliate Shopee
    "shopee-affiliate": -1002017573849,  # Group Support Shopee Affiliate
    "aff-go": -1003671263284,  # AFF GO
    "bigdream": -1002042715385,  # Kolaborasi BigDream
    "iklan-jos-course": -1003270910510,  # IKLAN JOS ANTI BONCOS (E-COURSE ONLY)
    # ── TRADING / CRYPTO ──
    "trading-formula": -1002317577817,  # TRADING FORMULA
    "bot-trading-forex": -1003125474336,  # Bot Trading Forex MT5
    "crypto-fams": -1002158492666,  # Screening crypto fams
    "cryptomanic": -1002155978952,  # CRYPTOMANIC
    "ea-profit-sakti": -1003087834088,  # VIP EA Profit Sakti
    "tele-signal": -1003092487853,  # Tele Signal Cuan
    "va-mod": -1001376538955,  # VA-MOD Volumes-Analysis
    "ea-robot-forex": -1002682544612,  # EA Robot Forex Premium
    # ── BUSINESS / EDU ──
    "kantin-scalev": -1002232700724,  # Kantin Scalev
    "vanapro": -1002566401895,  # VANAPRO BASIC CLASS
    "bumi-digital": -1002641735707,  # BUMI DIGITAL
    "edukazo": -1003635010202,  # Edukazo Squad
    "member-vip": -1002618823726,  # Member VIP AI Agent
    "raw-engine": -1003538188518,  # RAW ENGINE BATCH 5
    "hendra-setyo": -1002066760900,  # GROUP DISKUSI MEMBER HENDRA SETYO
    "king-seller": -1002366179321,  # Member King Seller All
    "mentorstream": -1002072541453,  # MentorStream - Member
}

WORKSPACE = os.path.expanduser("~/.openclaw/workspace")
LOG_FILE = os.path.join(WORKSPACE, "logs", "veris_topic_bot.log")
STATE_FILE = os.path.join(WORKSPACE, "logs", "veris_topic_bot_state.json")
INTERVAL_SECONDS = 15 * 60  # 15 menit

os.makedirs(os.path.dirname(LOG_FILE), exist_ok=True)
os.makedirs(os.path.dirname(STATE_FILE), exist_ok=True)


def log(msg: str):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line, flush=True)
    try:
        with open(LOG_FILE, "a") as f:
            f.write(line + "\n")
    except OSError:
        pass


def load_state() -> dict:
    if os.path.exists(STATE_FILE):
        try:
            with open(STATE_FILE) as f:
                return json.load(f)
        except Exception:
            pass
    return {"topics_cache": {}, "iteration": 0, "last_report": None}


def save_state(state: dict):
    with open(STATE_FILE, "w") as f:
        json.dump(state, f, indent=2, default=str)


# ═══════════════════════════════════════════════════════════════
# TOPIC MANAGEMENT
# ═══════════════════════════════════════════════════════════════


async def get_forum_topics(client: TelegramClient, group_id: int) -> list[dict]:
    """Ambil semua topic dari forum-enabled group."""
    try:
        entity = await client.get_entity(group_id)
    except Exception:
        return []
    if not hasattr(entity, "forum") or not entity.forum:
        return []  # Not a forum — skip silently

    channel = InputChannel(entity.id, entity.access_hash)
    topics = []
    offset_date = 0

    while True:
        result = await client(
            GetForumTopicsRequest(
                channel=channel,
                offset_date=offset_date,
                offset_id=0,
                offset_topic=0,
                limit=100,
            )
        )

        for topic in result.topics:
            topics.append(
                {
                    "id": topic.id,
                    "title": topic.title,
                    "icon_color": (
                        topic.icon_color if hasattr(topic, "icon_color") else None
                    ),
                    "closed": topic.closed if hasattr(topic, "closed") else False,
                    "pinned": topic.pinned if hasattr(topic, "pinned") else False,
                    "date": topic.date.isoformat() if hasattr(topic, "date") else None,
                    "author_id": topic.from_id if hasattr(topic, "from_id") else None,
                    "unread_count": (
                        topic.unread_count if hasattr(topic, "unread_count") else 0
                    ),
                    "unread_mentions_count": (
                        topic.unread_mentions_count
                        if hasattr(topic, "unread_mentions_count")
                        else 0
                    ),
                    "top_message": (
                        topic.top_message if hasattr(topic, "top_message") else 0
                    ),
                }
            )

        if len(result.topics) < 100:
            break
        # Next page: use oldest topic date + 1 second
        last = result.topics[-1]
        offset_date = last.date.timestamp() - 1 if hasattr(last, "date") else 0
        if offset_date <= 0:
            break

    return topics


async def get_topic_messages(
    client: TelegramClient, group_id: int, topic_id: int, limit: int = 10
) -> list[str]:
    """Ambil pesan terbaru dari sebuah topic."""
    entity = await client.get_entity(group_id)
    messages = await client.get_messages(entity, limit=limit, reply_to=topic_id)
    return [
        f"[{m.date.strftime('%H:%M')}] {'📤' if m.out else '📥'} {m.sender_id}: {m.text[:80] if m.text else '(media)'}"
        for m in messages
    ]


async def send_to_topic(
    client: TelegramClient, group_id: int, topic_id: int, text: str
) -> bool:
    """Kirim pesan ke topic spesifik."""
    try:
        entity = await client.get_entity(group_id)
        await client.send_message(entity, text, reply_to=topic_id)
        log(f"✅ Sent to topic#{topic_id} in group {group_id}")
        return True
    except Exception as e:
        log(f"❌ Failed to send to topic#{topic_id}: {e}")
        return False


async def find_topic_by_title(
    client: TelegramClient, group_id: int, keyword: str
) -> Optional[dict]:
    """Cari topic by keyword di judul."""
    topics = await get_forum_topics(client, group_id)
    keyword_lower = keyword.lower()
    for t in topics:
        if keyword_lower in t["title"].lower():
            return t
    return None


# ═══════════════════════════════════════════════════════════════
# MONITORING & REPORTING
# ═══════════════════════════════════════════════════════════════


async def build_topic_report(client: TelegramClient) -> str:
    """Build report semua topic dari semua target groups."""
    now = datetime.now()
    wib = now.strftime("%H:%M WIB")
    date_str = now.strftime("%Y-%m-%d")

    lines = [
        "🧵 **VERIS TOPIC BOT REPORT**",
        f"🕐 {wib} | {date_str}",
        "",
    ]

    total_topics = 0
    total_unread = 0
    total_mentions = 0
    active_topics = 0

    for name, group_id in TARGET_GROUPS.items():
        try:
            topics = await get_forum_topics(client, group_id)

            # Filter: only show topics with activity
            active = [
                t
                for t in topics
                if t["unread_count"] > 0 or t["unread_mentions_count"] > 0
            ]

            total_topics += len(topics)
            for t in topics:
                total_unread += t["unread_count"]
                total_mentions += t["unread_mentions_count"]
            active_topics += len(active)

            lines.append(f"📢 **{name}** — {len(topics)} topics, {len(active)} active")
            lines.append("")

            if active:
                # Sort by unread count descending
                active.sort(
                    key=lambda x: x["unread_count"] + x["unread_mentions_count"],
                    reverse=True,
                )
                for i, t in enumerate(active[:10], 1):
                    status = "🔒" if t["closed"] else ("📌" if t["pinned"] else "💬")
                    mention_flag = " 🔔" if t["unread_mentions_count"] > 0 else ""
                    unread_str = (
                        f"{t['unread_count']:,}" if t["unread_count"] > 0 else "0"
                    )
                    lines.append(
                        f"  {i}. {status} `{t['title'][:40]}` — {unread_str} unread{mention_flag}"
                    )

                if len(active) > 10:
                    lines.append(f"  ... _and {len(active) - 10} more_")

            # Check for closed topics that might need attention
            closed = [t for t in topics if t["closed"]]
            if closed:
                lines.append(f"  🔒 {len(closed)} closed topics")

            lines.append("")

        except Exception as e:
            lines.append(f"  ⚠️ Error fetching {name}: {e}")
            lines.append("")

    # Summary
    lines.append("📊 **Summary:**")
    lines.append(f"  Total topics: {total_topics}")
    lines.append(f"  Active (unread): {active_topics}")
    lines.append(f"  Total unread: {total_unread:,}")
    lines.append(f"  Mentions: {total_mentions:,}")

    lines.append("")
    lines.append(f"⏳ _Next check in 15 menit_ | 🤖 Veris Topic Bot")
    lines.append(f"_Session: @alwayscuanbos_")

    return "\n".join(lines)


async def send_group_report(client: TelegramClient, text: str):
    """Send report ke Veris personal chat."""
    try:
        await client.send_message(VERIS_CHAT_ID, text)
        log(f"📤 Topic report sent to Veris (@alwayscuanbos)")
    except Exception as e:
        log(f"⚠️ Failed to send topic report: {e}")


# ═══════════════════════════════════════════════════════════════
# COMMANDS
# ═══════════════════════════════════════════════════════════════


async def cmd_topics(client: TelegramClient, group_id: int = None):
    """List semua topics."""
    if group_id is None:
        group_id = list(TARGET_GROUPS.values())[0]

    name = [k for k, v in TARGET_GROUPS.items() if v == group_id]
    name = name[0] if name else str(group_id)

    topics = await get_forum_topics(client, group_id)
    print(f"\n🧵 Topics in {name} ({len(topics)} total):\n")

    # Sort: unread first, then by date
    active = sorted(
        [t for t in topics if t["unread_count"] > 0],
        key=lambda x: x["unread_count"],
        reverse=True,
    )
    inactive = sorted(
        [t for t in topics if t["unread_count"] == 0],
        key=lambda x: x.get("top_message", 0),
        reverse=True,
    )

    if active:
        print("📊 ACTIVE TOPICS:")
        for t in active:
            mention = " 🔔" if t["unread_mentions_count"] > 0 else ""
            status = "🔒" if t["closed"] else ("📌" if t["pinned"] else "💬")
            print(
                f"  {status} #{t['id']} {t['title'][:50]} — {t['unread_count']:,}{mention}"
            )

    if inactive[:5]:
        print("\n😴 INACTIVE (sample):")
        for t in inactive[:5]:
            status = "🔒" if t["closed"] else "💬"
            print(f"  {status} #{t['id']} {t['title'][:50]}")


async def cmd_send(client: TelegramClient, group_id: int, topic_id: int, text: str):
    """Kirim pesan ke topic."""
    ok = await send_to_topic(client, group_id, topic_id, text)
    if ok:
        print(f"✅ Sent to topic#{topic_id}: {text}")
    else:
        print(f"❌ Failed to send to topic#{topic_id}")


async def cmd_search(client: TelegramClient, group_id: int, keyword: str):
    """Cari topic by keyword."""
    topic = await find_topic_by_title(client, group_id, keyword)
    if topic:
        print(f"\n🔍 Found: #{topic['id']} \"{topic['title']}\"")
        print(f"   Unread: {topic['unread_count']:,}")
        print(f"   Mentions: {topic['unread_mentions_count']:,}")
        print(f"   Closed: {topic['closed']}")

        # Show recent messages
        print(f"\n📝 Recent messages:")
        msgs = await get_topic_messages(client, group_id, topic["id"], limit=5)
        for m in msgs:
            print(f"   {m}")
    else:
        print(f"❌ No topic found with keyword: {keyword}")


async def cmd_status(client: TelegramClient):
    """Tampilkan status bot."""
    state = load_state()
    print(f"Session     : @alwayscuanbos (veris.session)")
    print(f"Report to   : Army Group ({REPORT_GROUP_ID})")
    print(f"Targets     : {list(TARGET_GROUPS.keys())}")
    print(f"Iteration   : {state.get('iteration', 0)}")
    print(f"Last report : {state.get('last_report', 'never')}")
    print(f"Log file    : {LOG_FILE}")

    # Test connection
    await client.connect()
    if await client.is_user_authorized():
        me = await client.get_me()
        print(f"Status      : ✅ Connected as @{me.username}")
    else:
        print(f"Status      : ❌ Session invalid — need re-login")
    await client.disconnect()


# ═══════════════════════════════════════════════════════════════
# DAEMON
# ═══════════════════════════════════════════════════════════════


async def daemon_loop():
    """Loop monitoring topics dan kirim report tiap 15 menit."""
    state = load_state()
    client = TelegramClient(SESSION_PATH, API_ID, API_HASH)

    log("=" * 50)
    log("🧵 VERIS TOPIC BOT DAEMON STARTED")
    log(f"Session: @alwayscuanbos | Targets: {list(TARGET_GROUPS.keys())}")
    log(f"Interval: {INTERVAL_SECONDS}s | Report: Army Group")
    log("=" * 50)

    while True:
        try:
            await client.connect()
            if not await client.is_user_authorized():
                log("❌ Session NOT authorized! Re-login needed.")
                await asyncio.sleep(60)
                continue

            iteration = state.get("iteration", 0) + 1
            log(f"📊 Check #{iteration} — scanning topics...")

            # Build report
            report = await build_topic_report(client)
            await send_group_report(client, report)
            log(f"📤 Report #{iteration} sent to Army Group")

            # Update state
            state["iteration"] = iteration
            state["last_report"] = datetime.now().isoformat()
            save_state(state)

            await client.disconnect()
            log(f"⏳ Next check in 15 min...")
            await asyncio.sleep(INTERVAL_SECONDS)

        except Exception as e:
            log(f"⚠️ Loop error: {e}")
            try:
                await client.disconnect()
            except Exception:
                pass
            await asyncio.sleep(60)


# ═══════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════


async def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    cmd = sys.argv[1]
    client = TelegramClient(SESSION_PATH, API_ID, API_HASH)
    await client.connect()

    if not await client.is_user_authorized():
        print("❌ Session NOT authorized! Run manual login first.")
        await client.disconnect()
        sys.exit(1)

    try:
        if cmd == "daemon":
            await client.disconnect()
            await daemon_loop()

        elif cmd == "topics":
            group_id = int(sys.argv[2]) if len(sys.argv) > 2 else None
            await cmd_topics(client, group_id)

        elif cmd == "send":
            if len(sys.argv) < 4:
                print("Usage: veris_topic_bot.py send <topic_id> <message>")
                sys.exit(1)
            topic_id = int(sys.argv[2])
            text = " ".join(sys.argv[3:])
            default_group = list(TARGET_GROUPS.values())[0]
            await cmd_send(client, default_group, topic_id, text)

        elif cmd == "search":
            if len(sys.argv) < 3:
                print("Usage: veris_topic_bot.py search <keyword>")
                sys.exit(1)
            keyword = sys.argv[2]
            default_group = list(TARGET_GROUPS.values())[0]
            await cmd_search(client, default_group, keyword)

        elif cmd == "status":
            await cmd_status(client)

        elif cmd == "report":
            report = await build_topic_report(client)
            print(report)
            await send_group_report(client, report)

        else:
            print(f"Unknown command: {cmd}")
            print(__doc__)
            sys.exit(1)

    finally:
        if client.is_connected():
            await client.disconnect()


if __name__ == "__main__":
    asyncio.run(main())
