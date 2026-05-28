import requests
import os

ACCESS_TOKEN = os.getenv('META_ACCESS_TOKEN', '')
ACCOUNT_NYAMI = 'act_380721031313330'
ACCOUNT_KAKRIPUT = 'act_435670549443081'

def fix_budgets():
    # 1. Nyami - Push Rak Dapur 2
    camp_nyami = '120244913736550121' # Based on earlier logs for Rak Dapur 2
    print(f"Pushing Budget for Nyami {camp_nyami}...")
    # Setting to 500,000 IDR (Meta API uses cents/micros for some currencies, but usually IDR is full units or /100)
    # Based on previous check, budget 500000 was read as 5000.0, so 100x.
    requests.post(f'https://graph.facebook.com/v19.0/{camp_nyami}', params={
        'access_token': ACCESS_TOKEN,
        'daily_budget': 50000000 # Trying 500k in micro units
    })

    # 2. Kakriput - Push Winning Scale
    camp_kak = '120248315320250416' 
    print(f"Pushing Budget for Kakriput {camp_kak}...")
    requests.post(f'https://graph.facebook.com/v19.0/{camp_kak}', params={
        'access_token': ACCESS_TOKEN,
        'daily_budget': 30000000 # 300k
    })
    
    # 3. Ensure Bid Cap on Kakriput
    requests.post(f'https://graph.facebook.com/v19.0/{camp_kak}', params={
        'access_token': ACCESS_TOKEN,
        'bid_strategy': 'LOWEST_COST_WITH_BID_CAP',
        'bid_cap': 180
    })

if __name__ == "__main__":
    fix_budgets()
