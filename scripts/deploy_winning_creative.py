import requests
import json
import os

ACCESS_TOKEN = 'os.getenv('META_ACCESS_TOKEN', '')'
AD_ACCOUNT_ID = 'act_380721031313330'
NEW_ADSET_ID = '120245619478650121'
WINNING_POST_ID = '122109158625125943'

def deploy_video_creative():
    print(f"--- ATTEMPTING VIDEO CREATIVE INJECTION FOR POST {WINNING_POST_ID} ---")
    
    # We use the creative ID from the current winning ad if possible
    # Let's find it first
    url = f'https://graph.facebook.com/v19.0/{AD_ACCOUNT_ID}/ads'
    params = {
        'access_token': ACCESS_TOKEN,
        'fields': 'name,creative',
        'limit': 50
    }
    ads = requests.get(url, params=params).json().get('data', [])
    
    target_creative_id = '120244776292020121' # This was identified as the winning creative
    
    print(f"Using Winning Creative ID: {target_creative_id}")
    
    ad_payload = {
        'access_token': ACCESS_TOKEN,
        'name': 'Ad_Winner_BidCap_VILONA',
        'adset_id': NEW_ADSET_ID,
        'creative': json.dumps({'creative_id': target_creative_id}),
        'status': 'ACTIVE'
    }
    
    res = requests.post(f'https://graph.facebook.com/v19.0/{AD_ACCOUNT_ID}/ads', data=ad_payload).json()
    print(f"Final Ad Deployment Result: {res}")

if __name__ == "__main__":
    deploy_video_creative()
