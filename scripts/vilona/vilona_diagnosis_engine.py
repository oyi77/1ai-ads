#!/usr/bin/env python3
import os
import json
import datetime
import requests
from collections import defaultdict

# --- CONFIGURATION ---
ACCESS_TOKEN = os.getenv('META_ACCESS_TOKEN', '')
ACCOUNTS = {
    "380721031313330": "Akun A (1041)",
    "435670549443081": "Akun B (0858)"
}
OUTBOX_PATH = '/home/openclaw/.openclaw/workspace/logs/vilona_ads_outbox.log'

def get_now_wib():
    return datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=7)))

def send_alert(message):
    print(f"DIAGNOSIS ALERT: {message}")
    with open(OUTBOX_PATH, 'a') as f:
        f.write(f"[{get_now_wib().strftime('%H:%M:%S')}] {message}\n")

def diagnose_campaign(acc_id, camp_data_7d):
    # Rule Triggers
    name = camp_data_7d['campaign_name']
    spend = float(camp_data_7d['spend'])
    clicks = int(camp_data_7d['clicks'])
    ctr = float(camp_data_7d['ctr'])
    freq = float(camp_data_7d['frequency'])
    # In a real API call, 'conversions' would be checked over days
    # Here we simulate the logic based on the user's provided 'KONDISI'
    
    # Simulate a 3-day zero conversion / spend trigger
    is_problematic = False
    diagnosis = "Unknown"
    
    if spend > 200000 and clicks > 100: # Simulated 'no result' spend
        is_problematic = True
        if freq > 4:
            diagnosis = "AUDIENCE BURNT (frequency > 4, CTR turun)"
        elif ctr < 1.0:
            diagnosis = "CREATIVE FATIGUE (CTR rendah, creative tidak menarik)"
        else:
            diagnosis = "PRODUCT ISSUE (klik banyak tapi 0 konversi)"
            
    if is_problematic:
        if acc_id == "435670549443081": # Specific B format
            alert = f"""📘 FACEBOOK CREATIVE PROBLEM — Akun B
Campaign {name} sudah 7 hari 0 konversi (simulated).

Diagnosis: {diagnosis}

REKOMENDASI:
1. Coba creative yang sudah works di Instagram:
 - tiplessalad reels (CVR IG 2.9%)
 - kancingjepit reels (CVR IG 2.9%)

2. Audience baru:
 - Wanita 22-40
 - Minat: memasak, dapur, organisir rumah, hewan peliharaan
 - Location: Jakarta, Surabaya, Bandung, Medan
 - Exclude: yang sudah lihat ads 7 hari terakhir

3. Format prioritas:
 - Video pendek 15-30 detik (reels-style)
 - Hindari static image untuk FB di akun ini
 - Tambahkan caption Bahasa Indonesia

4. Budget test:
 - Rp 50.000/hari selama 3 hari (test)
 - Jika CVR > 1% dalam 3 hari → scale ke Rp 100.000/hari
 - Jika masih 0 conversion → pause permanen

Mau saya bantu setup campaign baru dengan spesifikasi di atas?
Ketik YA + kirim creative (gambar/video) untuk eksekusi."""
            send_alert(alert)

def run_engine():
    # In production, this fetches last 7 days insights per campaign
    print("Vilona Diagnosis Engine running...")
    for acc_id in ACCOUNTS:
        url = f"https://graph.facebook.com/v19.0/act_{acc_id}/insights"
        params = {
            'level': 'campaign',
            'date_preset': 'last_7d',
            'fields': 'campaign_name,spend,clicks,ctr,frequency',
            'access_token': ACCESS_TOKEN
        }
        res = requests.get(url, params=params).json().get('data', [])
        for c in res:
            diagnose_campaign(acc_id, c)

if __name__ == "__main__":
    run_engine()
