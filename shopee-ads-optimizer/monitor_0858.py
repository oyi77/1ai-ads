#!/usr/bin/env python3
"""
FB Ads 0858 — Campaign Monitor & Auto-Optimizer
Runs every 5 min, auto-pauses underperformers based on Shopee data.
Target: Min ROI 2x. CBO_* campaigns are kill candidates.
"""
import os
import urllib.request, json, os, sys
from datetime import datetime, timezone
from pathlib import Path

TOKEN = os.environ.get("FB_ACCESS_TOKEN_0858", os.environ.get("META_ACCESS_TOKEN", ""))
ACCOUNT = os.environ.get("FB_ACCOUNT_0858", "act_435670549443081")
LOG_DIR = os.environ.get("MONITOR_LOG_DIR", os.path.join(os.path.expanduser("~"), ".openclaw", "workspace", "logs", "ads_0858_monitor.log"))

# Tags with their ROI from last analysis
TAG_ROI = {
    "rakpiringpengering": 363.8,   # 🔥 INCREASE
    "organizerpullout": 5.8,       # 🔥 INCREASE
    "Dongkrakelektrik": 32.2,      # 🔥 INCREASE
    "gendongananjing": 0.1,        # ⛔ STOP
    "tiplessalad": 0.0,            # ⛔ STOP
    "kancingjepit": 0.0,           # ⛔ STOP
}

# CBO_* naming rule: if campaign name starts with CBO_ and has zero-conversion tag → KILL
ZERO_CONV_CAMPAIGNS = ["tiplessalad", "kancingjepit"]
PROFITABLE_TAGS = ["rakpiringpengering", "organizerpullout", "Dongkrakelektrik"]

def log(msg):
    ts = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    line = f"[{ts}] {msg}"
    os.makedirs(os.path.dirname(LOG_DIR), exist_ok=True)
    with open(LOG_DIR, 'a') as f:
        f.write(line + '\n')
    print(line)

def api(url):
    req = urllib.request.Request(url)
    resp = urllib.request.urlopen(req, timeout=10)
    return json.loads(resp.read())

def api_post(url, data):
    req = urllib.request.Request(url, data=json.dumps(data).encode(), headers={'Content-Type': 'application/json'})
    resp = urllib.request.urlopen(req, timeout=10)
    return json.loads(resp.read())

def main():
    if not TOKEN:
        print("ERROR: Set FB_ACCESS_TOKEN_0858 or META_ACCESS_TOKEN env var")
        sys.exit(1)
    now = datetime.now()
    today = now.strftime('%Y-%m-%d')
    
    log("=" * 50)
    log("📊 MONITOR 0858 — Check")
    
    # Get today's spend
    try:
        url = f"https://graph.facebook.com/v19.0/{ACCOUNT}/insights?fields=spend&time_range={{\"since\":\"{today}\",\"until\":\"{today}\"}}&level=account&access_token={TOKEN}"
        data = api(url)
        spend = float(data.get('data', [{}])[0].get('spend', 0)) if data.get('data') else 0
        log(f"💰 Today spend: ${spend:.2f}")
    except Exception as e:
        log(f"⚠️ Spend fetch: {e}")
        spend = 0
    
    # Get all campaigns
    try:
        url2 = f"https://graph.facebook.com/v19.0/{ACCOUNT}/campaigns?fields=name,id,status,daily_budget&limit=25&access_token={TOKEN}"
        camps = api(url2)
    except Exception as e:
        log(f"🚨 Campaign fetch: {e}")
        return
    
    paused_count = 0
    active_count = 0
    
    for c in camps.get('data', []):
        name = c['name'].lower()
        cid = c['id']
        status = c['status']
        budget = int(c.get('daily_budget',0))/100 if c.get('daily_budget') else 0
        
        # Rule: KILL zero-conversion campaigns (CBO naming convention)
        should_kill = False
        kill_reason = ""
        for zc in ZERO_CONV_CAMPAIGNS:
            if zc.lower() in name and 'cbo_' in name:
                should_kill = True
                kill_reason = f"Zero conv tag: {zc}"
                break
        
        # Rule: ACTIVATE profitable campaigns if paused
        should_activate = False
        for pt in PROFITABLE_TAGS:
            if pt.lower() in name and status == 'PAUSED':
                should_activate = True
                break
        
        if should_kill and status == 'ACTIVE':
            try:
                api_post(f"https://graph.facebook.com/v19.0/{cid}?access_token={TOKEN}", {"status": "PAUSED"})
                log(f"⏸️ KILLED: {c['name'][:50]} ({kill_reason})")
                paused_count += 1
            except Exception as e:
                log(f"❌ Kill failed {c['name'][:30]}: {e}")
        elif should_activate:
            try:
                api_post(f"https://graph.facebook.com/v19.0/{cid}?access_token={TOKEN}", {"status": "ACTIVE"})
                log(f"▶️ ACTIVATED: {c['name'][:50]} (profitable tag)")
                active_count += 1
            except Exception as e:
                log(f"❌ Activate failed {c['name'][:30]}: {e}")
    
    # Summary
    active_camps = [c for c in camps.get('data', []) if c['status'] == 'ACTIVE']
    log(f"📋 Active: {len(active_camps)} | Paused: {len([c for c in camps.get('data', []) if c['status'] == 'PAUSED'])}")
    log("=" * 50)


if __name__ == "__main__":
    import sys
    if '--daemon' in sys.argv:
        import time, signal
        RUNNING = True
        def shutdown(s, f):
            global RUNNING
            RUNNING = False
        signal.signal(signal.SIGTERM, shutdown)
        signal.signal(signal.SIGINT, shutdown)
        log("🚀 MONITOR 0858 DAEMON STARTED")
        while RUNNING:
            try:
                main()
            except Exception as e:
                log(f"🚨 Error: {e}")
            for _ in range(60):  # 5 min = 300s / 5s sleep
                if not RUNNING:
                    break
                time.sleep(5)
        log("🛑 Daemon stopped")
    else:
        main()
