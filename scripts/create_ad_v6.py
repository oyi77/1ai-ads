import requests
import json
import os

ACCESS_TOKEN = 'os.getenv('META_ACCESS_TOKEN', '')'
ACCOUNT_ID = 'act_1439536310038458'

ADSET_ID = '120245223232030444'

# Create ad with minimal spec for link campaign
ad_url = f'https://graph.facebook.com/v19.0/{ACCOUNT_ID}/ads'
ad_data = {
    'name': 'ADFORGE_Purwoceng_LandingPage_V1',
    'adset_id': ADSET_ID,
    'status': 'PAUSED',
    'creative': json.dumps({
        'object_type': 'LANDING_PAGE',
        'name': 'Purwoceng Herbal Landing Page',
        'page_id': '61904553'
    }),
    'adlabels': json.dumps([{'name': 'ADFORGE_Purwoceng'}]),
    'access_token': ACCESS_TOKEN
}
r = requests.post(ad_url, data=ad_data)
result = r.json()
print(f"Ad Creation Result: {json.dumps(result, indent=2)}")
