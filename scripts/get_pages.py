import requests
import json
import os

ACCESS_TOKEN = os.getenv("META_ACCESS_TOKEN", "")

# Get pages accessible by this token
url = "https://graph.facebook.com/v19.0/me/accounts"
params = {"access_token": ACCESS_TOKEN, "fields": "id,name,access_token"}
r = requests.get(url, params=params)
result = r.json()
print(f"Account Pages: {json.dumps(result, indent=2)}")
