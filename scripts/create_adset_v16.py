import requests
import json
import os

ACCESS_TOKEN = os.getenv('META_ACCESS_TOKEN', '')
ACCOUNT_ID = 'act_1439536310038458'
CAMPAIGN_ID = '120245223521440444' # ADFORGE_Purwoceng_DirectWA_V1
PAGE_ID = '997737406765722'

def create_adset_v16():
    # Mengetahui bid_strategy kampanye lo adalah LOWEST_COST_WITHOUT_CAP (Lowest Cost).
    # Maka optimasi goal HARUS SAMA dengan adset yang sudah ada di kampanye tersebut.
    # Adset lo yang lama (ID 120245223521450444) pake optimization_goal: CONVERSATIONS.
    
    url = f'https://graph.facebook.com/v19.0/{ACCOUNT_ID}/adsets'
    params = {
        'name': 'ADFORGE_Purwoceng_SeniorLaki_V7',
        'campaign_id': CAMPAIGN_ID,
        'optimization_goal': 'CONVERSATIONS', 
        'billing_event': 'IMPRESSIONS',
        'targeting': json.dumps({
            'geo_locations': {'countries': ['ID']},
            'age_min': 40,
            'age_max': 60,
            'genders': [1],
            'device_platforms': ['mobile'],
            'publisher_platforms': ['facebook', 'instagram']
        }),
        'promoted_object': json.dumps({
            'page_id': PAGE_ID,
            'whatsapp_number': '6285800620035'
        }),
        'status': 'PAUSED',
        'access_token': ACCESS_TOKEN
    }
    
    r = requests.post(url, params=params)
    return r.json()

if __name__ == "__main__":
    print(json.dumps(create_adset_v16(), indent=2))
