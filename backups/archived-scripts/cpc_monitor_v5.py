#!/usr/bin/env python3
"""
CPC Monitor v5 — Minimal API Calls
- 2 GET calls total (1 per account: campaigns + insights combined)
- POST only when action needed (pause/reactivate/budget)
- All data from ONE account-level insights call

~4 API calls per cycle (was 10-15)
"""
import json, requests, sys, os, re
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from meta_base import TOKEN, api_get, api_post, log, ACCOUNTS

STATE_FILE = '/tmp/cpc_monitor_state.json'
LOG_FILE = os.path.join(os.path.dirname(__file__), '..', 'logs', 'cpc_monitor.log')
DEFAULT_BUDGET = 500000
CPC_LIMIT = 150; COOLING_MIN = 60; DEATH_LIMIT = 2
CTR_OK = 3.0; CTR_WARN = 3.5

def load_state():
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE) as f:
            return json.load(f)
    return {'paused': {}, 'death_count': {}}

def save_state(s):
    os.makedirs(os.path.dirname(STATE_FILE), exist_ok=True)
    with open(STATE_FILE, 'w') as f:
        json.dump(s, f)

def clean_name(n):
    for p in ['DEAD_','OFF_','OFF','PAUSED_','P1_','P2_','CPC178_']:
        if n.startswith(p): n = n[len(p):]
    return n.strip('_ ')

def process_account(act_id, label, state):
    """One GET call: account-level insights = all campaign data"""
    now = datetime.now()
    
    # SINGLE API CALL: get all campaign data today
    data = api_get(f'{act_id}/insights', {
        'fields': 'campaign_id,campaign_name,spend,cpc,ctr,impressions,clicks',
        'date_preset': 'today', 'level': 'campaign', 'limit': 100
    })
    rows = data.get('data', [])
    
    # Build lookup
    today_data = {}
    for d in rows:
        cid = d.get('campaign_id', '')
        if cid:
            today_data[cid] = d
    
    # Get list of ALL campaigns (names + status + budget)
    camps = api_get(f'{act_id}/campaigns', {'fields': 'id,name,status,daily_budget', 'limit': 100})
    all_camps = camps.get('data', [])
    
    active = [c for c in all_camps if c['status'] == 'ACTIVE']
    paused = [c for c in all_camps if c['status'] == 'PAUSED']
    active_ids = {c['id'] for c in active}
    
    log(f"\n── {label} — {len(active)} active, {len(paused)} paused ──", LOG_FILE)
    
    # STEP 1: Check ACTIVE campaigns for CPC > limit
    for c in active:
        cid = c['id']; cname = c['name']
        d = today_data.get(cid)
        
        if not d:
            log(f"  ⏳ {cname[:45]:45s} | No data yet", LOG_FILE)
            # Ensure budget
            cur = int(c.get('daily_budget', 0))
            if cur != DEFAULT_BUDGET:
                api_post(cid, {'daily_budget': DEFAULT_BUDGET})
                log(f"  💰 Budget: {cur:,} → {DEFAULT_BUDGET:,}", LOG_FILE)
            continue
        
        cpc = float(d.get('cpc', 0)); ctr = float(d.get('ctr', 0))
        impr = int(d.get('impressions', 0)); spend = int(float(d.get('spend', 0)))
        
        if impr == 0 or cpc == 0:
            log(f"  ⏳ {cname[:45]:45s} | No impressions yet", LOG_FILE)
            continue
        
        if cpc > CPC_LIMIT:
            # PAUSE
            dc = state.get('death_count', {}).get(cid, 0) + 1
            state['death_count'][cid] = dc
            if 'paused' not in state: state['paused'] = {}
            state['paused'][cid] = {
                'paused_at': now.isoformat(), 'cpc': cpc, 'ctr': ctr,
                'death_count': dc, 'account': label, 'name': cname
            }
            result = api_post(cid, {
                'name': f'PAUSED_CPC{cpc:.0f}_{clean_name(cname)}'[:50],
                'status': 'PAUSED'
            })
            if result.get('success'):
                log(f"🛑 PAUSED: {cname[:40]} | CPC {cpc:.0f} | Strike {dc}", LOG_FILE)
        else:
            log(f"  ✅ {cname[:45]:45s} | CPC {cpc:>5.0f} | CTR {ctr:>5.2f}% | Rp{spend:,}", LOG_FILE)
            # Ensure budget
            cur = int(c.get('daily_budget', 0))
            if cur != DEFAULT_BUDGET:
                api_post(cid, {'daily_budget': DEFAULT_BUDGET})
    
    # STEP 2: Check DEAD/OFF campaigns that might have recovered (from today's data)
    for c in paused:
        cid = c['id']; cname = c['name']
        
        if not any(p in cname for p in ['DEAD','OFF']):
            continue
        if cid in state.get('paused', {}):
            continue
        
        d = today_data.get(cid)
        if not d: continue
        
        cpc = float(d.get('cpc', 0)); ctr = float(d.get('ctr', 0))
        impr = int(d.get('impressions', 0))
        
        if impr > 0 and cpc > 0 and cpc <= CPC_LIMIT and ctr >= CTR_OK:
            nname = f"CBO_ON_{clean_name(cname)}"[:50]
            r = api_post(cid, {'name': nname, 'status': 'ACTIVE', 'daily_budget': DEFAULT_BUDGET})
            if r.get('success'):
                log(f"🔄 DEAD→CBO_ON: {cname[:35]:35s} | CPC {cpc:.0f} | CTR {ctr:.2f}%", LOG_FILE)
    
    # STEP 3: Reactivate cooled-off paused campaigns
    for cid, info in list(state.get('paused', {}).items()):
        if info.get('account') != label: continue
        if info.get('death_count', 1) > DEATH_LIMIT: continue
        
        paused_at = datetime.fromisoformat(info['paused_at'])
        if (now - paused_at).total_seconds() / 60 < COOLING_MIN: continue
        
        d = today_data.get(cid)
        if not d: continue
        
        cpc = float(d.get('cpc', 0)); ctr = float(d.get('ctr', 0))
        impr = int(d.get('impressions', 0))
        if impr == 0 or cpc == 0: continue
        
        if cpc <= CPC_LIMIT and ctr >= CTR_OK:
            nname = f"CBO_ON_{clean_name(info.get('name',''))}"[:50]
            r = api_post(cid, {'name': nname, 'status': 'ACTIVE', 'daily_budget': DEFAULT_BUDGET})
            if r.get('success'):
                del state['paused'][cid]
                log(f"🟡 REACTIVATE: {info['name'][:30]} | CPC {cpc:.0f}", LOG_FILE)
        else:
            nname = f"DEAD_{clean_name(info.get('name',''))}"[:50]
            api_post(cid, {'name': nname, 'status': 'PAUSED'})
            del state['paused'][cid]
            log(f"💀 DEAD: {info['name'][:30]} | CPC {cpc:.0f} > 150", LOG_FILE)

def main():
    state = load_state()
    log("🚀 CPC MONITOR v5 — Minimal API", LOG_FILE)
    
    for act_id, cfg in ACCOUNTS.items():
        process_account(act_id, cfg['name'], state)
    
    save_state(state)
    log("✅ Done", LOG_FILE)

if __name__ == '__main__':
    main()
