import requests
import json
import os

ACCESS_TOKEN = os.getenv("META_ACCESS_TOKEN", "")
ACCOUNT_ID = "act_380721031313330"

url = f"https://graph.facebook.com/v19.0/{ACCOUNT_ID}/insights"
params = {
    "access_token": ACCESS_TOKEN,
    "time_range": '{"since":"2026-05-04","until":"2026-05-10"}',
    "level": "campaign",
    "fields": "campaign_name,spend,impressions,inline_link_clicks,inline_link_click_ctr",
}
r = requests.get(url, params=params).json()

print(json.dumps(r.get("data", []), indent=2))
