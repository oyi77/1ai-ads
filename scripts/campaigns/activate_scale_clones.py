#!/usr/bin/env python3
"""Activate PAUSED Scale_ clones with good CPC (< 120) and historical spend."""
import requests, json, os

token = os.environ.get('META_ACCESS_TOKEN', '')
act = 'act_435670549443081'

# Get all Scale_ campaigns with insights
url = f'https://graph.facebook.com/v22.0/{act}/campaigns'
params = {
    'access_token': token,
    'fields': 'name,status,insights{spend,impressions,clicks,cpc}',
    'limit': 200
}
r = requests.get(url, params=params)
campaigns = r.json().get('data', [])
scale = [c for c in campaigns if 'Scale_' in c.get('name','')]

print('[ACTIVATING PAUSED SCALE CLONES WITH GOOD CPC]')
activated = 0
skipped_no_data = 0
skipped_high_cpc = 0

for c in scale:
    name = c.get('name','')
    cid = c['id']
    status = c.get('status','')

    if status == 'ACTIVE':
        print(f'  ALREADY ACTIVE: {name[:50]}')
        continue

    ins = c.get('insights',{}).get('data',[{}])[0] if c.get('insights') else {}
    spend = ins.get('spend','0')
    cpc_str = ins.get('cpc','0')
    cpc = float(cpc_str) if cpc_str not in ['0',''] else 999

    if spend in ['0','']:
        print(f'  SKIP (no data): {name[:50]}')
        skipped_no_data += 1
        continue

    if cpc >= 120:
        print(f'  SKIP (CPC {cpc:.0f}): {name[:50]}')
        skipped_high_cpc += 1
        continue

    # ACTIVATE
    up_url = f'https://graph.facebook.com/v22.0/{cid}'
    r2 = requests.post(up_url, params={'access_token': token, 'status': 'ACTIVE'})
    res = r2.json()
    if res.get('success'):
        print(f'  ACTIVATED: {name[:50]} (CPC: Rp {cpc:.0f}, Spend: Rp {float(spend):,.0f})')
        activated += 1
    else:
        print(f'  FAILED: {name[:50]} — {res.get("error",{}).get("message","?")}')

print(f'\nResults: {activated} activated, {skipped_no_data} no data, {skipped_high_cpc} high CPC')
