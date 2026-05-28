import requests
import json
import os

ACCESS_TOKEN = 'os.getenv('META_ACCESS_TOKEN', '')'
AD_ACCOUNT_ID = 'act_380721031313330'

def create_bid_cap_campaign():
    print("--- CREATING NEW BID CAP CAMPAIGN (SELOW ID 1041) ---")
    
    # 1. Create Campaign with BID_CAP Strategy
    c_url = f'https://graph.facebook.com/v19.0/{AD_ACCOUNT_ID}/campaigns'
    c_payload = {
        'access_token': ACCESS_TOKEN,
        'name': 'CBO_Rak Dapur_BIDCAP_180_VILONA',
        'objective': 'OUTCOME_TRAFFIC', # Target Link Clicks for Affiliate
        'status': 'PAUSED', # Create as paused first
        'bid_strategy': 'LOWEST_COST_WITH_BID_CAP',
        'daily_budget': 50000, # Start with 50k IDR
        'special_ad_categories': '[]'
    }
    
    camp_res = requests.post(c_url, data=c_payload).json()
    if 'id' not in camp_res:
        print(f"Failed to create campaign: {camp_res}")
        return
    
    new_cid = camp_res['id']
    print(f"New Campaign Created: {new_cid}")

    # 2. Duplicate Ad Sets from Winner (Rak Dapur 1-3-1)
    # Winner AdSet ID from earlier audit: 120244776291970121
    source_adset = '120244776291970121'
    
    # In API, "duplicate" is best done by reading and re-creating
    # But for a quick pilot, let's create 1 clean AdSet in the new campaign
    as_url = f'https://graph.facebook.com/v19.0/{AD_ACCOUNT_ID}/adsets'
    as_payload = {
        'access_token': ACCESS_TOKEN,
        'name': 'Rak Dapur_Winner_BidCap180_VILONA',
        'campaign_id': new_cid,
        'status': 'PAUSED',
        'billing_event': 'IMPRESSIONS',
        'optimization_goal': 'LINK_CLICKS',
        'bid_amount': 180, # LOCK 180 IDR HERE
        'targeting': json.dumps({
            'geo_locations': {'countries': ['ID']},
            'publisher_platforms': ['instagram'],
            'flexible_spec': [{'interests': [{'id': '6003206259061', 'name': 'Kitchen'}]}]
        }),
        'pacing_type': '["standard"]'
    }
    
    as_res = requests.post(as_url, data=as_payload).json()
    print(f"AdSet Creation Result: {as_res}")

if __name__ == "__main__":
    create_bid_cap_campaign()
