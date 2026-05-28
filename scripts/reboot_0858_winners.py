import requests
import json
import os

# Config
ACCESS_TOKEN = 'os.getenv('META_ACCESS_TOKEN', '')'
AD_ACCOUNT_ID = 'act_435670549443081'

# Selected Winners for May 15, 04:00 AM
WINNER_IDS = [
    '120248404118800416', # CBO_1-1-1_rakpiringpengering (High CTR)
    '120248077336370416', # ADFORGE_RULE_ABO_Testing_Rak (Targeting Leader)
    '120248442511790416'  # CBO_0858_Test_GendonganAnjing (Organic potential)
]

def reboot():
    print(f"--- REBOOTING {len(WINNER_IDS)} WINNING CAMPAIGNS FOR 0858 ---")
    activated = []
    for cid in WINNER_IDS:
        url = f'https://graph.facebook.com/v19.0/{cid}'
        r = requests.post(url, data={'access_token': ACCESS_TOKEN, 'status': 'ACTIVE'}).json()
        if r.get('success'):
            activated.append(cid)
    
    # Also activate Adsets within Testing_Rak if they were explicitly paused
    as_url = f'https://graph.facebook.com/v19.0/{WINNER_IDS[1]}/adsets'
    adsets = requests.get(as_url, params={'access_token': ACCESS_TOKEN, 'fields': 'id,status'}).json().get('data', [])
    for aset in adsets:
        requests.post(f'https://graph.facebook.com/v19.0/{aset["id"]}', data={'access_token': ACCESS_TOKEN, 'status': 'ACTIVE'})
        
    print(f"Activated IDs: {activated}")

if __name__ == "__main__":
    reboot()
