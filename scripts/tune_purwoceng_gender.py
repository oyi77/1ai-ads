import requests
import json
import os

ACCESS_TOKEN = 'os.getenv('META_ACCESS_TOKEN', '')'
CAMPAIGN_PURWOCENG_ID = '120245846355810444'

def restrict_to_men():
    print(f"--- Restricting Adsets in Campaign {CAMPAIGN_PURWOCENG_ID} to Men only ---")
    url = f'https://graph.facebook.com/v19.0/{CAMPAIGN_PURWOCENG_ID}/adsets'
    r = requests.get(url, params={'access_token': ACCESS_TOKEN, 'fields': 'id,name,targeting'}).json()
    
    for adset in r.get('data', []):
        adset_id = adset['id']
        targeting = adset['targeting']
        targeting['genders'] = [1] # 1 is Male
        
        print(f"Updating {adset['name']} ({adset_id})...")
        url_upd = f'https://graph.facebook.com/v19.0/{adset_id}'
        res = requests.post(url_upd, data={
            'targeting': json.dumps(targeting),
            'access_token': ACCESS_TOKEN
        }).json()
        print(f"Result: {res}")

restrict_to_men()
