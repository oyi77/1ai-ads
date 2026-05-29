#!/usr/bin/env python3
"""
/check0858 — Quick health check for 0858 account
Trigger: Veris types "cek 0858", "status 0858", or runs directly
"""
import requests, json, subprocess, re, os
from datetime import datetime
from pathlib import Path

script_dir = Path(__file__).parent
TOKEN = subprocess.run(["grep", "-oP", "ACCESS_TOKEN = '***']+", str(script_dir / 'list_ad_accounts.py')], capture_output=True, text=True).stdout.strip()

ACT = 'act_435670549443081'
BASE = 'https://graph.facebook.com/v22.0'
today = datetime.now().strftime('%Y-%m-%d')
now = datetime.now().strftime('%H:%M WIB')

def api(url):
    try: return json.loads(requests.get(url, timeout=10).text)
    except Exception: return {}

def hdr(text):
    print(f"\n{'─'*45}")
    print(f"  {text}")
    print(f"{'─'*45}")

print("=" * 45)
print(f"🔍 0858 STATUS — {now}")
print("=" * 45)

# ═══ 1. MONITOR STATUS ═══
r = subprocess.run(['systemctl', 'is-active', 'vilona-ads0858.service'], 
                    capture_output=True, text=True).stdout.strip()
print(f"\n🖥️  Monitor v5: {'✅ RUNNING' if r == 'active' else '❌ STOPPED'}")

# ═══ 2. TODAY'S SPEND ═══
url = f"{BASE}/{ACT}/insights?fields=spend,clicks,impressions,cpc,ctr&time_range=%7B%22since%22%3A%22{today}%22%2C%22until%22%3A%22{today}%22%7D&access_token=***"
ins = api(url)
d = ins.get('data', [{}])[0] if ins.get('data') else {}
spend = float(d.get('spend', 0))
clicks = int(d.get('clicks', 0))
impressions = int(d.get('impressions', 0))
cpc = float(d.get('cpc', 0) or 0)
ctr = float(str(d.get('ctr', '0%')).replace('%', ''))

pct = min(spend/300000*100, 100)
bar = '█' * int(pct/3.33) + '░' * (30 - int(pct/3.33))
print(f"\n💰 SPEND: Rp {spend:,.0f} / Rp 300,000")
print(f"   [{bar}] {pct:.0f}%")
print(f"   👆 {clicks} clicks | 👁️ {impressions:,} imp | 💵 CPC Rp {cpc:,.0f} | 📊 CTR {ctr:.2f}%")

# ═══ 3. ACTIVE CAMPAIGNS ═══
camps = api(f"{BASE}/{ACT}/campaigns?fields=name,id,status,effective_status&limit=50&access_token=***")
active = [c for c in camps.get('data', []) if c.get('status') == 'ACTIVE']

hdr(f"📊 CAMPAIGNS: {len(active)} ACTIVE")
for c in active:
    cid = c['id']
    ins2 = api(f"{BASE}/{cid}/insights?fields=spend,clicks,impressions,cpc,ctr&date_preset=today&access_token=***")
    d2 = ins2.get('data', [{}])[0] if ins2.get('data') else {}
    sp = float(d2.get('spend', 0))
    cp = float(d2.get('cpc', 0) or 0)
    ct = float(str(d2.get('ctr', '0%')).replace('%', ''))
    cl = int(d2.get('clicks', 0))
    
    icon = '🔴' if cp > 150 else ('🔴' if (ct < 3 and int(d2.get('impressions',0)) >= 500) else '🟢')
    print(f"  {icon} {c['name'][:42]:42s} | Rp{sp:7,.0f} | CPC {cp:5.0f} | CTR {ct:5.2f}% | {cl:4} clk")

# ═══ 4. ALERTS ═══
hdr("⚠️  ALERTS")
alerts = []
if r != 'active': alerts.append("🔴 Monitor v5 is DOWN!")
if spend >= 300000: alerts.append("🔴 BUDGET CAP 300rb TERCAPAI!")
elif spend >= 270000: alerts.append("🟡 Budget 90%+ (Rp {:.0f})".format(spend))
if cpc > 150 and clicks > 10: alerts.append(f"🔴 CPC Rp {cpc:,.0f} > 150!")
if ctr < 3 and impressions > 500: alerts.append(f"🔴 CTR {ctr:.2f}% < 3%!")
if not active: alerts.append("🟡 NO ACTIVE CAMPAIGNS!")

if alerts:
    for a in alerts: print(f"  {a}")
else:
    print("  ✅ ALL CLEAR — no issues detected")

print()
