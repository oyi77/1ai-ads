import requests
import json
import os

ACCESS_TOKEN = 'os.getenv('META_ACCESS_TOKEN', '')'
AD_ACCOUNT_ID = 'act_380721031313330'
NEW_CAMPAIGN_ID = '120245619456560121'

# Final try: simplified AdSet without promoted_object for pure Link Clicks (standard traffic)
def deploy_v2():
    print("--- DEPLOYING BID CAP V2 (CLEAN) ---")
    
    as_payload = {
        'access_token': ACCESS_TOKEN,
        'name': 'RakDapur_Simple_BIDCAP180_VILONA',
        'campaign_id': NEW_CAMPAIGN_ID,
        'status': 'ACTIVE',
        'billing_event': 'IMPRESSIONS',
        'optimization_goal': 'LINK_CLICKS',
        'bid_amount': 180,
        'targeting': json.dumps({
            "geo_locations": {"countries": ["ID"]},
            "publisher_platforms": ["instagram"],
            "instagram_positions": ["stream", "story", "explore", "reels"]
        })
    }
    
    res = requests.post(f'https://graph.facebook.com/v11.0/{AD_ACCOUNT_ID}/adsets', data=as_payload).json()
    print(f"Result: {res}")

if __name__ == "__main__":
    deploy_v2()
