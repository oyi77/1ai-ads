#!/usr/bin/env python3
"""
AdForge 0858 Integration — Live Monitoring API + Dashboard Panel
================================================================
Provides real-time 0858 campaign data for AdForge dashboard.
Callable from AdForge or standalone.
"""
import requests, json, sys, time
from datetime import datetime
from pathlib import Path

WORKSPACE = Path(__file__).parent.parent
TOKEN_FILE = WORKSPACE / ".fb_token_0858"
if not TOKEN_FILE.exists():
    TOKEN_FILE = Path("/tmp/fb_token.txt")

ACCESS_TOKEN = TOKEN_FILE.read_text().strip() if TOKEN_FILE.exists() else None
if not ACCESS_TOKEN:
    sys.path.insert(0, str(WORKSPACE / "scripts"))
    from ads_dashboard import ACCESS_TOKEN as TOKEN
    ACCESS_TOKEN = TOKEN

API = 'https://graph.facebook.com/v19.0'
ACT = 'act_435670549443081'
OUTPUT_FILE = WORKSPACE / "data" / "0858_adforge_data.json"
LOG_FILE = WORKSPACE / "logs" / "vilona_0858_sync.log"
os = __import__('os')

os.makedirs(WORKSPACE / "data", exist_ok=True)
os.makedirs(WORKSPACE / "logs", exist_ok=True)

RULES = {
    'cpc_kill': 130,
    'ctr_kill': 3.0,
    'gas_cpc': 100,
    'gas_ctr': 5.0,
    'bid_cap': 150,
    'max_budget': 500000,
    'scale_budget': 500000,
    'time_zones': {'00-03': 'PAUSE', '04': 'UNPAUSE', '05': '50%', '06-11': '75%', '12-21': '100%', '22-23': '50%'},
}

def fetch_0858_data():
    """Pull all 0858 campaign data and save to JSON for AdForge"""
    data = {
        'timestamp': datetime.now().isoformat(),
        'account': {'id': ACT, 'label': 'Selow ID 0858', 'currency': 'IDR'},
        'rules': RULES,
        'summary': {},
        'campaigns': [],
        'winners': [],
        'losers': [],
        'actions_taken': [],
    }
    
    # Account-level
    acct = requests.get(f'{API}/{ACT}', params={
        'access_token': ACCESS_TOKEN,
        'fields': 'spend_cap,amount_spent,balance',
    }, timeout=15).json()
    
    cap = int(acct.get('spend_cap', 0))
    spent = int(acct.get('amount_spent', 0))
    data['account']['spend_cap'] = cap
    data['account']['amount_spent'] = spent
    data['account']['balance'] = int(acct.get('balance', 0))
    data['account']['cap_pct'] = round(spent / cap * 100, 1) if cap > 0 else 0
    
    # Campaigns
    camps = requests.get(f'{API}/{ACT}/campaigns', params={
        'access_token': ACCESS_TOKEN,
        'fields': 'id,name,effective_status,daily_budget,bid_strategy',
        'limit': 100
    }, timeout=15).json()
    
    if 'error' in camps:
        data['error'] = camps['error'].get('message', 'API Error')
        return data
    
    camp_list = camps.get('data', [])
    active = [c for c in camp_list if c.get('effective_status') in ('ACTIVE', 'IN_PROCESS')]
    paused = len(camp_list) - len(active)
    
    total_spend = 0
    total_clicks = 0
    total_imp = 0
    
    for c in camp_list:
        camp_data = {
            'id': c['id'],
            'name': c.get('name', '?'),
            'status': c.get('effective_status', '?'),
            'budget': int(c.get('daily_budget', 0) or 0),
            'strategy': c.get('bid_strategy', '?'),
        }
        
        if c.get('effective_status') in ('ACTIVE', 'IN_PROCESS'):
            try:
                ins = requests.get(f'{API}/{c["id"]}/insights', params={
                    'access_token': ACCESS_TOKEN,
                    'fields': 'spend,impressions,clicks,ctr,cpc',
                    'time_range': '{"since":"2026-06-02","until":"2026-06-02"}',
                }, timeout=15).json()
                sp = ins.get('data', [{}])[0] if 'data' in ins else {}
                
                camp_data['spend'] = float(sp.get('spend', 0))
                camp_data['impressions'] = int(sp.get('impressions', 0))
                camp_data['clicks'] = int(sp.get('clicks', 0))
                camp_data['ctr'] = float(sp.get('ctr', 0))
                camp_data['cpc'] = float(sp.get('cpc', 0))
                
                total_spend += camp_data['spend']
                total_clicks += camp_data['clicks']
                total_imp += camp_data['impressions']
                
                # Classify
                cpc = camp_data['cpc']
                ctr = camp_data['ctr']
                if cpc <= RULES['gas_cpc'] and ctr >= RULES['gas_ctr'] and camp_data['clicks'] >= 3:
                    data['winners'].append(camp_data)
                elif cpc > RULES['cpc_kill'] or (ctr < RULES['ctr_kill'] and camp_data['impressions'] >= 500):
                    data['losers'].append(camp_data)
                
            except:
                camp_data['spend'] = 0
                camp_data['impressions'] = 0
                camp_data['clicks'] = 0
                camp_data['ctr'] = 0
                camp_data['cpc'] = 0
        
        data['campaigns'].append(camp_data)
    
    # Summary
    data['summary'] = {
        'total_campaigns': len(camp_list),
        'active': len(active),
        'paused': paused,
        'total_spend': round(total_spend),
        'total_clicks': total_clicks,
        'total_impressions': total_imp,
        'avg_cpc': round(total_spend / total_clicks) if total_clicks > 0 else 0,
        'winners_count': len(data['winners']),
        'losers_count': len(data['losers']),
    }
    
    # Time zone
    hour = datetime.now().hour
    if hour < 4: data['time_zone'] = 'PAUSE'
    elif hour == 4: data['time_zone'] = 'UNPAUSE'
    elif hour == 5: data['time_zone'] = 'LOW (50%)'
    elif 6 <= hour <= 11: data['time_zone'] = 'MEDIUM (75%)'
    elif 12 <= hour <= 21: data['time_zone'] = 'FULL (100%)'
    else: data['time_zone'] = 'LOW (50%)'
    
    # Save
    try:
        with open(OUTPUT_FILE, 'w') as f:
            json.dump(data, f, indent=2)
    except: pass
    
    return data

def log(msg):
    ts = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    line = f'[{ts}] {msg}'
    print(line)
    with open(LOG_FILE, 'a') as f: f.write(line + '\n')

if __name__ == '__main__':
    if '--loop' in sys.argv:
        log('🔄 0858 AdForge Sync started (every 15 min)')
        while True:
            try:
                data = fetch_0858_data()
                s = data.get('summary', {})
                log(f'✅ Synced: {s.get("active")} active, {s.get("winners_count")} winners, Rp{s.get("total_spend",0):,.0f} spend')
            except Exception as e:
                log(f'❌ Sync error: {e}')
            time.sleep(900)  # 15 min
    else:
        data = fetch_0858_data()
        print(json.dumps(data.get('summary', {}), indent=2))
