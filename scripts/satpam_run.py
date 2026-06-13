import json
import time
import datetime
import subprocess
import sys

ACT_ID = "380721031313330"
API_VERSION = "v22.0"
BASE_URL = f"https://graph.facebook.com/{API_VERSION}/act_{ACT_ID}"
TOKEN_PATH = "/home/openclaw/projects/1ai-ads/.env"

def load_token():
    with open(TOKEN_PATH, "r") as f:
        for line in f:
            if line.startswith("META_ACCESS_TOKEN="):
                return line.strip().split("=", 1)[1]
    raise RuntimeError("Token tidak ditemukan")

def fb_get(url, params):
    cmd = ["curl", "-s", "-G", "-d", f"access_token={load_token()}", url]
    for k, v in params.items():
        cmd += ["-d", f"{k}={v}"]
    result = subprocess.run(cmd, capture_output=True, text=True)
    time.sleep(1.5)
    return json.loads(result.stdout)

def fb_post(url, data):
    cmd = ["curl", "-s", "-X", "POST", "-d", f"access_token={load_token()}", url]
    for k, v in data.items():
        cmd += ["-d", f"{k}={v}"]
    result = subprocess.run(cmd, capture_output=True, text=True)
    time.sleep(1.5)
    return json.loads(result.stdout)

def get_7d_range():
    now = datetime.datetime.now()
    since = (now - datetime.timedelta(days=7)).strftime("%Y-%m-%d")
    until = now.strftime("%Y-%m-%d")
    return json.dumps({"since": since, "until": until})

def get_campaigns():
    campaigns = []
    url = f"{BASE_URL}/campaigns"
    params = {"fields": "id,name,status", "limit": 200}
    res = fb_get(url, params)
    campaigns = res.get("data", [])
    paging = res.get("paging", {})
    # Auto-fix pagination loop that could blow up
    turns = 0
    while paging.get("next") and turns < 5:
        url = paging["next"]
        res = fb_get(url, {})
        campaigns.extend(res.get("data", []))
        paging = res.get("paging", {})
        turns += 1
    return campaigns

def get_insights(campaign_ids):
    # Meta batch insights, JANGAN per-campaign looping
    if not campaign_ids:
        return []
    url = f"{BASE_URL}/insights"
    params = {
        "fields": "campaign_id,campaign_name,spend,clicks,cpc,ctr",
        "time_range": get_7d_range(),
        "filtering": json.dumps([{"field": "campaign.id", "operator": "IN", "value": campaign_ids[:50]}]),
        "limit": 200,
    }
    res = fb_get(url, params)
    return res.get("data", [])

def pause_campaign(campaign_id):
    return fb_post(f"{BASE_URL}/{campaign_id}", {"status": "PAUSED"})

def rename_campaign(campaign_id, new_name):
    return fb_post(f"{BASE_URL}/{campaign_id}", {"name": new_name})

now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
campaigns = get_campaigns()
print(f"Total campaigns fetched: {len(campaigns)}", file=sys.stderr)

ids = [c["id"] for c in campaigns]
insights = get_insights(ids)
insights_map = {row["campaign_id"]: row for row in insights}

rows = []
total_spend = 0.0
total_clicks = 0.0
for c in campaigns:
    row = insights_map.get(c["id"], {"spend": "0", "clicks": "0", "cpc": "0", "ctr": "0"})
    spend = float(row.get("spend", "0") or "0")
    clicks = float(row.get("clicks", "0") or "0")
    cpc = float(row.get("cpc", "0") or "0")
    ctr = float(row.get("ctr", "0") or "0")
    rows.append({
        "id": c["id"],
        "name": row.get("campaign_name") or c.get("name") or c["id"],
        "status": c.get("status") or row.get("status", "ACTIVE"),
        "spend": spend,
        "clicks": clicks,
        "cpc": cpc,
        "ctr": ctr,
    })
    total_spend += spend
    total_clicks += clicks

global_cpc = total_spend / total_clicks if total_clicks > 0 else 0.0
print(f"Global CPC: Rp{global_cpc:.0f}", file=sys.stderr)

monster_names = []
watch_names = []
winner_names = []
lc_names = []

for r in rows:
    cid = r["id"]
    name = r["name"]
    spend = r["spend"]
    clicks = r["clicks"]
    cpc = r["cpc"]

    if (cpc >= 1000 and spend > 500) or (cpc >= 500 and spend > 1000):
        rename_campaign(cid, f"OFF_{name}")
        pause_campaign(cid)
        monster_names.append(f"OFF_{name}")
        continue

    if global_cpc >= 120 or (cpc > 200 and clicks == 0 and spend > 500) or (cpc > 200 and clicks > 0):
        if cpc > 200 and clicks == 0 and spend > 500:
            pause_campaign(cid)
            watch_names.append(name)
            continue
        if cpc > 200 and clicks > 0:
            watch_names.append(name)
            continue

    if cpc < 120 and clicks > 5 and spend > 10000 and not name.startswith("🌟_"):
        rename_campaign(cid, f"🌟_{name}")
        winner_names.append(f"🌟_{name}")
        continue

    if "LC" in name and cpc < 120 and clicks > 0:
        lc_names.append(name)
        continue

active_count = sum(1 for r in rows if r["status"] == "ACTIVE")
report = "\n".join([
    f"🛡️ SATPAM 1041 {now_str}",
    f"ACTIVE:{active_count} | Global CPC:Rp{global_cpc:.0f}",
    f"💀 MONSTER: {', '.join(monster_names) if monster_names else '-'}",
    f"👀 WATCH: {', '.join(watch_names) if watch_names else '-'}",
    f"🌟: {', '.join(winner_names) if winner_names else '-'}",
    f"💰 LC: {', '.join(lc_names) if lc_names else '-'}",
])

print(report)
