import requests
import json
from datetime import datetime
import os

ACCESS_TOKEN = os.getenv("META_ACCESS_TOKEN", "")
AD_ACCOUNT_ID = "act_1439536310038458"


def set_campaign_status(campaign_id, status):
    url = f"https://graph.facebook.com/v19.0/{campaign_id}"
    params = {"access_token": ACCESS_TOKEN, "status": status}
    response = requests.post(url, params=params).json()
    return response


def get_herbal_campaigns():
    url = f"https://graph.facebook.com/v19.0/{AD_ACCOUNT_ID}/campaigns"
    params = {"access_token": ACCESS_TOKEN, "fields": "id,name,status", "limit": 100}
    r = requests.get(url, params=params).json()
    return [
        c
        for c in r.get("data", [])
        if any(
            x in c["name"].lower()
            for x in ["purwoceng", "wedang", "herbal", "bawang", "soca"]
        )
    ]


def execute_on():
    print(f"[{datetime.now()}] 🚀 EXECUTING MASSIVE ON FOR HERBAL ADS...")
    campaigns = get_herbal_campaigns()
    for c in campaigns:
        res = set_campaign_status(c["id"], "ACTIVE")
        print(f"  Campaign: {c['name']} | Status: {res}")


if __name__ == "__main__":
    # Script ini akan dipanggil oleh cron atau scheduler eksternal jam 05:00
    execute_on()
