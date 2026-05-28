import requests
import json
import os

ACCESS_TOKEN = os.getenv('META_ACCESS_TOKEN', '')
CAMPAIGN_ID = '120245830196780444'

def get_adsets():
    url = f'https://graph.facebook.com/v19.0/{CAMPAIGN_ID}/adsets'
    params = {
        'access_token': ACCESS_TOKEN,
        'fields': 'name,status,bid_amount,billing_event,optimization_goal,bid_strategy',
    }
    r = requests.get(url, params=params).json()
    return r.get('data', [])

print(json.dumps(get_adsets(), indent=2))
