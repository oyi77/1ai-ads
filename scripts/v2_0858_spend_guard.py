#!/usr/bin/env python3
"""
V2 0858 Spend Guard — Hardcap 300rb/hari + CPC/CTR Rules
Cron: every 30 minutes
"""

import requests, json, subprocess, time, os
from datetime import datetime, timezone
from pathlib import Path

TOKEN = subprocess.run(
    [
        "grep",
        "-oP",
        "ACCESS_TOKEN = '\\K[^']+",
        str(Path(__file__).parent / "list_ad_accounts.py"),
    ],
    capture_output=True,
    text=True,
).stdout.strip()

ACT = "act_435670549443081"
BASE = "https://graph.facebook.com/v19.0"
LOG_FILE = Path.home() / ".openclaw/workspace/logs/v2_0858_guard.log"
STATE_FILE = Path.home() / ".openclaw/workspace/data/v2_0858_state.json"
HARDCAP = 300000  # Rp 300,000 max daily
CPC_LIMIT = 150
CTR_LIMIT = 3.0  # percent

today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
now_ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def log(msg):
    line = f"[{now_ts}] {msg}"
    print(line)
    os.makedirs(LOG_FILE.parent, exist_ok=True)
    with open(LOG_FILE, "a") as f:
        f.write(line + "\n")


# Load state
state = {}
if STATE_FILE.exists():
    state = json.loads(STATE_FILE.read_text())

log("🛡️ V2 Guard check starting...")

# Get today's spend
r = requests.get(
    f"{BASE}/{ACT}/insights",
    params={
        "access_token": TOKEN,
        "fields": "spend,clicks,impressions,cpc,ctr",
        "time_range": json.dumps({"since": today, "until": today}),
    },
)
today_data = r.json().get("data", [{}])[0]
today_spend = float(today_data.get("spend", 0))

log(f"Today's spend: Rp {today_spend:,.0f} / {HARDCAP:,.0f}")

# Check if approaching limit
if today_spend >= HARDCAP * 0.9:
    log(f"⚠️ APPROACHING HARDCAP ({today_spend/HARDCAP*100:.0f}%) — pausing campaigns")
    r = requests.get(
        f"{BASE}/{ACT}/campaigns",
        params={
            "access_token": TOKEN,
            "fields": "id,name",
            "limit": 50,
            "filtering": json.dumps(
                [
                    {
                        "field": "campaign.effective_status",
                        "operator": "IN",
                        "value": ["ACTIVE"],
                    }
                ]
            ),
        },
    )
    for c in r.json().get("data", []):
        requests.post(
            f'{BASE}/{c["id"]}',
            params={"access_token": TOKEN},
            json={"status": "PAUSED"},
        )
        log(f"  🛑 PAUSED: {c['name']}")
    state["paused_by_guard"] = True
    state["paused_date"] = today

# Check individual campaign CPC/CTR
r2 = requests.get(
    f"{BASE}/{ACT}/insights",
    params={
        "access_token": TOKEN,
        "fields": "campaign_id,campaign_name,spend,clicks,impressions,cpc,ctr",
        "time_range": json.dumps({"since": today, "until": today}),
        "level": "campaign",
        "limit": 50,
    },
)

for camp in r2.json().get("data", []):
    cpc = float(camp.get("cpc", 0))
    ctr = float(camp.get("ctr", 0))
    camp_id = camp.get("campaign_id")
    camp_name = camp.get("campaign_name", "?")

    # CPC check
    if cpc > CPC_LIMIT and camp_id:
        log(f"🔴 CPC Rp {cpc:,.0f} > {CPC_LIMIT} — PAUSING {camp_name}")
        requests.post(
            f"{BASE}/{camp_id}",
            params={"access_token": TOKEN},
            json={"status": "PAUSED"},
        )

    # CTR check
    if ctr < CTR_LIMIT and float(camp.get("impressions", 0)) > 500 and camp_id:
        log(f"🔴 CTR {ctr:.2f}% < {CTR_LIMIT}% — PAUSING {camp_name}")
        requests.post(
            f"{BASE}/{camp_id}",
            params={"access_token": TOKEN},
            json={"status": "PAUSED"},
        )

# Midnight reset — unpause if paused by guard yesterday
paused_date = state.get("paused_date", "")
if state.get("paused_by_guard") and paused_date != today:
    log("🌅 NEW DAY — Resuming paused campaigns")
    r = requests.get(
        f"{BASE}/{ACT}/campaigns",
        params={
            "access_token": TOKEN,
            "fields": "id,name",
            "limit": 50,
            "filtering": json.dumps(
                [
                    {
                        "field": "campaign.effective_status",
                        "operator": "IN",
                        "value": ["PAUSED"],
                    }
                ]
            ),
        },
    )
    for c in r.json().get("data", []):
        if "V2_HV" in c.get("name", ""):
            requests.post(
                f'{BASE}/{c["id"]}',
                params={"access_token": TOKEN},
                json={"status": "ACTIVE"},
            )
            log(f"  ▶️ RESUMED: {c['name']}")
    state["paused_by_guard"] = False
    state["paused_date"] = ""

# Save state
STATE_FILE.write_text(json.dumps(state, indent=2))
log("✅ Guard check complete")
