import requests
import json
import os

ACCESS_TOKEN = 'os.getenv('META_ACCESS_TOKEN', '')'
AD_ACCOUNT_ID = 'act_380721031313330'
WINNING_POST_ID = '122109158625125943'
PAGE_ID = '110360638531778'

# This script is the final attempt at clean autonomous injection using the user's specific Post ID.
def deploy_final_bidcap_win():
    # 1. Create a Campaign focused on Traffic/Engagement that supports the post
    # Using OUTCOME_TRAFFIC but configuring the adset correctly for a sponsored post.
    c_url = f'https://graph.facebook.com/v19.0/{AD_ACCOUNT_ID}/campaigns'
    c_payload = {
        'access_token': ACCESS_TOKEN,
        'name': 'CBO_RakDapur_Winner_BidCap180_VILONA_v3',
        'objective': 'OUTCOME_TRAFFIC',
        'status': 'ACTIVE',
        'bid_strategy': 'LOWEST_COST_WITH_BID_CAP',
        'daily_budget': 100000, # Bumping to 100k for the winner
        'special_ad_categories': '[]'
    }
    camp_res = requests.post(c_url, data=c_payload).json()
    new_cid = camp_res.get('id')
    print(f"Created Campaign: {new_cid}")

    # 2. Duplicate the AdSet from the WINNING adset (ID: 120244776291970121) 
    # instead of creating from scratch to ensure targeting compatibility.
    copy_url = f'https://graph.facebook.com/v19.0/120244776291970121/copies'
    copy_res = requests.post(copy_url, params={
        'access_token': ACCESS_TOKEN,
        'campaign_id': new_cid,
        'status': 'ACTIVE'
    }).json()
    new_as_id = copy_res.get('id')
    print(f"Copied AdSet ID: {new_as_id}")

    # 3. Apply the Bid Cap 180 to the new AdSet
    requests.post(f'https://graph.facebook.com/v19.0/{new_as_id}', params={
        'access_token': ACCESS_TOKEN,
        'bid_amount': 180,
        'name': 'Winner_RakDapur_BidCap180_VILONA'
    })

    # 4. Inject the WINNING POST ID into this AdSet
    # User provided: 122109158625125943
    # We already created creative 1478456233188550 for this post.
    ad_payload = {
        'access_token': ACCESS_TOKEN,
        'name': f'AD_Winner_Post_{WINNING_POST_ID}_VILONA',
        'adset_id': new_as_id,
        'creative': json.dumps({'creative_id': '1478456233188550'}),
        'status': 'ACTIVE'
    }
    ad_res = requests.post(f'https://graph.facebook.com/v19.0/{AD_ACCOUNT_ID}/ads', data=ad_payload).json()
    print(f"AD DEPLOYMENT RESULT: {ad_res}")

if __name__ == "__main__":
    deploy_final_bidcap_win()
