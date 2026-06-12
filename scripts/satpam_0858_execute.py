import json, time, urllib.request, urllib.error, urllib.parse
from datetime import datetime, timedelta

ACT_ID = "435670549443081"
API = "https://graph.facebook.com/v22.0"
ENV_PATH = "/home/openclaw/projects/1ai-ads/.env"

def load_token():
    for line in open(ENV_PATH).read().splitlines():
        if not line or line.startswith("#"):
            continue
        if line.split("=", 1)[0] == "META_ACCESS_TOKEN":
            return line.split("=", 1)[1].strip()
    raise RuntimeError("META_ACCESS_TOKEN missing")

TOKEN = load_token()
print("TOKEN_LEN", len(TOKEN))

until = datetime.now().date()
since = until - timedelta(days=7)

def api_get(path, params=None):
    if not path.startswith("http"):
        url = f"{API}/{path}"
    else:
        url = path
    if params is None:
        params = {}
    params["access_token"] = TOKEN
    url = f"{url}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "ignore")
        return {"_http_error": e.code, "_body": body}

def api_post(path, data):
    if not path.startswith("http"):
        url = f"{API}/{path}"
    else:
        url = path
    data["access_token"] = TOKEN
    for k in list(data.keys()):
        if isinstance(data[k], (dict, list)):
            data[k] = json.dumps(data[k])
    qs = urllib.parse.urlencode(data).encode()
    req = urllib.request.Request(url, data=qs, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "ignore")
        return {"_http_error": e.code, "_body": body}

time.sleep(1.5)
camp_resp = api_get(f"act_{ACT_ID}/campaigns", {"fields": "id,name,status", "limit": 200})
camps = camp_resp.get("data", [])
print("CAMPAIGN_COUNT", len(camps))

time.sleep(1.5)
ins_resp = api_get(f"act_{ACT_ID}/insights", {
    "fields": "campaign_id,campaign_name,spend,cpc,clicks,ctr,impressions",
    "time_range": json.dumps({"since": str(since), "until": str(until)}),
    "level": "campaign",
    "limit": 200,
})
ins_data = {row["campaign_id"]: row for row in ins_resp.get("data", [])}
print("INSIGHTS_ROWS", len(ins_data))

time.sleep(1.5)
rules = api_get(f"act_{ACT_ID}/adrules_library", {"fields": "id,name", "limit": 50})
print("RULES_COUNT", len(rules.get("data", [])))

now = datetime.now().strftime("%Y-%m-%d %H:%M")

# Identify candidates for auto-pause: CPC > 200 + spend > 2K => kill; CTR < 1% + impr > 1K => watch/pause; CPC > 120 + spend > 5K => watch/pause
# Auto-pause per rules: KILL + WATCH (CPC>120)
paused_ids = []
failed_ids = []
for c in camps:
    if c["status"] != "ACTIVE":
        continue
    ins = ins_data.get(c["id"], {})
    spend = float(ins.get("spend", 0) or 0)
    cpc_raw = ins.get("cpc")
    cpc = float(cpc_raw) if cpc_raw is not None else None
    clicks = int(ins.get("clicks", 0) or 0)
    impr = int(ins.get("impressions", 0) or 0)
    ctr = float(ins.get("ctr", 0) or 0)
    name = c["name"]
    if name.startswith("OFF_") or name.startswith("DEAD_"):
        continue
    should_pause = False
    reason = []
    if cpc is not None and cpc > 200 and spend > 2000:
        should_pause = True
        reason.append(f"CPC_KILL={cpc:.0f}")
    if ctr < 1 and impr > 1000:
        should_pause = True
        reason.append(f"CTR_LOW={ctr:.2f}%")
    if cpc is not None and cpc > 120 and spend > 5000:
        should_pause = True
        reason.append(f"CPC_WATCH={cpc:.0f}")
    if should_pause:
        time.sleep(1.5)
        res = api_post(c["id"], {"status": "PAUSED"})
        ok = res.get("success") is True or (not res.get("_http_error"))
        if ok:
            paused_ids.append((c["id"], name, "; ".join(reason)))
        else:
            failed_ids.append((c["id"], name, res))

# Recompute statuses after pauses by re-fetching campaign statuses (fresh)
time.sleep(1.5)
camp_resp2 = api_get(f"act_{ACT_ID}/campaigns", {"fields": "id,name,status", "limit": 200})
camps2 = camp_resp2.get("data", [])
active2 = [c for c in camps2 if c["status"] == "ACTIVE"]
off2 = [c for c in camps2 if c["status"] == "PAUSED" and c["name"].startswith("OFF_")]
paused_other2 = [c for c in camps2 if c["status"] == "PAUSED" and not c["name"].startswith("OFF_")]

# Winners among remaining active (spend > 50K, clicks > 0, CPC < 120 or unknown)
ins_data2 = ins_data
rows_active = []
for c in active2:
    ins = ins_data2.get(c["id"], {})
    spend = float(ins.get("spend", 0) or 0)
    cpc_raw = ins.get("cpc")
    cpc = float(cpc_raw) if cpc_raw is not None else None
    clicks = int(ins.get("clicks", 0) or 0)
    rows_active.append({"id": c["id"], "name": c["name"], "spend": spend, "cpc": cpc, "clicks": clicks})
winners2 = [r for r in rows_active if r["spend"] > 50000 and r["clicks"] > 0 and ((r["cpc"] is not None and r["cpc"] < 120) or r["cpc"] is None)]

total_spend = round(sum(float(ins_data2.get(c["id"], {}).get("spend", 0) or 0) for c in active2+paused_other2), 2)

def fmt(n):
    return "Rp" + f"{n:,.0f}".replace(",", ".")

paused_list = ", ".join(f"{name} ({reason})" for _, name, reason in paused_ids[:20])
winner_names = ", ".join(f"{r['name']} (spend {fmt(r['spend'])}, clicks {r['clicks']})" for r in winners2[:20])

report = f"""🛡️ SATPAM 0858 — {now}
ACTIVE: {len(active2)} | OFF_: {len(off2)} | PAUSED_OTHER: {len(paused_other2)}
📌 PAUSED_NOW: {paused_list or 'none'}
🌟 WINNERS: {winner_names or 'none'}
💰 Total spend 7d: {fmt(total_spend)}
🔧 Rules: {len(rules.get('data',[]))} total
"""
print(report)
if failed_ids:
    print("FAILED_PAUSES", failed_ids[:10])
