import requests
import time
import os
from datetime import datetime

# AGGRESSIVE CONFIG FOR NYAMIRESEP ONLY
ACCESS_TOKEN = os.getenv('META_ACCESS_TOKEN', '')
TARGET_ACCOUNT = 'act_380721031313330'
LOG_FILE = 'logs/vilona_nyamiresep_gass.log'

# TARGETS
STRICT_MAX_CPC = 175  # KILL IF HIGHER
ELITE_CTR = 7.5      # GASS IF HIGHER
GASS_MULTIPLIER = 1.30 # 30% jump per interval

def log(msg):
    ts = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    print(f"[{ts}] {msg}")
    with open(LOG_FILE, 'a') as f: f.write(f"[{ts}] {msg}\n")

def get_data(endpoint, params={}):
    params['access_token'] = ACCESS_TOKEN
    r = requests.get(f'https://graph.facebook.com/v19.0/{endpoint}', params=params).json()
    return r.get('data', [])

def update_obj(obj_id, data):
    return requests.post(f'https://graph.facebook.com/v19.0/{obj_id}', params={'access_token': ACCESS_TOKEN, **data}).json()

def run_gass_engine():
    log("VILONA 'GASS' ENGINE ACTIVATED EXCLUSIVELY FOR NYAMIRESEP 🔥")
    while True:
        try:
            # 1. Fetch Insights
            insights = get_data(f'{TARGET_ACCOUNT}/insights', {
                'level': 'campaign',
                'fields': 'campaign_id,campaign_name,cost_per_inline_link_click,inline_link_click_ctr,spend',
                'date_preset': 'today'
            })
            
            # 2. Fetch Campaign Settings
            campaigns = get_data(f'{TARGET_ACCOUNT}/campaigns', {'fields': 'id,name,status,effective_status,daily_budget'})
            camp_map = {c['id']: c for c in campaigns}
            
            for ins in insights:
                cid = ins['campaign_id']
                name = ins['campaign_name']
                if "VILONA" not in name: continue
                
                cpc = float(ins.get('cost_per_inline_link_click', 0))
                ctr = float(ins.get('inline_link_click_ctr', 0))
                status = camp_map.get(cid, {}).get('effective_status', 'Unknown')
                current_budget = int(camp_map.get(cid, {}).get('daily_budget', 0))

                # --- STRICT PROTECTION ---
                if status == 'ACTIVE' and cpc > STRICT_MAX_CPC:
                    log(f"🛡️ AUTO-PROTECT: Pausing {name} | CPC {cpc} > {STRICT_MAX_CPC}")
                    update_obj(cid, {'status': 'PAUSED'})

                # --- AGGRESSIVE GASS ---
                if status == 'ACTIVE' and cpc < 150 and ctr > ELITE_CTR:
                    if current_budget > 0:
                        new_budget = int(current_budget * GASS_MULTIPLIER)
                        log(f"🚀 ELITE GASS: {name} | CTR: {ctr}% | Budget Up: {current_budget} -> {new_budget}")
                        update_obj(cid, {'daily_budget': new_budget})
                
                elif status == 'ACTIVE' and cpc < 160 and ctr > 5.0:
                    # Standard scale for steady performers
                    new_budget = int(current_budget * 1.15)
                    log(f"📈 STEADY SCALE: {name} | CTR: {ctr}% | Budget Up: {current_budget} -> {new_budget}")
                    update_obj(cid, {'daily_budget': new_budget})

        except Exception as e:
            log(f"GENERAL ERROR: {e}")
        
        time.sleep(300) # Heartbeat 5 mins

if __name__ == "__main__":
    os.makedirs('logs', exist_ok=True)
    run_gass_engine()
