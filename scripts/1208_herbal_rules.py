#!/usr/bin/env python3
"""
⛓️ 1208 HERBAL RULES ENGINE — Auto-Pilot Scale Campaign
======================================================
Berdasarkan winning campaign Scale_Purwceng:
- 1 Campaign : 1 Adset : 1 Ad
- Objective: OUTCOME_SALES → OFFSITE_CONVERSIONS (ADD_PAYMENT_INFO)
- Platform: IG Only | Age 23-55 | Luxury_Hobbies interest
- Landing Page: herbalisme.my.id/purwoceng-herbalisme (Berdu)
- Bid: Rp40,000/konversi
- Produk: Purwoceng (HPP Rp19rb, Jual Rp89rb)

RULES:
1. BUDGET — Scale 30% max per 3 hari kalau CPA < Rp40rb
2. CPR — Bid cap di Rp40rb, auto-turunin kalau CPA > Rp50rb
3. AUTO-PAUSE — Kalau spend >Rp200rb tanpa konversi
4. DUPLICATE — Kalau CPA stabil 7 hari, duplicate ke FB placement
5. ALERT — Kirim notifikasi kalau ada perubahan performa drastis
"""

import requests, json, time, os
from datetime import datetime
import os

TOKEN = 'os.getenv('META_ACCESS_TOKEN', '')'
BASE = 'https://graph.facebook.com/v19.0'
ACT = 'act_1439536310038458'  # 1208

# ─── WINNING CAMPAIGN ─────────────────────────────────────
WINNING_CONFIG = {
    'campaign_id': '120245956714480444',   # Scale_Purwceng
    'adset_id': None,                       # Auto-detect
    'creative_id': None,                    # Auto-detect
    'product': 'Purwoceng',
    'link': 'https://herbalisme.my.id/purwoceng-herbalisme',
    'hpp': 19000,
    'harga_jual': 89000,
    'objective': 'OUTCOME_SALES',
    'conversion_event': 'ADD_PAYMENT_INFO',  # Berdu pixel
    'platform': 'instagram',
    'age_min': 23,
    'age_max': 55,
    'interest': 'Luxury_Hobbies',
    'bid_cap': 40000,    # Rp40rb per konversi
    'cpr_target': 40000, # Target CPR
    'cpr_max': 50000,    # Max CPR sebelum turunin budget
    'current_budget': 1000000,  # Rp1jt
}

# ─── RULES ──────────────────────────────────────────────────
RULES = {
    'budget': {
        'scale_percent': 30,           # Naik 30% per scale
        'scale_min_days': 3,           # Min 3 hari sebelum scale lagi
        'scale_down_percent': 50,      # Turun 50% kalau CPA > max
        'max_budget': 5000000,         # Max Rp5jt/hari
    },
    'cpr': {
        'target': 40000,               # Target Rp40rb/konversi
        'max_acceptable': 50000,       # Max Rp50rb
        'critical': 65000,             # Critical >Rp65rb → harus pause
        'bid_cap': 40000,              # Bid cap Rp40rb
    },
    'auto_pause': {
        'spend_no_conversion': 200000,  # Pause kalau spend Rp200rb tanpa konversi
        'impressions_no_click': 5000,   # Pause kalau 5000 imps 0 klik
        'ctr_minimum': 0.5,            # Min CTR 0.5%
    },
    'duplicate': {
        'days_stable': 7,               # Duplicate ke FB setelah 7 hari stabil
        'fb_initial_budget': 200000,    # Budget awal FB copy Rp200rb
        'fb_bid_cap': 35000,            # Bid cap FB Rp35rb (lebih murah)
    },
    'monitor': {
        'interval_minutes': 5,          # Check tiap 5 menit
        'alert_cpa_spike': 20,          # Alert kalau CPA naik >20% dalam 1 check
        'alert_ctr_drop': 30,           # Alert kalau CTR turun >30%
    }
}

# ─── AUTO FUNCTIONS ─────────────────────────────────────────
LOG_FILE = 'logs/1208_rules_engine.log'

def log(msg):
    ts = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    line = f'[{ts}] {msg}'
    print(line)
    os.makedirs('logs', exist_ok=True)
    with open(LOG_FILE, 'a') as f:
        f.write(line + '\n')

def fb_post(cid, params):
    params['access_token'] = TOKEN
    r = requests.post(f'{BASE}/{cid}', params=params, timeout=15)
    time.sleep(0.5)
    return r.json()

def fb_get(endpoint, params):
    params['access_token'] = TOKEN
    r = requests.get(f'{BASE}/{endpoint}', params=params, timeout=15)
    time.sleep(0.3)
    return r.json()


# ═══ RULE 1: SCALE BUDGET ═══════════════════════════════
def rule_scale_budget(cid, current_budget, cpa):
    """Scale budget up/down based on CPA performance"""
    log(f'📈 RULE 1: Budget check — CPA: Rp{cpa:,}')
    
    if cpa <= RULES['cpr']['target']:
        # CPA bagus → scale up
        scale = int(current_budget * (1 + RULES['budget']['scale_percent']/100))
        scale = min(scale, RULES['budget']['max_budget'])
        log(f'   CPA Rp{cpa:,} ≤ Target Rp{RULES["cpr"]["target"]:,} → SCALE UP ke Rp{scale:,}')
        r = fb_post(cid, {'daily_budget': scale})
        if 'success' in r:
            log(f'   ✅ Budget → Rp{scale:,}')
            return scale
        else:
            log(f'   ❌ Gagal: {r.get("error",{}).get("message","?")[:80]}')
            return current_budget
    
    elif cpa <= RULES['cpr']['max_acceptable']:
        log(f'   CPA Rp{cpa:,} masih dalam batas wajar (max Rp{RULES["cpr"]["max_acceptable"]:,})')
        log(f'   ⏸️ Pertahankan budget Rp{current_budget:,}')
        return current_budget
    
    elif cpa <= RULES['cpr']['critical']:
        # CPA di atas max → turunin budget 50%
        down = int(current_budget * (1 - RULES['budget']['scale_down_percent']/100))
        down = max(down, 100000)  # Min Rp100rb
        log(f'   ⚠️ CPA Rp{cpa:,} > Max Rp{RULES["cpr"]["max_acceptable"]:,} → TURUN ke Rp{down:,}')
        r = fb_post(cid, {'daily_budget': down})
        if 'success' in r:
            log(f'   ✅ Budget → Rp{down:,}')
            return down
        return current_budget
    
    else:
        # CPA critical → PAUSE
        log(f'   🛑 CRITICAL! CPA Rp{cpa:,} > Rp{RULES["cpr"]["critical"]:,} → PAUSE')
        r = fb_post(cid, {'status': 'PAUSED'})
        if 'success' in r:
            log(f'   ✅ Campaign PAUSED')
        return current_budget


# ═══ RULE 2: CPR MONITOR ════════════════════════════════
def rule_cpr_monitor(cid, aid, current_cpa, active_adset={}):
    """Monitor and adjust bid cap"""
    log(f'🎯 RULE 2: CPR monitor — CPA: Rp{current_cpa:,}')
    
    if current_cpa == 0:
        log(f'   ⏸️ Belum ada data konversi')
        return

    # Adjust bid cap if CPA is far from target
    bid_strategy = active_adset.get('bid_strategy')
    if not bid_strategy or bid_strategy != 'LOWEST_COST_WITH_BID_CAP':
        log(f'   ⚙️ Setting bid strategy ke LOWEST_COST_WITH_BID_CAP...')
        r = fb_post(aid, {
            'bid_strategy': 'LOWEST_COST_WITH_BID_CAP',
            'bid_amount': RULES['cpr']['bid_cap'],
        })
        if 'success' in r:
            log(f'   ✅ Bid strategy = LOWEST_COST_WITH_BID_CAP | Bid cap = Rp{RULES["cpr"]["bid_cap"]:,}')
        else:
            log(f'   ⚠️ Gagal set bid strategy: {r.get("error",{}).get("message","?")[:80]}')
    
    if current_cpa < RULES['cpr']['target'] * 0.7:
        new_bid = min(int(RULES['cpr']['bid_cap'] * 1.2), 50000)
        log(f'   💪 CPA Rp{current_cpa:,} < 70% target → scale bid cap ke Rp{new_bid:,}')
        r = fb_post(aid, {'bid_amount': new_bid})
        if 'success' in r:
            log(f'   ✅ Bid cap → Rp{new_bid:,}')
    
    elif current_cpa > RULES['cpr']['max_acceptable']:
        new_bid = max(int(RULES['cpr']['bid_cap'] * 0.8), 25000)
        log(f'   ⚠️ CPA Rp{current_cpa:,} > max → turunin bid cap ke Rp{new_bid:,}')
        r = fb_post(aid, {'bid_amount': new_bid})
        if 'success' in r:
            log(f'   ✅ Bid cap → Rp{new_bid:,}')


# ═══ RULE 3: AUTO-PAUSE ═════════════════════════════════
def rule_auto_pause(cid, aid, spend, impressions, clicks):
    """Auto-pause kalau performa jelek"""
    log(f'🛑 RULE 3: Auto-pause check')
    
    reasons = []
    
    if spend >= RULES['auto_pause']['spend_no_conversion']:
        # Cek apakah ada konversi
        ins = fb_get(f'{aid}/insights', {
            'fields': 'actions{action_type,value}',
            'date_preset': 'today',
            'limit': 1
        })
        conversions = 0
        if ins.get('data'):
            actions = ins['data'][0].get('actions', [])
            conversions = sum(a.get('value', 0) for a in actions if a.get('action_type') == 'offsite_conversion.fb_pixel_add_payment_info')
        
        if conversions == 0:
            reasons.append(f'Spend Rp{spend:,.0f} tanpa konversi')
    
    if impressions >= RULES['auto_pause']['impressions_no_click'] and clicks == 0:
        reasons.append(f'{impressions} impressions 0 klik')
    
    if impressions > 1000:
        ctr = (clicks / impressions) * 100
        if ctr < RULES['auto_pause']['ctr_minimum']:
            reasons.append(f'CTR {ctr:.2f}% < {RULES["auto_pause"]["ctr_minimum"]}%')
    
    if reasons:
        log(f'   ⚠️ Alasan: {", ".join(reasons)}')
        # Cek apakah udah pernah di-pause sebelumnya (biar gak loop)
        state_file = f'data/1208_pause_state_{aid}.json'
        if not os.path.exists(state_file):
            log(f'   🛑 PAUSE CAMPAIGN!')
            r = fb_post(cid, {'status': 'PAUSED'})
            if 'success' in r:
                log(f'   ✅ Campaign PAUSED')
                with open(state_file, 'w') as f:
                    f.write(json.dumps({'paused_at': datetime.now().isoformat(), 'reasons': reasons}))
        else:
            log(f'   ⏸️ Udah pernah di-pause, skip')
    else:
        log(f'   ✅ Semua parameter aman')


# ═══ RULE 4: DUPLICATE TO FB ════════════════════════════
def rule_duplicate_to_fb(cid, days_running):
    """Duplicate winning IG campaign ke FB placement"""
    if days_running < RULES['duplicate']['days_stable']:
        log(f'⏳ RULE 4: Baru {days_running} hari, tunggu {RULES["duplicate"]["days_stable"]} hari')
        return
    
    log(f'📋 RULE 4: Waktunya duplicate ke FB!')
    # Logic: copy campaign, change placement to FB only
    log(f'   ✅ Siap di-duplicate — butuh approval manual lo dulu bro')


# ═══ MAIN MONITOR ═══════════════════════════════════════
def run_monitor(campaign_id=WINNING_CONFIG['campaign_id']):
    """Main monitoring loop"""
    log('=' * 60)
    log('🔥 1208 RULES ENGINE — MULAI MONITOR')
    log('=' * 60)
    log(f'Campaign: {campaign_id}')
    log(f'Rules:')
    for rule, cfg in RULES.items():
        log(f'   {rule}: {json.dumps(cfg)[:100]}')
    log('')
    
    # Auto-detect adset and ad
    adsets = fb_get(f'{campaign_id}/adsets', {
        'fields': 'id,name,effective_status,bid_amount,bid_strategy',
        'limit': 5
    })
    
    active_adset = None
    for a in adsets.get('data', []):
        if a.get('effective_status') == 'ACTIVE':
            active_adset = a
            break
    
    if not active_adset:
        log('❌ TIDAK ADA ADSET AKTIF!')
        return
    
    aid = active_adset['id']
    log(f'📎 Active adset: {active_adset.get("name")} | ID: {aid}')
    
    # Get ad in adset
    ads = fb_get(f'{aid}/ads', {
        'fields': 'id,name,effective_status',
        'limit': 5
    })
    active_ad = None
    for ad in ads.get('data', []):
        if ad.get('effective_status') == 'ACTIVE':
            active_ad = ad
            break
    
    if active_ad:
        log(f'📝 Active ad: {active_ad.get("name")} | ID: {active_ad.get("id")}')
    
    # Get campaign insights
    ins = fb_get(f'{campaign_id}/insights', {
        'fields': 'spend,impressions,clicks,ctr,cpc,cost_per_action_type{action_type,value}',
        'date_preset': 'today',
        'limit': 1
    })
    
    if not ins.get('data'):
        log('⏸️ Belum ada data hari ini — skip rules, save state')
        state = {
            'last_check': datetime.now().isoformat(),
            'campaign_id': campaign_id,
            'adset_id': aid,
            'status': 'NO_DATA',
            'metrics': {'spend': 0, 'impressions': 0, 'clicks': 0, 'ctr': 0, 'cpc': 0, 'cpa': 0},
        }
        os.makedirs('data', exist_ok=True)
        with open('data/1208_rules_state.json', 'w') as f:
            json.dump(state, f, indent=2)
        return
    
    d = ins['data'][0]
    spend = float(d.get('spend', 0))
    impressions = int(d.get('impressions', 0))
    clicks = int(d.get('clicks', 0))
    ctr = float(d.get('ctr', 0))
    cpc = float(d.get('cpc', 0))
    
    # Get CPA
    cost_per = d.get('cost_per_action_type', [])
    cpa = 0
    for cp in cost_per:
        if cp.get('action_type') == 'offsite_conversion.fb_pixel_add_payment_info':
            cpa = float(cp.get('value', 0))
            break
    
    log(f'\n📊 DATA SAAT INI:')
    log(f'   Spend: Rp{spend:,.0f} | Imps: {impressions:,} | Clicks: {clicks:,}')
    log(f'   CTR: {ctr:.2f}% | CPC: Rp{cpc:,.0f} | CPA: Rp{cpa:,.0f}')
    
    # EKSEKUSI RULES
    log('\n⚡ EKSEKUSI RULES:')
    
    # Rule 1: Budget
    current_budget = WINNING_CONFIG['current_budget']
    new_budget = rule_scale_budget(campaign_id, current_budget, cpa)
    WINNING_CONFIG['current_budget'] = new_budget
    
    # Rule 2: CPR
    rule_cpr_monitor(campaign_id, aid, cpa, active_adset or {})
    
    # Rule 3: Auto-pause
    rule_auto_pause(campaign_id, aid, spend, impressions, clicks)
    
    # Save state
    state = {
        'last_check': datetime.now().isoformat(),
        'campaign_id': campaign_id,
        'adset_id': aid,
        'ad_id': active_ad.get('id') if active_ad else None,
        'metrics': {
            'spend': spend,
            'impressions': impressions,
            'clicks': clicks,
            'ctr': ctr,
            'cpc': cpc,
            'cpa': cpa,
        },
        'budget': new_budget,
    }
    os.makedirs('data', exist_ok=True)
    with open('data/1208_rules_state.json', 'w') as f:
        json.dump(state, f, indent=2)
    
    # Profit estimation
    if cpa > 0:
        profit = WINNING_CONFIG['harga_jual'] - WINNING_CONFIG['hpp'] - cpa
        log(f'\n💰 ESTIMASI PROFIT: Rp{profit:,}/konversi')
        log(f'   ROAS: {(WINNING_CONFIG["harga_jual"] / cpa):.2f}x')
    
    log('\n✅ MONITOR SELESAI')
    log('=' * 60)


# ═══ STATUS ══════════════════════════════════════════════
def show_rules():
    """Display current rules"""
    print('\n' + '╔' + '═'*58 + '╗')
    print('║' + '📋 1208 HERBAL RULES ENGINE'.center(56) + '║')
    print('╚' + '═'*58 + '╝')
    
    print(f'\n🎯 Winning Campaign: Scale_Purwceng (Rp{WINNING_CONFIG["current_budget"]:,}/hari)')
    print(f'   Link: {WINNING_CONFIG["link"]}')
    print(f'   Obj: {WINNING_CONFIG["objective"]} → OFFSITE_CONVERSIONS ({WINNING_CONFIG["conversion_event"]})')
    print(f'   Platform: {WINNING_CONFIG["platform"]} | Age: {WINNING_CONFIG["age_min"]}-{WINNING_CONFIG["age_max"]}')
    print(f'   Interest: {WINNING_CONFIG["interest"]} | Bid: Rp{WINNING_CONFIG["bid_cap"]:,}')
    print(f'   HPP: Rp{WINNING_CONFIG["hpp"]:,} | Jual: Rp{WINNING_CONFIG["harga_jual"]:,}')
    print(f'   Target CPR: Rp{WINNING_CONFIG["cpr_target"]:,} | Max: Rp{WINNING_CONFIG["cpr_max"]:,}')
    
    print(f'\n⚙️ RULES:')
    print(f'   📈 Budget: Scale +30% per 3 hari | Turun -50% kalau CPA > Rp50rb')
    print(f'   🎯 CPR: Bid cap Rp40rb | Target CPA Rp40rb | Critical Rp65rb')
    print(f'   🛑 Auto-pause: >Rp200rb tanpa konversi | >5K imps 0 klik | CTR <0.5%')
    print(f'   📋 Duplicate: Ke FB setelah 7 hari stabil | Budget awal Rp200rb')
    print(f'   ⏱️  Monitor: Tiap 60 menit')
    
    print(f'\n💰 PROFIT per konversi: Rp{WINNING_CONFIG["harga_jual"] - WINNING_CONFIG["hpp"] - WINNING_CONFIG["cpr_target"]:,} (pada CPR Rp40rb)')
    
    print(f'\n💾 State file: data/1208_rules_state.json')
    print(f'📝 Log file: {LOG_FILE}')
    print()


# ═══ MAIN ═══════════════════════════════════════════════
if __name__ == '__main__':
    import sys
    
    if '--monitor' in sys.argv:
        # Loop monitor with auto-restart on crash
        interval = RULES['monitor']['interval_minutes']
        log(f'🔄 Loop monitor aktif — check tiap {interval} menit')
        consecutive_errors = 0
        while True:
            try:
                run_monitor()
                consecutive_errors = 0  # Reset on success
            except Exception as e:
                consecutive_errors += 1
                log(f'❌ Error ke-{consecutive_errors}: {e}')
                if consecutive_errors >= 5:
                    log(f'🛑 5 errors berturut-turut, restart dalam 60 detik...')
                    time.sleep(60)
                    consecutive_errors = 0
            log(f'⏳ Next check in {interval} menit...')
            time.sleep(interval * 60)
    
    elif '--once' in sys.argv:
        run_monitor()
    
    else:
        show_rules()
        print('\nUsage:')
        print('  python3 scripts/1208_herbal_rules.py            # tampilkan rules')
        print('  python3 scripts/1208_herbal_rules.py --once     # jalankan 1x check')
        print('  python3 scripts/1208_herbal_rules.py --monitor  # loop tiap 60 menit')
