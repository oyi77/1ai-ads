import requests
import json
import os

ACCESS_TOKEN = os.getenv('META_ACCESS_TOKEN', '')
AD_ACCOUNT_ID = 'act_380721031313330'

def apply_bulk_adset_bid_via_campaign():
    campaign_id = '120244776291860121' # CBO winner
    
    # Get all adsets in this campaign
    url = f'https://graph.facebook.com/v19.0/{campaign_id}/adsets'
    adsets = requests.get(url, params={'access_token': ACCESS_TOKEN, 'fields': 'id'}).json().get('data', [])
    
    # Build the 'adset_bid_amounts' map
    # Format: {"adset_id": bid_amount}
    bid_map = {a['id']: 18000 for a in adsets}
    
    print(f"Applying Bid Strategy + Bulk AdSet Bid Caps to Campaign {campaign_id}")
    payload = {
        'bid_strategy': 'LOWEST_COST_WITH_BID_CAP',
        'adset_bid_amounts': json.dumps(bid_map)
    }
    
    res = requests.post(f'https://graph.facebook.com/v19.0/{campaign_id}', params={'access_token': ACCESS_TOKEN, **payload})
    print(f"Result: {res.json()}")

if __name__ == "__main__":
    apply_bulk_adset_bid_via_campaign()
