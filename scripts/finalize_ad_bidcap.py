import requests
import json
import os

ACCESS_TOKEN = os.getenv('META_ACCESS_TOKEN', '')
AD_ACCOUNT_ID = 'act_380721031313330'
NEW_ADSET_ID = '120245619478650121'

def add_ad():
    # Use the winning creative to finalize the new Bid Cap AdSet
    ad_payload = {
        'access_token': ACCESS_TOKEN,
        'name': 'Ad_Winner_VILONA',
        'adset_id': NEW_ADSET_ID,
        'creative': json.dumps({'creative_id': '120244776292020121'}),
        'status': 'ACTIVE'
    }
    res = requests.post(f'https://graph.facebook.com/v11.0/{AD_ACCOUNT_ID}/ads', data=ad_payload).json()
    print(f"AD Deployment Result: {res}")
    
    # Activate Campaign again to be sure
    requests.post(f'https://graph.facebook.com/v19.0/120245619456560121', params={'access_token': ACCESS_TOKEN, 'status': 'ACTIVE'})
    print("ENGINE LIVE.")

if __name__ == "__main__":
    add_ad()
