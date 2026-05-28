import requests
import json
import os

ACCESS_TOKEN = os.getenv('META_ACCESS_TOKEN', '')
ACCOUNT_ID = 'act_1439536310038458'

def get_winning_adset(campaign_id):
    url = f'https://graph.facebook.com/v19.0/{campaign_id}/adsets'
    params = {'access_token': ACCESS_TOKEN, 'fields': 'id,name,targeting,status'}
    r = requests.get(url, params=params).json()
    data = r.get('data', [])
    for ds in data:
        if ds['status'] == 'ACTIVE':
            return ds
    return data[0] if data else None

def get_ads_from_adset(adset_id):
    url = f'https://graph.facebook.com/v19.0/{adset_id}/ads'
    params = {'access_token': ACCESS_TOKEN, 'fields': 'id,name,creative{id,name,object_story_spec}'}
    r = requests.get(url, params=params).json()
    return r.get('data', [])

# Create Scaled Campaign
def create_scale_campaign():
    # 1. Create Campaign
    url_c = f'https://graph.facebook.com/v19.0/{ACCOUNT_ID}/campaigns'
    c_params = {
        'name': 'SCALED_DIRECT_WA_PURWOCENG_VILONA',
        'objective': 'OUTCOME_SALES', # Atur ke Sales atau Leads tergantung setup pixel
        'status': 'PAUSED', # Create as paused for safety check
        'access_token': ACCESS_TOKEN
    }
    # Note: Modern Meta API for WA Direct usually uses OUTCOME_MESSAGES/ENGAGEMENT
    # but for simplicity I will duplicate a winning structure if found.
    print("Strategy: Direct Message setup needed or manual dupe of CTR 15% creative.")

# For now, I've cleared the mess. Next step is creating the direct WA campaign.
if __name__ == "__main__":
    create_scale_campaign()
