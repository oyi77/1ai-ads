import requests
import json
import time
import os
from datetime import datetime

# CONFIGURATION
ACCESS_TOKEN = os.getenv('META_ACCESS_TOKEN', '')
AD_ACCOUNT_ID = 'act_380721031313330'
CHECK_INTERVAL = 300  # 5 minutes
LOG_FILE = 'logs/vilona_3807_monitor.log'
STATE_FILE = 'config/vilona_3807_state.json'

# THRESHOLDS
MAX_CPC = 180
TARGET_TAGS = ['rakdapur', 'rak dapur', 'ADFORGE']

def log_message(msg):
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    full_msg = f'[{timestamp}] {msg}'
    print(full_msg)
    with open(LOG_FILE, 'a') as f:
        f.write(full_msg + '\n')

def get_campaigns():
    url = f'https://graph.facebook.com/v19.0/{AD_ACCOUNT_ID}/campaigns'
    params = {
        'access_token': ACCESS_TOKEN,
        'fields': 'id,name,status,effective_status',
        'limit': 100
    }
    r = requests.get(url, params=params).json()
    return r.get('data', [])

def get_insights():
    url = f'https://graph.facebook.com/v19.0/{AD_ACCOUNT_ID}/insights'
    params = {
        'access_token': ACCESS_TOKEN,
        'level': 'campaign',
        'fields': 'campaign_id,cost_per_inline_link_click,inline_link_click_ctr,spend',
        'date_preset': 'today',
        'limit': 100
    }
    r = requests.get(url, params=params).json()
    return {i['campaign_id']: i for i in r.get('data', [])}

def monitor_loop():
    log_message("VILONA 5-MINUTE MONITOR STARTED for Account 3807...")
    
    while True:
        try:
            campaigns = get_campaigns()
            insights = get_insights()
            
            active_winners = 0
            for c in campaigns:
                cid = c['id']
                name = c['name']
                status = c['effective_status']
                
                # Check if it's a target campaign
                is_target = any(tag in name.lower() for tag in TARGET_TAGS)
                
                if is_target:
                    ins = insights.get(cid, {})
                    cpc = float(ins.get('cost_per_inline_link_click', 0))
                    
                    # If it was paused but should be active (RAKDAPUR rule)
                    if status == 'PAUSED' and cpc > 0 and cpc < MAX_CPC:
                        log_message(f"RE-ACTIVATING: {name} (CPC: {cpc})")
                        requests.post(f'https://graph.facebook.com/v19.0/{cid}', 
                                      params={'access_token': ACCESS_TOKEN, 'status': 'ACTIVE'})
                        active_winners += 1
                    
                    # If it is active but CPC is too high (PROTECTION)
                    elif status == 'ACTIVE' and cpc > 250: # Buffer for surge
                         log_message(f"PROTECTION PAUSE: {name} (CPC Spike: {cpc})")
                         requests.post(f'https://graph.facebook.com/v19.0/{cid}', 
                                      params={'access_token': ACCESS_TOKEN, 'status': 'PAUSED'})
                    
                    if status == 'ACTIVE':
                        active_winners += 1

            if active_winners == 0:
                log_message("🚨 CRITICAL: 0 Active Winners detected. Checking for accidental mass-pause...")
                # Alerting via log (Vilona will see this in next turn)

        except Exception as e:
            log_message(f"ERROR in monitor loop: {e}")
            
        time.sleep(CHECK_INTERVAL)

if __name__ == "__main__":
    os.makedirs('logs', exist_ok=True)
    os.makedirs('config', exist_ok=True)
    monitor_loop()
