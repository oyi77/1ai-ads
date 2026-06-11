#!/usr/bin/env python3
import os
import sys
import json
import time
import urllib.request
import urllib.parse
from datetime import datetime, timedelta

ACT_ID = "act_2125021885010866"
API = "https://graph.facebook.com/v22.0"

def load_token():
    # Avoids heredoc mangling of special char in token
    path = "/home/openclaw/projects/1ai-ads/.env"
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line.startswith("META_ACCESS_TOKEN="):
                return line.split("=", 1)[1]
    return os.environ.get("META_ACCESS_TOKEN", "")

TOKEN = load_token().strip()
if not TOKEN:
    sys.exit("Missing META_ACCESS_TOKEN")

def api_get(endpoint, params=None):
    url = f"{API}/{endpoint}"
    if params:
        url = f"{url}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {TOKEN}"})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", errors="ignore")
            if e.code == 400 and "User request limit reached" in body and attempt < 2:
                time.sleep((attempt + 1) * 5)
                continue
            raise SystemExit(f"GET {endpoint} failed: {e.code} {body}")
        except Exception as e:
            if attempt < 2:
                time.sleep((attempt + 1) * 2)
                continue
            raise SystemExit(f"GET {endpoint} error: {e}")

def api_post(endpoint, data):
    data["access_token"] = TOKEN
    for k in list(data.keys()):
        if isinstance(data[k], (list, dict)):
            data[k] = json.dumps(data[k])
    qs = urllib.parse.urlencode(data).encode()
    req = urllib.request.Request(f"{API}/{endpoint}", data=qs, method="POST")
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", errors="ignore")
            if e.code == 400 and "User request limit reached" in body and attempt < 2:
                time.sleep((attempt + 1) * 5)
                continue
            raise SystemExit(f"POST {endpoint} failed: {e.code} {body}")
        except Exception as e:
            if attempt < 2:
                time.sleep((attempt + 1) * 2)
                continue
            raise SystemExit(f"POST {endpoint} error: {e}")

def rename_campaign(cid, new_name):
    return api_post(str(cid), {"name": new_name})

def pause_campaign(cid):
    return api_post(str(cid), {"status": "PAUSED"})

now = datetime.now()
since = (now - timedelta(days=7)).strftime("%Y-%m-%d")
until = now.strftime("%Y-%m-%d")

# Campaigns
camp_fields = "id,name,status,daily_budget,effective_status"
camp_res = api_get(f"{ACT_ID}/campaigns", {"fields": camp_fields, "limit": 200})
campaigns = camp_res.get("data", [])
while camp_res.get("paging", {}).get("next"):
    time.sleep(1.2)
    nxt = camp_res["paging"]["next"]
    if "?" in nxt:
        path, qs = nxt.split("?", 1)
        camp_res = api_get(path.split("/")[-1], dict(urllib.parse.parse_qsl(qs)))
    else:
        break
    campaigns.extend(camp_res.get("data", []))

# Insights
ins_fields = "campaign_id,campaign_name,spend,cpc,clicks,ctr,impressions"
ins_res = api_get(f"{ACT_ID}/insights", {
    "fields": ins_fields,
    "level": "campaign",
    "time_range": json.dumps({"since": since, "until": until}),
    "limit": 200,
})
insights = {}
for row in ins_res.get("data", []):
    cid = row.get("campaign_id")
    if cid:
        insights[cid] = row
while ins_res.get("paging", {}).get("next"):
    time.sleep(1.2)
    nxt = ins_res["paging"]["next"]
    if "?" in nxt:
        path, qs = nxt.split("?", 1)
        ins_res = api_get(path.split("/")[-1], dict(urllib.parse.parse_qsl(qs)))
    else:
        break
    for row in ins_res.get("data", []):
        cid = row.get("campaign_id")
        if cid:
            insights[cid] = row

tracked = {"abera", "pintulipatgeser", "hijab"}

active = [c for c in campaigns if c.get("status") == "ACTIVE"]
off_ = [c for c in campaigns if c.get("name", "").startswith("OFF_")]

kill = []
watch = []
winners = []

for c in active:
    cid = c["id"]
    name = c.get("name", "")
    ins = insights.get(cid, {})
    spend = float(ins.get("spend") or 0)
    cpc = float(ins.get("cpc") or 0)
    clicks = int(ins.get("clicks") or 0)
    ctr = float(ins.get("ctr") or 0)
    impr = int(ins.get("impressions") or 0)
    is_cbo = any(p in name.upper() for p in ["CBO", "BC_", "LC_", "TC_", "🌟_", "ON_LC_", "ON_BC"])
    cpc_danger = 140 if is_cbo else 250
    has_tag = any(t in name.lower() for t in tracked)
    # Layer 1 CPC
    if cpc > 400 and spend > 2000:
        kill.append((cid, name, spend, cpc))
        continue
    # Layer 2 CTR
    if ctr < 1.0 and impr > 1000:
        watch.append((cid, name, ctr, impr, "CTR<1%"))
        continue
    # Layer 3 winner
    if cpc < 140 and spend > 50000 and clicks > 0:
        winners.append((cid, name, spend, cpc, clicks, ctr))
    elif has_tag and spend > 50000:
        watch.append((cid, name, spend, cpc, "taglink spend>50K"))

# Execute pausing for kill list
for cid, name, spend, cpc in kill:
    time.sleep(1.5)
    res = pause_campaign(cid)
    ok = res.get("success") is True
    print(f"PAUSE {cid} {name} -> {ok}")

# Rename winners
for cid, name, spend, cpc, clicks, ctr in winners:
    new_name = f"🌟_{name}"
    time.sleep(1.5)
    res = rename_campaign(cid, new_name)
    updated = res.get("id") or res.get("success") is True
    print(f"WINNER {cid} {name} -> 🌟_ prefix: {updated}")

total_spend = sum(float(insights.get(c["id"], {}).get("spend") or 0) for c in active)
# refresh counts after actions

ts = now.strftime("%Y-%m-%d %H:%M")
active_n = len(active)
off_n = len(off_)

print("\nSATPAM 1134 REPORT")
print("=" * 40)
print(f"🛡️ SATPAM 1134 — {ts}")
print(f"ACTIVE: {active_n} | OFF_: {off_n} | 🌟: {len(winners)}")
print(f"⚠️ KILL ({len(kill)}): {', '.join([n for _,n,_,_ in kill]) if kill else '-'}")
print(f"👀 WATCH ({len(watch)}): {', '.join([n for n,*_ in watch]) if watch else '-'}")
print(f"🌟 WINNERS ({len(winners)}): {', '.join([n for n,*_ in winners]) if winners else '-'}")
print(f"💰 Spend 7d: Rp{total_spend:,.0f}")
