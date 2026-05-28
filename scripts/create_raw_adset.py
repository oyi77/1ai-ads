import requests
import json
import os

ACCESS_TOKEN = 'os.getenv('META_ACCESS_TOKEN', '')'
ACCOUNT_ID = 'act_1439536310038458'
CAMPAIGN_ID = '120245223521440444'
ADSET_ID = '120245223521450444'

def create_raw_adset():
    # Ambil data adset asli
    r_orig = requests.get(f'https://graph.facebook.com/v19.0/{ADSET_ID}', 
                          params={'access_token': ACCESS_TOKEN, 'fields': 'optimization_goal,billing_event,promoted_object,targeting'}).json()
    
    url = f'https://graph.facebook.com/v19.0/{ACCOUNT_ID}/adsets'
    params = {
        'name': 'ADFORGE_Purwoceng_DirectWA_Test_V1',
        'campaign_id': CAMPAIGN_ID,
        'optimization_goal': r_orig['optimization_goal'],
        'billing_event': r_orig['billing_event'],
        'targeting': json.dumps({
            'geo_locations': {'countries': ['ID']},
            'age_min': 35,
            'age_max': 55,
            'genders': [1],
            'device_platforms': ['mobile']
        }),
        'promoted_object': json.dumps(r_orig['promoted_object']),
        'status': 'PAUSED',
        'access_token': ACCESS_TOKEN
    }
    
    r = requests.post(url, params=params)
    return r.json()

if __name__ == "__main__":
    print(json.dumps(create_raw_adset(), indent=2))
