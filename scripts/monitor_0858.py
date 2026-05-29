#!/usr/bin/env python3
"""
0858 AUTO-MONITOR — Veris Rules v5 (2026-05-23)
Check setiap 5 menit. PAUSE only, NO auto-resume.

RULES:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔴 CPC > Rp 150                           → PAUSE campaign
🔴 CTR < 3% (min 500 impressions)          → PAUSE campaign
🔴 Daily spend > Rp 300,000                → PAUSE ALL active
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NO: auto-resume, perma-kill tags, resume logic
"""
import urllib.request, urllib.error, json, os, sys, time, signal
from datetime import datetime
import os

TOKEN = os.getenv('META_ACCESS_TOKEN', '')
ACCOUNT = "act_435670549443081"
LOG_FILE = os.path.join(os.path.expanduser("~"), ".openclaw", "workspace", "logs", "ads_0858_monitor.log")

# ── VERIS RULES v5 ──
MAX_CPC = 150
MIN_CTR = 3.0
MIN_IMPRESSIONS = 500    # Minimum data before evaluating CTR
MAX_DAILY_SPEND = 300000

def log(msg):
    ts = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    line = f"[{ts}] {msg}"
    os.makedirs(os.path.dirname(LOG_FILE), exist_ok=True)
    with open(LOG_FILE, 'a') as f: f.write(line + '\n')
    print(line)

def api(url):
    try: return json.loads(urllib.request.urlopen(urllib.request.Request(url), timeout=15).read())
    except Exception: return {'error': True}

def api_post(url, data):
    req = urllib.request.Request(url, data=json.dumps(data).encode(), headers={'Content-Type': 'application/json'})
    try: return json.loads(urllib.request.urlopen(req, timeout=15).read())
    except Exception: return {'error': True}

def pause_hierarchy(cid, cname, reason):
    """Pause campaign → adsets → ads"""
    check = api(f"https://graph.facebook.com/v22.0/{cid}?fields=status&access_token={TOKEN}")
    if check.get('status') != 'ACTIVE': return
    
    adsets = api(f"https://graph.facebook.com/v22.0/{cid}/adsets?fields=id,name,status&limit=25&access_token={TOKEN}")
    if 'error' not in adsets:
        for a in adsets.get('data', []):
            if a.get('status') != 'ACTIVE': continue
            al = api(f"https://graph.facebook.com/v22.0/{a['id']}/ads?fields=id,name,status&limit=25&access_token={TOKEN}")
            if 'error' not in al:
                for ad in al.get('data', []):
                    if ad.get('status') == 'ACTIVE':
                        api_post(f"https://graph.facebook.com/v22.0/{ad['id']}?access_token={TOKEN}", {"status": "PAUSED"})
            api_post(f"https://graph.facebook.com/v22.0/{a['id']}?access_token={TOKEN}", {"status": "PAUSED"})
    
    r = api_post(f"https://graph.facebook.com/v22.0/{cid}?access_token={TOKEN}", {"status": "PAUSED"})
    if r.get('success'):
        log(f"  ⏸️  PAUSED: {cname[:50]} — {reason}")

def main():
    today = datetime.now().strftime('%Y-%m-%d')
    now_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    
    log("=" * 55)
    log(f"🔍 CHECK — {now_str}")
    
    # ── Daily spend ──
    ins = api(f"https://graph.facebook.com/v22.0/{ACCOUNT}/insights?fields=spend&time_range={{\"since\":\"{today}\",\"until\":\"{today}\"}}&level=account&access_token={TOKEN}")
    daily_spend = float(ins.get('data', [{}])[0].get('spend', 0)) if 'error' not in ins and ins.get('data') else 0
    log(f"💰 Spend: Rp {daily_spend:,.0f} / Rp {MAX_DAILY_SPEND:,}")
    
    # ── Get all campaigns ──
    camps = api(f"https://graph.facebook.com/v22.0/{ACCOUNT}/campaigns?fields=name,id,status&limit=50&access_token={TOKEN}")
    if 'error' in camps:
        log(f"⚠️ API error: {camps.get('error',{}).get('message','')[:100]}")
        return
    
    paused_count = 0
    budget_kill = daily_spend >= MAX_DAILY_SPEND
    
    for c in camps.get('data', []):
        cid = c['id']
        cname = c['name']
        status = c.get('status', 'PAUSED')
        
        if status != 'ACTIVE':
            continue
        
        # ── Get campaign insights ──
        ins2 = api(f"https://graph.facebook.com/v22.0/{cid}/insights?fields=spend,impressions,clicks,ctr,cpc&date_preset=today&access_token={TOKEN}")
        d = ins2.get('data', [{}])[0] if 'error' not in ins2 and ins2.get('data') else {}
        
        imp = int(d.get('impressions', 0))
        clk = int(d.get('clicks', 0))
        cpc = float(d.get('cpc', 0) or 0)
        ctr = float(str(d.get('ctr', '0%')).replace('%', ''))
        sp = float(d.get('spend', 0))
        
        status_icon = '🔴' if (cpc > MAX_CPC or (imp >= MIN_IMPRESSIONS and ctr < MIN_CTR)) else '🟢'
        log(f"  {status_icon} {cname[:45]:45s} | Rp{sp:7,.0f} | {imp:5}imp | {clk:4}clk | CPC Rp{cpc:5,.0f} | CTR {ctr:5.2f}%")
        
        # ── RULE 1: BUDGET CAP ──
        if budget_kill:
            pause_hierarchy(cid, cname, f"BUDGET CAP Rp {MAX_DAILY_SPEND:,}")
            paused_count += 1
            continue
        
        has_data = imp >= MIN_IMPRESSIONS
        
        # ── RULE 2: CPC > 150 ──
        if has_data and cpc > MAX_CPC:
            pause_hierarchy(cid, cname, f"CPC Rp {cpc:,.0f} > {MAX_CPC}")
            paused_count += 1
            continue
        
        # ── RULE 3: CTR < 3% ──
        if has_data and ctr < MIN_CTR:
            pause_hierarchy(cid, cname, f"CTR {ctr:.2f}% < {MIN_CTR}%")
            paused_count += 1
            continue
    
    # ── SUMMARY ──
    log(f"📋 PAUSED: {paused_count} | Spend: Rp {daily_spend:,.0f}")
    log("=" * 55)

if __name__ == "__main__":
    if '--daemon' in sys.argv:
        RUNNING = True
        def shutdown(s, f): global RUNNING; RUNNING = False
        signal.signal(signal.SIGTERM, shutdown)
        signal.signal(signal.SIGINT, shutdown)
        log("=" * 60)
        log("🚀 0858 MONITOR v5 — VERIS RULES")
        log(f"   🔴 CPC > Rp{MAX_CPC} → PAUSE  |  CTR < {MIN_CTR}% → PAUSE")
        log(f"   🔴 Budget > Rp{MAX_DAILY_SPEND:,} → PAUSE ALL")
        log(f"   ⚪ NO auto-resume | Check setiap 5 menit")
        log("=" * 60)
        while RUNNING:
            try: main()
            except Exception as e: log(f"🚨 Error: {e}")
            for _ in range(60):  # ~5 min check
                if not RUNNING: break
                time.sleep(5)
        log("🛑 Monitor stopped")
    else:
        main()
