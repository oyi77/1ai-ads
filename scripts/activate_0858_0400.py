#!/usr/bin/env python3
"""Activate 0858 campaigns at 04:00 WIB — Fix budgets + Activate"""
import os
import urllib.request, json, time, sys
from datetime import datetime

# Only run between 03:55 and 04:05 WIB (safety check)
now = datetime.now()
hour = now.hour
if not (3 <= hour <= 4):
    print(f"Not 04:00 WIB yet (current: {now.strftime('%H:%M')})")
    sys.exit(0)

tok = None
with open(os.path.join(os.path.expanduser('~'), '.openclaw', 'workspace', 'scripts', 'ads_daily_report.py')) as f:
    for line in f:
        if "ACCESS_TOKEN = " in line:
            tok = line.split("'")[1]
            break

API = 'https://graph.facebook.com/v22.0'
ACCT = 'act_435670549443081'

def api_post(url_suffix, data):
    url = f'{API}/{url_suffix}'
    data['access_token'] = tok
    req = urllib.request.Request(url, data=json.dumps(data).encode(), headers={'Content-Type': 'application/json'})
    try:
        return json.loads(urllib.request.urlopen(req, timeout=15).read())
    except urllib.error.HTTPError as e:
        return {'error': True, 'code': e.code, 'msg': e.read().decode()[:200]}

def api_get(url_suffix):
    url = f'{API}/{url_suffix}&access_token=***'
    return json.loads(urllib.request.urlopen(url, timeout=10).read())

# Get campaigns
camps = api_get(f'{ACCT}/campaigns?fields=name,id,daily_budget,status&limit=50')

# Find our winning campaigns
winning = {}
for c in camps.get('data', []):
    n = c['name']
    if '_Winning_' in n and 'test' not in n.lower():
        winning[n] = c['id']

# Correct budgets: rakpiring=25000, gendong=17500
corrections = {
    'rakpiring_FACEBOOK_Winning_BIDCAP130': 25000,
    'rakpiring_INSTAGRAM_Winning_BIDCAP130': 25000,
    'gendongananjing_FACEBOOK_Winning_BIDCAP130': 17500,
    'gendongananjing_INSTAGRAM_Winning_BIDCAP130': 17500,
}

print(f'=== ACTIVATING 0858 CAMPAIGNS at {now.strftime("%H:%M WIB")} ===')

# Step 1: Fix budgets
for name, budget in corrections.items():
    if name in winning:
        cid = winning[name]
        r = api_post(cid, {'daily_budget': budget})
        print(f'BUDGET: {name[:50]} -> Rp{budget:,} | {r.get("success","ERROR")}')
        time.sleep(2)

# Step 2: Activate
for name in corrections:
    if name in winning:
        cid = winning[name]
        r = api_post(cid, {'status': 'ACTIVE'})
        print(f'ACTIVATE: {name[:50]} | {r.get("success","ERROR")}')
        time.sleep(2)
        
        # Also activate adsets inside
        adsets = api_get(f'{cid}/adsets?fields=id,name,status&limit=25')
        for a in adsets.get('data', []):
            if a.get('status') != 'ACTIVE':
                r2 = api_post(a['id'], {'status': 'ACTIVE'})
                print(f'  Adset: {a["name"][:40]} | {r2.get("success","ERROR")}')
                time.sleep(1)
                # Activate ads
                ads = api_get(f"{a['id']}/ads?fields=id,name,status&limit=25")
                for ad in ads.get('data', []):
                    if ad.get('status') != 'ACTIVE':
                        api_post(ad['id'], {'status': 'ACTIVE'})

# Verify
print('\n=== VERIFY ===')
final = api_get(f'{ACCT}/campaigns?fields=name,id,daily_budget,status,effective_status&limit=50')
for c in final.get('data', []):
    n = c['name']
    if '_Winning_' in n:
        db = int(c.get('daily_budget',0))
        s = c.get('status','?')
        e = c.get('effective_status','?')
        print(f'{s:10s}/{e:15s} Rp{db:>6,}/hari | {n[:50]}')

print(f'\nDone at {datetime.now().strftime("%H:%M WIB")}')
