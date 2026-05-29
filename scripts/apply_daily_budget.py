#!/usr/bin/env python3
"""
Daily Budget Decision v2 — Multi-Account (1041 + 0858)
Based on 3-day average baseline + ROI-based scaling.

Baseline = rata-rata spend 3 hari terakhir
  ROI ≥ 2x → 🟢 Naik 50%
  ROI 1x-2x → 🟡 Tetap
  ROI < 1x → 🔴 Turun 50%

Usage:
  python3 apply_daily_budget.py                                # Interactive (ask commission)
  python3 apply_daily_budget.py --act 1041 --commission 500000  # Headless  
  python3 apply_daily_budget.py --dry-run                       # Preview only
"""
import json, requests, sys, os, argparse
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from meta_base import TOKEN, api_get, api_post, log, ACCOUNTS

LOG_FILE = os.path.join(os.path.dirname(__file__), '..', 'logs', 'budget_decision.log')
STATE_FILE = '/tmp/budget_baseline.json'

def load_baseline():
    """Load spending history for 3-day average"""
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE) as f:
            return json.load(f)
    return {'days': {}}

def save_baseline(state):
    os.makedirs(os.path.dirname(STATE_FILE), exist_ok=True)
    with open(STATE_FILE, 'w') as f:
        json.dump(state, f)

def get_spend_history(act_id, days=3):
    """Get spend for last N days"""
    from datetime import datetime, timedelta
    results = {}
    for i in range(days):
        date = (datetime.now() - timedelta(days=i+1)).strftime('%Y-%m-%d')
        r = api_get(f'{act_id}/insights', {
            'fields': 'spend',
            'time_range': json.dumps({'since': date, 'until': date}),
            'level': 'account',
            'limit': 1
        })
        if r.get('data'):
            results[date] = int(float(r['data'][0]['spend']))
        else:
            results[date] = 0
    return results

def distribute_budget(act_id, total_budget, act_cfg):
    """Spread budget across ACTIVE campaigns equally"""
    camps = api_get(f'{act_id}/campaigns', {'fields': 'id,name,status,daily_budget', 'limit': 100})
    active = [c for c in camps.get('data', []) if c['status'] == 'ACTIVE']
    
    if not active:
        return 0
    
    cap = act_cfg['budget_cap']
    if total_budget > cap:
        total_budget = cap
    
    per_c = total_budget // len(active)
    applied = 0
    
    for c in active:
        result = api_post(c['id'], {'daily_budget': per_c})
        if result.get('success'):
            applied += per_c
            log(f"  ✅ {c['name'][:40]:40s} → Rp{per_c:,}", LOG_FILE)
        else:
            log(f"  ❌ {c['name'][:40]:40s} → {result}", LOG_FILE)
    
    return applied

def get_act_cfg(act_label):
    for k, v in ACCOUNTS.items():
        if v['name'] == act_label:
            return {'id': k, 'name': v['name'], 'budget_cap': v['budget_cap']}
    return None

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--act', choices=['1041', '0858', 'all'], default='all')
    parser.add_argument('--commission', type=int, help='Total commission (bersih, exclude Belum Bayar)')
    parser.add_argument('--dry-run', action='store_true', help='Preview only, no changes')
    args = parser.parse_args()
    
    accounts_to_process = ['1041', '0858'] if args.act == 'all' else [args.act]
    baseline_state = load_baseline()
    
    for act_label in accounts_to_process:
        act_cfg = get_act_cfg(act_label)
        if not act_cfg:
            continue
        act_id = act_cfg['id']
        
        # Get 3-day spend history
        history = get_spend_history(act_id, 3)
        spend_list = list(history.values())
        avg_spend = sum(spend_list) // len(spend_list) if spend_list else 0
        yesterday_spend = spend_list[0] if spend_list else 0
        
        # Save to baseline state
        for date, spend in history.items():
            if act_label not in baseline_state:
                baseline_state[act_label] = {}
            baseline_state[act_label][date] = spend
        save_baseline(baseline_state)
        
        print(f"\n{'='*50}")
        print(f"📊 {act_label} — Daily Budget Decision")
        print(f"{'='*50}")
        print(f"\n  Spend 3 hari terakhir:")
        for date, spend in sorted(history.items()):
            print(f"    {date}: Rp {spend:,}")
        print(f"  Rata-rata: Rp {avg_spend:,}")
        print(f"  Kemarin:   Rp {yesterday_spend:,}")
        
        # Get commission
        commission = args.commission
        if not commission:
            inp = input(f"  Komisi (exclude Belum Bayar): Rp ")
            try:
                commission = int(inp.replace('.','').replace(',',''))
            except Exception:
                print(f"  ⏸️ {act_label} skipped (no commission data)")
                continue
        
        if yesterday_spend == 0 and commission == 0:
            print(f"  ⏸️ No data — skipping")
            continue
        
        # Calculate ROI using yesterday's spend
        roi = commission / yesterday_spend if yesterday_spend > 0 else 0
        
        print(f"\n  Spend kemarin: Rp {yesterday_spend:,}")
        print(f"  Komisi:        Rp {commission:,}")
        print(f"  ROI:           {roi:.2f}x")
        
        # Decision
        if roi >= 2:
            # Baseline = rata-rata 3 hari, naik 50%
            new_budget = int(avg_spend * 1.5)
            action = "🟢 NAIK 50% (ROI ≥ 2x)"
        elif roi >= 1:
            # Baseline = rata-rata 3 hari, tetap
            new_budget = avg_spend
            action = "🟡 TETAP (ROI 1x-2x)"
        else:
            # Baseline = rata-rata 3 hari, turun 50%
            new_budget = max(int(avg_spend * 0.5), 50000)
            action = f"🔴 TURUN 50% (ROI < 1x)"
        
        print(f"  Action: {action}")
        print(f"  Budget hari ini (baseline 3-hari): Rp {new_budget:,}")
        
        if args.dry_run:
            print(f"  ⏸️ DRY RUN — No changes applied")
            continue
        
        confirm = input(f"  Terapkan? (y/n): ")
        if confirm.lower() == 'y':
            applied = distribute_budget(act_id, new_budget, act_cfg)
            log(f"✅ {act_label}: Budget Rp{applied:,} | ROI {roi:.2f}x | Baseline 3d: Rp{avg_spend:,} | {action}", LOG_FILE)
        else:
            print(f"  ⏸️ Skipped.")

if __name__ == '__main__':
    main()
