import requests
import os

ACCESS_TOKEN = os.getenv('META_ACCESS_TOKEN', '')
AD_ACCOUNT_ID = 'act_1439536310038458'

def get_history():
    print(f"--- ANALYZING HISTORICAL DATA FOR {AD_ACCOUNT_ID} ---")
    url = f'https://graph.facebook.com/v19.0/{AD_ACCOUNT_ID}/insights'
    params = {
        'access_token': ACCESS_TOKEN,
        'level': 'adset',
        'fields': 'adset_name,cost_per_inline_link_click,inline_link_click_ctr,spend,reach',
        'date_preset': 'last_30d',
        'limit': 100
    }
    res = requests.get(url, params=params).json()
    data = res.get('data', [])
    
    # Sort by performance
    winners = sorted([d for d in data if float(d.get('spend', 0)) > 5000], 
                    key=lambda x: float(x.get('inline_link_click_ctr', 0)), reverse=True)
    
    for d in winners[:5]:
        print(f"WINNER: {d['adset_name']} | CTR: {d['inline_link_click_ctr']}% | CPC: {d['cost_per_inline_link_click']}")

if __name__ == "__main__":
    get_history()
