import requests
import time
import os
from datetime import datetime

# CONFIGURATION
ACCESS_TOKEN = 'os.getenv('META_ACCESS_TOKEN', '')'
ACCOUNTS = ['act_380721031313330', 'act_435670549443081', 'act_1439536310038458']
LOG_FILE = 'logs/vilona_autonomous_scaling.log'

# THRESHOLDS
MAX_CPC = 250
WINNER_CTR = 6.0
GASS_CTR = 8.0 # Aggressive scaling for this
SCALING_STEP = 0.20 # 20% increase

def log(msg):
    ts = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    print(f"[{ts}] {msg}")
    with open(LOG_FILE, 'a') as f: f.write(f"[{ts}] {msg}\n")

def get_data(endpoint, params={}):
    params['access_token'] = ACCESS_TOKEN
    try:
        r = requests.get(f'https://graph.facebook.com/v19.0/{endpoint}', params=params)
        r.raise_for_status()
        return r.json().get('data', [])
    except Exception as e:
        log(f"API Fetch Error ({endpoint}): {e}")
        return []

def update_obj(obj_id, data):
    try:
        r = requests.post(f'https://graph.facebook.com/v19.0/{obj_id}', params={'access_token': ACCESS_TOKEN, **data})
        return r.json()
    except Exception as e:
        log(f"API Update Error ({obj_id}): {e}")
        return {}

def monitor():
    log("VILONA AUTONOMOUS GASS ENGINE STARTED")
    while True:
        for AD_ACCOUNT_ID in ACCOUNTS:
            log(f"Periodic Check: {AD_ACCOUNT_ID}")
            # 1. Fetch Insights
            insights = get_data(f'{AD_ACCOUNT_ID}/insights', {
                'level': 'campaign',
                'fields': 'campaign_id,campaign_name,cost_per_inline_link_click,inline_link_click_ctr,spend',
                'date_preset': 'today'
            })
            
            # 2. Fetch Campaign Info
            campaigns = get_data(f'{AD_ACCOUNT_ID}/campaigns', {'fields': 'id,name,status,effective_status,daily_budget'})
            camp_map = {c['id']: c for c in campaigns}
            
            for ins in insights:
                cid = ins['campaign_id']
                name = ins['campaign_name']
                if "VILONA" not in name: continue
                
                cpc = float(ins.get('cost_per_inline_link_click', 0))
                ctr = float(ins.get('inline_link_click_ctr', 0))
                status = camp_map.get(cid, {}).get('effective_status', 'Unknown')
                current_budget = int(camp_map.get(cid, {}).get('daily_budget', 0))

                # RULE 1: KILL THE BAD (PROTECTION)
                if status == 'ACTIVE' and cpc > MAX_CPC:
                    log(f"PAUSING: {name} | CPC HIGH: {cpc}")
                    update_obj(cid, {'status': 'PAUSED'})

                # RULE 2: GASS THE WINNERS (SCALING)
                if status == 'ACTIVE' and cpc < 180:
                    multiplier = 0
                    if ctr > GASS_CTR:
                        multiplier = 0.30 # 30% jump for elite winners
                        log(f"🔥 ELITE WINNER: {name} (CTR: {ctr}%)")
                    elif ctr > WINNER_CTR:
                        multiplier = 0.15 # 15% standard scale
                        log(f"🚀 WINNER: {name} (CTR: {ctr}%)")
                    
                    if multiplier > 0 and current_budget > 0:
                        new_budget = int(current_budget * (1 + multiplier))
                        log(f"SCALING UP: {name} | {current_budget} -> {new_budget}")
                        update_obj(cid, {'daily_budget': new_budget})

        log("Heartbeat finish. Sleeping 5 mins...")
        time.sleep(300)

if __name__ == "__main__":
    os.makedirs('logs', exist_ok=True)
    monitor()
