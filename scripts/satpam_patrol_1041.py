#!/usr/bin/env python3
"""SATPAM PATROL 1041 (Nyamiresep) — 3-layer decision engine + enforcement."""

import json, os, sys, time, urllib.request, urllib.parse, datetime

BASE = "https://graph.facebook.com/v22.0"
ACT_ID = "380721031313330"
ACT = f"act_{ACT_ID}"
ENV = "/home/openclaw/projects/1ai-ads/.env"

def load_token():
    path = "/home/openclaw/projects/1ai-ads/.env"
    with open(path, "r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                k, v = line.split("=", 1)
                if k.strip() == "META_ACCESS_TOKEN":
                    t = v.strip().strip("\"'")
                    if not t:
                        raise RuntimeError("META_ACCESS_TOKEN empty")
                    return t
    raise RuntimeError("META_ACCESS_TOKEN not found in .env")
TOKEN = load_token()

def api_get(path, params=None):
    params = params or {}
    params["access_token"] = TOKEN
    url = f"{BASE}/{path.lstrip('/')}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read())

def api_post(path, data):
    data["access_token"] = TOKEN
    qs = urllib.parse.urlencode(data).encode()
    req = urllib.request.Request(f"{BASE}/{path.lstrip('/')}", data=qs, method="POST")
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read())

def pause_campaign(cid):
    try:
        api_post(cid, {"status": "PAUSED"})
        return True
    except Exception as e:
        return False

def rename_campaign(cid, new_name):
    try:
        api_post(cid, {"name": new_name})
        return True
    except Exception:
        return False

def activate_campaign(cid):
    try:
        api_post(cid, {"status": "ACTIVE"})
        return True
    except Exception:
        return False

now = datetime.datetime.utcnow() + datetime.timedelta(hours=7)
since = (now - datetime.timedelta(days=7)).strftime("%Y-%m-%d")
until = now.strftime("%Y-%m-%d")

print(f"WIB: {now.strftime('%Y-%m-%d %H:%M:%S')} | Range: {since} to {until}")

# Fetch campaigns
sys.stdout.write("Fetching campaigns... ")
sys.stdout.flush()
all_camps = api_get(f"{ACT}/campaigns", {"fields": "id,name,status,effective_status,daily_budget,spend", "limit": 200})
data = all_camps.get("data", [])
print(f"{len(data)} fetched")

# Fetch 7-day insights at campaign level
sys.stdout.write("Fetching insights... ")
sys.stdout.flush()

# Build filter for batching by name contains
insights = api_get(f"{ACT}/insights", {
    "fields": "campaign_id,campaign_name,spend,cpc,ctr,clicks,impressions",
    "time_range": json.dumps({"since": since, "until": until}),
    "level": "campaign",
    "limit": 200,
})
rows = insights.get("data", [])
by_cid = {row["campaign_id"]: row for row in rows}
print(f"{len(rows)} rows")

# Taglinks known from 1041/Nyamiresep
TAGS = ["rakdapur3", "atayasetelankaosanak"]

def detect_campaign_type(name):
    n = name.upper()
    for p in ["CBO", "BC_", "LC_", "TC_", "🌟_", "ON_LC_", "ON_BC"]:
        if p in n:
            return "CBO"
    if "TEST" in n or "TESTING" in n:
        return "TEST"
    if n.startswith("ABO") or n.startswith("BIDCAP"):
        return "ABO"
    return "CBO"

def matches_tag(name):
    low = name.lower()
    return any(t in low for t in TAGS)

kills = []
watch = []
winners = []
active_count = 0
off_count = 0
star_count = 0
watch_count = 0
kill_count = 0
total_spend = 0
actions = []

for c in data:
    cid = c["id"]
    name = c["name"]
    status = c.get("status", "") or c.get("effective_status","")

    if status in ("ACTIVE",):
        active_count += 1
    if name.startswith("OFF_"):
        off_count += 1
    if name.startswith("🌟_"):
        star_count += 1
    if name.startswith("DEAD_"):
        off_count += 1

    spend = float(by_cid.get(cid, {}).get("spend", 0) or 0)
    cpc = float(by_cid.get(cid, {}).get("cpc", 0) or 0)
    ctr = float(by_cid.get(cid, {}).get("ctr", 0) or 0)
    clicks = float(by_cid.get(cid, {}).get("clicks", 0) or 0)
    impr = float(by_cid.get(cid, {}).get("impressions", 0) or 0)

    total_spend += spend

    ctype = detect_campaign_type(name)
    cpc_safe = 100 if ctype == "CBO" else 200
    cpc_danger = 120 if ctype == "CBO" else 250
    cpc_kill = 200

    verdict = None
    # OFF_ skip
    if name.startswith("OFF_"):
        continue

    # Kill priority: CPC > kill + spend>2000
    if cpc > cpc_kill and spend > 2000:
        verdict = "KILL"
    # CTR kill
    elif ctr < 1.0 and impr > 1000:
        verdict = "CTR_WATCH"
    # Danger CPC
    elif cpc > cpc_danger and spend > 5000:
        verdict = "DANGER"
    # Healthy winner candidate
    elif ((ctype in ("CBO", "TEST") and cpc < cpc_safe and spend > 50000 and clicks > 0) or
          (cpc < 120 and spend > 50000 and clicks > 3 and matches_tag(name))):
        verdict = "WINNER"

    if verdict == "KILL":
        kill_count += 1
        kills.append((name, cpc, ctr, spend))
        ok = pause_campaign(cid)
        time.sleep(1.0)
        ok2 = rename_campaign(cid, f"OFF_{name}")
        time.sleep(0.7)
        actions.append(f"KILL→PAUSE+RENAME OFF_ {name} pause={ok} rename={ok2}")
    elif verdict == "DANGER":
        watch_count += 1
        watch.append((name, cpc, ctr, spend))
        ok = pause_campaign(cid)
        time.sleep(1.0)
        actions.append(f"DANGER→PAUSE {name} pause={ok}")
    elif verdict == "CTR_WATCH":
        watch_count += 1
        watch.append((name, cpc, ctr, spend))
        ok = pause_campaign(cid)
        time.sleep(1.0)
        actions.append(f"CTR_WATCH→PAUSE {name} pause={ok}")
    elif verdict == "WINNER" and (not name.startswith("🌟_")):
        star_count += 1
        winners.append((name, cpc, ctr, spend, clicks))
        ok = rename_campaign(cid, f"🌟_{name}")
        time.sleep(0.7)
        actions.append(f"WINNER→🌟_ {name} rename={ok}")

print()
print("🛡️ SATPAM 1041 —", now.strftime("%Y-%m-%d %H:%M:%S WIB"))
print(f"ACTIVE: {active_count} | OFF+: {off_count} | 🌟: {star_count}")
print(f"⚠️ KILL ({kill_count}):")
for name, cpc, ctr, spend in kills[:20]:
    print(f"  {name} | CPC Rp{cpc:.0f} | CTR {ctr:.1f}% | Spend Rp{spend:,.0f}")
print(f"👀 WATCH ({watch_count}):")
for name, cpc, ctr, spend in watch[:20]:
    print(f"  {name} | CPC Rp{cpc:.0f} | CTR {ctr:.1f}% | Spend Rp{spend:,.0f}")
print(f"🌟 WINNERS ({len(winners)}):")
for name, cpc, ctr, spend, clicks in winners[:20]:
    print(f"  {name} | CPC Rp{cpc:.0f} | CTR {ctr:.1f}% | Spend Rp{spend:,.0f} | clicks {clicks:.0f}")
print(f"💰 Spend 7d: Rp{total_spend:,.0f}")
print("--- actions ---")
for a in actions:
    print(a)
