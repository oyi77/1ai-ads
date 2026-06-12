#!/usr/bin/env python3
"""SATPAM PATROL 1041 Nyamiresep."""

import json
import os
import sys
import time
from datetime import datetime, timedelta, timezone

BASE_DIR = "/home/openclaw/projects/1ai-ads/scripts"
sys.path.insert(0, BASE_DIR)
import vilona_trakpro_engine as engine

ACT_ID = engine.ACCOUNTS["1041"]["id"]
SINCE = (datetime.now(timezone.utc) - timedelta(days=7)).strftime("%Y-%m-%d")
UNTIL = datetime.now(timezone.utc).strftime("%Y-%m-%d")
DRY_RUN = os.getenv("DRY_RUN", "true").lower() in ("true", "1", "yes")


def classify(name):
    n = name.upper()
    for pref in ("ABO", "BIDCAP", "BID", "TC_", "TEST", "TESTING", "DEAD_", "OFF_"):
        if n.startswith(pref):
            return "ABO"
    return "CBO"


def main():
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    all_camps = []
    endpoint = f"{ACT_ID}/campaigns"
    params = {
        "fields": "id,name,status,effective_status,daily_budget,lifetime_budget,spend",
        "limit": 200,
    }
    next_url = None
    while True:
        if next_url is None:
            raw = engine.fb_get(endpoint, **params)
        else:
            parts = next_url.split("?")
            ep = f"{ACT_ID}/campaigns"
            q = parts[1] if len(parts) > 1 else ""
            raw = engine.fb_get(ep, **dict([kv.split("=", 1) for kv in q.split("&") if "=" in kv]))
        all_camps.extend(raw.get("data", []))
        paging = raw.get("paging", {})
        next_url = paging.get("next")
        if not next_url:
            break
        endpoint = f"{ACT_ID}/campaigns"
        time.sleep(1)

    insights = {}
    endpoint = f"{ACT_ID}/insights"
    params = {
        "fields": "campaign_id,campaign_name,spend,cpc,clicks,ctr,impressions",
        "time_range": json.dumps({"since": SINCE, "until": UNTIL}),
        "level": "campaign",
        "limit": 200,
    }
    next_url = None
    while True:
        if next_url is None:
            raw = engine.fb_get(endpoint, **params)
        else:
            parts = next_url.split("?")
            ep = f"{ACT_ID}/insights"
            q = parts[1] if len(parts) > 1 else ""
            raw = engine.fb_get(ep, **dict([kv.split("=", 1) for kv in q.split("&") if "=" in kv]))
        for row in raw.get("data", []):
            cid = row.get("campaign_id")
            if cid:
                insights[cid] = {
                    "spend": float(row.get("spend", 0) or 0),
                    "cpc": float(row.get("cpc", 0) or 0),
                    "clicks": int(row.get("clicks", 0) or 0),
                    "ctr": float(row.get("ctr", 0) or 0),
                    "impressions": int(row.get("impressions", 0) or 0),
                }
        paging = raw.get("paging", {})
        next_url = paging.get("next")
        if not next_url:
            break
        endpoint = f"{ACT_ID}/insights"
        time.sleep(1)

    active_count = 0
    off_count = 0
    star_count = 0
    kill_list = []
    watch_list = []
    winner_list = []
    total_spend_7d = 0.0
    actions = []

    def post_status(cid, payload):
        try:
            engine.fb_post(cid, **payload)
            return True
        except Exception as e:
            actions.append(f"ERROR {cid}: {e}")
            return False

    for camp in all_camps:
        cid = camp["id"]
        name = camp["name"]
        status = camp.get("status", "")
        if name.startswith("OFF_") or name.startswith("DEAD_"):
            off_count += 1
            continue
        if status == "PAUSED":
            off_count += 1
            continue

        ins = insights.get(cid, {})
        spend = ins.get("spend", 0)
        cpc = ins.get("cpc", 0)
        clicks = ins.get("clicks", 0)
        ctr = ins.get("ctr", 0)
        impr = ins.get("impressions", 0)
        total_spend_7d += spend
        typ = classify(name)
        danger = 120 if typ == "CBO" else 250

        if cpc > 200 and spend > 2000:
            if not DRY_RUN:
                post_status(cid, {"status": "PAUSED"})
                time.sleep(1.5)
                post_status(cid, {"name": f"OFF_{name}"})
                time.sleep(1.5)
            actions.append(f"OFF+PAUSE {name}")
            off_count += 1
            kill_list.append(f"{name} (CPC {cpc:.0f}, spend Rp{spend:,.0f})")
            continue

        if cpc > danger and spend > 5000:
            if not DRY_RUN:
                post_status(cid, {"status": "PAUSED"})
                time.sleep(1.5)
            actions.append(f"PAUSE_WATCH {name}")
            off_count += 1
            watch_list.append(f"{name} (CPC {cpc:.0f}, spend Rp{spend:,.0f})")
            continue

        if ctr < 1.0 and impr > 1000:
            if not DRY_RUN:
                post_status(cid, {"status": "PAUSED"})
                time.sleep(1.5)
            actions.append(f"PAUSE_CTR {name}")
            off_count += 1
            watch_list.append(f"{name} (CTR {ctr:.2f}%, impr {impr:,})")
            continue

        if cpc < 120 and spend > 50000 and clicks > 0:
            new_name = f"🌟_{name}" if not name.startswith("🌟_") else name
            if new_name != name and not DRY_RUN:
                post_status(cid, {"name": new_name})
                time.sleep(1.5)
            actions.append(f"STAR {name}")
            star_count += 1
            active_count += 1
            winner_list.append(name)
            continue

        active_count += 1

    report = (
        f"🛡️ SATPAM 1041 — {timestamp}\n"
        f"ACTIVE: {active_count} | OFF_: {off_count} | 🌟: {star_count}\n"
        f"⚠️ KILL: {', '.join(kill_list) if kill_list else '0'}\n"
        f"👀 WATCH: {', '.join(watch_list) if watch_list else '0'}\n"
        f"🌟 WINNERS: {', '.join(winner_list) if winner_list else '0'}\n"
        f"💰 Spend 7d: Rp{total_spend_7d:,.0f}\n"
        f"DRY_RUN: {DRY_RUN}\n"
    )
    sys.stdout.write(report)

    log_path = "/home/openclaw/projects/1ai-ads/data/shopee/patrol_1041_log.json"
    os.makedirs(os.path.dirname(log_path), exist_ok=True)
    with open(log_path, "w") as f:
        json.dump(
            {
                "timestamp": timestamp,
                "dry_run": DRY_RUN,
                "active": active_count,
                "off": off_count,
                "star": star_count,
                "kill": kill_list,
                "watch": watch_list,
                "winners": winner_list,
                "spend_7d": total_spend_7d,
                "actions": actions,
            },
            f,
            indent=2,
        )


if __name__ == "__main__":
    main()
