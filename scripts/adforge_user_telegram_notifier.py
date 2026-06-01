#!/usr/bin/env python3
"""
AdForge Telegram Notifier v3 — Per-User Database
Scans each user's isolated DB and sends real-time FB alerts to their Telegram bot.
"""

import sqlite3
import requests
import json
import os
from pathlib import Path
from datetime import datetime

BASE_DIR = Path(
    os.path.join(os.path.expanduser("~"), ".openclaw", "workspace", "adforge", "db")
)
MASTER_DB = str(BASE_DIR / "adforge.db")
USER_DB_DIR = str(BASE_DIR / "users")


def get_master():
    conn = sqlite3.connect(MASTER_DB)
    conn.row_factory = sqlite3.Row
    return conn


def get_user_db(user_id):
    path = os.path.join(USER_DB_DIR, f"adforge_user_{user_id}.db")
    if not os.path.exists(path):
        return None
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    return conn


def send_user_update(user_id, token, chat_id):
    db = get_user_db(user_id)
    if not db:
        return

    campaigns = db.execute("""
        SELECT name, platform, status, spend, revenue, impressions, conversions
        FROM campaigns WHERE status = 'ACTIVE'
        ORDER BY spend DESC
    """).fetchall()

    if not campaigns:
        db.close()
        return

    total_spend = sum(c["spend"] or 0 for c in campaigns)
    total_revenue = sum(c["revenue"] or 0 for c in campaigns)
    total_conv = sum(c["conversions"] or 0 for c in campaigns)
    total_imp = sum(c["impressions"] or 0 for c in campaigns)

    now = datetime.now().strftime("%d %b %Y %H:%M WIB")
    lines = [f"📊 *YOUR ADS UPDATE* — {now}", ""]

    for c in campaigns[:5]:
        name = (c["name"] or "?")[:30]
        spend = f"Rp{c['spend']:,.0f}" if c["spend"] else "Rp0"
        conv = c["conversions"] or 0
        roas = round(c["revenue"] / c["spend"], 2) if c["spend"] and c["revenue"] else 0
        lines.append(f"🔹 *{name}*\n   Spend: {spend} | Conv: {conv} | ROAS: {roas}x")

    lines.append("")
    lines.append(f"💰 *Total Spend:* Rp{total_spend:,.0f}")
    lines.append(f"📈 *Total Revenue:* Rp{total_revenue:,.0f}")
    lines.append(
        f"🔥 *ROAS:* {round(total_revenue/total_spend, 2) if total_spend else 0}x"
    )
    lines.append(f"👁 *Impressions:* {total_imp:,}")

    message = "\n".join(lines)

    try:
        requests.post(
            f"https://api.telegram.org/bot{token}/sendMessage",
            json={"chat_id": chat_id, "text": message, "parse_mode": "Markdown"},
            timeout=10,
        )
        print(f"✅ Sent update to user {user_id}")
    except Exception as e:
        print(f"❌ Failed user {user_id}: {e}")

    db.close()


def main():
    master = get_master()
    users = master.execute("""
        SELECT id, telegram_bot_token, telegram_chat_id 
        FROM dashboard_users 
        WHERE telegram_bot_token IS NOT NULL AND telegram_chat_id IS NOT NULL
    """).fetchall()
    master.close()

    print(f"Sending updates to {len(users)} users...")
    for u in users:
        send_user_update(u["id"], u["telegram_bot_token"], u["telegram_chat_id"])
    print("Done.")


if __name__ == "__main__":
    main()
