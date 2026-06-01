import requests
import json
import os

ACCESS_TOKEN = os.getenv("META_ACCESS_TOKEN", "")
ACCOUNT_ID = "act_1439536310038458"

CAMPAIGN_ID = "120245223059800444"
ADSET_ID = "120245223169530444"

# Check if adset exists
url = f"https://graph.facebook.com/v19.0/{ADSET_ID}"
params = {"access_token": ACCESS_TOKEN}
r = requests.get(url, params=params)
print(f"Adset Info: {r.json()}")

# Checkcampaign info
url2 = f"https://graph.facebook.com/v19.0/{CAMPAIGN_ID}"
params2 = {"access_token": ACCESS_TOKEN}
r2 = requests.get(url2, params=params2)
print(f"Campaign Info: {r2.json()}")
