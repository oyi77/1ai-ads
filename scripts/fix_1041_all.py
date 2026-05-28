#!/usr/bin/env python3
"""
Fix ALL adsets on account 1041:
- Age: 25-55
- Gender: Female
- Geo: 38 specific cities (from Veris's list)
- Mark profitable campaigns with [WINNER] tag

Retries every 5 min until rate limit clears.
"""
import requests, json, time, sys, os
from datetime import datetime

TOKEN_FILE = '/tmp/meta_token.txt'
AD_ACCT = 'act_380721031313330'
LOG_DIR = os.path.expanduser('~/.openclaw/workspace/logs')
LOG_FILE = os.path.join(LOG_DIR, 'fix_1041_targeting.log')
MAX_ATTEMPTS = 10          # Max retries before giving up
BASE_WAIT = 300            # Base wait 5 min
MAX_WAIT = 1800            # Max wait 30 min

# 38 cities from Veris's list
CITIES = [
    {'key': '1002881'},  # Yogyakarta
    {'key': '2687160'},  # Batam
    {'key': '2906066'},  # Canggu
    {'key': '956849'},   # Tangerang Selatan
    {'key': '947857'},   # Ambarawa
    {'key': '948927'},   # Badung
    {'key': '949414'},   # Balikpapan
    {'key': '949797'},   # Bandung
    {'key': '950015'},   # Banjarmasin
    {'key': '950016'},   # Bandar Lampung
    {'key': '950237'},   # Bantul
    {'key': '951390'},   # Bekasi
    {'key': '953142'},   # Bogor
    {'key': '955176'},   # Cianjur
    {'key': '956410'},   # Cimahi
    {'key': '956891'},   # Cirebon
    {'key': '957883'},   # Denpasar
    {'key': '957890'},   # Depok
    {'key': '961615'},   # Gresik
    {'key': '964380'},   # Kalasan
    {'key': '966981'},   # Kediri
    {'key': '2928156'},  # Kotagede
    {'key': '973751'},   # Makassar
    {'key': '973850'},   # Malang
    {'key': '974074'},   # Manado
    {'key': '975058'},   # Mataram
    {'key': '975253'},   # Medan
    {'key': '979675'},   # Padang
    {'key': '980311'},   # Palembang
    {'key': '982868'},   # Pekanbaru
    {'key': '984861'},   # Pontianak
    {'key': '988013'},   # Samarinda
    {'key': '989399'},   # Semarang
    {'key': '990083'},   # Sewon
    {'key': '990263'},   # Sidoarjo
    {'key': '992951'},   # Surabaya
    {'key': '992961'},   # Surakarta
    {'key': '994587'},   # Tangerang
]

def log(msg):
    os.makedirs(LOG_DIR, exist_ok=True)
    ts = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    line = f"[{ts}] {msg}"
    print(line)
    with open(LOG_FILE, 'a') as f:
        f.write(line + '\n')

def get_token():
    if os.path.exists(TOKEN_FILE):
        with open(TOKEN_FILE) as f:
            return f.read().strip()
    return ''

def test_rate_limit(token):
    r = requests.get(f'https://graph.facebook.com/v19.0/{AD_ACCT}/adsets', params={
        'access_token': token, 'fields': 'id', 'limit': 1
    }, timeout=30)
    return r.status_code == 200

def fix_adsets(token):
    r = requests.get(f'https://graph.facebook.com/v19.0/{AD_ACCT}/adsets', params={
        'access_token': token, 'fields': 'id,name,targeting,status', 'limit': 50
    }, timeout=30)
    if r.status_code != 200:
        return 0, 0, 0
    
    adsets = r.json().get('data', [])
    target_keys = sorted([c['key'] for c in CITIES])
    
    needs_fix = []
    ok = 0
    for a in adsets:
        t = a.get('targeting', {})
        g = t.get('genders', [])
        amin = t.get('age_min', 0)
        amax = t.get('age_max', 99)
        geo = t.get('geo_locations', {})
        cities = sorted([c['key'] for c in geo.get('cities', [])])
        
        age_ok = amin >= 25 and amax <= 55
        gender_ok = g == [2]
        geo_ok = (cities == target_keys)
        
        if age_ok and gender_ok and geo_ok:
            ok += 1
        else:
            needs_fix.append(a)
    
    fixed = 0
    for a in needs_fix:
        t = a.get('targeting', {})
        
        # Build new geo with cities
        geo = {'cities': [{'key': c['key']} for c in CITIES], 'location_types': ['home', 'recent']}
        
        update = {
            'age_min': 25, 'age_max': 55, 'genders': [2],
            'geo_locations': geo,
            'targeting_automation': t.get('targeting_automation', {'advantage_audience': 0}),
            'user_age_unknown': False
        }
        if 'flexible_spec' in t:
            update['flexible_spec'] = t['flexible_spec']
        
        time.sleep(10)
        r2 = requests.post(f'https://graph.facebook.com/v19.0/{a["id"]}', params={
            'access_token': token, 'targeting': json.dumps(update)
        }, timeout=30)
        if r2.json().get('success'):
            fixed += 1
            log(f"  ✅ Fixed: {a['name']} → 38 cities")
        else:
            err = r2.json().get('error', {})
            log(f"  ❌ {a['name']}: {err.get('error_user_msg', err.get('message',''))[:60]}")
    
    return ok, fixed, len(adsets)

def mark_profitable(token):
    r = requests.get(f'https://graph.facebook.com/v19.0/{AD_ACCT}/insights', params={
        'access_token': token,
        'fields': 'campaign_name,campaign_id,spend,clicks,cpc,ctr',
        'date_preset': 'last_7d',
        'level': 'campaign',
        'limit': 50
    }, timeout=30)
    if r.status_code != 200:
        return 0
    
    campaigns = r.json().get('data', [])
    winners = 0
    for c in campaigns:
        cpc = float(c.get('cpc', 999))
        ctr = float(c.get('ctr', 0))
        clicks = int(c.get('clicks', 0))
        name = c.get('campaign_name', '')
        camp_id = c.get('campaign_id', '')
        
        if cpc < 130 and ctr > 4.0 and clicks > 50 and '[WINNER]' not in name:
            time.sleep(5)
            r2 = requests.post(f'https://graph.facebook.com/v19.0/{camp_id}', params={
                'access_token': token, 'name': f'[WINNER] {name}'
            }, timeout=30)
            if r2.json().get('success'):
                winners += 1
                log(f"  🏆 WINNER: {name} (CPC={cpc:.0f}, CTR={ctr:.1f}%)")
    
    return winners

def main():
    token = get_token()
    if not token:
        log("❌ No token!")
        sys.exit(1)
    
    log("=== Starting fix_1041_all (38 cities) ===")
    
    attempt = 0
    while attempt < 60:
        attempt += 1
        if test_rate_limit(token):
            log(f"✅ Rate limit cleared after {attempt} attempts")
            break
        log(f"⏳ Attempt {attempt}: rate limited, attempt {attempt}/{max_attempts}, waiting {wait}s...")
        wait = min(BASE_WAIT * (2 ** attempt), MAX_WAIT)
            time.sleep(wait)
    else:
        log("❌ Gave up after 60 attempts")
        sys.exit(1)
    
    log("\n=== Phase 1: Fix Adsets → 38 Cities ===")
    ok, fixed, total = fix_adsets(token)
    log(f"Result: {ok} OK, {fixed} fixed, {total} total")
    
    time.sleep(10)
    
    log("\n=== Phase 2: Mark Winners ===")
    winners = mark_profitable(token)
    log(f"Marked {winners} campaigns as WINNER")
    
    log("\n🎉 DONE!")

if __name__ == '__main__':
    main()
