#!/usr/bin/env python3
"""
ads_dashboard.py — "cekin semua akun"
Pull all active Meta Ads accounts + campaign status in 10 seconds.
Output: Telegram-ready markdown summary.

Usage:
  python3 scripts/ads_dashboard.py           # print to stdout
  python3 scripts/ads_dashboard.py --send     # print + queue for Telegram
"""
import requests, json, sys, os, time
from datetime import datetime
import os

ACCESS_TOKEN = 'os.getenv('META_ACCESS_TOKEN', '')'
API_BASE = 'https://graph.facebook.com/v19.0'

ACCOUNTS = [
    ('act_380721031313330', 'Selow ID 1041'),
    ('act_1439536310038458', 'Selow ID 1208'),
    ('act_1773760133153789', 'Selow ID 1134'),
    ('act_1181078009580337', 'Selow ID 1340'),
    ('act_435670549443081', 'Selow ID 0858'),
    ('act_1204208138534580', 'Produk Digital'),
]

def api_get(path, params=None):
    if params is None:
        params = {}
    params['access_token'] = ACCESS_TOKEN
    try:
        r = requests.get(f'{API_BASE}/{path}', params=params, timeout=15)
        return r.json()
    except Exception as e:
        return {'error': str(e)}

def get_account_summary(act_id, label):
    """Get quick summary for one account."""
    result = {'label': label, 'id': act_id, 'campaigns': 0, 'active': 0, 'spend_today': 0, 'status': '❌', 'top_campaigns': []}
    
    # Get campaigns
    camps = api_get(f'{act_id}/campaigns', {'fields': 'id,name,status,effective_status,daily_budget', 'limit': 50})
    if 'error' in camps:
        result['error'] = camps['error'].get('message', str(camps['error']))
        return result
    
    camp_list = camps.get('data', [])
    result['campaigns'] = len(camp_list)
    active_camps = [c for c in camp_list if c.get('effective_status') == 'ACTIVE']
    result['active'] = len(active_camps)
    result['status'] = '✅' if active_camps else '⏸️'
    
    # Get today's insights (aggregate)
    insights = api_get(f'{act_id}/insights', {
        'date_preset': 'today',
        'fields': 'spend,impressions,clicks,ctr,cpc,cpm,cost_per_action_type,actions',
        'level': 'account'
    })
    if 'error' not in insights:
        data = insights.get('data', [])
        if data:
            d = data[0]
            result['spend_today'] = float(d.get('spend', 0))
            result['impressions'] = int(d.get('impressions', 0))
            result['clicks'] = int(d.get('clicks', 0))
            result['ctr'] = d.get('ctr', '0%')
            result['cpc'] = d.get('cpc', '0')
            
            # Extract conversions from actions
            actions = d.get('actions', [])
            conversions = sum(int(a.get('value', 0)) for a in actions if a.get('action_type') in ('purchase', 'lead', 'add_to_cart', 'complete_registration'))
            result['conversions'] = conversions
            if result['spend_today'] > 0 and conversions > 0:
                result['cpa'] = round(result['spend_today'] / conversions, 0)
    
    # Get top 3 active campaigns by spend
    if active_camps:
        for c in active_camps[:5]:
            ci = api_get(f'{c["id"]}/insights', {
                'date_preset': 'today',
                'fields': 'campaign_name,spend,impressions,ctr,cpc'
            })
            ci_data = ci.get('data', [{}])[0] if ci.get('data') else {}
            result['top_campaigns'].append({
                'name': c.get('name', '?'),
                'spend': float(ci_data.get('spend', 0)),
                'ctr': ci_data.get('ctr', '-'),
                'cpc': ci_data.get('cpc', '-')
            })
    
    return result

def format_dashboard(results):
    """Format all results into Telegram-ready markdown."""
    now = datetime.now().strftime('%d %b %Y %H:%M WIB')
    lines = [f'📊 *ADS DASHBOARD* — {now}', '']
    
    total_spend = 0
    total_active = 0
    total_campaigns = 0
    
    for r in results:
        label = r['label']
        icon = r.get('status', '❌')
        camps = r['campaigns']
        active = r['active']
        spend = r.get('spend_today', 0)
        ctr = r.get('ctr', '-')
        cpc = r.get('cpc', '-')
        conv = r.get('conversions', 0)
        
        total_spend += spend
        total_active += active
        total_campaigns += camps
        
        lines.append(f'{icon} *{label}*')
        lines.append(f'  ├─ {active}/{camps} kampanye aktif')
        lines.append(f'  ├─ Spend hari ini: Rp{spend:,.0f}')
        
        if ctr != '-':
            lines.append(f'  ├─ CTR: {ctr} | CPC: Rp{cpc}')
        if conv:
            lines.append(f'  └─ Konversi: {conv}')
        else:
            lines.append(f'  └─ Konversi: —')
        
        # Top campaigns
        tops = r.get('top_campaigns', [])
        if tops:
            for t in tops[:2]:
                name = t['name'][:40]
                lines.append(f'     → {name}: Rp{t["spend"]:,.0f} | CTR {t["ctr"]}')
        
        lines.append('')
    
    # Summary line
    lines.append(f'━' * 30)
    lines.append(f'💰 *Total Spend:* Rp{total_spend:,.0f}')
    lines.append(f'📈 *Total Aktif:* {total_active}/{total_campaigns} kampanye')
    lines.append(f'⏱️  *Last updated:* {now}')
    
    return '\n'.join(lines)

def main():
    results = []
    for act_id, label in ACCOUNTS:
        sys.stdout.write(f'  Memproses {label}... ')
        sys.stdout.flush()
        r = get_account_summary(act_id, label)
        results.append(r)
        print(f'{r.get("status", "❌")} ({r.get("active", 0)}/{r.get("campaigns", 0)} aktif, Rp{r.get("spend_today",0):,.0f})')
    
    report = format_dashboard(results)
    print('\n' + '='*50)
    print(report)
    
    # Also write to a report file for other scripts to read
    report_path = 'reports/latest_dashboard.txt'
    os.makedirs('reports', exist_ok=True)
    with open(report_path, 'w') as f:
        f.write(report)
    
    # Write JSON for programmatic use
    json_path = 'reports/latest_dashboard.json'
    with open(json_path, 'w') as f:
        json.dump(results, f, indent=2, default=str)
    
    print(f'\n📁 Report saved: {report_path}')

if __name__ == '__main__':
    main()
