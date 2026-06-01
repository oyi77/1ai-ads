#!/usr/bin/env python3
"""
vilona_0858_abo_strategy.py — Auto-pilot Budget Strategy for 0858
===========================================================

STRATEGI:
  1. BUAT 5 ABO ADSET × Rp20rb (TOTAL Rp100rb)
  2. Optimization goal: LINK_CLICKS (traffic to LYNK)
  3. Auto-pause kalau 30rb spend 0 result
  4. Auto-scale 30% per 3 hari kalau hasil bagus

Usage:
  python3 scripts/vilona_0858_abo_strategy.py              # apply sekali
  python3 scripts/vilona_0858_abo_strategy.py --monitor    # loop monitor tiap 30 menit
  python3 scripts/vilona_0858_abo_strategy.py --status     # cek status aja
"""

import requests, json, os, sys, time, random
from datetime import datetime
import os

# ─── CONFIG ─────────────────────────────────────────────────────────────
TOKEN = 'os.getenv('META_ACCESS_TOKEN', '')'
ACCOUNT_ID = 'act_435670549443081'
PAGE_ID = '997737406765722'  # JENDRALBOT page
BASE = 'https://graph.facebook.com/v19.0'
LOG_PATH = 'logs/vilona_0858_abo_strategy.log'

# ─── BUDGET STRATEGY ────────────────────────────────────────────────────
ABO_CONFIG = {
    'total_budget': 100000,          # Rp100rb total
    'adsets': 5,                     # 5 adset
    'budget_per_adset': 20000,       # Rp20rb/adset
    'cost_cap_target': 50000,        # Target CPR Rp50rb (applied via budget + monitoring)
    'auto_pause_threshold': 30000,   # Auto-pause kalau spend >30rb tanpa klik
    'scale_percent': 30,             # Naik 30% kalau hasil oke
    'scale_days': 3,                 # Scale setiap 3 hari
}

# ─── AUDIENCES ──────────────────────────────────────────────────────────
AUDIENCES = [
    {   # Audience 1: Belanja Online Umum
        'name': 'BelanjaOnline',
        'age_min': 23,
        'age_max': 55,
    },
    {   # Audience 2: Ibu Rumah Tangga
        'name': 'IbuRumah',
        'age_min': 25,
        'age_max': 50,
    },
    {   # Audience 3: Produk Rumah Tangga
        'name': 'RumahTangga',
        'age_min': 23,
        'age_max': 55,
    },
    {   # Audience 4: Semua Kalangan
        'name': 'SemuaKalangan',
        'age_min': 23,
        'age_max': 55,
    },
    {   # Audience 5: Dewasa Produktif
        'name': 'DewasaProduktif',
        'age_min': 25,
        'age_max': 50,
    },
]

# ─── TARGETING BUILDER ─────────────────────────────────────────────────
def build_targeting(audience, platform='facebook'):
    """Buat targeting dict sesuai rules 0858
    IMPORTANT: publisher_platforms must be lowercase ('facebook' or 'instagram')
    """
    targeting = {
        'geo_locations': {'countries': ['ID']},
        'age_min': audience['age_min'],
        'age_max': audience['age_max'],
        'device_platforms': ['mobile'],  # CELLULAR ONLY
        'publisher_platforms': [platform],  # lowercase: 'facebook' or 'instagram'
        'facebook_positions': [],
        'instagram_positions': [],
    }

    # Platform-specific placements
    if platform == 'facebook':
        targeting['facebook_positions'] = [
            'feed',           # Beranda Facebook
        ]
    else:
        targeting['instagram_positions'] = [
            'stream',        # Beranda Instagram
            'story',          # Instagram Stories
            'reels',          # Instagram Reels
        ]

    # Disable Advantage+ audience (wajib for 0858 rules)
    targeting['targeting_automation'] = {'advantage_audience': 0}

    return targeting

# ─── API CALLS ─────────────────────────────────────────────────────────
def fb_get(endpoint, params=None):
    url = f'{BASE}/{endpoint}'
    p = {'access_token': TOKEN}
    if params:
        p.update(params)

    for attempt in range(5):
        r = requests.get(url, params=p)
        data = r.json()

        if 'error' in data:
            err = data['error']
            code = err.get('code', 0)
            msg = err.get('message', '')

            if code == 17:
                wait = min(30 + (attempt * 15), 120)
                log(f"⚠️ Rate limited — tunggu {wait}s...")
                time.sleep(wait)
                continue
            else:
                log(f"❌ API Error [{code}]: {msg[:200]}")
                return data
        return data

    return {'error': {'message': 'Max retries reached (rate limit)'}}

def fb_post(endpoint, params=None):
    url = f'{BASE}/{endpoint}'
    p = {'access_token': TOKEN}
    if params:
        p.update(params)

    for attempt in range(5):
        r = requests.post(url, params=p)
        data = r.json()

        if 'error' in data:
            err = data['error']
            code = err.get('code', 0)
            msg = err.get('message', 'Unknown error')

            if code == 17:
                wait = min(30 + (attempt * 15), 120)
                log(f"⚠️ Rate limited — tunggu {wait}s...")
                time.sleep(wait)
                continue
            else:
                log(f"❌ API Error [{code}]: {msg[:200]}")
                return data
        return data

    return {'error': {'message': 'Max retries reached (rate limit)'}}

# ─── LOGGING ────────────────────────────────────────────────────────────
def log(msg):
    ts = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    line = f'[{ts}] {msg}'
    print(line)
    os.makedirs(os.path.dirname(LOG_PATH), exist_ok=True)
    with open(LOG_PATH, 'a') as f:
        f.write(line + '\n')

# ─── STRATEGY EXECUTION ─────────────────────────────────────────────────
def run_strategy():
    """Main strategy execution"""
    log("=" * 60)
    log("🔥 VILONA 0858 ABO STRATEGY — STARTING")
    log("=" * 60)
    log(f"Budget: Rp{ABO_CONFIG['total_budget']:,} ({ABO_CONFIG['adsets']}× Rp{ABO_CONFIG['budget_per_adset']:,})")
    log(f"Target CPR: Rp{ABO_CONFIG['cost_cap_target']:,} | Auto-pause: >Rp{ABO_CONFIG['auto_pause_threshold']:,} no clicks")
    log("")

    # ─── STEP 1: Check existing active campaign ─────────────────────
    log("📋 STEP 1: Checking active campaigns on 0858...")
    camps = fb_get(f'{ACCOUNT_ID}/campaigns', {
        'fields': 'id,name,status,effective_status,daily_budget,campaign_budget_type,bid_strategy',
        'limit': 100
    })

    active_camps = []
    if 'data' in camps:
        for c in camps['data']:
            if c.get('effective_status') == 'ACTIVE':
                active_camps.append(c)
                db = c.get('daily_budget', '0')
                db_idr = int(db)/100 if db and db != '0' else 0
                log(f"  → Aktif: {c['name']} | Budget: Rp{db_idr:,.0f} | Type: {c.get('campaign_budget_type','?')}")

    log(f"  Total kampanye aktif: {len(active_camps)}")
    log("")

    # ─── STEP 2: Create ABO campaign ────────────────────────────────
    log("🚀 STEP 2: Membuat ABO Campaign baru...")
    now_ts = datetime.now().strftime('%d%b_%H%M')

    camp_result = fb_post(f'{ACCOUNT_ID}/campaigns', {
        'name': f'ABO_JENDRALBOT_Rp100rb_BIDCAP130_{now_ts}',
        'objective': 'OUTCOME_TRAFFIC',
        'status': 'ACTIVE',
        'special_ad_categories': 'NONE',
        'buying_type': 'AUCTION',
        'is_adset_budget_sharing_enabled': False,  # ABO mode (no campaign budget)
    })

    campaign_id = camp_result.get('id')
    if not campaign_id:
        log(f"❌ GAGAL buat campaign: {json.dumps(camp_result)[:300]}")
        return

    log(f"✅ Campaign created: {campaign_id}")
    log("")

    # ─── STEP 3: Create 5 ABO ad sets ──────────────────────────────
    log("📦 STEP 3: Membuat 5 ABO Ad Sets...")
    adset_ids = []

    for i, audience in enumerate(AUDIENCES):
        platform = 'facebook' if i % 2 == 0 else 'instagram'  # Selang-seling FB/IG
        targeting = build_targeting(audience, platform)

        adset_result = fb_post(f'{ACCOUNT_ID}/adsets', {
            'name': f'ABO_{audience["name"]}_{platform.capitalize()}_Rp20rb',
            'campaign_id': campaign_id,
            'daily_budget': ABO_CONFIG['budget_per_adset'] * 100,  # Rp20rb (in cents)
            'optimization_goal': 'LINK_CLICKS',
            'billing_event': 'IMPRESSIONS',
            'bid_strategy': 'LOWEST_COST_WITH_BID_CAP',
            'bid_amount': 13000,  # IDR 130 bid cap (per 0858 rules)
            'targeting': json.dumps(targeting),
            'status': 'ACTIVE',
        })

        adset_id = adset_result.get('id')
        if adset_id:
            adset_ids.append(adset_id)
            log(f"  ✅ Ad Set {i+1}: {audience['name']} ({platform}) → {adset_id}")
        else:
            log(f"  ❌ Ad Set {i+1} GAGAL: {json.dumps(adset_result)[:200]}")
            continue

        time.sleep(2)  # Rate limit safety

    log(f"  Total ad set berhasil: {len(adset_ids)}/{ABO_CONFIG['adsets']}")
    log("")

    # ─── STEP 4: Save state for monitor ────────────────────────────
    state = {
        'campaign_id': campaign_id,
        'adset_ids': adset_ids,
        'created_at': datetime.now().isoformat(),
        'config': {**ABO_CONFIG, 'created_adsets': len(adset_ids)},
        'monitor': {
            'last_check': None,
            'adset_stats': {},
            'paused_adsets': [],
            'scale_log': [],
        }
    }

    os.makedirs('data', exist_ok=True)
    with open('data/vilona_0858_abo_state.json', 'w') as f:
        json.dump(state, f, indent=2)
    log("✅ State saved to data/vilona_0858_abo_state.json")

    # ─── SUMMARY ──────────────────────────────────────────────────
    log("")
    log("=" * 60)
    log("🔥 STRATEGI BERHASIL DITERAPKAN!")
    log("=" * 60)
    log(f"Campaign: ABO_JENDRALBOT_Rp100rb_CPR50rb_{now_ts}")
    log(f"Total Budget: Rp{ABO_CONFIG['total_budget']:,}/hari")
    log(f"Ad Sets Aktif: {len(adset_ids)} × Rp{ABO_CONFIG['budget_per_adset']:,}")
    log(f"Target CPR: Rp{ABO_CONFIG['cost_cap_target']:,} (via LINK_CLICKS optimization)")
    log("")
    log("Monitoring aktif. Auto-pause jika:")
    log(f"  - Spend >Rp{ABO_CONFIG['auto_pause_threshold']:,} tanpa klik → PAUSE")
    log(f"  - Performa bagus 3 hari → Scale +{ABO_CONFIG['scale_percent']}%")
    log("=" * 60)

    return state

# ─── MONITOR LOOP ───────────────────────────────────────────────────────
def monitor_loop():
    """Monitor running every 30 minutes"""
    log("📊 MONITOR LOOP STARTED (30 menit interval)")

    while True:
        try:
            state_path = 'data/vilona_0858_abo_state.json'
            if not os.path.exists(state_path):
                log("❌ State file not found. Jalankan strategy dulu!")
                return

            with open(state_path) as f:
                state = json.load(f)

            campaign_id = state.get('campaign_id')
            adset_ids = state.get('adset_ids', [])
            now = datetime.now()

            log(f"\n📊 Monitor Check — {now.strftime('%Y-%m-%d %H:%M WIB')}")

            for adset_id in adset_ids:
                insights = fb_get(f'{adset_id}/insights', {
                    'fields': 'spend,impressions,clicks,ctr,cpc,cpm',
                    'date_preset': 'today',
                    'time_increment': 1,
                    'limit': 1,
                })

                stats = {}
                if 'data' in insights and insights['data']:
                    d = insights['data'][0]
                    spend = float(d.get('spend', 0)) * 100
                    impressions = int(d.get('impressions', 0))
                    clicks = int(d.get('clicks', 0))
                    ctr = float(d.get('ctr', 0))
                    cpc = float(d.get('cpc', 0)) * 100 if d.get('cpc') else 0

                    stats = {
                        'spend_idr': spend,
                        'impressions': impressions,
                        'clicks': clicks,
                        'ctr': ctr,
                        'cpc': cpc,
                    }

                    log(f"  Ad Set {adset_id}: Rp{spend:,.0f} spent | {impressions} imps | {clicks} clicks | CTR {ctr:.2f}%")

                    # AUTO-PAUSE
                    if spend >= ABO_CONFIG['auto_pause_threshold'] and impressions > 500 and clicks == 0:
                        log(f"  🛑 AUTO-PAUSE: 0 klik dari Rp{spend:,.0f} spend dengan {impressions} impressions!")
                        pause_result = fb_post(f'{adset_id}', {'status': 'PAUSED'})
                        if 'success' in pause_result:
                            log(f"  ✅ Ad set {adset_id} PAUSED")
                            state['monitor']['paused_adsets'].append({
                                'adset_id': adset_id,
                                'spend': spend,
                                'clicks': clicks,
                                'paused_at': now.isoformat(),
                            })

                state['monitor']['adset_stats'][adset_id] = stats
                state['monitor']['last_check'] = now.isoformat()
                time.sleep(1)

            with open(state_path, 'w') as f:
                json.dump(state, f, indent=2)

            active_count = len(adset_ids) - len(state['monitor']['paused_adsets'])
            log(f"  📊 Status: {active_count}/{len(adset_ids)} aktif | {len(state['monitor']['paused_adsets'])} paused")

        except Exception as e:
            log(f"❌ Monitor error: {str(e)}")

        log(f"\n⏳ Next check in 30 menit...")
        time.sleep(1800)


# ─── STATUS CHECK ──────────────────────────────────────────────────────
def check_status():
    """Check current strategy status"""
    state_path = 'data/vilona_0858_abo_state.json'
    if not os.path.exists(state_path):
        log("❌ Belum ada strategy yang dijalankan.")
        return

    with open(state_path) as f:
        state = json.load(f)

    campaign_id = state.get('campaign_id')
    adset_ids = state.get('adset_ids', [])
    paused = state.get('monitor', {}).get('paused_adsets', [])
    last_check = state.get('monitor', {}).get('last_check', 'N/A')

    log(f"\n📊 VILONA 0858 ABO — STATUS")
    log(f"  Campaign: {campaign_id}")
    log(f"  Ad Sets: {len(adset_ids)} total")
    log(f"  Paused: {len(paused)}")
    log(f"  Last Check: {last_check}")

    for adset_id in adset_ids:
        stats = state.get('monitor', {}).get('adset_stats', {}).get(adset_id, {})
        is_paused = any(p.get('adset_id') == adset_id for p in paused)
        status = '🛑 PAUSED' if is_paused else '✅ AKTIF'
        if stats:
            log(f"  {status} | {adset_id[:10]}... | Rp{stats.get('spend_idr',0):,.0f} | {stats.get('impressions',0)} imps | {stats.get('clicks',0)} clicks")
        else:
            log(f"  {status} | {adset_id[:10]}... | Belum ada data")


# ─── MAIN ──────────────────────────────────────────────────────────────
if __name__ == '__main__':
    import sys

    if '--monitor' in sys.argv:
        monitor_loop()
    elif '--status' in sys.argv:
        check_status()
    else:
        run_strategy()
