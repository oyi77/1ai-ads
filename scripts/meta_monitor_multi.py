import requests
import json
import time
from datetime import datetime
import os

# CONFIGURATION
ACCESS_TOKEN = os.getenv('META_ACCESS_TOKEN', '')
ACCOUNTS = ['act_380721031313330', 'act_1439536310038458']

def log_action(message):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with open('logs/meta_monitor_multi.log', 'a') as f:
        f.write(f'[{ts}] {message}\n')
    print(f'[{ts}] {message}')

def get_insights(level_id):
    url = f'https://graph.facebook.com/v19.0/{level_id}/insights'
    params = {
        'access_token': ACCESS_TOKEN,
        'date_preset': 'today',
        'fields': 'spend,inline_link_clicks,inline_link_click_ctr'
    }
    try:
        r = requests.get(url, params=params).json()
        data = r.get('data', [])
        if data:
            ins = data[0]
            spend = float(ins.get('spend', 0))
            clicks = int(ins.get('inline_link_clicks', 0))
            ctr = float(ins.get('inline_link_click_ctr', 0))
            return {'spend': spend, 'clicks': clicks, 'ctr': ctr}
    except:
        pass
    return None

def manage_account(account_id):
    # 1. SCALE WINNERS
    url_c = f'https://graph.facebook.com/v19.0/{account_id}/campaigns'
    camps = requests.get(url_c, params={'access_token': ACCESS_TOKEN, 'fields': 'id,name,status,daily_budget'}).json().get('data', [])
    
    for c in camps:
        if c['status'] != 'ACTIVE': continue
        ins = get_insights(c['id'])
        if not ins or ins['spend'] < 5000: continue
        
        # Scale Up Logic: CTR > 7% & Clicks > 10
        budget = int(c.get('daily_budget', 0))
        if ins['ctr'] > 7.0 and ins['clicks'] > 10 and budget < 2000000:
            new_budget = int(budget * 1.1) # Safe 10% increase
            requests.post(f'https://graph.facebook.com/v19.0/{c["id"]}', 
                          params={'daily_budget': new_budget, 'access_token': ACCESS_TOKEN})
            log_action(f'🚀 SCALE UP [{account_id}]: {c["name"]} ({budget} -> {new_budget}) CTR: {ins["ctr"]}%')

        # Kill/Pause Logic: CTR < 2% & Spend > 20k
        if ins['ctr'] < 2.0 and ins['spend'] > 20000:
            requests.post(f'https://graph.facebook.com/v19.0/{c["id"]}', 
                          params={'status': 'PAUSED', 'access_token': ACCESS_TOKEN})
            log_action(f'💀 PAUSED [{account_id}]: {c["name"]} (Reason: CTR {ins["ctr"]}% too low)')

if __name__ == '__main__':
    log_action("VILONA MULTI-ACCOUNT MONITOR STARTED.")
    while True:
        try:
            for acc in ACCOUNTS:
                manage_account(acc)
        except Exception as e:
            log_action(f"Error in cycle: {e}")
        time.sleep(300) # Every 5 minutes
