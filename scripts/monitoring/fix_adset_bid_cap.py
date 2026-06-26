import requests
import os

ACCESS_TOKEN = os.getenv("META_ACCESS_TOKEN", "")


def fix_adset_level():
    campaign_id = "120244776291860121"
    url = f"https://graph.facebook.com/v19.0/{campaign_id}/adsets"
    adsets = (
        requests.get(url, params={"access_token": ACCESS_TOKEN, "fields": "id,name"})
        .json()
        .get("data", [])
    )

    print(f"--- UPDATING {len(adsets)} ADSETS TO BID CAP 180 ---")
    for a in adsets:
        res = requests.post(
            f'https://graph.facebook.com/v19.0/{a["id"]}',
            params={"access_token": ACCESS_TOKEN, "bid_amount": 180},
        ).json()
        print(f"Update {a['name']}: {res}")


if __name__ == "__main__":
    fix_adset_level()
