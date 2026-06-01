import requests
import os

ACCESS_TOKEN = os.getenv('META_ACCESS_TOKEN', '')
AD_ACCOUNT_ID = 'act_380721031313330'

def tag_vilona():
    print("--- TAGGING CAMPAIGNS WITH 'VILONA' ---")
    
    # Get all campaigns
    url = f'https://graph.facebook.com/v19.0/{AD_ACCOUNT_ID}/campaigns'
    params = {'access_token': ACCESS_TOKEN, 'fields': 'id,name', 'limit': 100}
    campaigns = requests.get(url, params=params).json().get('data', [])
    
    for c in campaigns:
        cid = c['id']
        name = c['name']
        
        # If I am actively managing it (based on today's cleaning list or general targeting)
        # But for safety, I will tag campaigns that are in my monitoring scope or active
        if "VILONA" not in name:
            new_name = f"{name}_VILONA"
            print(f"Renaming: {name} -> {new_name}")
            requests.post(f'https://graph.facebook.com/v19.0/{cid}', 
                          params={'access_token': ACCESS_TOKEN, 'name': new_name})

if __name__ == "__main__":
    tag_vilona()
