import requests
import json
import os

ACCESS_TOKEN = os.getenv("META_ACCESS_TOKEN", "")
ACCOUNT_ID = "act_1439536310038458"
CAMPAIGN_ID = "120245223521440444"  # ADFORGE_Purwoceng_DirectWA_V1


def create_new_adset_test():
    url = f"https://graph.facebook.com/v19.0/{CAMPAIGN_ID}/adsets"

    # New Targeting: Focus on interest Coffee, Traditional Medicine, and Fitness
    # using Advantage+ Audience where possible or structural targeting
    adset_params = {
        "name": "ADFORGE_Purwoceng_AudienceTest_V1",
        "optimization_goal": "CONVERSATIONS",  # Sinkron dengan target WA
        "billing_event": "IMPRESSIONS",
        "bid_amount": 25000,
        "daily_budget": 50000,  # Budget tester
        "targeting": json.dumps(
            {
                "geo_locations": {
                    "countries": ["ID"],
                    "regions": [
                        {"key": "1664", "name": "Jakarta"},
                        {"key": "1685", "name": "West Java"},
                    ],
                },
                "age_min": 30,  # Naikin umur dikit biar lebih mateng (duitnya ready)
                "age_max": 55,
                "genders": [1],  # Fokus ke Laki-laki
                "publisher_platforms": ["facebook", "instagram"],
                "device_platforms": ["mobile"],
            }
        ),
        "is_budget_sharing_enabled": False,
        "promoted_object": json.dumps(
            {
                "page_id": "1084424941415870"  # Menggunakan Page ID dari campaign manual lo tadi
            }
        ),
        "status": "PAUSED",  # Gue buat PAUSED dulu biar lo bisa review
        "access_token": ACCESS_TOKEN,
    }

    r = requests.post(url, params=adset_params)
    return r.json()


if __name__ == "__main__":
    result = create_new_adset_test()
    print(json.dumps(result, indent=2))
