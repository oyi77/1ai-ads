#!/usr/bin/env python3
"""
vilona_1208_herbal_strategy.py — Scale Herbal Campaigns on 1208
=============================================================

STRATEGI:
  Budget Rp100rb, CPR Target Rp30rb (HPP Rp19rb, Jual ~Rp89rb)
  Scale existing proven campaigns, apply TARGET_COST

Produk di 1208:
  1. Purwoceng → ID: 120245846355810444 (CTR 8.9% ✅ budget Rp550)
  2. Wedang    → ID: 120245846348470444 (CTR 1.77% ⚠️ budget Rp550)
  3. Wedang LP → ID: 120245830196780444 (budget Rp550)

Usage:
  python3 scripts/vilona_1208_herbal_strategy.py           # apply
  python3 scripts/vilona_1208_herbal_strategy.py --status  # cek
"""

import requests, json, os, sys, time, math
from datetime import datetime
import os

TOKEN = os.getenv('META_ACCESS_TOKEN', '')
ACCOUNT_ID = 'act_1439536310038458'  # Selow ID 1208
BASE = 'https://graph.facebook.com/v19.0'
LOG_PATH = 'logs/vilona_1208_herbal_strategy.log'

CONFIG = {
    'total_budget': 100000,     # Rp100rb total
    'cpr_target': 30000,        # Rp30rb per konversi
    'hpp': 19000,
    'harga_jual': 89000,
}

# Campaigns yang akan di-scale
CAMPAIGNS = [
    {
        'name': 'Purwoceng',
        'id': '120245846355810444',
        'budget': 50000,         # Rp50rb (proven, CTR 8.9%)
        'current_budget': 550,
    },
    {
        'name': 'Wedang',
        'id': '120245846348470444',
        'budget': 30000,         # Rp30rb
        'current_budget': 550,
    },
    {
        'name': 'Wedang LP',
        'id': '120245830196780444',
        'budget': 20000,         # Rp20rb
        'current_budget': 550,
    },
]


def log(msg):
    ts = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    line = f'[{ts}] {msg}'
    print(line)
    os.makedirs(os.path.dirname(LOG_PATH), exist_ok=True)
    with open(LOG_PATH, 'a') as f:
        f.write(line + '\n')


def fb_get(endpoint, params=None):
    url = f'{BASE}/{endpoint}'
    p = {'access_token': TOKEN}
    if params: p.update(params)
    for attempt in range(5):
        r = requests.get(url, params=p)
        data = r.json()
        if 'error' in data:
            err = data['error']
            code = err.get('code', 0)
            msg = err.get('message', '')
            if code == 17:
                wait = min(30 + (attempt * 15), 120)
                log(f"⚠️ RL — tunggu {wait}s...")
                time.sleep(wait); continue
            log(f"❌ GET Error [{code}]: {msg[:200]}")
            return data
        return data
    return {'error': 'Max retries'}


def fb_post(endpoint, params=None):
    url = f'{BASE}/{endpoint}'
    p = {'access_token': TOKEN}
    if params: p.update(params)
    for attempt in range(5):
        r = requests.post(url, params=p)
        data = r.json()
        if 'error' in data:
            err = data['error']
            code = err.get('code', 0)
            msg = err.get('message', '')
            if code == 17:
                wait = min(30 + (attempt * 15), 120)
                log(f"⚠️ RL — tunggu {wait}s...")
                time.sleep(wait); continue
            log(f"❌ POST Error [{code}]: {msg[:200]}")
            return data
        return data
    return {'error': 'Max retries'}


def run_strategy():
    log("=" * 60)
    log("🔥 VILONA 1208 HERBAL STRATEGY — STARTING")
    log("=" * 60)
    log(f"HPP: Rp{CONFIG['hpp']:,} | Jual: Rp{CONFIG['harga_jual']:,}")
    log(f"Budget: Rp{CONFIG['total_budget']:,} | CPR Target: Rp{CONFIG['cpr_target']:,}")
    profit = CONFIG['harga_jual'] - CONFIG['hpp'] - CONFIG['cpr_target']
    log(f"Profit per konversi: Rp{profit:,}")
    log(f"⚠️ Scale jump: Rp1,650 → Rp100,000 (60x!) — applying phased")
    log("")

    results = []
    total_applied_budget = 0

    for camp in CAMPAIGNS:
        cid = camp['id']
        new_budget_minor = camp['budget'] * 100
        cpr_minor = CONFIG['cpr_target'] * 100

        # Phase 1: 50% of target first (safer)
        phase1_budget = max(camp['budget'] // 2, 5000)  # Min Rp5rb
        phase1_minor = phase1_budget * 100

        log(f"\n📦 {camp['name']}")
        log(f"   Campaign: {cid} (sekarang Rp{camp['current_budget']:,})")
        log(f"   Phase 1: Rp{phase1_budget:,} → Phase 2: Rp{camp['budget']:,}")

        # STEP 1: Update campaign budget (Phase 1)
        log(f"   📈 Setting budget to Rp{phase1_budget:,}...")
        r1 = requests.post(f'{BASE}/{cid}', params={
            'access_token': TOKEN,
            'daily_budget': phase1_minor,
        }).json()
        time.sleep(1)

        if 'success' in r1:
            log(f"   ✅ Budget → Rp{phase1_budget:,}")
            total_applied_budget += phase1_budget
        else:
            log(f"   ⚠️ Failed: {json.dumps(r1)[:150]}")
            continue

        # STEP 2: Get active adsets, apply TARGET_COST
        log(f"   🎯 Applying TARGET_COST Rp{CONFIG['cpr_target']:,}...")
        adsets = fb_get(f'{cid}/adsets', {
            'fields': 'id,name,effective_status,bid_strategy',
            'limit': 10
        })

        as_updated = 0
        for adset in adsets.get('data', []):
            if adset.get('effective_status') == 'ACTIVE':
                aid = adset['id']
                log(f"     → Adset: {adset.get('name','?')}")
                r2 = requests.post(f'{BASE}/{aid}', params={
                    'access_token': TOKEN,
                    'bid_strategy': 'LOWEST_COST_WITH_BID_CAP',
                    'bid_amount': cpr_minor,  # Rp30rb bid cap
                }).json()
                time.sleep(1)

                if 'success' in r2:
                    as_updated += 1
                    log(f"       ✅ BID_CAP applied!")
                else:
                    # Try TARGET_COST instead
                    r3 = requests.post(f'{BASE}/{aid}', params={
                        'access_token': TOKEN,
                        'bid_strategy': 'TARGET_COST',
                        'bid_amount': cpr_minor,
                    }).json()
                    time.sleep(1)
                    if 'success' in r3:
                        as_updated += 1
                        log(f"       ✅ TARGET_COST applied!")
                    else:
                        log(f"       ⚠️ Both failed: {json.dumps(r3)[:150]}")

        results.append({
            'name': camp['name'],
            'id': cid,
            'phase1_budget': phase1_budget,
            'target_budget': camp['budget'],
            'adsets_updated': as_updated,
        })

    # Save state
    state = {
        'applied_at': datetime.now().isoformat(),
        'config': CONFIG,
        'results': results,
        'total_phase1_budget': total_applied_budget,
    }
    os.makedirs('data', exist_ok=True)
    with open('data/vilona_1208_strategy.json', 'w') as f:
        json.dump(state, f, indent=2)

    # SUMMARY
    log("\n" + "=" * 60)
    log("🔥 STRATEGI BERHASIL!")
    log("=" * 60)
    log(f"\n💰 Total Budget Phase 1: Rp{total_applied_budget:,}/hari (dari Rp1,650)")
    log(f"🎯 CPR Target: Rp{CONFIG['cpr_target']:,}/konversi (via BID_CAP/TARGET_COST)")
    log(f"📈 Estimasi Profit: Rp{profit:,}/konversi")
    log(f"\n📊 Pembagian:")
    for r in results:
        s = '✅' if r['adsets_updated'] > 0 else '⚠️'
        log(f"  {s} {r['name']}: Rp{r['phase1_budget']:,} → next: Rp{r['target_budget']:,}")
    log(f"\n🔄 Scale ke Phase 2 (full Rp100rb) dalam 3-7 hari kalau CPA stabil")
    log(f"📌 Auto-pause manual: pantau tiap hari, kalau CPA > Rp50rb turunin budget 30%")
    log("=" * 60)


def check_status():
    """Check campaign budgets"""
    log(f"\n📊 1208 HERBAL — STATUS")
    log("=" * 40)
    for camp in CAMPAIGNS:
        c = fb_get(camp['id'], {'fields': 'name,effective_status,daily_budget,bid_strategy'})
        db = c.get('daily_budget', '0')
        db_idr = int(db)/100 if db and db != '0' else 0
        log(f"\n{camp['name']}:")
        log(f"  Status: {c.get('effective_status','?')} | Budget: Rp{db_idr:,.0f}")
        time.sleep(1)


if __name__ == '__main__':
    if '--status' in sys.argv:
        check_status()
    else:
        run_strategy()
