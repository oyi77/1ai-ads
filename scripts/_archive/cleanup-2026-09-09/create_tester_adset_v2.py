import requests
import json
import os

ACCESS_TOKEN = os.getenv("META_ACCESS_TOKEN", "")
ACCOUNT_ID = "act_1439536310038458"
CAMPAIGN_ID = "120245223521440444"


def create_adset_simplified():
    # POST direct ke Account ID dengan field campaign_id
    url = f"https://graph.facebook.com/v19.0/{ACCOUNT_ID}/adsets"

    params = {
        "name": "ADFORGE_Purwoceng_AudienceTest_V1",
        "campaign_id": CAMPAIGN_ID,
        "optimization_goal": "CONVERSATIONS",
        "billing_event": "IMPRESSIONS",
        "daily_budget": 50000,
        "targeting": json.dumps(
            {
                "geo_locations": {"countries": ["ID"]},
                "age_min": 30,
                "age_max": 55,
                "genders": [1],
            }
        ),
        "promoted_object": json.dumps({"page_id": "1084424941415870"}),
        "status": "PAUSED",
        "access_token": ACCESS_TOKEN,
    }

    r = requests.post(url, params=params)
    return r.json()


if __name__ == "__main__":
    print(json.dumps(create_adset_simplified(), indent=2))
