import requests
import json
import os

ACCESS_TOKEN = os.getenv('META_ACCESS_TOKEN', '')
AD_ACCOUNT_ID = 'act_380721031313330'

def check_tags():
    url = f'https://graph.facebook.com/v19.0/{AD_ACCOUNT_ID}/ads'
    params = {
        'access_token': ACCESS_TOKEN,
        'fields': 'id,name,adset{name},campaign{name},creative{id,object_story_id,creative_link_data{link}}',
        'limit': 50
    }
    ads = requests.get(url, params=params).json().get('data', [])
    for ad in ads:
        name = ad.get('name')
        creative = ad.get('creative', {})
        link = creative.get('creative_link_data', {}).get('link', '')
        # Check Sub_ID in link
        print(f"AD: {name} | Link: {link[:100]}...")

if __name__ == "__main__":
    check_tags()
