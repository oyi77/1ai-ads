import requests
import json
import os

ACCESS_TOKEN = 'os.getenv('META_ACCESS_TOKEN', '')'
ACCOUNT_ID = 'act_1439536310038458'
WINNING_CAMPAIGN_ID = '120245035630550444' # SCALE_CBO_Purwoceng 2_Prospek (CTR 15%)

def scale_up_budget():
    url = f'https://graph.facebook.com/v19.0/{WINNING_CAMPAIGN_ID}'
    # Mendapatkan budget saat ini
    r_get = requests.get(url, params={'access_token': ACCESS_TOKEN, 'fields': 'daily_budget,name'}).json()
    current_budget = int(r_get.get('daily_budget', 100000))
    
    # Naikkan budget 20% untuk scaling yang aman tapi agresif
    new_budget = int(current_budget * 1.2)
    
    # Update Campaign
    payload = {
        'daily_budget': new_budget,
        'access_token': ACCESS_TOKEN
    }
    r_post = requests.post(url, params=payload).json()
    
    if r_post.get('success'):
        return f"🚀 SCALED UP: Campaign {r_get['name']} budget dinaikkan dari Rp {current_budget:,} jadi Rp {new_budget:,}"
    else:
        return f"❌ FAILED to scale: {r_post}"

if __name__ == "__main__":
    # Eksekusi Scaling pada campaign yang terbukti CTR-nya tinggi
    print(scale_up_budget())
