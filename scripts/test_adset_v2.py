import requests
import json
import os

ACCESS_TOKEN = 'os.getenv('META_ACCESS_TOKEN', '')'
ACCOUNT_ID = 'act_1439536310038458'

# Use existing campaign ID
CAMPAIGN_ID = '120245223059800444'

# Test creating adset with properly formatted params
adset_url = f'https://graph.facebook.com/v19.0/{ACCOUNT_ID}/adsets'
adset_params = {
    'name': 'ADFORGE_Purwoceng_WhatsApp_V3',
    'optimization_goal': 'OFFSITE_CONVERSIONS',
    'billing_event': 'IMPRESSIONS',
    'bid_amount': 30000,
    'daily_budget': 100000,
    'start_time': '2026-05-12T00:00:00+0700',
    'end_time': '2026-05-20T00:00:00+0700',
    'campaign_id': CAMPAIGN_ID,
    'promoted_object': json.dumps({'page_id': 61904553}),
    'targeting': json.dumps({
        'geo_countries': ['ID'],
        'age_range': {'min': 25, 'max': 55},
        'user_os': ['android', 'ios'],
        'interests': ['herbal', 'wellness']
    }),
    'is_budget_sharing_enabled': False,
    'access_token': ACCESS_TOKEN
}
r = requests.post(adset_url, params=adset_params)
print(f"Adset Creation Result: {r.json()}")
