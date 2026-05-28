import requests
import json
import os

ACCESS_TOKEN = 'os.getenv('META_ACCESS_TOKEN', '')'
AD_ACCOUNT_ID = 'act_435670549443081' # Kakriput
WINNING_POST_URL = 'https://www.facebook.com/61583778313869/posts/122112585633125943/'
POST_ID = '122112585633125943'
PAGE_ID = '61583778313869'

def deploy_kakriput_scale():
    print(f"--- SCALING KAKRIPUT WINNING POST: {POST_ID} ---")
    
    # 1. Create Campaign with Bid Cap Strategy
    c_url = f'https://graph.facebook.com/v19.0/{AD_ACCOUNT_ID}/campaigns'
    c_payload = {
        'access_token': ACCESS_TOKEN,
        'name': 'CBO_Kakriput_WinningScale_BIDCAP180_VILONA',
        'objective': 'OUTCOME_TRAFFIC',
        'status': 'ACTIVE',
        'bid_strategy': 'LOWEST_COST_WITH_BID_CAP',
        'daily_budget': 100000,
        'special_ad_categories': '[]'
    }
    camp_res = requests.post(c_url, data=c_payload).json()
    if 'id' not in camp_res:
        print(f"Failed to create campaign: {camp_res}")
        return
    new_cid = camp_res['id']
    print(f"Campaign Created: {new_cid}")

    # 2. Create Ad Creative with Post ID 
    # Proper format for object_story_id usually: PAGEID_POSTID
    full_story_id = f"{PAGE_ID}_{POST_ID}"
    cr_payload = {
        'access_token': ACCESS_TOKEN,
        'name': f'Creative_Kakriput_Winner_{POST_ID}',
        'object_story_id': full_story_id
    }
    cr_res = requests.post(f'https://graph.facebook.com/v19.0/{AD_ACCOUNT_ID}/adcreatives', data=cr_payload).json()
    if 'id' not in cr_res:
        print(f"Creative Failed: {cr_res}")
        return
    cr_id = cr_res['id']
    print(f"Creative Created: {cr_id}")

    # 3. Create AdSet with 180 IDR Bid Cap
    as_payload = {
        'access_token': ACCESS_TOKEN,
        'name': 'Scale_Testing_BIDCAP180_VILONA',
        'campaign_id': new_cid,
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
    as_res = requests.post(f'https://graph.facebook.com/v19.0/{AD_ACCOUNT_ID}/adsets', data=as_payload).json()
    if 'id' not in as_res:
        print(f"AdSet Failed: {as_res}")
        return
    as_id = as_res['id']
    print(f"AdSet Created: {as_id}")

    # 4. Create Ad
    ad_payload = {
        'access_token': ACCESS_TOKEN,
        'name': 'Ad_Winner_Kakriput_VILONA',
        'adset_id': as_id,
        'creative': json.dumps({'creative_id': cr_id}),
        'status': 'ACTIVE'
    }
    ad_res = requests.post(f'https://graph.facebook.com/v19.0/{AD_ACCOUNT_ID}/ads', data=ad_payload).json()
    print(f"AD DEPLOYED: {ad_res}")

if __name__ == "__main__":
    deploy_kakriput_scale()
