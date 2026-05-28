import requests
import json
import pandas as pd
from datetime import datetime
import os

ACCESS_TOKEN = os.getenv('META_ACCESS_TOKEN', '')
ACCOUNT_ID = 'act_380721031313330'

# 1. SHOPEE DATA (28 Apr - 10 Mei) - Refined from user provide CSV
shopee_tags = {
    'rakdapur3': 6713749,
    'multistorage': 194789,
    'rakpiringlifttarik': 977,
    'sofaarabian': 81,
    'pisaupeeler': 15462
}

def get_ads_hist():
    url = f'https://graph.facebook.com/v19.0/{ACCOUNT_ID}/campaigns'
    camps = requests.get(url, params={'access_token': ACCESS_TOKEN, 'fields': 'id,name,status'}).json().get('data', [])
    
    actions = []
    summary = []
    
    for c in camps:
        # Get historical spend (28 Apr - 10 Mei)
        ins_url = f'https://graph.facebook.com/v19.0/{c["id"]}/insights'
        params = {
            'access_token': ACCESS_TOKEN,
            'time_range': '{"since":"2026-04-28","until":"2026-05-10"}',
            'fields': 'spend,inline_link_clicks,inline_link_click_ctr'
        }
        ins_r = requests.get(ins_url, params=params).json().get('data', [])
        
        if ins_r:
            spend = float(ins_r[0]['spend'])
            # Identify Shopee Tag in Campaign Name (usually at the end or specific label)
            tag = "UNKNOWN"
            if "RAK" in c['name'].upper(): tag = "rakdapur3"
            elif "MULTI" in c['name'].upper(): tag = "multistorage"
            elif "SOFA" in c['name'].upper(): tag = "sofaarabian"
            
            revenue = shopee_tags.get(tag, 0)
            roi = revenue / spend if spend > 0 else 0
            
            # DECISION LOGIC: VILONA MODE
            if roi < 0.5 and spend > 50000: # ROI < 0.5 is safe threshold for 'very bad'
                new_name = f"OFF_{c['name']}"
                requests.post(f'https://graph.facebook.com/v19.0/{c["id"]}', params={'name': new_name, 'status': 'PAUSED', 'access_token': ACCESS_TOKEN})
                actions.append(f"KILLED (ROI {roi:.2f}): {c['name']} -> {new_name}")
            elif roi > 1.2:
                new_name = f"ADFORGE_{c['name']}" if not c['name'].startswith("ADFORGE") else c['name']
                requests.post(f'https://graph.facebook.com/v19.0/{c["id"]}', params={'name': new_name, 'access_token': ACCESS_TOKEN})
                actions.append(f"WINNER DETECTED (ROI {roi:.2f}): {c['name']} -> Labelled ADFORGE")

    return actions

if __name__ == "__main__":
    results = get_ads_hist()
    print(json.dumps(results, indent=2))
