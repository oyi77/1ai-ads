import os, json, time, requests
from datetime import datetime, timedelta
base = "https://graph.facebook.com/v22.0"
act = "380721031313330"
# read token
env_path = "/home/openclaw/projects/1ai-ads/.env"
with open(env_path, "r") as f:
    for line in f:
        if not line.strip() or line.startswith("#"):
            continue
        key, sep, value = line.partition("=")
        if key.strip() == "META_ACCESS_TOKEN":
            token = value.strip()
            break
    else:
        raise SystemExit("META_ACCESS_TOKEN not found")
fields = "id,name,status"
time_range = json.dumps({"since": (datetime.now()-timedelta(days=7)).strftime("%Y-%m-%d"), "until": datetime.now().strftime("%Y-%m-%d")})
s = requests.Session()
camp = s.get(f"{base}/act_{act}/campaigns", params={"fields": fields, "limit": 200, "access_token": token}).json().get("data", [])
print("CAMPAIGNS", len(camp))
ins = s.get(f"{base}/act_{act}/insights", params={"fields":"campaign_id,campaign_name,spend,clicks,cpc,ctr","time_range": time_range,"level":"campaign","access_token": token}).json().get("data", [])
print("INSIGHTS", len(ins))
print(json.dumps(ins, ensure_ascii=False))
