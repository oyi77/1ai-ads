import requests
import os

# Hardcoded token from the scan script which is known to work
ACCESS_TOKEN = 'os.getenv('META_ACCESS_TOKEN', '')'

CHANGES = {
    "120248436652100416": 300000, # Winning Scale -> UP
    "120248404118800416": 150000  # Rak Piring -> DOWN
}

def update_budgets():
    for campaign_id, budget in CHANGES.items():
        url = f"https://graph.facebook.com/v19.0/{campaign_id}"
        payload = {
            'daily_budget': budget * 100, # Meta budget is in cents
            'access_token': ACCESS_TOKEN
        }
        r = requests.post(url, data=payload)
        res = r.json()
        if res.get('success'):
            print(f"✅ Campaign {campaign_id} updated to Rp {budget:,}")
        else:
            print(f"❌ Failed to update {campaign_id}: {res}")

if __name__ == "__main__":
    update_budgets()
