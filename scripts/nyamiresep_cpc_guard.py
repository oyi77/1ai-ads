#!/usr/bin/env python3
"""Nyamiresep CPC Guardian — 15-min interval monitor for act_380721031313330"""
import requests, json, time, os, sys
from datetime import datetime
from pathlib import Path

# === CONFIG ===
ACCOUNT = 'act_380721031313330'
TEST_CPC_LIMIT = 200
WINNER_CPC_LIMIT = 150
MIN_CLICKS_FOR_JUDGMENT = 3  # need at least 3 clicks to judge CPC
LOG_FILE = Path(__file__).parent.parent / 'logs' / 'nyamiresep_cpc_guard.log'
TOKEN_FILE = Path(__file__).parent.parent / '.env'

def get_token():
    with open(TOKEN_FILE) as f:
        for line in f:
            if line.startswith('META_ACCESS_TOKEN='):
                return line.split('=', 1)[1].strip()
    return None

def log(msg):
    ts = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    line = f"[{ts}] {msg}"
    print(line)
    LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(LOG_FILE, 'a') as f:
        f.write(line + '\n')

def api(endpoint, params=None, method='GET', data=None):
    if params is None:
        params = {}
    params['access_token'] = TOKEN
    params['limit'] = 200
    if method == 'GET':
        r = requests.get(f'https://graph.facebook.com/v19.0/{endpoint}', params=params, timeout=15)
    else:
        r = requests.post(f'https://graph.facebook.com/v19.0/{endpoint}', params=params, json=data, timeout=15)
    return r.json()

def pause_campaign(cid, name, reason):
    """Pause a campaign with reason"""
    r = requests.post(
        f'https://graph.facebook.com/v19.0/{cid}',
        params={'access_token': TOKEN},
        json={'status': 'PAUSED'},
        timeout=10
    )
    resp = r.json()
    if resp.get('success'):
        log(f"🛑 PAUSED: {name} — {reason}")
        return True
    else:
        err = resp.get('error', {}).get('message', 'Unknown')
        log(f"❌ FAILED to pause {name}: {err}")
        return False

TOKEN = get_token()
if not TOKEN:
    log("FATAL: No META_ACCESS_TOKEN")
    sys.exit(1)

log("=" * 60)
log("NYAMIRESEP CPC GUARDIAN STARTED")
log(f"  TEST limit: Rp {TEST_CPC_LIMIT} | WINNER limit: Rp {WINNER_CPC_LIMIT} | Min clicks: {MIN_CLICKS_FOR_JUDGMENT}")

# 1. Get today's insights + current campaign status
insights = api(f'{ACCOUNT}/insights', {
    'level': 'campaign',
    'fields': 'campaign_id,campaign_name,spend,impressions,clicks,inline_link_clicks,cpc,ctr',
    'time_range': json.dumps({'since': '2026-06-03', 'until': '2026-06-03'}),
})

campaigns = api(f'{ACCOUNT}/campaigns', {'fields': 'id,name,status,effective_status'})
camp_status = {c['id']: c for c in campaigns.get('data', [])}

paused_count = 0
total_good_cpc = 0
total_spend = 0
total_clicks = 0

if 'data' not in insights:
    log("No insight data yet")
    sys.exit(0)

# Only show active campaigns with spend
active_insights = []
for ins in insights['data']:
    cid = ins.get('campaign_id', '')
    c_stat = camp_status.get(cid, {}).get('effective_status', 'UNKNOWN')
    spend = float(ins.get('spend', 0))
    if c_stat == 'ACTIVE' and spend > 0:
        active_insights.append(ins)

if not active_insights:
    log("No active campaigns with spend yet")
else:
    log(f"\n{'CAMPAIGN':<50} {'SPEND':>9} {'CLK':>5} {'CPC':>7} {'CTR':>6} {'TYPE':>7} STATUS")
    log("-" * 96)
    
    for ins in active_insights:
        cid = ins.get('campaign_id', '')
        name = ins.get('campaign_name', '?')
        spend = float(ins.get('spend', 0))
        clicks = int(ins.get('inline_link_clicks', 0))
        cpc = float(ins.get('cpc', 0)) if ins.get('cpc') else (spend / clicks if clicks > 0 else 0)
        ctr = float(ins.get('ctr', 0)) if ins.get('ctr') else 0
        
        total_spend += spend
        total_clicks += clicks
        
        # Classify
        name_lower = name.lower()
        if 'bidcap' in name_lower or 'winner' in name_lower:
            ctype = 'WINNER'
            limit = WINNER_CPC_LIMIT
        else:
            ctype = 'TEST'
            limit = TEST_CPC_LIMIT
        
        # Judge
        over = (cpc > limit and clicks >= MIN_CLICKS_FOR_JUDGMENT)
        
        if over:
            reason = f"CPC Rp {cpc:,.0f} > {ctype} limit Rp {limit:,} ({clicks} clicks)"
            if pause_campaign(cid, name, reason):
                paused_count += 1
            status = '🛑 PAUSED'
        elif clicks < MIN_CLICKS_FOR_JUDGMENT:
            status = '⏳ WAIT'
        else:
            status = '✅ OK'
            total_good_cpc += 1
        
        cpc_str = f"Rp {cpc:,.0f}" if cpc > 0 else "-"
        log(f"{name[:49]:<50} Rp {spend:>7,.0f} {clicks:>5} {cpc_str:>7} {ctr:>5.1f}% {ctype:>7} {status}")
    
    log("-" * 96)
    avg_cpc = total_spend / total_clicks if total_clicks > 0 else 0
    log(f"{'TOTAL':<50} Rp {total_spend:>7,.0f} {total_clicks:>5} Rp {avg_cpc:>5,.0f}")

log(f"RESULT: ✅ {total_good_cpc} OK | 🛑 {paused_count} paused")

# 2. Also check: is OFF_TC_Stikerkeramik still running?
for cid, c in camp_status.items():
    if 'stikerkeramik' in c.get('name', '').lower() and c.get('effective_status') == 'ACTIVE':
        log(f"🚨 WARNING: Stikerkeramik campaign STILL ACTIVE: {c['name']} {cid}")
        pause_campaign(cid, c['name'], "OFF_ prefix — auto-kill by guardian")

log("GUARDIAN CYCLE COMPLETE")
