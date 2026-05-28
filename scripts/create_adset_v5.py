import requests
import json
import os

ACCESS_TOKEN = 'os.getenv('META_ACCESS_TOKEN', '')'
ACCOUNT_ID = 'act_1439536310038458'
CAMPAIGN_ID = '120245223521440444' # ADFORGE_Purwoceng_DirectWA_V1
PAGE_ID = '997737406765722' # Herbalisme Pusat Herbal

def create_adset_v5():
    # Final Attempt: Matching exactly the 'CONVERSATIONS' goal from your manual campaign 
    url = f'https://graph.facebook.com/v19.0/{ACCOUNT_ID}/adsets'
    
    params = {
        'name': 'ADFORGE_Purwoceng_SeniorGents_V5',
        'campaign_id': CAMPAIGN_ID,
        'optimization_goal': 'CONVERSATIONS', 
        'billing_event': 'IMPRESSIONS',
        'daily_budget': 50000,
        'targeting': json.dumps({
            'geo_locations': {'countries': ['ID']},
            'age_min': 40, # Test extreme senior audience
            'age_max': 60,
            'genders': [1],
            'device_platforms': ['mobile']
        }),
        'promoted_object': json.dumps({
            'page_id': PAGE_ID,
            'app_id': '881378894925519' # Mapping to WhatsApp Business ID from manual campaign
        }),
        'status': 'PAUSED',
        'access_token': ACCESS_TOKEN
    }
    
    r = requests.post(url, params=params)
    return r.json()

if __name__ == "__main__":
    result = create_adset_v5()
    print(f"Adset Creation Result: {json.dumps(result, indent=2)}")
