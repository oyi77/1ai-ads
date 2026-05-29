#!/usr/bin/env python3
"""
Vilona Governor Heartbeat — Auto Report ke Telegram setiap 2 jam
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Dipanggil via cron. Kirim status 1041 ke Veris via Telethon.
"""
import os
import sys, os, asyncio, time, json
from datetime import datetime
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.expanduser('~'), '.openclaw', 'workspace', 'scripts'))

from vilona_telethon_notify import send_alert
import urllib.request

TOKEN = "***"
ACCOUNT = "act_380721031313330"
STATE_FILE = os.path.join(os.path.expanduser("~"), ".openclaw", "workspace", "state", "ads_1041_governor_state.json")

def api(url):
    req = urllib.request.Request(url)
    return json.loads(urllib.request.urlopen(req, timeout=15).read())

def get_status():
    now = datetime.now()
    
    # Get spend
    try:
        ins_url = f"https://graph.facebook.com/v19.0/{ACCOUNT}/insights?date_preset=today&fields=spend,impressions,clicks,cpc,ctr&level=account&access_token=***"
        dat = api(ins_url).get('data', [{}])[0]
        spend = float(dat.get('spend', 0) or 0)
        impressions = int(dat.get('impressions', 0) or 0)
        clicks = int(dat.get('clicks', 0) or 0)
        cpc = float(dat.get('cpc', 0) or 0)
        ctr = dat.get('ctr', '0')
    except Exception:
        spend, impressions, clicks, cpc, ctr = 0, 0, 0, 0, '0'
    
    # Get active campaigns
    try:
        camp_url = f"https://graph.facebook.com/v19.0/{ACCOUNT}/campaigns?fields=name,id,status&effective_status=[\"ACTIVE\"]&limit=100&access_token=***"
        active = api(camp_url).get('data', [])
        active_count = len(active)
    except Exception:
        active_count = 0
    
    # Get state
    try:
        with open(STATE_FILE) as f:
            state = json.load(f)
        budget = state.get('daily_budget', 300000)
        paused = state.get('paused_today', False)
        soft = state.get('soft_paused', False)
    except Exception:
        budget = 300000
        paused = False
        soft = False
    
    # Determine status
    if paused:
        status = "⏸️ PAUSED (hard cap)"
    elif soft:
        status = "💛 SOFT CAP"
    elif spend >= budget:
        status = "🚫 OVER BUDGET!"
    elif active_count == 0:
        status = "⏸️ ALL PAUSED"
    else:
        pct = spend/budget*100 if budget > 0 else 0
        status = f"▶️ RUNNING ({pct:.0f}%)"
    
    return {
        'time': now.strftime('%H:%M WIB'),
        'date': now.strftime('%d %b'),
        'spend': spend,
        'budget': budget,
        'impressions': impressions,
        'clicks': clicks,
        'cpc': cpc,
        'ctr': ctr,
        'active': active_count,
        'status': status
    }

def main():
    s = get_status()
    
    # Always log
    msg = (
        f"📊 *1041 STATUS* — {s['date']} {s['time']}\n\n"
        f"💰 Spend: Rp {s['spend']:,.0f} / Rp {s['budget']:,}\n"
        f"👁️ Impressions: {s['impressions']:,}\n"
        f"👆 Clicks: {s['clicks']:,}\n"
        f"💸 CPC: Rp {s['cpc']:,.0f} | CTR: {s['ctr']}%\n"
        f"📈 Active: {s['active']} campaigns\n"
        f"{s['status']}"
    )
    
    print(msg)
    
    # Send via Telethon setiap check
    # Anti-spam handled by vilona_telethon_notify
    if '--silent' not in sys.argv:
        send_alert(msg, target='veris')

if __name__ == '__main__':
    main()
