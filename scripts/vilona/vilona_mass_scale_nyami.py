import requests
import os

ACCESS_TOKEN = os.getenv('META_ACCESS_TOKEN', '')
AD_ACCOUNT_ID = 'act_380721031313330'

def activate_and_push():
    # Fetch all campaigns to find current IDs and status
    url = f'https://graph.facebook.com/v19.0/{AD_ACCOUNT_ID}/campaigns'
    params = {'access_token': ACCESS_TOKEN, 'fields': 'id,name,status,effective_status'}
    campaigns = requests.get(url, params=params).json().get('data', [])
    
    for c in campaigns:
        # PUSH RAK DAPUR 2
        if "Rak Dapur_2_VILONA" in c['name']:
            print(f"ACTIVATE & PUSH: {c['name']}")
            requests.post(f'https://graph.facebook.com/v19.0/{c["id"]}', params={
                'access_token': ACCESS_TOKEN,
                'status': 'ACTIVE',
                'daily_budget': 50000000 # 500k
            })
        
        # PUSH RAK DAPUR 1-3-1 (High Potential)
        if "Rak Dapur_1-3-1_VILONA" in c['name'] and "v3" not in c['name']:
            print(f"ACTIVATE & PUSH: {c['name']}")
            requests.post(f'https://graph.facebook.com/v19.0/{c["id"]}', params={
                'access_token': ACCESS_TOKEN,
                'status': 'ACTIVE',
                'daily_budget': 30000000 # 300k
            })

if __name__ == "__main__":
    activate_and_push()
