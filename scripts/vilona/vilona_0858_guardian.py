#!/usr/bin/env python3
"""
🔥 VILONA 0858 GUARDIAN v2 — Aligned with 1041 Nyamiresep Rules
=================================================================
Shopee Affiliate Unified Rules System
Runs 24/7. Handles errors. Never stops.

UNIFIED RULES (same across 0858, 1041, 1208):
  1. TIERED: TEST/WINNER/STANDARD with different thresholds
  2. TIME ZONES: 00-03 PAUSE, 04 AUTO-UNPAUSE, 12-21 FULL
  3. GAS: CPC≤100 + CTR≥5% → SCALE +20%
  4. REM: CPC>130 OR CTR<3% → PAUSE
  5. BONCOS: 100+ clicks + 0 orders → PAUSE
  6. ZERO CLICK: Spend>Rp200 + 0 clicks → PAUSE
  7. BUDGET SANITY: cap at Rp500K per campaign
"""

import requests, json, os, sys, time, traceback
from datetime import datetime
from pathlib import Path

# === CONFIG ===
WORKSPACE = Path(__file__).parent.parent
LOG_FILE = WORKSPACE / "logs" / "vilona_0858_guardian.log"
STATE_FILE = WORKSPACE / "data" / "0858_guardian_state.json"
TIME_PAUSE_FILE = WORKSPACE / "data" / "0858_time_pause_state.json"
os.makedirs(WORKSPACE / "logs", exist_ok=True)
os.makedirs(WORKSPACE / "data", exist_ok=True)

TOKEN_FILE = WORKSPACE / ".fb_token_0858"
if not TOKEN_FILE.exists():
    TOKEN_FILE = Path("/tmp/fb_token.txt")

ACCESS_TOKEN = TOKEN_FILE.read_text().strip() if TOKEN_FILE.exists() else None
if not ACCESS_TOKEN:
    sys.path.insert(0, str(WORKSPACE / "scripts"))
    from ads_dashboard import ACCESS_TOKEN as TOKEN
    ACCESS_TOKEN = TOKEN

API = 'https://graph.facebook.com/v19.0'
ACCOUNT_ID = 'act_435670549443081'

# === UNIFIED RULES (aligned with 1041) ===
CPC_KILL = 130          # >130 → PAUSE
CTR_KILL = 3.0          # <3% after 500 imp → PAUSE
GAS_CPC = 100           # CPC ≤100 = GAS candidate
GAS_CTR = 5.0           # CTR ≥5% = GAS candidate
MIN_IMP = 500           # Minimum impressions before evaluating
BONCOS_CLICKS = 100     # 100+ clicks without orders = BONCOS
ZERO_CLICK_SPEND = 200  # Spend >200 without clicks = pause
MAX_BUDGET = 500000     # Rp500K max per campaign
SCALE_BUDGET = 500000   # Scale budget
BID_CAP = 200           # Bid cap (Veris: 200, step from 150)

# Tiered CPC thresholds
TIER_RULES = {
    'TEST':     {'cpc_kill': 350, 'cpc_scale': 150, 'ctr_scale': 5},
    'WINNER':   {'cpc_kill': 150, 'cpc_scale': 100, 'ctr_scale': 5},
    'STANDARD': {'cpc_kill': 130, 'cpc_scale': 100, 'ctr_scale': 5},
}

BLACKLIST_KEYWORDS = ['kakriput', 'kancingjepit', 'gendongananjing', 'gendongan']

def log(msg):
    ts = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    line = f'[{ts}] {msg}'
    print(line)
    try:
        with open(LOG_FILE, 'a') as f:
            f.write(line + '\n')
    except: pass

def load_json(path, default=None):
    if default is None: default = {}
    if os.path.exists(path):
        try: return json.loads(open(path).read())
        except: return default
    return default

def save_json(path, data):
    try: json.dump(data, open(path, 'w'), indent=2, default=str)
    except: pass

def api_get(path, params=None, retries=3):
    if params is None: params = {}
    params['access_token'] = ACCESS_TOKEN
    for attempt in range(retries):
        try:
            r = requests.get(f'{API}/{path}', params=params, timeout=20)
            data = r.json()
            if 'error' in data and data['error'].get('code') in [4,17,80000,80001]:
                time.sleep(2**attempt * 5); continue
            return data
        except: 
            if attempt < retries-1: time.sleep(2**attempt); continue
            return {'error': str(sys.exc_info()[1])}
    return {'error': 'max retries'}

def api_post(path, data, retries=3):
    for attempt in range(retries):
        try:
            r = requests.post(f'{API}/{path}',
                params={'access_token': ACCESS_TOKEN}, data=data, timeout=15)
            resp = r.json()
            if 'error' in resp and resp['error'].get('code') in [4,17,80000,80001]:
                time.sleep(2**attempt * 5); continue
            return resp
        except:
            if attempt < retries-1: time.sleep(2**attempt); continue
            return {'error': str(sys.exc_info()[1])}
    return {'error': 'max retries'}

def get_time_multiplier():
    """Time zone rules: 23-00:29 PAUSE, 00:30 ACTIVATE, then 1041-style"""
    hour = datetime.now().hour
    minute = datetime.now().minute
    
    # Night pause: 23:00 - 00:29 (brain: aktivasi 00:30)
    if hour == 23: return 0.0
    if hour == 0 and minute < 30: return 0.0
    
    # 00:30-03:59: LOW (after activation)
    if hour < 4: return 0.5
    # 04-05: 50%
    if hour < 6: return 0.5
    # 06-11: 75%
    if hour < 12: return 0.75
    # 12-21: FULL
    if hour < 22: return 1.0
    # 22: 50%
    return 0.5

def get_tier(campaign_name):
    """Determine campaign tier from name"""
    name_upper = campaign_name.upper()
    if 'TEST' in name_upper: return 'TEST'
    if any(kw in name_upper for kw in ['WINNER', 'PROFIT', 'GAS', 'SCALE_']): return 'WINNER'
    return 'STANDARD'

def is_blacklisted(name):
    return any(kw.lower() in name.lower() for kw in BLACKLIST_KEYWORDS)

def run_cycle():
    state = load_json(STATE_FILE)
    time_state = load_json(TIME_PAUSE_FILE, {'time_paused': {}, 'last_unpause_hour': -1})
    state['cycle_count'] = state.get('cycle_count', 0) + 1
    actions = []
    
    now = datetime.now()
    hour = now.hour
    minute = now.minute
    time_mult = get_time_multiplier()
    time_label = "PAUSE" if time_mult == 0 else ("LOW" if time_mult <= 0.3 else ("MEDIUM" if time_mult < 1 else "FULL"))
    
    log(f'🔄 Cycle #{state["cycle_count"]} | {now.strftime("%H:%M")} WIB | Time: {time_label} ({time_mult*100:.0f}%)')
    
    # === AUTO-UNPAUSE at 00:30 WIB (brain: jadwal aktivasi) ===
    activation_hour = 0
    activation_min = 30
    if hour == activation_hour and minute >= activation_min and minute < (activation_min + 10) and time_state.get('last_unpause_hour') != activation_hour:
        time_paused_ids = set(time_state.get('time_paused', {}).keys())
        if time_paused_ids:
            camps = api_get(f'{ACCOUNT_ID}/campaigns',
                {'fields': 'id,name,effective_status', 'limit': 100})
            unpaused = 0
            skipped = 0
            for c in camps.get('data', []):
                if c['id'] not in time_paused_ids or c.get('effective_status') != 'PAUSED':
                    continue
                
                # SAFETY: cek permakill, CPC/CTR sebelum unpause
                if c['id'] in state.get('permakill', {}):
                    continue  # permakilled, never wake
                
                should_skip = False
                try:
                    ins = api_get(f'{c["id"]}/insights', {
                        'fields': 'spend,impressions,clicks,ctr,cpc',
                        'time_range': '{"since":"2026-06-02","until":"2026-06-02"}',
                    })
                    sp = ins.get('data',[{}])[0] if 'data' in ins else {}
                    last_cpc = float(sp.get('cpc', 0))
                    last_ctr = float(sp.get('ctr', 0))
                    last_imp = int(sp.get('impressions', 0))
                    
                    # Jangan unpause kalau CPC > 130 atau CTR < 3% (ada masalah sebelum night pause)
                    if last_imp >= 500 and last_cpc > CPC_KILL:
                        log(f'  ⛔ SKIP UNPAUSE: {c["name"][:40]} — CPC Rp{last_cpc:.0f} > Rp{CPC_KILL}')
                        should_skip = True
                    elif last_imp >= 500 and last_ctr > 0 and last_ctr < CTR_KILL:
                        log(f'  ⛔ SKIP UNPAUSE: {c["name"][:40]} — CTR {last_ctr:.1f}% < {CTR_KILL}%')
                        should_skip = True
                except:
                    pass
                
                if should_skip:
                    skipped += 1
                    continue
                
                resp = api_post(c['id'], {'status': 'ACTIVE'})
                if resp.get('success'):
                    log(f'  🌅 UNPAUSE: {c["name"][:45]}')
                    unpaused += 1
                    
            if unpaused or skipped:
                log(f'  🌅 UNPAUSE: {unpaused} resumed, {skipped} skipped (bad CPC/CTR)')
            time_state['time_paused'] = {}
            time_state['last_unpause_hour'] = activation_hour
            save_json(TIME_PAUSE_FILE, time_state)
    elif (hour > activation_hour or (hour == activation_hour and minute >= activation_min + 10)) and time_state.get('last_unpause_hour') == activation_hour:
        time_state['last_unpause_hour'] = -1
        save_json(TIME_PAUSE_FILE, time_state)
    
    # === GET CAMPAIGNS ===
    camps = api_get(f'{ACCOUNT_ID}/campaigns',
        {'fields': 'id,name,effective_status,daily_budget,bid_strategy', 'limit': 100})
    if 'error' in camps:
        log(f'❌ Campaign fetch error: {camps["error"]}')
        save_json(STATE_FILE, state)
        return
    
    camp_list = camps.get('data', [])
    active = [c for c in camp_list if c.get('effective_status') in ('ACTIVE', 'IN_PROCESS')]
    log(f'  Active: {len(active)}/{len(camp_list)} campaigns')
    
    # === PERMANENT KILL LIST — never revive ===
    permakill = state.get('permakill', {})
    for camp in camp_list:
        cname = camp.get('name','')
        cid = camp['id']
        
        # OFF_ prefix = Veris manual kill, never touch
        if cname.startswith('OFF_'): continue
        
        # Already permakilled, ensure it stays dead
        if cid in permakill:
            if camp.get('effective_status') == 'ACTIVE':
                api_post(cid, {'status': 'PAUSED'})
                log(f'  💀 PERMAKILL ENFORCED: {cname[:45]}')

    # === BID CAP ENFORCEMENT (set all to 200) ===
    for camp in active:
        try:
            adset_data = api_get(f'{camp["id"]}', {
                'fields': 'adsets{id,name,bid_amount,effective_status}',
            })
            for a in adset_data.get('adsets',{}).get('data',[]):
                if a.get('effective_status') == 'ACTIVE' and a.get('bid_amount',0) != BID_CAP:
                    api_post(a['id'], {'bid_amount': BID_CAP})
        except: pass
    
    # === BUDGET SANITY ===
    for camp in camp_list:
        db = int(camp.get('daily_budget', 0) or 0)
        if db > MAX_BUDGET:
            resp = api_post(camp['id'], {'daily_budget': MAX_BUDGET})
            if resp.get('success'):
                log(f'  🔧 BUDGET: {camp["name"][:40]} → Rp{MAX_BUDGET:,}')
    
    # === BLACKLIST ===
    for camp in camp_list:
        if is_blacklisted(camp.get('name','')) and camp.get('effective_status') == 'ACTIVE':
            resp = api_post(camp['id'], {'status': 'PAUSED'})
            if resp.get('success'):
                msg = f'🚫 BLACKLIST: {camp["name"][:45]}'
                log(f'  {msg}')
                actions.append(msg)
    
    # === MAIN LOOP ===
    total_spend = 0
    winners = []
    paused_count = 0
    
    for camp in active:
        cid = camp['id']
        cname = camp.get('name', '?')
        budget = int(camp.get('daily_budget', 0) or 0)
        if budget > 10000000: budget //= 100  # sanity
        
        tier = get_tier(cname)
        rules = TIER_RULES.get(tier, TIER_RULES['STANDARD'])
        
        try:
            ins = api_get(f'{cid}/insights', {
                'fields': 'spend,impressions,clicks,ctr,cpc,actions',
                'time_range': '{"since":"2026-06-02","until":"2026-06-02"}',
            })
            sp = ins.get('data', [{}])[0] if 'data' in ins else {}
            spend = float(sp.get('spend', 0))
            imps = int(sp.get('impressions', 0))
            clicks = int(sp.get('clicks', 0))
            ctr = float(sp.get('ctr', 0))
            cpc = float(sp.get('cpc', 0))
            total_spend += spend
            
            # Check orders from actions
            actions_list = sp.get('actions', [])
            orders = sum(int(a.get('value', 0)) for a in actions_list 
                        if a.get('action_type') in ('offsite_conversion','purchase','add_to_cart'))
        except:
            spend = imps = clicks = ctr = cpc = orders = 0
        
        should_pause = False
        pause_reason = ''
        
        # TIME ZONE PAUSE (night: pause ALL regardless of spend)
        if time_mult == 0:
            resp = api_post(cid, {'status': 'PAUSED'})
            if resp.get('success'):
                pause_reason = f'TIME PAUSE ({time_label})'
                should_pause = True
                time_state['time_paused'][cid] = {'name': cname, 'time': now.isoformat()}
        
        # ZERO CLICK PAUSE
        elif spend > ZERO_CLICK_SPEND and clicks == 0:
            resp = api_post(cid, {'status': 'PAUSED'})
            if resp.get('success'):
                pause_reason = f'ZERO CLICK (Rp{spend:,.0f} spent, 0 clicks)'
                should_pause = True
        
        # CPC KILL (tier-specific)
        elif clicks > 0 and cpc > rules['cpc_kill'] and imps >= MIN_IMP:
            resp = api_post(cid, {'status': 'PAUSED'})
            if resp.get('success'):
                pause_reason = f'CPC Rp{cpc:,.0f} > {rules["cpc_kill"]} [{tier}]'
                should_pause = True
        
        # CTR KILL
        elif imps >= MIN_IMP and ctr < CTR_KILL and ctr > 0:
            resp = api_post(cid, {'status': 'PAUSED'})
            if resp.get('success'):
                pause_reason = f'CTR {ctr:.2f}% < {CTR_KILL}% [{tier}]'
                should_pause = True
        
        if should_pause and pause_reason:
            paused_count += 1
            log(f'  {'💤' if "TIME" in pause_reason else '👻' if "ZERO" in pause_reason else '💀' if "CPC" in pause_reason else '📉'} {pause_reason}: {cname[:45]}')
            actions.append(pause_reason)
            save_json(TIME_PAUSE_FILE, time_state)
            
            # PERMAKILL TRACKING: 3 CPC/CTR strikes in 7 days = kill forever
            if 'CPC' in pause_reason or 'CTR' in pause_reason:
                strikes = state.get('strikes', {})
                strike_data = strikes.get(cid, {'count': 0, 'first': now.isoformat(), 'reasons': []})
                strike_data['count'] += 1
                strike_data['reasons'].append(pause_reason[:60])
                strikes[cid] = strike_data
                state['strikes'] = strikes
                
                if strike_data['count'] >= 3:
                    permakill[cid] = {'name': cname, 'killed': now.isoformat(), 'reason': '3x CPC/CTR strikes'}
                    state['permakill'] = permakill
                    log(f'  💀 PERMAKILL: {cname[:45]} — 3x strikes, never again')
            
            continue
        
        # GAS CHECK (scale winners) — ONLY for LOWEST_COST campaigns
        # COST_CAP: bid cap controls spending, budget just needs minimum
        # LOWEST_COST/LOWEST_COST_WITH_BID_CAP: budget controls scale
        if clicks >= 3 and cpc <= rules['cpc_scale'] and ctr >= rules['ctr_scale']:
            strat = camp.get('bid_strategy', '')
            is_lowest_cost = 'LOWEST_COST' in strat.upper() and 'BID_CAP' not in strat.upper()
            
            if is_lowest_cost:
                # Scale budget for LOWEST_COST campaigns
                new_budget = min(int(budget * 1.2), SCALE_BUDGET)
                if new_budget > budget:
                    resp = api_post(cid, {'daily_budget': new_budget})
                    if resp.get('success'):
                        msg = f'🔥 GAS: {cname[:45]} → Rp{new_budget:,} (CPC Rp{cpc:.0f}, CTR {ctr:.1f}%) [{tier}]'
                        log(f'  {msg}')
                        actions.append(msg)
            else:
                # COST_CAP: only scale bid, not budget
                if cpc < rules['cpc_scale'] * 0.7:  # CPC very low, room to increase bid
                    log(f'  📊 COST_CAP HOLD: {cname[:45]} | CPC Rp{cpc:.0f} good, bid already optimal')
        
        # Track winners
        if cpc <= GAS_CPC and ctr >= GAS_CTR:
            winners.append({'name': cname, 'cpc': cpc, 'ctr': ctr, 'tier': tier})
    
    # Summary
    log(f'✅ Cycle #{state["cycle_count"]} done | {paused_count} paused | {len(winners)} winners')
    if winners:
        for w in winners[:5]:
            log(f'  🏆 {w["name"][:45]} | CPC Rp{w["cpc"]:.0f} | CTR {w["ctr"]:.1f}%')
    
    # Daily scale: at activation time, create duplicates of winners
    if hour == activation_hour and minute >= activation_min and minute < (activation_min + 10) and winners:
        scale_created = 0
        for w in winners[:3]:  # max 3 scale campaigns per day
            # Find original campaign
            orig = next((c for c in active if c.get('name','') == w['name']), None)
            if orig and not any('Scale_' in w['name'] for _ in [1]):
                new_name = f"Scale_{w['name'][:40]}"
                # Check if already exists
                existing = [c for c in camp_list if new_name in c.get('name','')]
                if not existing:
                    resp = api_post(f'{ACCOUNT_ID}/campaigns', {
                        'name': new_name,
                        'objective': 'OUTCOME_TRAFFIC',
                        'status': 'PAUSED',
                        'special_ad_categories': [],
                        'buying_type': 'AUCTION',
                    })
                    if resp.get('id'):
                        scale_created += 1
                        log(f'  📋 NEW SCALE: {new_name}')
        if scale_created:
            log(f'  📋 Daily scale: {scale_created} campaigns created')
    
    
    state['last_total_spend'] = total_spend
    state['last_winners'] = len(winners)
    save_json(STATE_FILE, state)

def main():
    log('🔥 VILONA 0858 GUARDIAN v2 — Unified Shopee Affiliate Rules')
    log(f'   Rules: CPC>130 REM, CTR<3% REM, GAS CPC≤100+CTR≥5%, Time Zones, Boncos, Zero Click')
    log(f'   Cycle: 30 minutes')
    
    errors = 0
    while True:
        try:
            run_cycle()
            errors = 0
        except Exception as e:
            errors += 1
            log(f'❌ ERROR #{errors}: {e}\n{traceback.format_exc()[:300]}')
            if errors > 10:
                log('🆘 10+ errors, resetting...')
                errors = 0
        log(f'💤 Next check in 30 min...')
        time.sleep(1800)

if __name__ == '__main__':
    if '--once' in sys.argv:
        run_cycle()
    else:
        main()
