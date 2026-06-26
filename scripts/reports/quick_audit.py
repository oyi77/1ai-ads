#!/usr/bin/env python3
"""Quick audit script for Meta Ads campaigns - fixed effective_status param."""
import os, json, sys, subprocess, urllib.parse

# Read token from .env
token = ""
with open('/home/openclaw/projects/1ai-ads/.env') as f:
    for line in f:
        line = line.strip()
        if line.startswith('META_ACCESS_TOKEN=***            val = line.split('=', 1)[1].strip()
            val = val.strip('"\';')
            token = val
            break

if not token or len(token) < 50:
    print(f"ERROR: Token not found or too short (len={len(token)})")
    sys.exit(1)

print(f"Token loaded: {token[:10]}...{token[-5:]} (len={len(token)})", flush=True)

API = "https://graph.facebook.com/v22.0"

def api_get(url_path, params_dict=None):
    """API call with proper URL encoding."""
    if params_dict is None:
        params_dict = {}
    params_dict['access_token'] = token
    
    query_parts = []
    for k, v in params_dict.items():
        encoded_k = urllib.parse.quote(k, safe='')
        if isinstance(v, list):
            # Serialize arrays as JSON array
            encoded_v = urllib.parse.quote(json.dumps(v), safe='')
        else:
            encoded_v = urllib.parse.quote(str(v), safe='')
        query_parts.append(f"{encoded_k}={encoded_v}")
    
    full_url = f"{API}/{url_path}?{'&'.join(query_parts)}"
    
    result = subprocess.run(
        ['curl', '-s', full_url],
        capture_output=True, text=True, timeout=60
    )
    try:
        return json.loads(result.stdout)
    except:
        return {"error": result.stdout[:500]}

def fetch_all_campaigns(account_id, fields_arr, status_filter=None):
    """Fetch all campaigns with pagination."""
    fields_str = ','.join(fields_arr)
    params = {'fields': fields_str, 'limit': '100'}
    if status_filter:
        params['effective_status'] = status_filter  # must be a list like ['ACTIVE']
    
    all_data = []
    data = api_get(f"{account_id}/campaigns", params)
    
    if 'error' in data:
        print(f"ERROR: {json.dumps(data['error'], indent=2)[:500]}", flush=True)
        return []
    
    all_data.extend(data.get('data', []))
    
    page_count = 1
    while 'paging' in data and 'next' in data['paging']:
        next_url = data['paging']['next']
        result = subprocess.run(['curl', '-s', next_url], capture_output=True, text=True, timeout=60)
        data = json.loads(result.stdout)
        if 'error' in data:
            print(f"  Pagination error: {data['error']}", flush=True)
            break
        all_data.extend(data.get('data', []))
        page_count += 1
        if page_count > 10:
            break
    
    return all_data

# ===== ACCOUNT 0858 =====
print("=" * 90, flush=True)
print("ACCOUNT 0858 (act_435670549443081) — ALL ACTIVE CAMPAIGNS WITH 7D INSIGHTS", flush=True)
print("=" * 90, flush=True)

# Fetch ACTIVE campaigns with insights
print("\nFetching active campaigns with 7D insights...", flush=True)
campaigns_0858 = fetch_all_campaigns(
    'act_435670549443081',
    ['name', 'status', 'effective_status', 'created_time',
     'adsets.limit(1){name,status,effective_status}',
     'insights.date_preset(last_7d){spend,impressions,clicks,ctr,cpc,cpm,actions,action_values,cost_per_action_type}'],
    ['ACTIVE']
)

print(f"\nActive campaigns fetched: {len(campaigns_0858)}", flush=True)

# Parse and display
results_0858 = []
for idx, c in enumerate(campaigns_0858, 1):
    name = c.get('name', 'UNNAMED')
    status = c.get('effective_status', c.get('status', 'UNKNOWN'))
    
    insights = c.get('insights', {})
    insight_data = insights.get('data', [{}])[0] if insights.get('data') else {}
    
    spend = float(insight_data.get('spend', 0) or 0)
    impressions = int(insight_data.get('impressions', 0) or 0)
    clicks = int(insight_data.get('clicks', 0) or 0)
    ctr = float(insight_data.get('ctr', 0) or 0)
    cpc = float(insight_data.get('cpc', 0) or 0)
    cpm = float(insight_data.get('cpm', 0) or 0)
    
    # Parse actions
    actions_raw = insight_data.get('actions', [])
    actions = {}
    for a in actions_raw:
        actions[a.get('action_type', '')] = int(a.get('value', 0) or 0)
    
    action_values_raw = insight_data.get('action_values', [])
    action_values = {}
    for av in action_values_raw:
        action_values[av.get('action_type', '')] = float(av.get('value', 0) or 0)
    
    link_clicks = actions.get('link_click', 0)
    purchases = actions.get('purchase', 0)
    onsite_conversions = actions.get('onsite_conversion', 0)
    adds_to_cart = actions.get('add_to_cart', 0)
    
    total_action_value = sum(action_values.values())
    roas = total_action_value / spend if spend > 0 else 0
    
    # Adset info
    adset_info = c.get('adsets', {}).get('data', [])
    has_adsets = len(adset_info) > 0
    
    # Recommendation logic
    rec = ""
    rec_type = "NONE"
    
    if not has_adsets and spend == 0:
        rec = "💀 NO ADSETS"
        rec_type = "BROKEN"
    elif not has_adsets and spend > 0:
        rec = "⚠️  NO ADSETS but has spend"
        rec_type = "WARN"
    elif spend == 0:
        rec = "🟡 NO SPEND"
        rec_type = "NONE"
    elif cpc > 120 and spend > 0:
        rec = "🔴 KILL (CPC > 120)"
        rec_type = "KILL"
    elif spend > 200000 and purchases == 0 and link_clicks == 0:
        rec = "🔴 KILL (Spent >200k, 0 results)"
        rec_type = "KILL"
    elif roas < 0.5 and spend > 100000:
        rec = "🔴 KILL (ROAS <0.5, spend >100k)"
        rec_type = "KILL"
    elif roas < 0.3 and spend > 50000:
        rec = "🔴 KILL (ROAS <0.3)"
        rec_type = "KILL"
    elif cpc < 120 and roas > 1.0 and link_clicks >= 5:
        rec = "✅ WINNER — CLONE NOW"
        rec_type = "WINNER"
    elif cpc < 120 and roas > 1.0:
        rec = "✅ WINNER (low clicks)"
        rec_type = "WINNER"
    elif cpc < 120 and link_clicks >= 5:
        rec = "🟢 PROMISING"
        rec_type = "PROMISING"
    elif cpc > 120:
        rec = "⚠️ HIGH CPC"
        rec_type = "WARN"
    elif roas < 0.5 and spend > 0:
        rec = "⚠️ LOW ROAS"
        rec_type = "WARN"
    
    results_0858.append({
        'idx': idx,
        'name': name,
        'status': status,
        'spend': spend,
        'impressions': impressions,
        'clicks': clicks,
        'ctr': ctr,
        'cpc': cpc,
        'cpm': cpm,
        'link_clicks': link_clicks,
        'purchases': purchases,
        'add_to_cart': adds_to_cart,
        'action_value': total_action_value,
        'roas': roas,
        'has_adsets': has_adsets,
        'rec': rec,
        'rec_type': rec_type,
        'campaign_id': c.get('id', '')
    })

# Print table
print(f"\n{'#':<3} {'Campaign Name':<40} {'Sts':<4} {'Spend 7D':<12} {'Impr':<7} {'CPC':<8} {'CTR':<6} {'LClk':<5} {'Pur':<4} {'ATC':<4} {'ROAS':<7} {'Adset':<5} {'Recommendation':<30}")
print("-" * 140)
for r in results_0858:
    name_trunc = r['name'][:39]
    print(f"{r['idx']:<3} {name_trunc:<40} {r['status'][0]:<4} {r['spend']:<12,.0f} {r['impressions']:<7} {r['cpc']:<8,.0f} {r['ctr']:<6.2f} {r['link_clicks']:<5} {r['purchases']:<4} {r['add_to_cart']:<4} {r['roas']:<7.2f} {'Y' if r['has_adsets'] else 'N':<5} {r['rec']}")

# Summaries
kill_candidates = [r for r in results_0858 if r['rec_type'] == 'KILL']
winner_candidates = [r for r in results_0858 if r['rec_type'] == 'WINNER']
promising = [r for r in results_0858 if r['rec_type'] == 'PROMISING']
broken = [r for r in results_0858 if r['rec_type'] == 'BROKEN']
no_spend = [r for r in results_0858 if r['rec_type'] in ('NONE',) and r['spend'] == 0]
warn = [r for r in results_0858 if r['rec_type'] == 'WARN']

print(f"\n{'='*65}")
print("0858 SUMMARY")
print(f"{'='*65}")
print(f"Total ACTIVE:                    {len(campaigns_0858)}")
print(f"  ✅ WINNERS to clone:           {len(winner_candidates)}")
print(f"  🟢 PROMISING:                  {len(promising)}")
print(f"  🔴 KILL candidates:            {len(kill_candidates)}")
print(f"  ⚠️ Warnings:                   {len(warn)}")
print(f"  💀 Broken (no adsets):         {len(broken)}")
print(f"  🟡 No spend data:              {len(no_spend)}")

if kill_candidates:
    print(f"\n🔴 KILL CANDIDATES (PAUSE immediately):")
    for r in kill_candidates:
        print(f"  #{r['idx']} {r['name'][:45]:<45} | Spend: {r['spend']:>10,.0f} | CPC: {r['cpc']:>6.0f} | ROAS: {r['roas']:.2f} | {r['rec']}")

if winner_candidates:
    print(f"\n✅ WINNERS (clone immediately):")
    for r in winner_candidates:
        print(f"  #{r['idx']} {r['name'][:45]:<45} | Spend: {r['spend']:>10,.0f} | CPC: {r['cpc']:>6.0f} | ROAS: {r['roas']:.2f} | LClk: {r['link_clicks']} | Pur: {r['purchases']}")

if promising:
    print(f"\n🟢 PROMISING:")
    for r in promising:
        print(f"  #{r['idx']} {r['name'][:45]:<45} | Spend: {r['spend']:>10,.0f} | CPC: {r['cpc']:>6.0f} | ROAS: {r['roas']:.2f} | LClk: {r['link_clicks']}")


# ===== ACCOUNT 1773760133153789 =====
print(f"\n\n{'='*90}")
print("ACCOUNT 1773760133153789 — DETAILED CHECK")
print(f"{'='*90}")

# Fetch all campaigns with last_30d insights
campaigns_177 = fetch_all_campaigns(
    'act_1773760133153789',
    ['name', 'status', 'effective_status', 'created_time',
     'insights.date_preset(last_30d){spend,impressions,clicks,ctr,cpc,cpm,actions,action_values}']
)

print(f"Total campaigns: {len(campaigns_177)}", flush=True)

total_spend_177 = 0
total_impr_177 = 0
total_clicks_177 = 0
active_177_count = 0

print(f"\n{'Campaign Name':<45} {'Status':<8} {'Spend 30d':<12} {'Impr':<7} {'CPC':<8} {'Clicks':<6} {'Action':<10}")
print("-" * 100)
for c in campaigns_177:
    name = c.get('name', 'UNNAMED')
    status = c.get('effective_status', c.get('status', 'UNKNOWN'))
    
    insights = c.get('insights', {})
    insight_data = insights.get('data', [{}])[0] if insights.get('data') else {}
    
    spend = float(insight_data.get('spend', 0) or 0)
    impr = int(insight_data.get('impressions', 0) or 0)
    clk = int(insight_data.get('clicks', 0) or 0)
    cpc_val = float(insight_data.get('cpc', 0) or 0)
    
    actions_raw = insight_data.get('actions', [])
    actions_str = ""
    for a in actions_raw:
        actions_str += f"{a.get('action_type','')}={a.get('value',0)} "
    
    status_flag = "❌" if spend == 0 else "✅"
    
    total_spend_177 += spend
    total_impr_177 += impr
    total_clicks_177 += clk
    
    name_trunc = name[:44]
    print(f"{status_flag} {name_trunc:<43} {status:<8} {spend:<12,.0f} {impr:<7} {cpc_val:<8,.0f} {clk:<6} {actions_str[:25]:<10}")

print(f"\n{'='*65}")
print(f"177 SUMMARY")
print(f"{'='*65}")
print(f"Total campaigns:           {len(campaigns_177)}")
print(f"Total spend (30d):         {total_spend_177:>10,.0f} IDR")
print(f"Total impressions (30d):   {total_impr_177:>10,}")
print(f"Total clicks (30d):        {total_clicks_177:>10,}")
print(f"ACTIVE campaigns:          {active_177_count}")
print(f"PAUSED campaigns:          {len(campaigns_177) - active_177_count}")

# Has trailing activity?
campaigns_with_activity = [c for c in campaigns_177 if float(c.get('insights',{}).get('data',[{}])[0].get('spend',0) or 0) > 0]
print(f"Campaigns with 30d spend:  {len(campaigns_with_activity)}")
if not any(c.get('effective_status', c.get('status')) == 'ACTIVE' for c in campaigns_177):
    print(">>> All campaigns are PAUSED — account is dormant.")
    print(">>> But {0} campaigns still have recent (30d) spend — they were active recently.".format(len(campaigns_with_activity)))

# Check account-level
print(f"\nAccount-level total (30d): {total_spend_177:,.0f} IDR spent")

print(f"\n{'='*65}")
print("GUARDIAN STATUS")
print(f"{'='*65}")
print("vilona-0858-guardian: CRASH LOOP — 6347+ restarts, status 1/FAILURE")
print("vilona-guardian: RUNNING — but errors on wrong account (act_1439536310038458)")
print(">>> Need to fix guardian to use act_435670549443081 instead")

print(f"\n{'='*65}")
print("AUDIT COMPLETE")
print(f"{'='*65}")
