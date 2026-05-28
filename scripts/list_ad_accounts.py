import requests
import json
import os

ACCESS_TOKEN = os.getenv('META_ACCESS_TOKEN', '')

url = 'https://graph.facebook.com/v19.0/me/adaccounts'
r = requests.get(url, params={'access_token': ACCESS_TOKEN, 'fields': 'id,name,account_status,currency'}).json()
print(json.dumps(r, indent=2))
