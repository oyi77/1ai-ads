import requests
import json
import os

# TARGET: SELOW ID 1041
ACCESS_TOKEN = 'os.getenv('META_ACCESS_TOKEN', '')'
AD_ACCOUNT_ID = 'act_380721031313330'
NEW_CAMPAIGN_ID = '120245619456560121' # ID dari campaign yang barusan dibuat

def duplicate_winner_structure():
    # 1. Ambil penargetan dari AdSet Winner yang asli
    # ID: Wanita_IG_Luxury goods (120244776291970121)
    source_as_id = '120244776291970121'
    as_data = requests.get(f'https://graph.facebook.com/v19.0/{source_as_id}', params={
        'access_token': ACCESS_TOKEN,
        'fields': 'name,targeting,optimization_goal,billing_event,promoted_object'
    }).json()
    
    # 2. Buat AdSet baru di Campaign Bid Cap dengan targeting yang SAMA PERSIS
    as_url = f'https://graph.facebook.com/v19.0/{AD_ACCOUNT_ID}/adsets'
    as_payload = {
        'access_token': ACCESS_TOKEN,
        'name': f"{as_data['name']}_BIDCAP_180_VILONA",
        'campaign_id': NEW_CAMPAIGN_ID,
        'status': 'PAUSED',
        'billing_event': as_data['billing_event'],
        'optimization_goal': as_data['optimization_goal'],
        'bid_amount': 180, # KONCI 180 PERAK DIMARI
        'targeting': json.dumps(as_data['targeting']),
        'promoted_object': json.dumps(as_data.get('promoted_object', {}))
    }
    
    res = requests.post(as_url, data=as_payload).json()
    if 'id' in res:
        print(f"SUCCESS: AdSet Duplicated with Bid Cap! ID: {res['id']}")
    else:
        print(f"FAILED to duplicate AdSet: {res}")

if __name__ == "__main__":
    duplicate_winner_structure()
