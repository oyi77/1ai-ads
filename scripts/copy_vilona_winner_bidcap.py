import requests
import json
import os

ACCESS_TOKEN = 'os.getenv('META_ACCESS_TOKEN', '')'
NEW_CAMPAIGN_ID = '120245619456560121'

def setup_clean_bidcap():
    # Menggunakan metode copy adset biar targeting-nya nggak error
    # Winner: 120244776291970121
    copy_url = f'https://graph.facebook.com/v19.0/120244776291970121/copies'
    params = {
        'access_token': ACCESS_TOKEN,
        'campaign_id': NEW_CAMPAIGN_ID,
        'status': 'PAUSED'
    }
    
    res = requests.post(copy_url, params=params).json()
    if 'id' in res:
        new_as_id = res['id']
        print(f"AdSet COPIED! ID: {new_as_id}")
        
        # Sekarang baru set Bid Cap-nya di level adset yang baru dicopy
        print(f"Setting Bid Amount to 180 on {new_as_id}...")
        requests.post(f'https://graph.facebook.com/v19.0/{new_as_id}', params={
            'access_token': ACCESS_TOKEN,
            'bid_amount': 180,
            'name': 'Rak Dapur_Winner_BIDCAP180_VILONA'
        })
    else:
        print(f"Copy failed: {res}")

if __name__ == "__main__":
    setup_clean_bidcap()
