#!/usr/bin/env python3
"""
CPC Monitor v3 — Multi-Account (1041 + 0858)
Every 5 min: Check CPC, pause bad, reactivate recovered, redistribute budget, alert.

Robust, Reusable, Applicable.
"""
import json, requests, sys, os, re
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from meta_base import TOKEN, api_get, api_post, log, ACCOUNTS

# ─── CONFIG ───
STATE_FILE = '/tmp/cpc_monitor_state.json'
LOG_FILE = os.path.join(os.path.dirname(__file__), '..', 'logs', 'cpc_monitor.log')

CPC_LIMIT = 150      # Pause when CPC > 150 (was 130 — too tight)
COOLING_MIN = 60      # Wait 1h before reactivation
DEATH_LIMIT = 2       # Max strikes before permanent DEAD

# Reactivation thresholds
GAS_CPC = 100    # CPC ≤ 100 + CTR ≥ 5% → GAS
OK_CPC = 130     # CPC 100-130 + CTR > 3% → REACTIVE
WARN_CPC = 150   # CPC 130-150 + CTR > 3.5% → cautious (was 5%)
CTR_GAS = 5.0
CTR_OK = 3.0
CTR_WARN = 3.5   # Lowered from 5.0 — more tolerant for borderline

# ─── STATE ───
def load_state():
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE) as f:
            return json.load(f)
    return {'paused': {}, 'death_count': {}}

def save_state(state):
    os.makedirs(os.path.dirname(STATE_FILE), exist_ok=True)
    with open(STATE_FILE, 'w') as f:
        json.dump(state, f)

def get_insights(cid):
    data = api_get(f'{cid}/insights', {'fields': 'spend,cpc,ctr,impressions,clicks', 'date_preset': 'today', 'limit': 1})
    rows = data.get('data', [])
    return rows[0] if rows else None

def alert(msg):
    print(f"📱 ALERT: {msg}")

# ─── PAUSE ───
def check_and_pause(cid, cname, act_label, state):
    insights = get_insights(cid)
    if not insights:
        return False
    
    spend = int(float(insights.get('spend', 0)))
    cpc = float(insights.get('cpc', 0))
    ctr = float(insights.get('ctr', 0))
    impr = int(insights.get('impressions', 0))
    
    if impr == 0:
        return False
    
    if cpc > CPC_LIMIT:
        dc = state.get('death_count', {}).get(cid, 0) + 1
        if 'death_count' not in state: state['death_count'] = {}
        state['death_count'][cid] = dc
        if 'paused' not in state: state['paused'] = {}
        state['paused'][cid] = {
            'paused_at': datetime.now().isoformat(),
            'cpc_when_paused': cpc,
            'ctr_when_paused': ctr,
            'spend_when_paused': spend,
            'death_count': dc,
            'account': act_label,
            'name': cname
        }
        
        new_name = f'P{dc}_CPC{cpc:.0f}_{cname.replace(" ","_")[:30]}'
        result = api_post(cid, {'name': new_name, 'status': 'PAUSED'})
        if result.get('success'):
            log(f"🛑 [{act_label}] PAUSED: {cname} | CPC {cpc:.0f} | Strike {dc} | Saved Rp{spend:,}", LOG_FILE)
            if dc >= DEATH_LIMIT:
                alert(f"💀 [{act_label}] {cname} DEAD — {dc}x pause, CPC {cpc:.0f}")
            return spend
    else:
        log(f"  ✅ [{act_label}] {cname[:45]:45s} | CPC {cpc:>5.0f} | CTR {ctr:>5.2f}%", LOG_FILE)
    
    return False

# ─── REACTIVATE ───
def check_and_reactivate(state):
    now = datetime.now()
    for cid, info in list(state.get('paused', {}).items()):
        dc = info.get('death_count', 1)
        paused_at = datetime.fromisoformat(info['paused_at'])
        mins = (now - paused_at).total_seconds() / 60
        label = info.get('account', '?')
        name = info.get('name', cid)
        
        if dc > DEATH_LIMIT:
            continue
        if mins < COOLING_MIN:
            continue
        
        insights = get_insights(cid)
        if not insights:
            continue
        
        cpc = float(insights.get('cpc', 0))
        ctr = float(insights.get('ctr', 0))
        impr = int(insights.get('impressions', 0))
        
        if impr == 0 or cpc == 0:
            continue
        
        if cpc <= GAS_CPC and ctr >= CTR_GAS:
            api_post(cid, {'status': 'ACTIVE'})
            del state['paused'][cid]
            log(f"🟢 [{label}] GAS: {name} | CPC {cpc:.0f} | CTR {ctr:.2f}%", LOG_FILE)
            alert(f"🟢 [{label}] {name} REACTIVATED — CPC {cpc:.0f}")
        elif cpc <= OK_CPC and ctr >= CTR_OK:
            api_post(cid, {'status': 'ACTIVE'})
            del state['paused'][cid]
            log(f"🟡 [{label}] REACTIVATE: {name} | CPC {cpc:.0f} | CTR {ctr:.2f}%", LOG_FILE)
        elif cpc <= WARN_CPC and ctr >= CTR_WARN:
            api_post(cid, {'status': 'ACTIVE'})
            del state['paused'][cid]
            log(f"⚠️ [{label}] CAUTIOUS: {name} | CPC {cpc:.0f}", LOG_FILE)
        else:
            new_name = f'DEAD_CPC{cpc:.0f}_{name.replace("P1_","").replace("P2_","").replace(" ","_")[:25]}'
            api_post(cid, {'name': new_name, 'status': 'PAUSED'})
            del state['paused'][cid]
            log(f"💀 [{label}] DEAD: {name} | CPC {cpc:.0f} > 130 after {COOLING_MIN}m", LOG_FILE)
            alert(f"💀 [{label}] {name} CONFIRMED DEAD — CPC {cpc:.0f}")

# ─── BUDGET REDISTRIBUTION ───
def redistribute_budget(state):
    for act_id, act_cfg in ACCOUNTS.items():
        label = act_cfg['name']
        
        freed = 0
        for info in state.get('paused', {}).values():
            if info.get('account') == label:
                freed += info.get('spend_when_paused', 0)
        
        if freed < 1000:
            continue
        
        camps = api_get(f'{act_id}/campaigns', {'fields': 'id,name,status,daily_budget', 'limit': 50})
        active = [c for c in camps.get('data', []) if c['status'] == 'ACTIVE']
        
        if not active:
            continue
        
        current = sum(int(c.get('daily_budget', 0)) for c in active)
        cap = act_cfg['budget_cap']
        new_total = min(current + freed, cap)
        freed_actual = new_total - current
        
        if freed_actual < 1000:
            continue
        
        per_c = freed_actual // len(active)
        for c in active:
            old = int(c.get('daily_budget', 0))
            result = api_post(c['id'], {'daily_budget': old + per_c})
            if result.get('success'):
                log(f"💰 [{label}] {c['name'][:30]}: Rp{old:,} → Rp{old+per_c:,}", LOG_FILE)
        
        log(f"💰 [{label}] Total redistributed: Rp{freed_actual:,}", LOG_FILE)

# ─── MAIN ───
def main():
    state = load_state()
    log("=" * 50, LOG_FILE)
    log("🚀 CPC MONITOR v3 — Multi-Account", LOG_FILE)
    
    for act_id, act_cfg in ACCOUNTS.items():
        camps = api_get(f'{act_id}/campaigns', {'fields': 'id,name,status,daily_budget', 'limit': 100})
        active = [c for c in camps.get('data', []) if c['status'] == 'ACTIVE']
        log(f"\n── {act_cfg['name']} — {len(active)} active ──", LOG_FILE)
        
        total_freed = 0
        for c in active:
            freed = check_and_pause(c['id'], c['name'], act_cfg['name'], state)
            if freed:
                total_freed += freed
        
        if total_freed > 0:
            redistribute_budget(state)
    
    check_and_reactivate(state)
    save_state(state)
    log("✅ Monitor complete", LOG_FILE)

if __name__ == '__main__':
    main()
