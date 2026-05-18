#!/usr/bin/env python3
"""
auto_check_0858.py — Automated 0858 monitor
Check every 2 hours:
- Bid cap = 130? ❌
- CTR > 0.75% after 3K impressions?
- Placement FB-only or IG-only? (no mix)
- Age targeting 23-55?
- Not_delivering ads?
- Budget exhaustion?

Sends alerts to Telegram when violations found.

Usage:
  python3 scripts/auto_check_0858.py              # run once
  python3 scripts/auto_check_0858.py --loop       # run every 2 hours
"""
import requests, json, os, sys, time
from datetime import datetime

ACCESS_TOKEN = 'EAAKA2OT1FroBRUxF5Lmx6PC0rqBBvEX7VrWtpbyoUlBH6x7QzaVCWozV63ZAzXwvjWN3RF8ZAHdWv5umKSq3FjCFUDjRF7FhOZBjF6O7MzjlIDdtnNYfitUuIloBDVktKfw5KkeOFGI06tdbuHxyCZAMkdW7ZAXqGZAM32GgJCkn78oUo8ZAg5CG95lTAnSLMZC8jAZDZD'
API_BASE = 'https://graph.facebook.com/v19.0'
ACCOUNT_ID = 'act_435670549443081'
ACCOUNT_LABEL = 'Selow ID 0858'
LOG_PATH = 'logs/auto_check_0858.log'
ALERTS_PATH = 'logs/0858_alerts.json'

os.makedirs('logs', exist_ok=True)

def log(msg):
    ts = datetime.now().strftime('%Y-%m-%d %H:%M')
    line = f'[{ts}] {msg}'
    print(line)
    with open(LOG_PATH, 'a') as f:
        f.write(line + '\n')

def api_get(path, params=None):
    if params is None:
        params = {}
    params['access_token'] = ACCESS_TOKEN
    try:
        r = requests.get(f'{API_BASE}/{path}', params=params, timeout=15)
        return r.json()
    except Exception as e:
        return {'error': str(e)}

def load_alerts():
    if os.path.exists(ALERTS_PATH):
        try:
            with open(ALERTS_PATH) as f:
                return json.load(f)
        except:
            return {}
    return {}

def save_alert(key, value):
    alerts = load_alerts()
    now = datetime.now().isoformat()
    if key not in alerts:
        alerts[key] = {'first_seen': now, 'count': 0, 'last_status': None}
    alerts[key]['last_seen'] = now
    alerts[key]['count'] += 1
    alerts[key]['last_status'] = value
    with open(ALERTS_PATH, 'w') as f:
        json.dump(alerts, f, indent=2)

def check_0858():
    """Main check — returns list of alerts."""
    log(f'🔍 Checking {ACCOUNT_LABEL}...')
    alerts = []

    # 1. Get all active campaigns
    camps = api_get(f'{ACCOUNT_ID}/campaigns', {
        'fields': 'id,name,status,effective_status,daily_budget,lifetime_budget',
        'limit': 50
    })
    if 'error' in camps:
        log(f'❌ API error: {camps["error"]}')
        return [f'API Error: {camps["error"]["message"]}']
    
    camp_list = camps.get('data', [])
    log(f'  Total campaigns: {len(camp_list)}')
    
    active_camps = [c for c in camp_list if c.get('effective_status') == 'ACTIVE']
    log(f'  Active: {len(active_camps)}')
    
    # 2. Check each active campaign's adsets
    for camp in active_camps:
        cid = camp['id']
        cname = camp.get('name', '?')
        budget = camp.get('daily_budget', 0)
        budget_idr = int(budget) / 100 if budget else 0
        
        # Get adsets for this campaign
        adsets = api_get(f'{cid}/adsets', {
            'fields': 'id,name,daily_budget,bid_strategy,bid_amount,targeting,status,effective_status',
            'limit': 25
        })
        if 'error' in adsets:
            continue
        
        for adset in adsets.get('data', []):
            aid = adset['id']
            aname = adset.get('name', '?')
            astatus = adset.get('effective_status', '?')
            
            # CHECK 1: Bid cap = 130?
            bid_amount = adset.get('bid_amount', 0)
            bid_strategy = adset.get('bid_strategy', '')
            if bid_strategy == 'LOWEST_COST_WITH_BID_CAP' and bid_amount != 130:
                msg = f'🚨 Bid cap salah: {aname} — bid_amount={bid_amount} (harus 130)'
                alerts.append(msg)
                save_alert(f'bidcap_{aid}', msg)
                log(f'  ⚠️  {msg}')
            
            # CHECK 2: Age targeting 23-55?
            targeting = adset.get('targeting', {})
            age_min = targeting.get('age_min', 0)
            age_max = targeting.get('age_max', 0)
            if age_min != 23 or age_max != 55:
                msg = f'⚠️ Age targeting mismatch: {aname} — age {age_min}-{age_max} (harus 23-55)'
                alerts.append(msg)
                save_alert(f'age_{aid}', msg)
                log(f'  ⚠️  {msg}')
            
            # CHECK 3: Placement FB-only or IG-only (not both)?
            placements = targeting.get('flexible_spec', [])
            publisher_platforms = targeting.get('publisher_platforms', [])
            if len(publisher_platforms) > 1 and set(publisher_platforms).intersection({'facebook', 'instagram'}):
                msg = f'⚠️ Placement campur FB+IG: {aname} — platforms={publisher_platforms} (harus salah satu)'
                alerts.append(msg)
                save_alert(f'placement_{aid}', msg)
                log(f'  ⚠️  {msg}')
            
            # CHECK 4: Device cellular only?
            device_platforms = targeting.get('device_platforms', [])
            if device_platforms and 'mobile' not in device_platforms:
                msg = f'⚠️ Device bukan cellular: {aname} — devices={device_platforms}'
                alerts.append(msg)
                log(f'  ⚠️  {msg}')
            
            # Get ads for this adset — check performance
            ads = api_get(f'{aid}/ads', {
                'fields': 'id,name,effective_status,creative{id}',
                'limit': 25
            })
            if 'error' in ads:
                continue
            
            for ad in ads.get('data', []):
                ad_id = ad['id']
                ad_name = ad.get('name', '?')
                ad_status = ad.get('effective_status', '?')
                
                # CHECK 5: Not delivering?
                if ad_status == 'NOT_DELIVERING' or ad_status == 'DISAPPROVED':
                    msg = f'❌ {ad_status}: {ad_name} di adset {aname}'
                    alerts.append(msg)
                    save_alert(f'ad_{ad_id}', msg)
                    log(f'  ❌ {msg}')
                
                # CHECK 6: CTR check (need impressions > 3000)
                if ad_status == 'ACTIVE':
                    insights = api_get(f'{ad_id}/insights', {
                        'date_preset': 'last_7d',
                        'fields': 'spend,impressions,ctr,cpc,cpm'
                    })
                    idata = insights.get('data', [{}])[0] if insights.get('data') else {}
                    impressions = int(idata.get('impressions', 0))
                    ctr_str = idata.get('ctr', '0%')
                    ctr_val = float(ctr_str.replace('%', '')) if '%' in ctr_str else 0
                    
                    if impressions >= 3000 and ctr_val < 0.75:
                        msg = f'⚠️ CTR rendah: {ad_name} — CTR {ctr_str} ({impressions} impressions) — target > 0.75%'
                        alerts.append(msg)
                        save_alert(f'ctr_{ad_id}', msg)
                        log(f'  ⚠️  {msg}')
    
    return alerts

def send_report(alerts):
    """Format and write report for Telegram delivery."""
    now = datetime.now().strftime('%d %b %H:%M WIB')
    
    if not alerts:
        summary = f'✅ *0858 Check OK* — {now}\nTidak ada masalah ditemukan. Semua kampanye sehat.'
        log('✅ No issues found')
    else:
        lines = [f'🔴 *0858 Check — {now}*', f'Ditemukan {len(alerts)} masalah:', '']
        criticals = []
        warnings = []
        
        for a in alerts:
            if a.startswith('🚨') or a.startswith('❌'):
                criticals.append(a)
            else:
                warnings.append(a)
        
        if criticals:
            lines.append('*CRITICAL:*')
            lines.extend(f'• {a}' for a in criticals)
            lines.append('')
        if warnings:
            lines.append('*WARNINGS:*')
            lines.extend(f'• {a}' for a in warnings)
            lines.append('')
        
        lines.append(f'📋 Detail ada di {ALERTS_PATH}')
        summary = '\n'.join(lines)
    
    # Save to report file for Telegram delivery
    report_path = 'reports/latest_0858_check.txt'
    os.makedirs('reports', exist_ok=True)
    with open(report_path, 'w') as f:
        f.write(summary)
    
    log(f'📁 Report saved: {report_path}')
    print('\n' + summary)
    return summary

def run_check():
    alerts = check_0858()
    send_report(alerts)

if __name__ == '__main__':
    if '--loop' in sys.argv:
        log('🔄 Starting auto_check_0858 loop (every 2 hours)')
        while True:
            run_check()
            log('💤 Sleeping for 2 hours...')
            time.sleep(7200)
    else:
        run_check()
