#!/usr/bin/env python3
"""
PILAR 3 — Daily Activity Reporter
Merangkum aktivitas harian tiap topik dan kirim ke Telegram.
"""

import os, sys, json, subprocess
from pathlib import Path
from datetime import datetime, timedelta, UTC, UTC
import urllib.request
import urllib.error

REPO = Path(__file__).resolve().parent.parent
OPS = REPO / "ops"
AUDIT = OPS / "audit.jsonl"


def load_audit_since(dt):
    rows = []
    if not AUDIT.exists():
        return rows
    cutoff = dt.isoformat() + "Z"
    with AUDIT.open() as f:
        for line in f:
            try:
                obj = json.loads(line)
                ts = obj.get("ts", "")
                if ts >= cutoff:
                    rows.append(obj)
            except Exception:
                pass
    return rows


def send_telegram(text, chat="@alwayscuanbos"):
    token = os.environ.get("TELEGRAM_BOT_TOKEN")
    if not token:
        print("TELEGRAM_BOT_TOKEN tidak ada, skip kirim")
        return False
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = json.dumps({"chat_id": chat, "text": text, "parse_mode": "HTML"}).encode()
    req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status == 200
    except urllib.error.URLError as e:
        print("Gagal kirim Telegram:", e)
        return False


def build_report(since: datetime) -> str:
    rows = load_audit_since(since)
    by_topic = {}
    for r in rows:
        t = r.get("topic", r.get("action", "unknown"))
        by_topic.setdefault(t, {"events": 0, "patched": 0, "failed": 0, "actions": []})
        by_topic[t]["events"] += 1
        by_topic[t]["actions"].append(r.get("action", "-"))
        status = r.get("status", "-")
        if status == "applied":
            by_topic[t]["patched"] += 1
        elif status == "failed_after_retries":
            by_topic[t]["failed"] += 1

    lines = [f"📋 <b>Laporan Otonomi Harian — {since.strftime('%d/%m/%Y')}</b>"]
    for topic, agg in by_topic.items():
        lines.append(f"🏷️ <b>{topic}</b> — events {agg['events']} | patched {agg['patched']} | failed {agg['failed']}")
        for a in agg["actions"][:10]:
            lines.append(f"   • {a}")
    return "\n".join(lines)


def main():
    now = datetime.now(UTC)
    since = now - timedelta(days=1)
    report = build_report(since)
    print(report)
    send_telegram(report)


if __name__ == "__main__":
    main()
