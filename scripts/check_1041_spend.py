#!/usr/bin/env python3
"""Check 1041 spend & enforce hard cap"""
import requests, json, sys, os
import os

# Get token from env
TOKEN = os.getenv('META_ACCESS_TOKEN', '')

ACCT = 'act_380721031313330'
HARD_CAP = 300000  # Rp 300.000
WARN_AT = 240000   # Rp 240.000 (80%)

r = requests.get(f'https://graph.facebook.com/v22.0/{ACCT}/insights', params={
    'access_token': TOKEN,
    'fields': 'spend,impressions,clicks,ctr,cpc',
    'date_preset': 'today'
})
data = r.json()

if 'data' in data and data['data']:
    d = data['data'][0]
    sp = float(d.get('spend', 0))
    cpc = float(d.get('cpc', 0))
    ctr = float(d.get('ctr', 0))
    
    print(f"1041 TODAY: Rp {sp:,.0f} / Rp {HARD_CAP:,} ({sp/HARD_CAP*100:.1f}%)")
    print(f"CPC: Rp {cpc:,.0f} | CTR: {ctr:.2f}%")
    
    if sp >= HARD_CAP:
        print(f"\n🚨 HARD CAP REACHED!")
        print(f"Action: PAUSE ALL campaigns on 1041")
        # Pause all active campaigns
        r2 = requests.get(f'https://graph.facebook.com/v22.0/{ACCT}/campaigns', params={
            'access_token': TOKEN,
            'fields': 'id,name,status',
            'effective_status': '["ACTIVE"]',
            'limit': 20
        })
        for c in r2.json().get('data', []):
            pause = requests.post(f"https://graph.facebook.com/v22.0/{c['id']}", params={
                'access_token': TOKEN,
                'status': 'PAUSED'
            })
            print(f"  PAUSED: {c['name'][:50]} | {pause.json()}")
    
    elif sp >= WARN_AT:
        remaining = HARD_CAP - sp
        print(f"\n⚠️ WARNING: Sisa Rp {remaining:,.0f}")
    else:
        remaining = HARD_CAP - sp
        print(f"\n✅ Sisa: Rp {remaining:,.0f}")

print(f"\nRule: Hard cap Rp {HARD_CAP:,}/hari untuk 1041")
print(f"Jika ROI dari data Shopee ≥ 2x → naik Rp 50rb")
print(f"Jika ROI < 2x → tetap atau turun")
