import requests
import json
import os

ACCESS_TOKEN = os.getenv("META_ACCESS_TOKEN", "")
ACCOUNT_ID = "act_1439536310038458"

CAMPAIGN_ID = "120245223059800444"

# Test adset with location targeting
adset_url = f"https://graph.facebook.com/v19.0/{ACCOUNT_ID}/adsets"
adset_params = {
    "name": "ADFORGE_Purwoceng_DirectWA_V8",
    "optimization_goal": "REACH",
    "billing_event": "IMPRESSIONS",
    "bid_amount": 30000,
    "daily_budget": 100000,
    "start_time": "2026-05-12T00:00:00+0700",
    "end_time": "2026-05-20T00:00:00+0700",
    "campaign_id": CAMPAIGN_ID,
    "targeting": json.dumps(
        {
            "geo_locations": {
                "countries": ["ID"],
                "cities": [
                    {
                        "region_id": 10150630098568939,
                        "radius": 10,
                        "distance_unit": "mile",
                    }
                ],  # Jakarta
            },
            "age_range": {"min": 25, "max": 55},
            "user_os": ["android", "ios"],
        }
    ),
    "is_budget_sharing_enabled": False,
    "access_token": ACCESS_TOKEN,
}
r = requests.post(adset_url, params=adset_params)
result = r.json()
print(f"Adset Result: {json.dumps(result, indent=2)}")
