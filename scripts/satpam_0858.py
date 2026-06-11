#!/usr/bin/env python3
"""Satpam patrol 0858 — 3-layer CPC/CTR/ROI guardian

Run after sourcing env:
  source /home/openclaw/projects/1ai-ads/.env
  python3 scripts/satpam_0858.py
"""

import json
import os
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timedelta

ACT_ID = "435670549443081"
API_BASE = "https://graph.facebook.com/v22.0"
SLEEP_SEC = 1.5


def _qs(params):
    p = dict(params)
    p["access_token"] = os.environ.get("META_ACCESS_TOKEN") or os.environ.get(
        "ACCESS_TOKEN", ""
    )
    if not p["access_token"]:
        print("Missing token: META_ACCESS_TOKEN")
        raise SystemExit(1)
    return urllib.parse.urlencode(p)


def api_get(path, params):
    qs = _qs(params)
    url = f"{API_BASE}/{path}?{qs}"
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def api_post(path, data):
    qs = _qs(data)
    req = urllib.request.Request(
        f"{API_BASE}/{path}", data=qs.encode(), method="POST"
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def rate_limit():
    time.sleep(SLEEP_SEC)


def cpc_danger_for(name):
    n = name.upper()
    if any(p in n for p in ["CBO", "BC_", "LC_", "TC_", "🌟_", "ON_LC_", "ON_BC"]):
        return 120
    if n.startswith("ABO") or n.startswith("BIDCAP") or "TEST" in n:
        return 250
    return 120


def main():
    since = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
    until = datetime.now().strftime("%Y-%m-%d")

    campaigns = api_get(
        f"act_{ACT_ID}/campaigns",
        {"fields": "id,name,status,effective_status", "limit": "200"},
    ).get("data", [])

    active = [c for c in campaigns if c.get("status") == "ACTIVE"]
    active_ids = [c["id"] for c in active]

    rate_limit()
    rules = api_get(
        f"act_{ACT_ID}/adrules_library",
        {"fields": "id,name,execution_spec,evaluation_spec", "limit": "50"},
    ).get("data", [])

    rate_limit()
    insights = api_get(
        f"act_{ACT_ID}/insights",
        {
            "fields": "campaign_id,campaign_name,spend,clicks,cpc,ctr,impressions",
            "level": "campaign",
            "since": since,
            "until": until,
            "limit": "200",
        },
    ).get("data", [])

    ins_map = {i["campaign_id"]: i for i in insights if i.get("campaign_id") in active_ids}

    watch_list = []
    kill_list = []
    winners_list = []
    total_spend = 0.0
    for i in insights:
        try:
            total_spend += float(i.get("spend", 0) or 0)
        except Exception:
            pass

    for c in list(active):
        cid = c["id"]
        name = c["name"]
        ins = ins_map.get(cid, {})
        spend = float(ins.get("spend", 0) or 0)
        cpc = float(ins.get("cpc", 0) or 0)
        clicks = int(ins.get("clicks", 0) or 0)
        ctr = float(ins.get("ctr", 0) or 0)
        impr = int(ins.get("impressions", 0) or 0)
        danger = cpc_danger_for(name)

        if cpc > 200 and spend > 2000:
            kill_list.append(f"{name} (CPC Rp{cpc:.0f}, spend Rp{spend:.0f})")
            api_post(cid, {"status": "PAUSED"})
            rate_limit()
            api_post(cid, {"name": "OFF_" + name})
            rate_limit()
            continue

        if cpc > danger and spend > 5000:
            watch_list.append(f"{name} (CPC Rp{cpc:.0f}, danger={danger})")
            api_post(cid, {"status": "PAUSED"})
            rate_limit()
            continue

        if ctr < 1 and impr > 1000:
            watch_list.append(f"{name} (CTR {ctr:.2f}%, impr {impr})")
            api_post(cid, {"status": "PAUSED"})
            rate_limit()
            continue

        if cpc < 120 and spend > 50000 and clicks > 0 and not name.startswith("🌟_"):
            new_name = "🌟_" + name
            winners_list.append(f"{new_name} (CPC Rp{cpc:.0f}, spend Rp{spend:.0f})")
            api_post(cid, {"name": new_name})
            rate_limit()

    active_after = [c for c in campaigns if c.get("status") == "ACTIVE"]
    off_after = [c for c in campaigns if c["name"].startswith("OFF_")]
    conflict_names = [r["name"] for r in rules if "130" in json.dumps(r)]

    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    lines = [
        f"🛡️ SATPAM 0858 — {ts}",
        f"ACTIVE: {len(active_after)} | OFF_: {len(off_after)}",
        f"⚠️ KILL: {', '.join(kill_list) if kill_list else 'None'}",
        f"👀 WATCH: {', '.join(watch_list) if watch_list else 'None'}",
        f"🌟 WINNERS: {', '.join(winners_list) if winners_list else 'None'}",
        f"💰 Total spend 7d: Rp{total_spend:.0f}",
    ]
    if conflict_names:
        lines.append(f"⚠️ CONFLICTING RULES CPC 130: {', '.join(conflict_names)}")
    sys.stdout.write("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
