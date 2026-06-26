#!/usr/bin/env python3
import os
import json
import datetime
import requests
import sqlite3
import sys
from collections import defaultdict

# --- CONFIGURATION ---
ACCOUNTS = {
    "380721031313330": "Selow ID 1041 (Akun A)",
    "435670549443081": "Selow ID 0858 (Akun B)"
}
ACCESS_TOKEN = os.getenv('META_ACCESS_TOKEN', '')
DB_PATH = '/home/openclaw/.openclaw/workspace/learning_ads_system.db'
OUTBOX_PATH = '/home/openclaw/.openclaw/workspace/logs/vilona_ads_outbox.log'
BUDGET_CAP = 800000
ALERT_THRESHOLD = 750000

# Ensure logs dir exists
os.makedirs(os.path.dirname(OUTBOX_PATH), exist_ok=True)

# --- UTILS ---
def get_now_wib():
    return datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=7)))

def log_to_db(action, account_id, campaign_id, campaign_name, context):
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute('''CREATE TABLE IF NOT EXISTS actions 
                     (timestamp TEXT, action_type TEXT, account_id TEXT, 
                      campaign_id TEXT, campaign_name TEXT, context TEXT)''')
        c.execute("INSERT INTO actions VALUES (?, ?, ?, ?, ?, ?)", 
                  (datetime.datetime.now().isoformat(), action, account_id, 
                   campaign_id, campaign_name, json.dumps(context)))
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"DB Log Error: {e}")

def send_telegram(text):
    print(f"TELEGRAM: {text}")
    with open(OUTBOX_PATH, 'a') as f:
        f.write(f"[{get_now_wib().strftime('%H:%M:%S')}] {text}\n")

# --- CORE AD OPS ---
def switch_campaign(campaign_id, status):
    url = f"https://graph.facebook.com/v19.0/{campaign_id}"
    payload = {'status': status, 'access_token': ACCESS_TOKEN}
    r = requests.post(url, data=payload)
    return r.json().get('success', False)

def run_vilona_master():
    now = get_now_wib()
    hour = now.hour
    minute = now.minute

    # --- RULE 1: DEAD HOUR (00:00 - 05:59 WIB) ---
    if 0 <= hour <= 5:
        print(f"RULE 1: Dead Hour ({hour:02d}). Pausing campaigns...")
        # In dead hour, fetch all ACTIVE from both and PAUSE
        for acc_id in ACCOUNTS:
            url = f"https://graph.facebook.com/v19.0/act_{acc_id}/campaigns"
            params = {'fields': 'id,name,status', 'access_token': ACCESS_TOKEN}
            camps = requests.get(url, params=params).json().get('data', [])
            for c in camps:
                if c['status'] == 'ACTIVE':
                    print(f"Pausing {c['name']} (dead hour)")
                    switch_campaign(c['id'], 'PAUSED')
        return

    # --- DATA FETCHING ---
    account_stats = {}
    for acc_id in ACCOUNTS:
        # Get status map
        url_c = f"https://graph.facebook.com/v19.0/act_{acc_id}/campaigns"
        c_res = requests.get(url_c, params={'fields': 'id,name,status', 'access_token': ACCESS_TOKEN}).json()
        c_status_map = {c['id']: c['status'] for c in c_res.get('data', [])}

        # Get insights
        url_i = f"https://graph.facebook.com/v19.0/act_{acc_id}/insights"
        params = {
            'level': 'campaign', 'date_preset': 'today',
            'fields': 'campaign_id,campaign_name,spend,clicks,impressions,cpc,ctr,frequency',
            'access_token': ACCESS_TOKEN
        }
        res = requests.get(url_i, params=params).json()
        
        data = res.get('data', [])
        for item in data:
            item['status'] = c_status_map.get(item['campaign_id'], 'UNKNOWN')
        account_stats[acc_id] = data

    # --- EVALUATE RULES ---
    for acc_id, campaigns in account_stats.items():
        total_spend = sum(float(c.get('spend', 0)) for c in campaigns)
        acc_label = "A (1041)" if "1041" in ACCOUNTS[acc_id] else "B (0858)"

        # --- RULE 2: BUDGET CAP ---
        if total_spend > ALERT_THRESHOLD:
            send_telegram(f"⛔️ AKUN {acc_label} budget hampir habis: Rp{total_spend:,.0f}/{BUDGET_CAP}")
            for c in campaigns:
                if c.get('status') == 'ACTIVE':
                    switch_campaign(c['campaign_id'], 'PAUSED')

        # --- CAMPAIGN LEVEL RULES ---
        for c in campaigns:
            name = c.get('campaign_name', '')
            spend = float(c.get('spend', 0))
            cpc = float(c.get('cpc', 0))
            ctr = float(c.get('ctr', 0))
            freq = float(c.get('frequency', 0))
            impr = int(c.get('impressions', 0))
            ctx = {'cpc': cpc, 'ctr': ctr, 'spend': spend, 'frequency': freq, 'hour': hour}

            if c.get('status') != 'ACTIVE': continue

            # --- RULE 3: CPC EMERGENCY ---
            if cpc > 400 and spend > 50000:
                switch_campaign(c['campaign_id'], 'PAUSED')
                send_telegram(f"🚨 CPC EMERGENCY: {name} CPC Rp{cpc:,.0f}")
                log_to_db("PAUSE", acc_id, c['campaign_id'], name, {**ctx, 'rule': 'rule_3'})
                # Trigger deep diagnosis
                os.system(f"python3 /home/openclaw/.openclaw/workspace/scripts/vilona_diagnosis_engine.py")
            elif cpc > 200 and spend > 30000:
                send_telegram(f"⚠️ CPC Tinggi: {name} CPC Rp{cpc:,.0f}")

            # --- RULE 4: CTR RENDAH ---
            if ctr < 0.5 and impr > 5000:
                switch_campaign(c['campaign_id'], 'PAUSED')
                send_telegram(f"🚨 CTR JELEK: {name} CTR {ctr:.2f}%")
                log_to_db("PAUSE", acc_id, c['campaign_id'], name, {**ctx, 'rule': 'rule_4'})

            # --- RULE 6: KHUSUS AKUN B (0858) ---
            if acc_id == "435670549443081":
                if "rakpiringpengering" in name.lower() and cpc > 100 and spend > 30000:
                    switch_campaign(c['campaign_id'], 'PAUSED')
                    send_telegram(f"🚨 CPC TIGHT (B): {name} CPC Rp{cpc:,.0f}")

    # --- RULE 7: HEARTBEAT (30m) ---
    if minute % 30 == 0:
        hb_msg = f"✅ {now.strftime('%H:%M')}\n"
        for acc_id in ACCOUNTS:
            label = "1041" if "1041" in ACCOUNTS[acc_id] else "0858"
            camps = account_stats[acc_id]
            s = sum(float(c.get('spend', 0)) for c in camps)
            act = len([c for c in camps if c.get('status') == 'ACTIVE'])
            hb_msg += f"Akun {label}: Rp{s:,.0f}/800rb | {act} Aktif\n"
        send_telegram(hb_msg)

if __name__ == "__main__":
    run_vilona_master()
