import requests
import json
import os

ACCESS_TOKEN = 'os.getenv('META_ACCESS_TOKEN', '')'
AD_ACCOUNT_ID = 'act_380721031313330'
BID_CAP_CAMPAIGN_ID = '120245619456560121'

def check_bid_cap_status():
    print(f"--- CHECKING STATUS FOR CAMPAIGN {BID_CAP_CAMPAIGN_ID} ---")
    
    # Check Campaign
    c_url = f'https://graph.facebook.com/v19.0/{BID_CAP_CAMPAIGN_ID}'
    c_res = requests.get(c_url, params={'access_token': ACCESS_TOKEN, 'fields': 'name,status,effective_status,bid_strategy'}).json()
    print(f"Campaign: {c_res.get('name')} | Status: {c_res.get('effective_status')} | Strategy: {c_res.get('bid_strategy')}")
    
    # Check AdSets
    as_url = f'https://graph.facebook.com/v19.0/{BID_CAP_CAMPAIGN_ID}/adsets'
    as_res = requests.get(as_url, params={'access_token': ACCESS_TOKEN, 'fields': 'name,status,effective_status,bid_amount'}).json().get('data', [])
    for a in as_res:
        print(f"  AdSet: {a.get('name')} | Status: {a.get('effective_status')} | Bid Cap: {a.get('bid_amount')}")

    # Check Ads
    ad_url = f'https://graph.facebook.com/v19.0/{BID_CAP_CAMPAIGN_ID}/ads'
    ad_res = requests.get(ad_url, params={'access_token': ACCESS_TOKEN, 'fields': 'name,status,effective_status'}).json().get('data', [])
    for ad in ad_res:
        print(f"    Ad: {ad.get('name')} | Status: {ad.get('effective_status')}")

if __name__ == "__main__":
    check_bid_cap_status()
