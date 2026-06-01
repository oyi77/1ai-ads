import requests
import json
import os

ACCESS_TOKEN = os.getenv("META_ACCESS_TOKEN", "")
AD_ACCOUNT_ID = "act_1439536310038458"
CAMPAIGN_WEDANG = "120245846348470444"

# Manually selected working high-res creatives for Wedang (Page: 997737406765722)
WEDANG_FINAL_CREATIVES = [
    "1011654887960239",  # Video: Awas! Capek Terus Tanda Ginjal Penuh Racun
    "1187188911135729",  # Video: Nyesel Baru Tau Cara Buang Racun Tubuh Ini
]


def complete_wedang_formation():
    print(f"Completing Wedang campaign formation...")
    url_as = f"https://graph.facebook.com/v19.0/{CAMPAIGN_WEDANG}/adsets"
    adsets = (
        requests.get(url_as, params={"access_token": ACCESS_TOKEN, "fields": "id,name"})
        .json()
        .get("data", [])
    )

    for adset in adsets:
        adset_id = adset["id"]
        for i, cr_id in enumerate(WEDANG_FINAL_CREATIVES):
            ad_name = f"Ads_{adset['name']}_Fix_{i+1}"
            print(f"  Creating {ad_name} in adset {adset_id}...")
            url_ad = f"https://graph.facebook.com/v19.0/{AD_ACCOUNT_ID}/ads"
            payload = {
                "name": ad_name,
                "adset_id": adset_id,
                "status": "ACTIVE",
                "creative": json.dumps({"creative_id": cr_id}),
                "access_token": ACCESS_TOKEN,
            }
            r = requests.post(url_ad, data=payload).json()
            if r.get("id"):
                print(f"    Success: {r.get('id')}")
            else:
                print(f"    Failed: {r}")


if __name__ == "__main__":
    complete_wedang_formation()
