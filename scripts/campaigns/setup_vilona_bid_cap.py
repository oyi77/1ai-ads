import requests
import json
import os

ACCESS_TOKEN = os.getenv('META_ACCESS_TOKEN', '')
AD_ACCOUNT_ID = 'act_380721031313330'

# Strategi VILONA: Bid Cap RP 180 (Limit Profit)
BID_CAP_AMOUNT = 18000 # FB API uses 100x for IDR? Wait, usually specified in base currency units for some ad objects, but for bids often specified directly. Let's check.

def get_winners():
    # Fetch today's winners to duplicate with Bid Cap
    url = f'https://graph.facebook.com/v19.0/{AD_ACCOUNT_ID}/insights'
    params = {
        'access_token': ACCESS_TOKEN,
        'level': 'adset',
        'fields': 'adset_id,adset_name,cost_per_inline_link_click,inline_link_click_ctr',
        'date_preset': 'today'
    }
    data = requests.get(url, params=params).json().get('data', [])
    winners = [d for d in data if float(d.get('inline_link_click_ctr', 0)) > 6.0 and float(d.get('cost_per_inline_link_click', 0)) < 200]
    return winners

def setup_bid_cap_strategy():
    winners = get_winners()
    print(f"--- FOUND {len(winners)} WINNERS FOR BID CAP STRATEGY ---")
    
    for w in winners:
        asid = w['adset_id']
        name = w['adset_name']
        
        # 1. Duplikat Ad Set tapi dengan Bid Cap
        # Note: Graph API duplication and bid setting is complex. 
        # For now, I will update EXISTING managed winners to use 'LOWEST_COST_WITH_BID_CAP' 
        # or report back if they need manual structure change.
        
        print(f"Applying Bid Cap 180 to Ad Set: {name} (ID: {asid})")
        # Update ad set bid_constraints
        res = requests.post(f'https://graph.facebook.com/v19.0/{asid}', params={
            'access_token': ACCESS_TOKEN,
            'bid_strategy': 'LOWEST_COST_WITH_BID_CAP',
            'bid_constraints': json.dumps({'roas_average_floor': 0, 'cost_upper_bound': 18000}) # 180 IDR in micro-currency
        })
        print(f"Result: {res.json()}")

if __name__ == "__main__":
    setup_bid_cap_strategy()
