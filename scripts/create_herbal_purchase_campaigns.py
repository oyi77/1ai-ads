import requests
import json
import time
import os

ACCESS_TOKEN = os.getenv('META_ACCESS_TOKEN', '')
AD_ACCOUNT_ID = 'act_1439536310038458'
PIXEL_ID = '771021905629860'

def cleanup():
    print("--- Cleaning up previous failed campaigns ---")
    url = f'https://graph.facebook.com/v19.0/{AD_ACCOUNT_ID}/campaigns'
    r = requests.get(url, params={'access_token': ACCESS_TOKEN, 'fields': 'id,name'}).json()
    for c in r.get('data', []):
        if "_VILONA" in c['name']:
            print(f"Deleting {c['name']} ({c['id']})...")
            requests.delete(f'https://graph.facebook.com/v19.0/{c["id"]}', params={'access_token': ACCESS_TOKEN})

def create_purchase_campaign(name, creative_id):
    print(f"--- Creating Campaign: {name} ---")
    
    # 1. Create Campaign
    url_c = f'https://graph.facebook.com/v19.0/{AD_ACCOUNT_ID}/campaigns'
    payload_c = {
        'name': name,
        'objective': 'OUTCOME_SALES',
        'status': 'ACTIVE',
        'special_ad_categories': '[]',
        'bid_strategy': 'LOWEST_COST_WITHOUT_CAP',
        'daily_budget': 105000,
        'access_token': ACCESS_TOKEN
    }
    r_c = requests.post(url_c, data=payload_c).json()
    campaign_id = r_c.get('id')
    if not campaign_id:
        print(f"Error creating campaign: {r_c}")
        return
    
    print(f"Created Campaign ID: {campaign_id}")

    # 2. Define Adsets
    adset_configs = [
        {
            'name': 'Belanja_Online_IG_23-55',
            'targeting': {
                'geo_locations': {'countries': ['ID']},
                'age_min': 23,
                'age_max': 55,
                'publisher_platforms': ['instagram'],
                'instagram_positions': ['stream', 'ig_search', 'story', 'reels', 'profile_feed'],
                'device_platforms': ['mobile'],
                'flexible_spec': [{'interests': [{'id': '6003346592981', 'name': 'Belanja online (ritel)'}]}],
                'targeting_automation': {'advantage_audience': 0}
            }
        },
        {
            'name': 'Luxury_Hobbies_IG_23-55',
            'targeting': {
                'geo_locations': {'countries': ['ID']},
                'age_min': 23,
                'age_max': 55,
                'publisher_platforms': ['instagram'],
                'instagram_positions': ['stream', 'ig_search', 'story', 'reels', 'profile_feed'],
                'device_platforms': ['mobile'],
                'flexible_spec': [{'interests': [{'id': '6003263791114', 'name': 'Belanja (ritel)'}]}],
                'targeting_automation': {'advantage_audience': 0}
            }
        },
        {
            'name': 'Broad_IG_23-55',
            'targeting': {
                'geo_locations': {'countries': ['ID']},
                'age_min': 23,
                'age_max': 55,
                'publisher_platforms': ['instagram'],
                'instagram_positions': ['stream', 'ig_search', 'story', 'reels', 'profile_feed'],
                'device_platforms': ['mobile'],
                'targeting_automation': {'advantage_audience': 0}
            }
        }
    ]

    for config in adset_configs:
        print(f"  Creating Adset: {config['name']}...")
        url_as = f'https://graph.facebook.com/v19.0/{AD_ACCOUNT_ID}/adsets'
        payload_as = {
            'name': config['name'],
            'campaign_id': campaign_id,
            'status': 'ACTIVE',
            'billing_event': 'IMPRESSIONS',
            'optimization_goal': 'OFFSITE_CONVERSIONS',
            'promoted_object': json.dumps({'pixel_id': PIXEL_ID, 'custom_event_type': 'PURCHASE'}),
            'targeting': json.dumps(config['targeting']),
            'access_token': ACCESS_TOKEN
        }
        r_as = requests.post(url_as, data=payload_as).json()
        adset_id = r_as.get('id')
        if not adset_id:
            print(f"    Error creating adset: {r_as}")
            continue
             
        # 3. Create Ad
        url_ad = f'https://graph.facebook.com/v19.0/{AD_ACCOUNT_ID}/ads'
        payload_ad = {
            'name': f"Ads_{name}",
            'adset_id': adset_id,
            'status': 'ACTIVE',
            'creative': json.dumps({'creative_id': creative_id}),
            'access_token': ACCESS_TOKEN
        }
        r_ad = requests.post(url_ad, data=payload_ad).json()
        ad_id = r_ad.get('id')
        if ad_id:
            print(f"    Created Ad ID: {ad_id}")
        else:
            print(f"    Error creating ad: {r_ad}")

# Execution
cleanup()

# Wedang Alang-Alang Creative: 951263927682538
create_purchase_campaign(
    name="CBO_PURCHASE_WEDANG_VILONA", 
    creative_id="951263927682538"
)

# Purwoceng Creative: 1296083695381611
create_purchase_campaign(
    name="CBO_PURCHASE_PURWOCENG_VILONA", 
    creative_id="1296083695381611"
)
