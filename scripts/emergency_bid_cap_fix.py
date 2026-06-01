import requests
import json
import os

ACCESS_TOKEN = os.getenv("META_ACCESS_TOKEN", "")
AD_ACCOUNT_ID = "act_380721031313330"


def emergency_fix_bid_cap():
    print("--- EMERGENCY FIX: SETTING BID CAP TO 180 IDR ---")

    # 1. Target campaign
    campaign_id = "120244776291860121"

    # 2. Get adsets to build correct bid map (180 IDR)
    url = f"https://graph.facebook.com/v19.0/{campaign_id}/adsets"
    adsets = (
        requests.get(url, params={"access_token": ACCESS_TOKEN, "fields": "id"})
        .json()
        .get("data", [])
    )

    # 180 IDR as bid_amount (Meta usually takes integer IDR for manual bids in many contexts,
    # but some internal micro-conversions happen. Let's use 180 as the base.)
    bid_map = {a["id"]: 180 for a in adsets}

    payload = {
        "bid_strategy": "LOWEST_COST_WITH_BID_CAP",
        "adset_bid_amounts": json.dumps(bid_map),
    }

    res = requests.post(
        f"https://graph.facebook.com/v19.0/{campaign_id}",
        params={"access_token": ACCESS_TOKEN, **payload},
    )
    print(f"Correcting Campaign {campaign_id}: {res.json()}")


if __name__ == "__main__":
    emergency_fix_bid_cap()
