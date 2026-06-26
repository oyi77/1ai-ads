#!/usr/bin/env python3
"""
Activate scheduled 0858 campaigns at 00:30 WIB
Run via: python3 activate_scheduled.py
Or: systemd timer at 00:30 daily
"""
import sys, json, requests, os
from datetime import datetime, timezone, timedelta
from pathlib import Path

sys.path.insert(0, str(Path.home() / ".openclaw" / "workspace" / "scripts"))

# Load token from shared file first, env var fallback
TOKEN_FILE = Path("/tmp/fb_token.txt")
if TOKEN_FILE.exists():
    TOKEN = TOKEN_FILE.read_text().strip()
else:
    try:
        from ads_dashboard import ACCESS_TOKEN as TOKEN
    except:
        TOKEN = os.environ.get('META_ACCESS_TOKEN', os.environ.get('META_TOKEN', ''))

API = 'https://graph.facebook.com/v19.0'
SCHEDULE_FILE = Path(__file__).resolve().parent.parent / 'data' / 'scheduled_0858.json'
LOG_FILE = Path(__file__).resolve().parent.parent / 'logs' / 'scheduler_0858.log'
WIB = timezone(timedelta(hours=7))

def log(msg):
    ts = datetime.now(WIB).strftime('%Y-%m-%d %H:%M:%S')
    line = f'[{ts}] {msg}'
    print(line)
    os.makedirs(LOG_FILE.parent, exist_ok=True)
    with open(LOG_FILE, 'a') as f:
        f.write(line + '\n')

def main():
    log('🚀 0858 Scheduler — Activating campaigns')
    
    if not SCHEDULE_FILE.exists():
        log('⚠️ No schedule file found')
        return
    
    data = json.loads(SCHEDULE_FILE.read_text())
    campaigns = data.get('campaigns', [])
    
    if not campaigns:
        log('⚠️ No campaigns to activate')
        return
    
    log(f'Activating {len(campaigns)} campaigns...')
    
    activated = 0
    failed = 0
    
    for camp in campaigns:
        cid = camp['campaign_id']
        name = camp.get('name', '?')
        
        # Activate adset
        if camp.get('adset_id'):
            r = requests.post(f'{API}/{camp["adset_id"]}', data={
                'status': 'ACTIVE',
                'access_token': TOKEN
            }, timeout=15).json()
        
        # Activate ad
        if camp.get('ad_id'):
            r = requests.post(f'{API}/{camp["ad_id"]}', data={
                'status': 'ACTIVE',
                'access_token': TOKEN
            }, timeout=15).json()
        
        # Activate campaign
        r = requests.post(f'{API}/{cid}', data={
            'status': 'ACTIVE',
            'access_token': TOKEN
        }, timeout=15).json()
        
        if r.get('success', True) and 'error' not in r:
            activated += 1
            log(f'  🚀 {name}')
        else:
            failed += 1
            err = r.get('error', {}).get('message', '?')
            log(f'  ❌ {name}: {err[:80]}')
    
    log(f'✅ {activated} activated, {failed} failed')
    
    # Clear schedule
    SCHEDULE_FILE.unlink()
    log('Schedule cleared')

if __name__ == '__main__':
    main()
