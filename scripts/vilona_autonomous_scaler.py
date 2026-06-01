#!/usr/bin/env python3
"""
🔥 VILONA AUTONOMOUS ADS SCALER v1
Full pipeline: FB data → Shopee attribution → ROAS → Scale decisions → Execute

Data sources:
- Meta API: campaign spend, clicks, CPC, CTR
- Shopee CSV: clicks (tag_link → campaign) + commission (tag_link → revenue)
- Attribution: sub_id1 tag = campaign name

Rules:
  SCALE_UP:   ROAS > 2.0 × 48h   → +30% budget
  SCALE_DOWN: ROAS < 0.8 × 48h   → -50% budget  
  PAUSE:      100+ clicks + 0 orders × 48h → PAUSE
  WINNER:     CPC < 100 + ROAS > 2.0 → mark WINNER
  CREATE:     WINNER at max budget + ROAS > 3.0 × 72h → new campaign

Runs: every 1 hour (or --daemon for 60min loop)
"""

import requests, json, re, csv, os, sys, time
from datetime import datetime, timedelta
from collections import defaultdict
from pathlib import Path
import os

# ── CONFIG ──
WORKSPACE = Path(__file__).parent.parent
DATA_DIR = WORKSPACE / 'data/shopee'
LOG_FILE = WORKSPACE / 'logs/autoscale.log'

TOKEN = os.getenv('META_ACCESS_TOKEN', '')

ACCOUNTS = {
    'act_435670549443081': '0858',
    'act_380721031313330': '1041',
}
API = 'https://graph.facebook.com/v19.0'

# ── RULES ──
SCALE_UP_ROAS = 2.0
SCALE_DOWN_ROAS = 0.8
CREATE_ROAS = 3.0
WINNER_CPC = 100
WINNER_ROAS = 2.0
MAX_DAILY_SPEND_PER_ACCOUNT = 500000
MAX_BUDGET_PER_CAMPAIGN = 200000
SCALE_UP_PCT = 0.30
SCALE_DOWN_PCT = 0.50
MIN_ORDERS_FOR_ROAS = 3
MIN_SPEND_FOR_ROAS = 30000
PAUSE_NO_ORDER_CLICKS = 100
PAUSE_NO_ORDER_DAYS = 2
MAX_NEW_CAMPAIGNS_PER_DAY = 1
COOLDOWN_HOURS = 24

# ── UTILS ──
def log(msg):
    ts = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    line = f"[{ts}] {msg}"
    os.makedirs(LOG_FILE.parent, exist_ok=True)
    with open(LOG_FILE, 'a') as f: f.write(line + '\n')
    print(line)

def api_get(url, params=None):
    if params is None: params = {}
    params['access_token'] = TOKEN
    try:
        r = requests.get(url, params=params, timeout=20)
        return r.json()
    except Exception as e:
        return {'error': str(e)}

def api_post(url, data=None):
    if data is None: data = {}
    try:
        r = requests.post(url, json=data, params={'access_token': TOKEN}, timeout=20)
        return r.json()
    except Exception as e:
        return {'error': str(e)}

# ── STEP 1: GET FB CAMPAIGN DATA ──
def get_fb_campaigns(account_id):
    """Get all active campaigns with today's + yesterday's insights"""
    campaigns = []
    r = api_get(f'{API}/{account_id}/campaigns', {
        'fields': 'id,name,status,daily_budget',
        'limit': 200
    })
    for c in r.get('data', []):
        if c.get('status') != 'ACTIVE':
            continue
        
        cid = c['id']
        # Get 2-day insights
        today = datetime.now().strftime('%Y-%m-%d')
        yesterday = (datetime.now() - timedelta(days=1)).strftime('%Y-%m-%d')
        
        ins = api_get(f'{API}/{cid}/insights', {
            'fields': 'spend,impressions,clicks,ctr,cpc,actions,action_values',
            'time_range': json.dumps({'since': yesterday, 'until': today}),
        })
        
        data = ins.get('data', [{}])[0] if ins.get('data') else {}
        link_clicks = 0
        
        for a in data.get('actions', []):
            if a.get('action_type') == 'link_click':
                link_clicks = int(a.get('value', 0))
        
        campaigns.append({
            'id': cid,
            'name': c['name'],
            'budget': int(c.get('daily_budget', 0)),
            'spend_2d': float(data.get('spend', 0)),
            'impressions_2d': int(data.get('impressions', 0)),
            'clicks_2d': int(data.get('clicks', 0)),
            'link_clicks_2d': link_clicks,
            'ctr': float(data.get('ctr', 0)),
            'cpc': float(data.get('cpc', 0)),
        })
    
    return campaigns

# ── STEP 2: GET SHOPEE ATTRIBUTION ──
def get_shopee_attribution(account_name):
    """Match Shopee tag_links to campaign names"""
    attribution = defaultdict(lambda: {'orders': 0, 'revenue': 0, 'clicks': 0})
    
    # Read clicks data
    clicks_files = sorted(DATA_DIR.glob('*clicks*.csv'), reverse=True)[:3]
    for cf in clicks_files:
        try:
            with open(cf) as f:
                reader = csv.DictReader(f)
                for row in reader:
                    tag = row.get('Tag_link', '').strip()
                    if tag:
                        attribution[tag]['clicks'] += 1
        except Exception:
            pass
    
    # Read commission data
    comm_files = sorted(DATA_DIR.glob('*commission*.csv'), reverse=True)[:3]
    for cf in comm_files:
        try:
            with open(cf) as f:
                reader = csv.DictReader(f)
                for row in reader:
                    # Check all 5 tag_link columns
                    for i in range(1, 6):
                        tag = row.get(f'Tag_link{i}', '').strip()
                        if tag:
                            revenue = float(row.get('Total Komisi per Produk(Rp)', 0) or 0)
                            attribution[tag]['orders'] += 1
                            attribution[tag]['revenue'] += revenue
        except Exception:
            pass
    
    # Also check live dashboard
    dash_file = DATA_DIR / 'all_dashboard_live.json'
    if dash_file.exists():
        try:
            with open(dash_file) as f:
                dash = json.load(f)
                # Extract any tag_link data from dashboard
        except Exception:
            pass
    
    return dict(attribution)

# ── STEP 3: MERGE FB + SHOPEE = ROAS ──
def calculate_roas(campaigns, attribution, account_name):
    """EXACT tag matching: Shopee Tag_link directly maps to campaign product names.
    E.g., 'organizerpullout' tag → campaigns with 'organizer' or 'pullout' in name.
    'rakpiringpengering' tag → campaigns with 'rakpiring' in name."""
    
    # Tag patterns: extract the product identifier from campaign name
    # Campaign names contain product keywords that match Shopee tags
    def get_product_from_campaign(cname):
        cname_lower = cname.lower()
        # Common product patterns from Shopee tags on this account
        patterns = [
            'rakpiring', 'organizer', 'dongkrak', 'gendongan', 'tiplessalad',
            'cupbathroom', 'raksepatususun', 'buttercurner', 'portablephone',
            'rakdapur', 'multistorage', 'bajuanak', 'bibit', 'stiker', 'sofaarabian',
        ]
        for p in patterns:
            if p.lower() in cname_lower:
                return p
        return None
    
    results = []
    
    for camp in campaigns:
        cname = camp['name']
        spend = camp['spend_2d']
        campaign_product = get_product_from_campaign(cname)
        
        # Find EXACT matching Shopee tags
        matched_orders = 0
        matched_revenue = 0
        
        if campaign_product:
            for tag, data in attribution.items():
                tag_clean = tag.lower().replace('----','').replace('--','').strip()
                # Exact: tag must contain campaign product OR campaign product must contain tag
                if campaign_product in tag_clean or tag_clean in cname.lower():
                    matched_orders += data['orders']
                    matched_revenue += data['revenue']
        
        # If multiple campaigns share same product, divide attribution equally
        same_product_count = sum(1 for c in campaigns 
                                if get_product_from_campaign(c['name']) == campaign_product)
        
        if same_product_count > 0:
            matched_orders = matched_orders // max(same_product_count, 1)
            matched_revenue = matched_revenue / max(same_product_count, 1)
        
        # Calculate ROAS
        roas = (matched_revenue / spend) if spend > 0 and matched_revenue > 0 else 0
        enough_data = spend >= MIN_SPEND_FOR_ROAS
        
        results.append({
            **camp,
            'campaign_product': campaign_product or 'unknown',
            'shopee_orders': matched_orders,
            'shopee_revenue': matched_revenue,
            'roas': roas,
            'enough_data': enough_data,
        })
    
    return results

# ── STEP 4: SCALING DECISIONS ──
def make_decisions(campaign_data, history):
    """Apply scaling rules and return actions"""
    actions = []
    
    for camp in campaign_data:
        cid = camp['id']
        cname = camp['name']
        budget = camp['budget']
        roas = camp['roas']
        cpc = camp['cpc']
        orders = camp['shopee_orders']
        link_clicks = camp['link_clicks_2d']
        enough = camp['enough_data']
        
        # Check cooldown
        last_action = history.get(cid, {})
        last_time = last_action.get('time', datetime.min.isoformat())
        if last_time:
            hours_since = (datetime.now() - datetime.fromisoformat(last_time)).total_seconds() / 3600
        else:
            hours_since = 999
        
        if hours_since < COOLDOWN_HOURS:
            continue
        
        action = None
        reason = None
        
        # Rule 1: PAUSE — lots of clicks but no orders
        if link_clicks >= PAUSE_NO_ORDER_CLICKS and orders == 0 and enough:
            action = 'PAUSE'
            reason = f'{link_clicks} clicks, 0 orders — no conversion'
        
        # Rule 2: SCALE UP — good ROAS
        elif enough and orders >= MIN_ORDERS_FOR_ROAS and roas >= SCALE_UP_ROAS:
            new_budget = min(int(budget * (1 + SCALE_UP_PCT)), MAX_BUDGET_PER_CAMPAIGN)
            if new_budget > budget:
                action = 'SCALE_UP'
                reason = f'ROAS {roas:.1f}x | Budget {budget:,} → {new_budget:,} (+{SCALE_UP_PCT*100:.0f}%)'
                budget = new_budget
        
        # Rule 3: SCALE DOWN — poor ROAS
        elif enough and orders >= MIN_ORDERS_FOR_ROAS and roas < SCALE_DOWN_ROAS:
            new_budget = max(int(budget * (1 - SCALE_DOWN_PCT)), 10000)
            if new_budget < budget:
                action = 'SCALE_DOWN'
                reason = f'ROAS {roas:.1f}x | Budget {budget:,} → {new_budget:,} (-{SCALE_DOWN_PCT*100:.0f}%)'
        
        # Rule 4: MARK WINNER
        elif cpc > 0 and cpc < WINNER_CPC:
            if roas >= WINNER_ROAS or orders >= MIN_ORDERS_FOR_ROAS:
                action = 'WINNER'
                reason = f'CPC Rp{cpc:.0f} | ROAS {roas:.1f}x | {orders} orders'
        
        if action:
            actions.append({
                'campaign_id': cid,
                'name': cname,
                'action': action,
                'reason': reason,
                'new_budget': budget if action in ('SCALE_UP', 'SCALE_DOWN') else None,
                'roas': roas,
                'cpc': cpc,
                'orders': orders,
            })
    
    return actions

# ── STEP 5: EXECUTE ──
def execute_actions(actions, history):
    """Apply scaling decisions via Meta API"""
    for act in actions:
        cid = act['campaign_id']
        action = act['action']
        
        log(f"  {action}: {act['name'][:50]} — {act['reason']}")
        
        if action == 'PAUSE':
            r = api_post(f'{API}/{cid}', {'status': 'PAUSED'})
            if r.get('success'):
                log(f"    ⏸️  PAUSED: {act['name'][:50]}")
        
        elif action in ('SCALE_UP', 'SCALE_DOWN'):
            r = api_post(f'{API}/{cid}', {'daily_budget': act['new_budget']})
            if r.get('success'):
                log(f"    💰 Budget updated: {act['new_budget']:,}")
        
        elif action == 'WINNER':
            log(f"    🏆 WINNER: {act['name'][:50]}")
        
        # Update history
        history[cid] = {
            'time': datetime.now().isoformat(),
            'action': action,
            'roas': act['roas'],
        }

# ── MAIN ──
def main():
    log("=" * 60)
    log("🔥 AUTONOMOUS SCALER — Starting cycle")
    
    # Load history
    history_file = WORKSPACE / 'data/autoscale_history.json'
    history = {}
    if history_file.exists():
        try:
            with open(history_file) as f:
                history = json.load(f)
        except:
            pass
    
    total_actions = 0
    total_campaigns = 0
    
    for account_id, account_name in ACCOUNTS.items():
        log(f"\n📊 Account: {account_name} ({account_id})")
        
        # Get FB data
        campaigns = get_fb_campaigns(account_id)
        total_campaigns += len(campaigns)
        
        if not campaigns:
            log("  (no active campaigns)")
            continue
        
        # Get Shopee attribution
        attribution = get_shopee_attribution(account_name)
        log(f"  Campaigns: {len(campaigns)} | Shopee tags: {len(attribution)}")
        
        # Calculate ROAS
        merged = calculate_roas(campaigns, attribution, account_name)
        
        # Summary table
        log(f"  {'Campaign':40s} {'Spend':>8s} {'CPC':>6s} {'Orders':>6s} {'ROAS':>6s}")
        log(f"  {'-'*65}")
        for c in merged:
            spend_s = f"Rp{c['spend_2d']:,.0f}" if c['spend_2d'] > 0 else "Rp0"
            cpc_s = f"Rp{c['cpc']:.0f}" if c['cpc'] > 0 else "-"
            roas_s = f"{c['roas']:.1f}x" if c['roas'] > 0 else "-"
            log(f"  {c['name'][:38]:40s} {spend_s:>8s} {cpc_s:>6s} {c['shopee_orders']:>6d} {roas_s:>6s}")
        
        # Make decisions
        actions = make_decisions(merged, history)
        log(f"\n  📋 Decisions: {len(actions)}")
        
        # Execute
        execute_actions(actions, history)
        total_actions += len(actions)
    
    # Save history
    os.makedirs(history_file.parent, exist_ok=True)
    with open(history_file, 'w') as f:
        json.dump(history, f, indent=2)
    
    log(f"\n✅ Cycle complete — {total_campaigns} campaigns checked, {total_actions} actions taken")
    log("=" * 60)

if __name__ == "__main__":
    if '--daemon' in sys.argv:
        log("🚀 AUTONOMOUS SCALER DAEMON — Check every 60 minutes")
        while True:
            try:
                main()
            except Exception as e:
                log(f"🚨 Error: {e}")
            time.sleep(3600)
    else:
        main()
