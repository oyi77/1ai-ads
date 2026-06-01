import requests
import os

ACCESS_TOKEN = os.getenv("META_ACCESS_TOKEN", "")
AD_ACCOUNT_ID = "act_380721031313330"


def apply_campaign_bid_cap():
    # Attempting to set bid_strategy and bid_cap on a CBO campaign
    # Based on today's report, CBO_Scale_Rak Dapur_1-3-1_VILONA is ID: 120244776291860121
    target_campaign = "120244776291860121"

    print(f"--- SETTING CAMPAIGN BID CAP ON {target_campaign} ---")

    # Target 180 IDR Bid Cap
    res = requests.post(
        f"https://graph.facebook.com/v19.0/{target_campaign}",
        params={
            "access_token": ACCESS_TOKEN,
            "bid_strategy": "LOWEST_COST_WITH_BID_CAP",
            "bid_cap": 18000,  # Using micro units for 180.00 IDR
        },
    )
    print(f"Result: {res.json()}")


if __name__ == "__main__":
    apply_campaign_bid_cap()
