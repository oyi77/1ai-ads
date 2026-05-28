import requests
import json
import time
import os
from datetime import datetime

ACCESS_TOKEN = 'os.getenv('META_ACCESS_TOKEN', '')'
AD_ACCOUNT_ID = 'act_380721031313330'
LOG_FILE = 'logs/vilona_bid_cap_monitor.log'

def log(msg):
    ts = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    with open(LOG_FILE, 'a') as f: f.write(f"[{ts}] {msg}\n")
    print(f"[{ts}] {msg}")

def monitor_and_cap():
    log("VILONA AUTONOMOUS BID CAP MONITOR STARTED (FIXED 180 IDR)")
    while True:
        try:
            # Fetch winners
            i_url = f'https://graph.facebook.com/v19.0/{AD_ACCOUNT_ID}/insights'
            i_params = {'access_token': ACCESS_TOKEN, 'level': 'campaign', 'fields': 'campaign_id,campaign_name,inline_link_click_ctr', 'date_preset': 'today'}
            insights = requests.get(i_url, params=i_params).json().get('data', [])
            
            for ins in insights:
                ctr = float(ins.get('inline_link_click_ctr', 0))
                cid = ins['campaign_id']
                name = ins['campaign_name']
                
                if ctr > 6.0 and "VILONA" in name:
                    # Update all adsets in this winning campaign to bid_amount 180
                    a_url = f'https://graph.facebook.com/v19.0/{cid}/adsets'
                    adsets = requests.get(a_url, params={'access_token': ACCESS_TOKEN, 'fields': 'id'}).json().get('data', [])
                    
                    for a in adsets:
                        requests.post(f'https://graph.facebook.com/v19.0/{a["id"]}', params={
                            'access_token': ACCESS_TOKEN,
                            'bid_amount': 180
                        })
                    log(f"SENTINEL: Bid Cap 180 IDR enforced on {name}")

        except Exception as e:
            log(f"ERROR: {e}")
        time.sleep(300)

if __name__ == "__main__":
    os.makedirs('logs', exist_ok=True)
    monitor_and_cap()
