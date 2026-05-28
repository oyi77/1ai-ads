import requests
import json
import os

ACCESS_TOKEN = 'os.getenv('META_ACCESS_TOKEN', '')'
AD_ACCOUNT_ID = 'act_380721031313330'

# List of campaign IDs to apply Bid Cap
MANAGED_CAMPAIGNS = [
    '120244776291860121', # Rak Dapur 1-3-1
]

def apply_bid_cap_to_campaigns():
    print(f"--- STARTING CAMPAIGN-LEVEL BID CAP PROTECTION ---")
    
    for camp_id in MANAGED_CAMPAIGNS:
        # Step 1: Set Campaign Bid Strategy to LOWEST_COST_WITH_BID_CAP
        # Step 2: Set Campaign-level Bid Cap
        # Note: FB requires 'bid_cap' field for campaign level bid limit in micro-units
        
        print(f"Applying RP 180 Bid Cap to Campaign: {camp_id}")
        payload = {
            'bid_strategy': 'LOWEST_COST_WITH_BID_CAP',
            'bid_cap': 18000 # 180 IDR in micros
        }
        r = requests.post(f'https://graph.facebook.com/v19.0/{camp_id}', params={'access_token': ACCESS_TOKEN, **payload})
        print(f"Result: {r.json()}")

if __name__ == "__main__":
    apply_bid_cap_to_campaigns()
