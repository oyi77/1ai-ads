import requests
import json
import os

ACCESS_TOKEN = os.getenv('META_ACCESS_TOKEN', '')
AD_ACCOUNT_ID = 'act_380721031313330'

def test_bid_amount():
    # Attempting to set bid_amount directly on a winner ad set
    # Winner ID from last run: 120244776291970121 (Rak Dapur Ad Set)
    target_adset = '120244776291970121'
    
    print(f"--- TESTING BID_AMOUNT (BID CAP) ON AD SET {target_adset} ---")
    
    # FB API for Bid Cap usually uses 'bid_amount' for manual bidding strategies
    res = requests.post(f'https://graph.facebook.com/v19.0/{target_adset}', params={
        'access_token': ACCESS_TOKEN,
        'bid_strategy': 'LOWEST_COST_WITH_BID_CAP',
        'bid_amount': 18000 # 180 IDR? Or 180? Micro units is common (180 * 100)
    })
    print(f"Result: {res.json()}")

if __name__ == "__main__":
    test_bid_amount()
