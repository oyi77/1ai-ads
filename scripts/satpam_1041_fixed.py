import os, time, json, sys
from datetime import datetime, timedelta
import requests

ACT_ID = "380721031313330"
TOKEN_PATH="/home/openclaw/projects/1ai-ads/.env"
API_VERSION = "v22.0"
BASE = f"https://graph.facebook.com/{API_VERSION}/act_{ACT_ID}"

def load_token():
    with open(TOKEN_PATH, "r") as f:
        for line in f:
            if line.startswith("META_ACCESS_TOKEN="):
                return line.strip().split("=", 1)[1]
    sys.exit("Token not found")

TOKEN = load_token()

def api_get(url, params):
    time.sleep(0.5)
    resp = requests.get(url, params=params, timeout=30)
    data = resp.json()
    if "error" in data:
        print(f"ERROR GET {url}: {data['error']}")
        sys.exit(1)
    return data

def api_post(url, payload):
    time.sleep(0.5)
    resp = requests.post(url, json={**payload, "access_token": TOKEN}, timeout=30)
    data = resp.json()
    if "error" in data:
        print(f"ERROR POST {url}: {data['error']}")
        return None
    return data

# 1. Fetch campaigns
camp_url = f"{BASE}/campaigns"
camp_data = api_get(camp_url, {"fields": "id,name,status", "limit": 200, "access_token": TOKEN})
campaigns = camp_data.get("data", [])
print(f"Fetched {len(campaigns)} campaigns")

# 2. Fetch insights last 7 days
now = datetime.utcnow()
since = (now - timedelta(days=7)).strftime("%Y-%m-%d")
until = now.strftime("%Y-%m-%d")
ins_url = f"{BASE}/insights"
ins_data = api_get(ins_url, {
    "fields": "campaign_id,campaign_name,spend,clicks,cpc,ctr",
    "time_range": json.dumps({"since": since, "until": until}),
    "level": "campaign",
    "access_token": TOKEN,
})
insights = {i["campaign_id"]: i for i in ins_data.get("data", [])}
print(f"Fetched {len(insights)} insights")

# 3. Global CPC
total_spend = 0.0
total_clicks = 0
for cid, ins in insights.items():
    spend = float(ins.get("spend", 0))
    clicks = int(ins.get("clicks", 0))
    total_spend += spend
    total_clicks += clicks
global_cpc = total_spend / total_clicks if total_clicks > 0 else 0
print(f"Global CPC: Rp{global_cpc:,.2f} (spend={total_spend:,.2f}, clicks={total_clicks})")

# 4. Process campaigns
monster_pause = []
watch_pause = []
winners = []
lc_scale = []

for camp in campaigns:
    cid = camp["id"]
    name = camp["name"]
    status = camp["status"]
    ins = insights.get(cid, {})
    spend = float(ins.get("spend", 0))
    clicks = int(ins.get("clicks", 0))
    cpc = float(ins.get("cpc", 0)) if ins.get("cpc") else 0

    if (cpc >= 1000 and spend > 500) or (cpc >= 500 and spend > 2000):
        new_name = f"OFF_{name}"
        print(f"MONSTER: {name} (CPC={cpc:,.0f}, spend={spend:,.0f}) OFF_ + PAUSE")
        api_post(f"{BASE}/{cid}", {"name": new_name, "access_token": TOKEN})
        if status == "ACTIVE":
            api_post(f"{BASE}/{cid}", {"status": "PAUSED", "access_token": TOKEN})
        monster_pause.append(name)
        continue

    if cpc > 200 and clicks == 0 and spend > 500:
        print(f"WATCH->PAUSE: {name} (CPC={cpc:,.0f}, clicks={clicks}, spend={spend:,.0f}) PAUSE")
        if status == "ACTIVE":
            api_post(f"{BASE}/{cid}", {"status": "PAUSED", "access_token": TOKEN})
        watch_pause.append(name)
        continue

    if cpc > 200 and clicks > 0:
        print(f"WATCH: {name} (CPC={cpc:,.0f}, clicks={clicks}, spend={spend:,.0f}) NO ACTION")
        watch_pause.append(name)

    if global_cpc < 120 and cpc < 120 and clicks > 5 and spend > 10000:
        new_name = f"🌟_{name}"
        print(f"WINNER: {name} rename 🌟_")
        api_post(f"{BASE}/{cid}", {"name": new_name, "access_token": TOKEN})
        winners.append(name)

    if "LC" in name and global_cpc < 120 and clicks > 0:
        lc_scale.append(name)
        print(f"LC SCALE candidate: {name} (cpc={cpc:,.0f}, spend={spend:,.0f})")

print("\n--- SUMMARY ---")
print(f"ACTIVE: {len([c for c in campaigns if c['status']=='ACTIVE'])}")
print(f"Global CPC: Rp{global_cpc:,.2f}")
print(f"MONSTER OFF_+PAUSE: {monster_pause}")
print(f"WATCH PAUSE: {watch_pause}")
print(f"WINNER 🌟_: {winners}")
print(f"LC SCALE: {lc_scale}")
