import json
import time
import urllib.request
import urllib.error
import urllib.parse
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

account_check = api_get(f"act_{ACT_ID}", {"fields": "account_name"})
print("ACCOUNT_CHECK", account_check)

time.sleep(1.5)
camp_resp = api_get(f"act_{ACT_ID}/campaigns", {
    "fields": "id,name,status",
    "limit": 200,
})
camps = camp_resp.get("data", [])
print("CAMPAIGN_COUNT", len(camps))

insights_params = {
    "fields": "campaign_id,campaign_name,spend,cpc,clicks,ctr,impressions",
    "time_range": json.dumps({"since": str(since), "until": str(until)}),
    "level": "campaign",
    "limit": 200,
}
time.sleep(1.5)
ins_resp = api_get(f"act_{ACT_ID}/insights", insights_params)
ins_data = {row["campaign_id"]: row for row in ins_resp.get("data", [])}
print("INSIGHTS_ROWS", len(ins_data))

time.sleep(1.5)
rules = api_get(f"act_{ACT_ID}/adrules_library", {"fields": "id,name", "limit": 50})
print("RULES_COUNT", len(rules.get("data", [])))

now = datetime.now().strftime("%Y-%m-%d %H:%M")
active = [c for c in camps if c["status"] == "ACTIVE"]
off = [c for c in camps if c["status"] == "PAUSED" and c["name"].startswith("OFF_")]
paused_other = [c for c in camps if c["status"] == "PAUSED" and not c["name"].startswith("OFF_")]

rows = []
for c in active + paused_other:
    ins = ins_data.get(c["id"], {})
    spend = float(ins.get("spend", 0) or 0)
    cpc_raw = ins.get("cpc")
    cpc = float(cpc_raw) if cpc_raw is not None else None
    clicks = int(ins.get("clicks", 0) or 0)
    impr = int(ins.get("impressions", 0) or 0)
    ctr = float(ins.get("ctr", 0) or 0)
    name = c["name"]
    is_off_limit = name.startswith("OFF_") or name.startswith("DEAD_")
    rows.append({
        "id": c["id"],
        "name": name,
        "status": c["status"],
        "spend": spend,
        "cpc": cpc,
        "clicks": clicks,
        "impressions": impr,
        "ctr": ctr,
        "is_off_limit": is_off_limit,
    })

kill = []
watch = []
winners = []
for r in rows:
    if r["is_off_limit"]:
        continue
    if r["cpc"] is not None and r["cpc"] > 200 and r["spend"] > 2000:
        kill.append(r)
    elif r["ctr"] < 1 and r["impressions"] > 1000:
        watch.append(r)
    elif r["cpc"] is not None and r["cpc"] > 120 and r["spend"] > 5000:
        watch.append(r)
    elif r["spend"] > 50000 and r["clicks"] > 0 and ((r["cpc"] is not None and r["cpc"] < 120) or r["cpc"] is None):
        winners.append(r)

seen = set()
deduped_watch = []
for r in watch:
    if r["id"] not in seen:
        seen.add(r["id"])
        deduped_watch.append(r)
watch = deduped_watch

total_spend = round(sum(r["spend"] for r in rows), 2)

def fmt(n):
    return "Rp" + f"{n:,.0f}".replace(",", ".")

kill_names = ", ".join(f"{r['name']} (CPC {r['cpc']:.0f}, {fmt(r['spend'])})" for r in kill[:20])
watch_names = ", ".join(f"{r['name']} (CTR {r['ctr']:.2f}%, impr {r['impressions']}, CPC {r['cpc']})" for r in watch[:20])
winner_names = ", ".join(f"{r['name']} (spend {fmt(r['spend'])}, clicks {r['clicks']})" for r in winners[:20])

conflict_rules = [r["name"] for r in rules.get("data", []) if any(k in r["name"].upper() for k in ["CPC","CTR","PAUSE","STOP"])]

report = f"""🛡️ SATPAM 0858 — {now}
ACTIVE: {len(active)} | OFF_: {len(off)} | PAUSED_OTHER: {len(paused_other)}
⚠️ KILL: {kill_names or 'none'}
👀 WATCH: {watch_names or 'none'}
🌟 WINNERS: {winner_names or 'none'}
💰 Total spend 7d: {fmt(total_spend)}
🔧 Rules: {len(rules.get('data',[]))} total — conflicts {', '.join(conflict_rules[:10]) or 'none'}
"""
print(report)
