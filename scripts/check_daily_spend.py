#!/usr/bin/env python3
"""Check today's total spend across all ad accounts"""
import requests, json, sys

TOKEN = open('/dev/stdin', 'r')  # Will replace below

ACCOUNTS = {
    'act_380721031313330': '1041',
    'act_435670549443081': '0858',
    'act_1181078009580337': '1340',
}
DAILY_CAP = 20000  # Rp 20.000 total all accounts
CRITICAL_PCT = 80  # Alert when 80% of cap reached

if len(sys.argv) > 1:
    TOKEN = sys.argv[1]
else:
    print("ERROR: Need token as argument")
    sys.exit(1)

total_spend = 0
results = {}

for acct_id, acct_name in ACCOUNTS.items():
    r = requests.get(f'https://graph.facebook.com/v22.0/{acct_id}/insights', params={
        'access_token': TOKEN,
        'fields': 'spend,impressions,clicks,ctr,cpc',
        'date_preset': 'today'
    })
    data = r.json()
    if 'data' in data and data['data']:
        d = data['data'][0]
        sp = float(d.get('spend', 0))
        cpc = float(d.get('cpc', 0))
        results[acct_name] = {'spend': sp, 'cpc': cpc}
        total_spend += sp

# Print report
print(f"\n{'='*50}")
print(f"SPEND MONITOR — {__import__('datetime').datetime.now().strftime('%d %b %H:%M')} WIB")
print(f"{'='*50}")

for acct_name, data in results.items():
    pct = (data['spend'] / DAILY_CAP) * 100
    bar = '█' * int(pct / 5) + '░' * (20 - int(pct / 5))
    print(f"  {acct_name}: Rp {data['spend']:>8,.0f} | CPC Rp {data['cpc']:>5,.0f} | {bar} {pct:.0f}%")

total_pct = (total_spend / DAILY_CAP) * 100
print(f"\n  TOTAL: Rp {total_spend:>8,.0f} dari Rp {DAILY_CAP:,} ({total_pct:.0f}%)")

# Alert if over threshold
if total_spend >= DAILY_CAP:
    print(f"\n  🚨 ALERT: DAILY CAP REACHED! Semua campaign harus di-pause!")
elif total_spend >= (DAILY_CAP * CRITICAL_PCT / 100):
    remaining = DAILY_CAP - total_spend
    print(f"\n  ⚠️ WARNING: Sisa budget Rp {remaining:,.0f} — siap-siap pause!")
else:
    remaining = DAILY_CAP - total_spend
    print(f"\n  ✅ Sisa budget: Rp {remaining:,.0f}")

# Recommendations
print(f"\n{'='*50}")
print(f"RULES:")
print(f"  - Daily cap total: Rp {DAILY_CAP:,}")
print(f"  - Kalo > 80%: WARNING")
print(f"  - Kalo > 100%: PAUSE ALL")
print(f"  - CPC > 130: PAUSE per campaign")
