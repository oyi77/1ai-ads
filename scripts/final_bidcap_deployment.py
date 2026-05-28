import requests
import json
import os

ACCESS_TOKEN = os.getenv('META_ACCESS_TOKEN', '')
AD_ACCOUNT_ID = 'act_380721031313330'
NEW_CAMPAIGN_ID = '120245619456560121'

# Targeting "Wanita_IG_Luxury goods" original payload manually cleaned for BidCap success
# Resolving 'instagram_positions' error by adding explore
CLEAN_TARGETING = {
    "geo_locations": {"countries": ["ID"]},
    "age_min": 25,
    "age_max": 55,
    "genders": [2],
    "publisher_platforms": ["instagram"],
    "facebook_positions": [],
    "instagram_positions": [
        "stream",
        "story",
        "explore",
        "explore_grid",
        "reels"
    ],
    "device_platforms": ["mobile"],
    "flexible_spec": [
        {
            "interests": [
                {"id": "6003113941014", "name": "Kitchen"},
                {"id": "6003206259061", "name": "Kitchenware"}
            ]
        }
    ]
}

def final_push():
    print("--- DEPLOYING CLEAN BID CAP ADSET ---")
    
    # 1. Create AdSet
    as_payload = {
        'access_token': ACCESS_TOKEN,
        'name': 'Winner_RakDapur_BIDCAP180_VILONA',
        'campaign_id': NEW_CAMPAIGN_ID,
        'status': 'ACTIVE',
        'billing_event': 'IMPRESSIONS',
        'optimization_goal': 'LINK_CLICKS',
        'bid_amount': 180,
        'targeting': json.dumps(CLEAN_TARGETING),
        'promoted_object': json.dumps({"page_id": "110360638531778"}) # nyamiresepdapur Page
    }
    
    res = requests.post(f'https://graph.facebook.com/v19.0/{AD_ACCOUNT_ID}/adsets', data=as_payload).json()
    
    if 'id' in res:
        as_id = res['id']
        print(f"AdSet SUCCESS: {as_id}")
        
        # 2. Add an Ad to this AdSet using the winning Creative
        # Winner Creative ID (from audit): 120244776292020121
        ad_payload = {
            'access_token': ACCESS_TOKEN,
            'name': 'Ad_Winner_VILONA',
            'adset_id': as_id,
            'creative': json.dumps({'creative_id': '120244776292020121'}),
            'status': 'ACTIVE'
        }
        ad_res = requests.post(f'https://graph.facebook.com/v19.0/{AD_ACCOUNT_ID}/ads', data=ad_payload).json()
        print(f"Ad SUCCESS: {ad_res}")
        
        # 3. Activate Campaign
        requests.post(f'https://graph.facebook.com/v19.0/{NEW_CAMPAIGN_ID}', params={'access_token': ACCESS_TOKEN, 'status': 'ACTIVE'})
        print("CAMPAIGN ACTIVATED.")
    else:
        print(f"FAILED: {res}")

if __name__ == "__main__":
    final_push()
