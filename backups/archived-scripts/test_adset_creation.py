import requests
import json
import os

ACCESS_TOKEN = os.getenv("META_ACCESS_TOKEN", "")
ACCOUNT_ID = "act_1439536310038458"

# Use existing campaign ID created by previous run
CAMPAIGN_ID = "120245223059800444"

# Test if campaign is accessible
url = f"https://graph.facebook.com/v19.0/{CAMPAIGN_ID}"
params = {"access_token": ACCESS_TOKEN}
r = requests.get(url, params=params)
print(f"Campaign Info: {r.json()}")

# Test creating adset directly with campaign_id field
adset_url = f"https://graph.facebook.com/v19.0/{ACCOUNT_ID}/adsets"
adset_params = {
    "name": "ADFORGE_Purwoceng_WhatsApp_V2",
    "optimization_goal": "OFFSITE_CONVERSIONS",
    "billing_event": "IMPRESSIONS",
    "bid_amount": 30000,
    "daily_budget": 100000,
    "start_time": "2026-05-12T00:00:00+0700",
    "end_time": "2026-05-20T00:00:00+0700",
    "campaign_id": CAMPAIGN_ID,
    "promoted_object": {"page_id": "61904553"},
    "targeting": {
        "geo_countries": ["ID"],
        "age_range": {"min": 25, "max": 55},
        "user_os": ["android", "ios"],
        "interests": ["herbal", "wellness"],
    },
    "is_budget_sharing_enabled": False,
    "access_token": ACCESS_TOKEN,
}
r2 = requests.post(adset_url, params=adset_params)
print(f"Adset Creation: {r2.json()}")
