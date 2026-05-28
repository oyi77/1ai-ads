import requests
import json
import os

ACCESS_TOKEN = 'os.getenv('META_ACCESS_TOKEN', '')'
ACCOUNT_ID = 'act_1439536310038458'
CAMPAIGN_ID = '120245223521440444' # ADFORGE_Purwoceng_DirectWA_V1
PAGE_ID = '997737406765722'

def create_adset_v14():
    url = f'https://graph.facebook.com/v19.0/{ACCOUNT_ID}/adsets'
    
    # Optimization Goal: CONVERSATIONS (Harus sinkron dengan budget CBO campaign tersebut)
    params = {
        'name': 'ADFORGE_Purwoceng_SeniorLaki_V5',
        'campaign_id': CAMPAIGN_ID,
        'optimization_goal': 'CONVERSATIONS', 
        'billing_event': 'IMPRESSIONS',
        'targeting': json.dumps({
            'geo_locations': {'countries': ['ID']},
            'age_min': 40,
            'age_max': 60,
            'genders': [1],
            'device_platforms': ['mobile']
        }),
        'promoted_object': json.dumps({
            'page_id': PAGE_ID
        }),
        'status': 'PAUSED',
        'access_token': ACCESS_TOKEN
    }
    
    r = requests.post(url, params=params)
    return r.json()

if __name__ == "__main__":
    print(json.dumps(create_adset_v14(), indent=2))
