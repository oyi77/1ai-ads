import requests
import json
import os

ACCESS_TOKEN = os.getenv('META_ACCESS_TOKEN', '')
ACCOUNT_ID = 'act_1439536310038458'
CAMPAIGN_ID = '120245223521440444' # ADFORGE_Purwoceng_DirectWA_V1
PAGE_ID = '997737406765722'

def create_adset_v9():
    url = f'https://graph.facebook.com/v19.0/{ACCOUNT_ID}/adsets'
    
    # Mencoba format baru Meta API untuk Direct WA
    params = {
        'name': 'ADFORGE_Purwoceng_DirectWA_V1',
        'campaign_id': CAMPAIGN_ID,
        'optimization_goal': 'CONVERSATIONS', 
        'billing_event': 'IMPRESSIONS',
        'daily_budget': 50000,
        'targeting': json.dumps({
            'geo_locations': {'countries': ['ID']},
            'age_min': 35,
            'age_max': 55,
            'genders': [1],
            'device_platforms': ['mobile']
        }),
        'destination_type': 'WHATSAPP',
        'promoted_object': json.dumps({
            'page_id': PAGE_ID
        }),
        'status': 'PAUSED',
        'access_token': ACCESS_TOKEN
    }
    
    r = requests.post(url, params=params)
    return r.json()

if __name__ == "__main__":
    print(json.dumps(create_adset_v9(), indent=2))
