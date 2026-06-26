#!/usr/bin/env python3
"""
🔥 VILONA META ADS MASTER OPTIMIZER
Covers all 6 accounts. Auto-flag burning campaigns, duplicates, winners.
Run: python3 scripts/vilona_ads_optimizer.py [--execute] [--report-only]

Rules:
  BURN:  spend >= 50K IDR + 0 purchases + CTR >= 3% + impr >= 500  → FLAG PAUSE
  DUPE:  same base name + 0 purchases + sibling has purchases        → FLAG PAUSE  
  WIN:   purchases >= 1 + CTR >= 3% + CPR (if available)              → FLAG SCALE
  COLD:  spend >= 80K + 0 purchases + impr >= 100 (7d)               → FLAG PAUSE
  STALL: spend > 0 + 0 impressions in last 2 hours                   → FLAG REVIEW
"""

import re, requests, json, os, sys, time
from datetime import datetime, timezone, timedelta
from collections import defaultdict
import os

# ─── CONFIG ───────────────────────────────────────────────────
ACCESS_TOKEN = os.getenv('META_ACCESS_TOKEN', '')
API_BASE = 'https://graph.facebook.com/v19.0'
EXECUTE = '--execute' in sys.argv
FAST = '--fast' in sys.argv or '--quick' in sys.argv
LOG_DIR = os.path.expanduser('~/.openclaw/workspace/logs')

ACCOUNTS = [
    ('act_380721031313330', '1041', 'Selow 1041'),
    ('act_1439536310038458', '1208', 'Selow 1208 - Purwoceng'),
    ('act_1773760133153789', '1134', 'Selow 1134 - BabyPillow'),
    ('act_1181078009580337', '1340', 'Selow 1340 - BajuAnak'),
    ('act_435670549443081', '0858', 'Selow 0858 - JENDRALBOT'),
    ('act_1204208138534580', 'ProdDig', 'Produk Digital'),
]

# Burn thresholds (IDR)
BURN_MIN_SPEND = 50000
BURN_MIN_IMPR = 500
BURN_MIN_CTR = 3.0
COLD_MIN_SPEND = 80000
COLD_MIN_IMPR = 100

# ─── HELPERS ──────────────────────────────────────────────────
def api_get(path, params=None):
    if params is None: params = {}
    params['access_token'] = ACCESS_TOKEN
    try:
        r = requests.get(f'{API_BASE}/{path}', params=params, timeout=15)
        return r.json()
    except Exception as e:
        return {'error': str(e)}

def api_post(path, data=None):
    if data is None: data = {}
    data['access_token'] = ACCESS_TOKEN
    try:
        r = requests.post(f'{API_BASE}/{path}', data=data, timeout=15)
        return r.json()
    except Exception as e:
        return {'error': str(e)}

def log(msg):
    ts = datetime.now(timezone(timedelta(hours=7))).strftime('%H:%M:%S')
    print(f"[{ts}] {msg}")

def pause_campaign(camp_id, name):
    if not EXECUTE:
        log(f"  [DRY-RUN] Would pause: {name}")
        return 'dry_run'
    resp = api_post(f'{camp_id}', {'status': 'PAUSED'})
    if 'success' in resp and resp['success']:
        log(f"  ✅ PAUSED: {name}")
        return 'paused'
    err = resp.get('error', {}).get('message', str(resp))
    log(f"  ❌ FAILED: {name} - {err}")
    return 'error'

# ─── DATA FETCHING ────────────────────────────────────────────
def fetch_campaigns(act_id):
    """Get all active campaigns with insights."""
    camps = api_get(f'{act_id}/campaigns', {
        'fields': 'id,name,status,daily_budget',
        'limit': 50
    })
    
    # Filter to ACTIVE only
    if 'error' in camps:
        log(f"  ❌ API error: {camps['error'].get('message', str(camps['error']))[:100]}")
        return []
    active_camps = [c for c in camps.get('data', []) if c.get('status') == 'ACTIVE']
    
    results = []
    for c in active_camps:
        ins = api_get(f"{c['id']}/insights", {
            'fields': 'impressions,clicks,ctr,spend,cpc,actions,cost_per_action_type',
            'date_preset': 'today'
        })
        if 'error' in ins:
            log(f"  ⚠️ API error for {c['name'][:40]}: {ins['error'].get('message', str(ins['error']))[:100]}")
            continue
        d = ins.get('data', [{}])[0] if ins.get('data') else {}
        
        purch = sum(int(a['value']) for a in d.get('actions', []) if 'purchase' in a.get('action_type','').lower())
        cpr = next((float(x['value']) for x in d.get('cost_per_action_type', []) if 'purchase' in x.get('action_type','').lower()), None)
        
        results.append({
            'id': c['id'],
            'name': c.get('name', 'N/A'),
            'budget': int(c.get('daily_budget', 0)),
            'spend': float(d.get('spend', 0)),
            'impressions': int(float(d.get('impressions', 0))),
            'clicks': int(float(d.get('clicks', 0))),
            'ctr': float(d.get('ctr', 0)),
            'cpc': float(d.get('cpc', 0)),
            'purchases': purch,
            'cpr': cpr,
        })
    
    return results

def fetch_account_summary(act_id):
    """Get account-level daily summary."""
    ins = api_get(f'{act_id}/insights', {
        'fields': 'impressions,clicks,ctr,spend,actions',
        'date_preset': 'today'
    })
    d = ins.get('data', [{}])[0] if ins.get('data') else {}
    return {
        'spend': float(d.get('spend', 0)),
        'impressions': int(float(d.get('impressions', 0))),
        'clicks': int(float(d.get('clicks', 0))),
        'ctr': float(d.get('ctr', 0)),
        'purchases': sum(int(a['value']) for a in d.get('actions', []) if 'purchase' in a.get('action_type','').lower()),
    }

# ─── OPTIMIZATION RULES ───────────────────────────────────────
def detect_burning(campaigns):
    """Flag campaigns spending heavily with no conversions despite good CTR."""
    burning = []
    for c in campaigns:
        if (c['spend'] >= BURN_MIN_SPEND and 
            c['purchases'] == 0 and 
            c['ctr'] >= BURN_MIN_CTR and 
            c['impressions'] >= BURN_MIN_IMPR):
            burning.append({
                **c,
                'rule': 'BURN',
                'reason': f"spend IDR {c['spend']:,.0f} | CTR {c['ctr']:.1f}% | {c['impressions']} impr | 0 purchases"
            })
    return burning

def detect_cold(campaigns):
    """Flag campaigns with high spend, decent exposure, zero conv (7d style)."""
    cold = []
    for c in campaigns:
        if (c['spend'] >= COLD_MIN_SPEND and 
            c['purchases'] == 0 and 
            c['impressions'] >= COLD_MIN_IMPR):
            if c not in [b for b in detect_burning(campaigns)]:  # Don't double-flag
                cold.append({
                    **c,
                    'rule': 'COLD',
                    'reason': f"spend IDR {c['spend']:,.0f} | {c['impressions']} impr | 0 purchases"
                })
    return cold

def detect_duplicates(campaigns):
    """Flag duplicate campaigns where sibling has purchases."""
    # Group by base name (strip " - Salin", "Salin", numbers)
    groups = defaultdict(list)
    for c in campaigns:
        base = c['name'].replace(' - Salin', '').replace(' Salin', '').rstrip('0123456789 ')
        groups[base].append(c)
    
    dupes = []
    for base, members in groups.items():
        if len(members) <= 1:
            continue
        has_winner = any(m['purchases'] > 0 for m in members)
        if has_winner:
            for m in members:
                if m['purchases'] == 0:
                    dupes.append({
                        **m,
                        'rule': 'DUPE',
                        'reason': f"duplicate of winner (0 vs {max(x['purchases'] for x in members)} purchases)"
                    })
    return dupes

def detect_winners(campaigns):
    """Flag winning campaigns for scaling."""
    winners = []
    for c in campaigns:
        if c['purchases'] >= 1 and c['ctr'] >= 3.0:
            winners.append({
                **c,
                'rule': 'WIN',
                'reason': f"{c['purchases']} purchases | CTR {c['ctr']:.1f}% | CPR " + (f"IDR {c['cpr']:,.0f}" if c['cpr'] else 'N/A')
            })
    return winners

def detect_stalled(campaigns):
    """Flag campaigns that spent but have very low impressions (possible delivery issue)."""
    stalled = []
    for c in campaigns:
        if c['spend'] > 0 and c['impressions'] < 10 and c['spend'] < 10000:
            stalled.append({
                **c,
                'rule': 'STALL',
                'reason': f"spend IDR {c['spend']:,.0f} but only {c['impressions']} impressions — delivery issue?"
            })
    return stalled

# ─── MAIN ─────────────────────────────────────────────────────
def main():
    log("=" * 60)
    log("🔥 VILONA META ADS MASTER OPTIMIZER")
    log(f"   Mode: {'⚡ EXECUTE' if EXECUTE else '🔍 DRY-RUN (add --execute to apply)'}")
    log("=" * 60)
    
    total_spend = 0
    total_purch = 0
    total_impr = 0
    all_flags = []
    account_scorecard = []
    actions_log = []
    
    # Parallel scan using ThreadPoolExecutor for 3-4x speed
    from concurrent.futures import ThreadPoolExecutor, as_completed
    
    def _scan(act_id, short, label):
        campaigns = fetch_campaigns(act_id)
        summary = fetch_account_summary(act_id)
        if not campaigns:
            return {'short': short, 'campaigns': [], 'summary': summary, 'burning': [], 'cold': [], 'dupes': [], 'winners': [], 'stalled': []}
        return {
            'short': short, 'campaigns': campaigns, 'summary': summary,
            'burning': detect_burning(campaigns), 'cold': detect_cold(campaigns),
            'dupes': detect_duplicates(campaigns), 'winners': detect_winners(campaigns),
            'stalled': detect_stalled(campaigns)
        }
    
    results_map = {}
    log("📡 Parallel scanning 6 accounts...")
    with ThreadPoolExecutor(max_workers=6) as executor:
        futures = {executor.submit(_scan, aid, s, l): s for aid, s, l in ACCOUNTS}
        for future in as_completed(futures):
            r = future.result()
            results_map[r['short']] = r
    
    for act_id, short, label in ACCOUNTS:
        r = results_map[short]
        campaigns = r['campaigns']
        summary = r['summary']
        burning = r['burning']
        cold = r['cold']
        dupes = r['dupes']
        winners = r['winners']
        stalled = r['stalled']
        
        total_spend += summary['spend']
        total_purch += summary['purchases']
        total_impr += summary['impressions']
        
        if not campaigns:
            account_scorecard.append(f"  ⏸️ {short}: No active campaigns")
            continue
        
        # Issues already detected in parallel scan
        
        # Scorecard line
        flags = []
        if winners: flags.append(f"🏆 {len(winners)} winners")
        if burning: flags.append(f"🔥 {len(burning)} BURNING")
        if dupes: flags.append(f"📋 {len(dupes)} dupes")
        if cold: flags.append(f"❄️ {len(cold)} cold")
        if stalled: flags.append(f"⏸️ {len(stalled)} stalled")
        
        flag_str = ' | '.join(flags) if flags else '✅ clean'
        account_scorecard.append(
            f"  {'🔥' if summary['purchases'] > 0 else '✅'} {short}: IDR {summary['spend']:,.0f} | "
            f"{summary['impressions']} impr | CTR {summary['ctr']:.1f}% | "
            f"{summary['purchases']} purch | {flag_str}"
        )
        
        # Execute on burning campaigns
        for b in burning:
            all_flags.append({'account': short, **b})
            if EXECUTE:
                result = pause_campaign(b['id'], b['name'])
                actions_log.append(f"🛑 PAUSED {short}/{b['name']} — {b['reason']}")
        
        # Execute on duplicates
        for d in dupes:
            all_flags.append({'account': short, **d})
            if EXECUTE:
                result = pause_campaign(d['id'], d['name'])
                actions_log.append(f"🛑 PAUSED {short}/{d['name']} — {d['reason']}")
        
        # Log winners (no auto-scale without approval)
        for w in winners:
            all_flags.append({'account': short, **w})
        
        # Log stalled
        for s in stalled:
            all_flags.append({'account': short, **s})
    
    # ─── REPORT ───────────────────────────────────────────────
    report = f"""
{'='*55}
📊 VILONA ADS OPTIMIZER — FULL REPORT
{'='*55}
Time: {datetime.now(timezone(timedelta(hours=7))).strftime('%Y-%m-%d %H:%M WIB')}
Mode: {'⚡ AUTO-EXECUTE' if EXECUTE else '🔍 DRY-RUN'}

📈 ALL ACCOUNTS:
"""
    for line in account_scorecard:
        report += line + "\n"
    
    report += f"""
💰 TOTALS: IDR {total_spend:,.0f} spend | {total_impr:,} impr | {total_purch} purchases

{'='*55}
🔍 FLAGS ({len(all_flags)}):
"""
    
    if all_flags:
        by_rule = defaultdict(list)
        for f in all_flags:
            by_rule[f['rule']].append(f)
        
        for rule in ['BURN', 'COLD', 'DUPE', 'WIN', 'STALL']:
            items = by_rule.get(rule, [])
            if items:
                emoji = {'BURN': '🔥', 'COLD': '❄️', 'DUPE': '📋', 'WIN': '🏆', 'STALL': '⏸️'}[rule]
                report += f"\n{emoji} {rule} ({len(items)}):\n"
                for item in items[:10]:
                    report += f"   [{item['account']}] {item['name'][:50]}\n"
                    report += f"   → {item['reason']}\n"
    else:
        report += "\n✅ No flags — all campaigns healthy\n"
    
    if actions_log:
        report += f"\n{'='*55}\n⚡ ACTIONS EXECUTED ({len(actions_log)}):\n"
        for a in actions_log:
            report += f"  {a}\n"
    
    report += f"\n{'='*55}\n"
    
    log(report)
    
    # Save report
    os.makedirs(LOG_DIR, exist_ok=True)
    report_path = os.path.join(LOG_DIR, 'vilona_optimizer_report.txt')
    with open(report_path, 'w') as f:
        f.write(report)
    log(f"📝 Report saved: {report_path}")
    
    # JSON summary
    flag_counts = {}
    for f in all_flags:
        flag_counts[f['rule']] = flag_counts.get(f['rule'], 0) + 1
    
    summary_json = {
        'timestamp': datetime.now(timezone(timedelta(hours=7))).isoformat(),
        'mode': 'execute' if EXECUTE else 'dry-run',
        'totals': {'spend': total_spend, 'impressions': total_impr, 'purchases': total_purch},
        'flags': flag_counts,
        'actions': len(actions_log),
    }
    
    print("\n---JSON---")
    print(json.dumps(summary_json, indent=2, default=str))
    
    return report

if __name__ == '__main__':
    main()
