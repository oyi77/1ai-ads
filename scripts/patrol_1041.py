#!/usr/bin/env python3
"""SATPAM PATROL 1041 — 3-Layer Decision Engine"""
import os, sys, json, time, urllib.request, urllib.parse, urllib.error
from datetime import datetime, timedelta

ACT_ID = "act_380721031313330"
API = "https://graph.facebook.com/v22.0"
SINCE = (datetime.utcnow() - timedelta(days=7)).strftime("%Y-%m-%d")
UNTIL = datetime.utcnow().strftime("%Y-%m-%d")
TAGLINKS = {"rakdapur3", "atayasetelankaosanak"}
CPC_KILL = 200
CPC_DANGER_CBO = 120
CPC_DANGER_ABO = 250

def load_token():
    with open("/tmp/_tk_1041.txt") as f:
        return f.read().strip()

TOKEN = load_token()

def fb_get(endpoint, params=None, retries=3):
    url = f"{API}/{endpoint}"
    if params:
        url = f"{url}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url)
    req.add_header("Authorization", f"Bearer {TOKEN}")
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            body = e.read().decode()
            if e.code == 400 and ("2446079" in body or "request limit" in body.lower()):
                wait = (attempt + 1) * 6
                print(f"  [rate-limit] retry {attempt+1}/{retries} wait {wait}s", file=sys.stderr)
                time.sleep(wait)
                continue
            raise
        except Exception:
            if attempt < retries - 1:
                time.sleep(3)
                continue
            raise
    return {}

def fb_post(endpoint, data):
    url = f"{API}/{endpoint}?access_token={TOKEN}"
    qs = urllib.parse.urlencode(data).encode()
    req = urllib.request.Request(url, data=qs, method="POST")
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read())

def detect_type(name):
    n = name.upper()
    if "TEST" in n or "TESTING" in n:
        return "TEST"
    if n.startswith("ABO"):
        return "ABO"
    if n.startswith("BIDCAP"):
        return "BIDCAP"
    if n.startswith(("CBO", "BC_", "LC_", "TC_", "ON_LC_", "ON_BC", "🌟_")):
        return "CBO"
    return "ABO"

def wait(seconds=1.5):
    time.sleep(seconds)

# Fetch campaigns
print("Fetching campaigns...", file=sys.stderr)
all_camps = fb_get(f"{ACT_ID}/campaigns", {
    "fields": "id,name,status,effective_status,spend,cpc",
    "limit": 200
})
wait()
campaigns = all_camps.get("data", [])
print(f"  Total campaigns: {len(campaigns)}", file=sys.stderr)

# Fetch insights
print("Fetching 7-day insights...", file=sys.stderr)
insights = fb_get(f"{ACT_ID}/insights", {
    "fields": "campaign_id,campaign_name,spend,clicks,cpc,ctr,impressions",
    "time_range": json.dumps({"since": SINCE, "until": UNTIL}),
    "level": "campaign",
    "limit": 200
})
wait()
ins_map = {i["campaign_id"]: i for i in insights.get("data", [])}
print(f"  Insight rows: {len(ins_map)}", file=sys.stderr)

# Classify
off_list = []      # to pause + rename
watch_list = []
winner_list = []
kill_cpc_list = []
kill_ctr_list = []
active_count = 0
off_count = 0
star_count = 0
total_spend = 0.0

for c in campaigns:
    cid = c["id"]
    name = c["name"]
    status = c.get("effective_status", c.get("status", "UNKNOWN"))
    ins = ins_map.get(cid, {})
    spend = float(ins.get("spend", 0))
    clicks = int(ins.get("clicks", 0))
    cpc = float(ins.get("cpc", 0))
    ctr = float(ins.get("ctr", 0))
    impr = int(ins.get("impressions", 0))
    total_spend += spend

    if status == "ACTIVE":
        active_count += 1
    if name.startswith("OFF_"):
        off_count += 1
    if name.startswith("🌟_"):
        star_count += 1

    if name.startswith("OFF_"):
        continue
    if status != "ACTIVE":
        continue

    ctype = detect_type(name)

    # LAYER 1 — CPC
    if cpc > CPC_KILL and spend > 2000:
        kill_cpc_list.append((name, cid, cpc, spend))
        continue

    danger = CPC_DANGER_CBO if ctype == "CBO" else CPC_DANGER_ABO
    if cpc > danger and spend > 5000:
        watch_list.append((name, cid, cpc, spend, f"CPC danger ({ctype}: {cpc:.0f}>{danger})"))
        continue

    # LAYER 2 — CTR
    if ctr < 1.0 and impr > 1000:
        watch_list.append((name, cid, cpc, spend, f"CTR low {ctr:.1f}%"))
        continue

    # LAYER 3 — Taglink ROI (winner check)
    is_taglink = any(t in name.lower() for t in TAGLINKS)
    if is_taglink and clicks > 0 and spend > 50000:
        winner_list.append((name, cid, spend, clicks, cpc))

# Execute: KILL CPC > 200
print("\n[EXECUTE] KILL CPC>200...", file=sys.stderr)
for name, cid, cpc, spend in kill_cpc_list:
    label = f"{name} CPC={cpc:.0f} spend={spend:.0f}"
    print(f"  KILL: {label}", file=sys.stderr)
    try:
        fb_post(f"{cid}", {"status": "PAUSED"})
        wait(2)
        chk = fb_get(f"{cid}", {"fields": "status"})
        if chk.get("status") == "PAUSED":
            print(f"    ✅ PAUSED", file=sys.stderr)
        else:
            print(f"    ⚠️ status={chk.get('status')}", file=sys.stderr)
    except Exception as e:
        print(f"    ❌ pause error: {e}", file=sys.stderr)
    # Rename OFF_
    if not name.startswith("OFF_"):
        try:
            fb_post(f"{cid}", {"name": f"OFF_{name}"})
            wait(2)
            chk = fb_get(f"{cid}", {"fields": "name"})
            if chk.get("name", "").startswith("OFF_"):
                off_count += 1
                active_count -= 1
                print(f"    ✅ Renamed OFF_", file=sys.stderr)
            else:
                print(f"    ⚠️ rename: {chk.get('name')}", file=sys.stderr)
        except Exception as e:
            print(f"    ❌ rename error: {e}", file=sys.stderr)

# Execute: WATCH → PAUSE
print("\n[EXECUTE] WATCH → PAUSE...", file=sys.stderr)
for item in watch_list:
    if len(item) == 5:
        name, cid, cpc, spend, reason = item
    else:
        name, cid, cpc, spend = item
        reason = "WATCH"
    print(f"  WATCH: {reason} | {name} CPC={cpc:.0f} spend={spend:.0f}", file=sys.stderr)
    try:
        fb_post(f"{cid}", {"status": "PAUSED"})
        wait(2)
        chk = fb_get(f"{cid}", {"fields": "status"})
        if chk.get("status") == "PAUSED":
            active_count -= 1
            print(f"    ✅ PAUSED", file=sys.stderr)
        else:
            print(f"    ⚠️ status={chk.get('status')}", file=sys.stderr)
    except Exception as e:
        print(f"    ❌ error: {e}", file=sys.stderr)

# Execute: WINNER → 🌟_
print("\n[EXECUTE] WINNER → 🌟_...", file=sys.stderr)
for name, cid, spend, clicks, cpc in winner_list:
    new_name = f"🌟_{name}" if not name.startswith("🌟_") else name
    print(f"  WINNER: {name} spend={spend:.0f} clicks={clicks} cpc={cpc:.0f}", file=sys.stderr)
    try:
        fb_post(f"{cid}", {"name": new_name})
        wait(2)
        chk = fb_get(f"{cid}", {"fields": "name"})
        if chk.get("name", "").startswith("🌟_"):
            star_count += 1
            print(f"    ✅ Renamed 🌟_", file=sys.stderr)
        else:
            print(f"    ⚠️ rename: {chk.get('name')}", file=sys.stderr)
    except Exception as e:
        print(f"    ❌ error: {e}", file=sys.stderr)

# === BUILD REPORT ===
ts = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")
report = f"🛡️ SATPAM 1041 — {ts}\n"
report += f"ACTIVE: {active_count} | OFF_: {off_count} | 🌟: {star_count}\n\n"

report += f"⚠️ KILL (CPC>{CPC_KILL}+spend>2K):\n"
if kill_cpc_list:
    for name, cid, cpc, spend in kill_cpc_list:
        report += f"  💀 {name} | CPC={cpc:.0f} spend={spend:.0f}\n"
else:
    report += "  (none)\n"

report += f"\n👀 WATCH:\n"
if watch_list:
    for item in watch_list:
        if len(item) == 5:
            name, cid, cpc, spend, reason = item
        else:
            name, cid, cpc, spend = item
            reason = "WATCH"
        report += f"  {reason}: {name} CPC={cpc:.0f} spend={spend:.0f}\n"
else:
    report += "  (none)\n"

report += f"\n🌟 WINNERS:\n"
if winner_list:
    for name, cid, spend, clicks, cpc in winner_list:
        report += f"  {name} | spend={spend:,.0f} clicks={clicks} cpc={cpc:.0f}\n"
else:
    report += "  (none)\n"

report += f"\n💰 Spend 7d: Rp{total_spend:,.0f}\n"
report += f"📅 Window: {SINCE} → {UNTIL}\n"

with open("/tmp/patrol_1041_report.txt", "w") as f:
    f.write(report)
print(report)
