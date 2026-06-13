#!/usr/bin/env python3
import json
import os
import sys
import time
from datetime import datetime, timezone
from urllib.request import Request, urlopen
from urllib.parse import urlencode

ACT_ID = "435670549443081"
API = "https://graph.facebook.com/v22.0"
ENV_PATH = "/home/openclaw/projects/1ai-ads/.env"

def load_token():
    for line in open(ENV_PATH).read().splitlines():
        if not line or line.startswith("#"):
            continue
        if line.split("=", 1)[0].strip() == "META_ACCESS_TOKEN":
            return line.split("=", 1)[1].strip()
    raise RuntimeError("token missing")

def api_get(endpoint, params=None):
    token = load_token()
    qs = urlencode({**(params or {}), "access_token": token})
    url = f"{API}/{endpoint}?{qs}"
    req = Request(url, method="GET")
    with urlopen(req, timeout=20) as resp:
        return json.loads(resp.read())

def api_post(endpoint, data=None):
    token = load_token()
    payload = {**(data or {}), "access_token": token}
    qs = urlencode(payload).encode()
    req = Request(f"{API}/{endpoint}", data=qs, method="POST")
    with urlopen(req, timeout=20) as resp:
        return json.loads(resp.read())

def today_str():
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")

def main():
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    insights = api_get(f"act_{ACT_ID}/insights", {
        "time_range": json.dumps({"since": today_str(), "until": today_str()}),
        "level": "account",
        "fields": "spend,clicks,cpc",
    })
    data = insights.get("data", [{}])[0] if insights.get("data") else {}
    global_spend = float(data.get("spend", 0) or 0)
    global_clicks = float(data.get("clicks", 0) or 0)
    global_cpc = float(data.get("cpc", 0) or 0) if global_clicks > 0 else 0.0

    mode = "AMAN" if global_cpc < 120 else "WASPADA"

    camps = api_get(f"act_{ACT_ID}/campaigns", {
        "fields": "id,name,status,daily_budget",
        "limit": 200,
    }).get("data", [])

    active = [c for c in camps if c.get("status") == "ACTIVE"]
    active_count = len(active)

    camp_insights = {}
    for i in range(0, len(active), 50):
        batch = active[i:i+50]
        ids = [c["id"] for c in batch]
        res = api_get(f"act_{ACT_ID}/insights", {
            "time_range": json.dumps({"since": today_str(), "until": today_str()}),
            "level": "campaign",
            "fields": "campaign_id,campaign_name,spend,cpc,clicks",
            "filtering": json.dumps([
                {"field": "campaign.id", "operator": "IN", "value": ids}
            ]),
        })
        for row in res.get("data", []):
            camp_insights[row["campaign_id"]] = row
        if i + 50 < len(active):
            time.sleep(1.2)

    monster = []
    watch = []
    winners = []
    lc_scale = []

    for c in active:
        cid = c["id"]
        name = c.get("name", "")
        row = camp_insights.get(cid, {})
        cpc = float(row.get("cpc", 0) or 0)
        spend = float(row.get("spend", 0) or 0)
        clicks = float(row.get("clicks", 0) or 0)

        if mode == "WASPADA":
            if (cpc >= 500 and spend > 1000) or (cpc >= 1000 and spend > 500):
                monster.append(cid)
                try:
                    api_post(cid, {"status": "PAUSED"})
                    if not name.startswith("OFF_"):
                        api_post(cid, {"name": f"OFF_{name}"})
                except Exception as e:
                    print(f"pause error {cid}: {e}", file=sys.stderr)
                continue
            if cpc > 200 and clicks == 0 and spend > 500:
                watch.append(cid)
                try:
                    api_post(cid, {"status": "PAUSED"})
                except Exception as e:
                    print(f"watch pause error {cid}: {e}", file=sys.stderr)
                continue

        if cpc < 120 and clicks > 5 and spend > 10000:
            winners.append({"id": cid, "name": name, "cpc": cpc, "clicks": clicks, "spend": spend})

        if "LC" in name.upper() and cpc < 120 and clicks > 0:
            current_budget = int(c.get("daily_budget", 0) or 0)
            if current_budget <= 0:
                current_budget = 20000
            new_budget = min(int(current_budget * 1.2), 50000)
            if new_budget != current_budget:
                lc_scale.append({"id": cid, "name": name, "from": current_budget, "to": new_budget})
                try:
                    api_post(cid, {"daily_budget": str(new_budget)})
                except Exception as e:
                    print(f"scale error {cid}: {e}", file=sys.stderr)

    report = (
        f"🛡️ SATPAM 0858 {ts}\n"
        f"ACTIVE:{active_count} | Global CPC:Rp{int(global_cpc)} | Mode:{mode}\n"
        f"💀 MONSTER: {len(monster) if monster else 'none'}\n"
        f"👀 WATCH: {len(watch) if watch else 'none'}\n"
        f"🌟 WINNER: {len(winners)}\n"
        f"💰 LC SCALE: {len(lc_scale)} naik budget\n"
        f"📊 Spend Today: Rp{int(global_spend)}"
    )
    print(report)

if __name__ == "__main__":
    main()
