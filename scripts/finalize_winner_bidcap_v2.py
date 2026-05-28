import requests
import json
import os

ACCESS_TOKEN = os.getenv('META_ACCESS_TOKEN', '')
AD_ACCOUNT_ID = 'act_380721031313330'
WINNING_POST_ID = '122109158625125943'
PAGE_ID = '110360638531778'

def finalize_with_correct_structure():
    print("--- FIXING BID CAP CAMPAIGN STRUCTURE TO MATCH WINNING POST ---")
    
    # 1. Create a NEW campaign with OUTCOME_ENGAGEMENT or proper objective for the post
    # Actually, traffic is fine but the AdSet needs to match.
    # Let's try creating a clean AdSet that allows promoted posts.
    
    c_url = f'https://graph.facebook.com/v19.0/{AD_ACCOUNT_ID}/campaigns'
    c_payload = {
        'access_token': ACCESS_TOKEN,
        'name': 'CBO_Rak Dapur_WINNER_BIDCAP180_VILONA_v2',
        'objective': 'OUTCOME_ENGAGEMENT',
        'status': 'ACTIVE',
        'bid_strategy': 'LOWEST_COST_WITH_BID_CAP',
        'daily_budget': 50000,
        'special_ad_categories': '[]'
    }
    camp_res = requests.post(c_url, data=c_payload).json()
    new_cid = camp_res['id']
    
    # 2. Create AdSet
    as_payload = {
        'access_token': ACCESS_TOKEN,
        'name': 'Winner_RakDapur_Eng_BIDCAP180_VILONA',
        'campaign_id': new_cid,
        'status': 'ACTIVE',
        'billing_event': 'IMPRESSIONS',
        'optimization_goal': 'POST_ENGAGEMENT',
        'bid_amount': 180,
        'targeting': json.dumps({
            "geo_locations": {"countries": ["ID"]},
            "publisher_platforms": ["instagram"],
            "instagram_positions": ["stream", "story", "explore", "reels"]
        }),
        'promoted_object': json.dumps({"page_id": PAGE_ID})
    }
    as_res = requests.post(f'https://graph.facebook.com/v19.0/{AD_ACCOUNT_ID}/adsets', data=as_payload).json()
    new_as_id = as_res['id']
    
    # 3. Create Ad using the Creative we just succeeded in creating (ID: 1478456233188550)
    ad_payload = {
        'access_token': ACCESS_TOKEN,
        'name': 'Ad_Winner_FINAL_VILONA',
        'adset_id': new_as_id,
        'creative': json.dumps({'creative_id': '1478456233188550'}),
        'status': 'ACTIVE'
    }
    ad_res = requests.post(f'https://graph.facebook.com/v19.0/{AD_ACCOUNT_ID}/ads', data=ad_payload).json()
    print(f"FINAL DEPLOYMENT RESULT: {ad_res}")

if __name__ == "__main__":
    finalize_with_correct_structure()
