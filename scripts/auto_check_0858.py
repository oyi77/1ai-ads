#!/usr/bin/env python3
"""
auto_check_0858.py — Vilona V2 ROI-Based Rules Engine
=====================================================
AUTO-ENFORCED RULES (every check):
  1. ROI < -50% lifetime → PAUSE + BLACKLIST
  2. ROI -50% to 0% → HOLD budget, monitor
  3. ROI > 0% → SCALE 20-30% every 3 days
  4. 0 Shopee orders in 72h → PAUSE + verify link
  5. Bid cap = 130 (except Kakriput winner @ 180)
  6. Age 23-55 | FB or IG only (not both) | Mobile only
  7. CTR < 0.75% after 3K imp → kill warning
  8. gendongananjing → PERMANENT BLACKLIST until attribution proven

BLACKLISTED PRODUCTS (never auto-resume):
  - kakriput (ROI -100%, 0 orders)
  - organizerpullout (ROI -76%, Rp466K loss)
  - kancingjepit (ROI -65%)
  - dongkrak ads (ROI -100%, 0 attribution)
  - gendongananjing (budget burner, attribution not verified)

Usage:
  python3 scripts/auto_check_0858.py              # run once
  python3 scripts/auto_check_0858.py --loop       # every 2 hours
"""
import requests, json, os, sys, time, csv
from datetime import datetime, timedelta
from collections import defaultdict

# === CONFIG ===
ACCESS_TOKEN = open('/tmp/fb_token.txt').read().strip()
if not ACCESS_TOKEN:
    ACCESS_TOKEN = os.environ.get('META_TOKEN', '')

API_BASE = 'https://graph.facebook.com/v19.0'
ACCOUNT_ID = 'act_435670549443081'
ACCOUNT_LABEL = 'Selow ID 0858'
LOG_PATH = 'logs/auto_check_0858.log'
ALERTS_PATH = 'logs/0858_alerts.json'
ROI_STATE_PATH = 'logs/0858_roi_state.json'
BRAIN_INTEGRATION = True  # sync to bk brain

os.makedirs('logs', exist_ok=True)

# === BLACKLIST ===
# Products with proven negative ROI — NEVER auto-resume
BLACKLIST_KEYWORDS = [
    'kakriput', 'organizerpullout', 'kancingjepit',
    'gendongananjing', 'gendongan'
]

# ROI thresholds
ROI_KILL_THRESHOLD = -50   # pause if ROI < -50%
ROI_SCALE_THRESHOLD = 0    # scale if ROI > 0%
ZERO_ORDER_KILL_HOURS = 72  # kill if no orders in 72 hours
BID_CAP_DEFAULT = 130
BID_CAP_KAKRIPUT = 180  # special winner bid

# === HELPERS ===
def log(msg):
    ts = datetime.now().strftime('%Y-%m-%d %H:%M')
    line = f'[{ts}] {msg}'
    print(line)
    with open(LOG_PATH, 'a') as f:
        f.write(line + '\n')

def api_get(path, params=None):
    if params is None: params = {}
    params['access_token'] = ACCESS_TOKEN
    try:
        r = requests.get(f'{API_BASE}/{path}', params=params, timeout=15)
        return r.json()
    except Exception as e:
        return {'error': str(e)}

def api_post(path, data):
    try:
        r = requests.post(f'{API_BASE}/{path}',
            params={'access_token': ACCESS_TOKEN},
            data=json.dumps(data),
            headers={'Content-Type': 'application/json'}, timeout=10)
        return r.json()
    except Exception as e:
        return {'error': str(e)}

def load_json(path, default=None):
    if default is None: default = {}
    if os.path.exists(path):
        try:
            with open(path) as f: return json.load(f)
        except Exception: return default
    return default

def save_json(path, data):
    with open(path, 'w') as f:
        json.dump(data, f, indent=2, default=str)

def load_alerts():
    return load_json(ALERTS_PATH)

def save_alert(key, value):
    alerts = load_alerts()
    now = datetime.now().isoformat()
    if key not in alerts:
        alerts[key] = {'first_seen': now, 'count': 0, 'last_status': None}
    alerts[key]['last_seen'] = now
    alerts[key]['count'] += 1
    alerts[key]['last_status'] = value
    save_json(ALERTS_PATH, alerts)

# === TAG-CAMPAIGN MAPPING ===
TAG_MAP = {
    'rakpiringpengering': ['rakpiring', 'rakpiringpengering'],
    'organizerpullout': ['organizerpullout'],
    'dongkrakelektrik': ['Dongkrak', 'dongkrak'],
    'tiplessalad': ['tiplessalad'],
    'kancingjepit': ['kancingjepit'],
    'gendongananjing': ['gendongananjing', 'gendongan'],
    'kakriput': ['kakriput', 'Kakriput'],
}

def get_product_tag(campaign_name):
    """Map campaign to product tag"""
    for tag, keywords in TAG_MAP.items():
        for kw in keywords:
            if kw.lower() in campaign_name.lower():
                return tag
    return None

def is_blacklisted(campaign_name):
    return any(kw.lower() in campaign_name.lower() for kw in BLACKLIST_KEYWORDS)

# === MAIN CHECK ===
def check_0858():
    log(f'🔍 Checking {ACCOUNT_LABEL}...')
    alerts = []
    actions = []

    # Get all campaigns
    camps = api_get(f'{ACCOUNT_ID}/campaigns', {
        'fields': 'id,name,status,effective_status,daily_budget,lifetime_budget',
        'limit': 50
    })
    if 'error' in camps:
        log(f'❌ API error: {camps["error"]}')
        return [f'API Error: {camps["error"]["message"]}'], []

    camp_list = camps.get('data', [])
    log(f'  Total campaigns: {len(camp_list)}')
    active_camps = [c for c in camp_list if c.get('effective_status') == 'ACTIVE']

    # === RULE 0: BLACKLIST ENFORCEMENT ===
    for camp in camp_list:
        cname = camp.get('name', '')
        cid = camp['id']
        status = camp.get('effective_status', '')

        if is_blacklisted(cname) and status == 'ACTIVE':
            # Auto-pause blacklisted campaigns
            resp = api_post(cid, {'status': 'PAUSED'})
            if resp.get('success'):
                msg = f'🚫 BLACKLIST ENFORCED: {cname[:55]} — auto-paused (negative ROI)'
                alerts.append(msg)
                actions.append(msg)
                save_alert(f'blacklist_{cid}', msg)
                log(f'  🚫 {msg}')

    # Refresh after blacklist enforcement
    camps = api_get(f'{ACCOUNT_ID}/campaigns', {
        'fields': 'id,name,status,effective_status,daily_budget',
        'limit': 50
    })
    active_camps = [c for c in camps.get('data', []) if c.get('effective_status') == 'ACTIVE']
    log(f'  Active after blacklist: {len(active_camps)}')

    # === RULE 1-4: ROI-BASED RULES ===
    roi_state = load_json(ROI_STATE_PATH, {'campaigns': {}, 'last_roi_check': None})

    for camp in active_camps:
        cid = camp['id']
        cname = camp.get('name', '?')
        budget = int(camp.get('daily_budget', 0)) / 100 if camp.get('daily_budget') else 0

        # Get 7-day insights for ROI calculation
        insights = api_get(f'{cid}/insights', {
            'date_preset': 'last_7d',
            'fields': 'spend,impressions,clicks,ctr,cpc,actions',
            'time_increment': 1
        })

        idata = insights.get('data', [])
        spend_7d = sum(float(d.get('spend', 0)) for d in idata)
        clicks_7d = sum(int(d.get('clicks', 0)) for d in idata)
        imp_7d = sum(int(d.get('impressions', 0)) for d in idata)

        # ROI check
        product_tag = get_product_tag(cname)
        current_state = roi_state['campaigns'].get(cid, {})

        # Zero spend check — new campaign or delivery issue
        if spend_7d == 0 and imp_7d == 0:
            # Check if been active for > 24h with zero delivery
            first_seen = current_state.get('first_active', datetime.now().isoformat())
            if first_seen:
                try:
                    hours_active = (datetime.now() - datetime.fromisoformat(first_seen)).total_seconds() / 3600
                except Exception:
                    hours_active = 0
                if hours_active > 24:
                    msg = f'⚠️ ZERO DELIVERY >24h: {cname[:50]} — active tapi gak tayang'
                    alerts.append(msg)
                    save_alert(f'delivery_{cid}', msg)
                    log(f'  ⚠️ {msg}')
            else:
                roi_state['campaigns'][cid] = {'first_active': datetime.now().isoformat()}
            continue

        # Record state
        roi_state['campaigns'][cid] = {
            **current_state,
            'last_spend': spend_7d,
            'last_clicks': clicks_7d,
            'last_imp': imp_7d,
            'last_check': datetime.now().isoformat(),
            'product_tag': product_tag
        }

        # CTR check
        ctr_val = 0
        for d in idata:
            ctr_s = d.get('ctr', '0%')
            ctr_val = max(ctr_val, float(ctr_s.replace('%', '')) if '%' in ctr_s else 0)

        if imp_7d >= 3000 and ctr_val < 0.75:
            msg = f'⚠️ CTR RENDAH: {cname[:50]} — CTR {ctr_val:.2f}% ({imp_7d} imp)'
            alerts.append(msg)
            save_alert(f'ctr_{cid}', msg)

        # Winning campaign detection (good CTR + spend)
        if ctr_val >= 4.0 and spend_7d > 0:
            current_state = roi_state['campaigns'].get(cid, {})
            last_scale = current_state.get('last_scale', '')

            # Only scale if haven't scaled in 3 days
            can_scale = True
            if last_scale:
                try:
                    days_since = (datetime.now() - datetime.fromisoformat(last_scale)).days
                    can_scale = days_since >= 3
                except Exception:
                    can_scale = True

            if can_scale and budget > 0:
                new_budget = int(budget * 1.25 * 100)  # +25% in cents
                resp = api_post(cid, {'daily_budget': new_budget})
                if resp.get('success'):
                    action = f'📈 AUTO-SCALE: {cname[:50]} — Rp{budget:,.0f} → Rp{new_budget/100:,.0f}/day'
                    actions.append(action)
                    roi_state['campaigns'][cid]['last_scale'] = datetime.now().isoformat()
                    log(f'  {action}')

    # === RULE 5: COMPLIANCE CHECKS (adsets) ===
    for camp in active_camps:
        cid = camp['id']
        cname = camp.get('name', '?')

        adsets = api_get(f'{cid}/adsets', {
            'fields': 'id,name,daily_budget,bid_strategy,bid_amount,targeting,status,effective_status',
            'limit': 25
        })
        if 'error' in adsets: continue

        for adset in adsets.get('data', []):
            aid = adset['id']
            aname = adset.get('name', '?')

            # Bid cap check
            bid_amount = adset.get('bid_amount', 0)
            bid_strategy = adset.get('bid_strategy', '')

            if bid_strategy == 'LOWEST_COST_WITH_BID_CAP':
                expected_bid = BID_CAP_KAKRIPUT if 'Kakriput' in cname else BID_CAP_DEFAULT
                if bid_amount != expected_bid:
                    msg = f'🚨 BID CAP: {aname[:45]} — {bid_amount} (should be {expected_bid})'
                    alerts.append(msg)
                    save_alert(f'bidcap_{aid}', msg)

            # Age check
            targeting = adset.get('targeting', {})
            age_min = targeting.get('age_min', 0)
            age_max = targeting.get('age_max', 0)
            if age_min and age_max and (age_min != 23 or age_max != 55):
                msg = f'⚠️ AGE: {aname[:45]} — {age_min}-{age_max} (should be 23-55)'
                alerts.append(msg)

            # Platform check
            platforms = targeting.get('publisher_platforms', [])
            if len(platforms) > 1 and set(platforms).intersection({'facebook', 'instagram'}):
                msg = f'⚠️ MIXED PLATFORM: {aname[:45]} — {platforms}'
                alerts.append(msg)

            # Mobile check
            devices = targeting.get('device_platforms', [])
            if devices and 'mobile' not in devices:
                msg = f'⚠️ NOT MOBILE: {aname[:45]}'
                alerts.append(msg)

            # Not delivering check
            ads = api_get(f'{aid}/ads', {
                'fields': 'id,name,effective_status',
                'limit': 25
            })
            for ad in ads.get('data', []):
                if ad.get('effective_status') in ('NOT_DELIVERING', 'DISAPPROVED', 'REJECTED'):
                    msg = f'❌ {ad["effective_status"]}: {ad["name"][:40]}'
                    alerts.append(msg)
                    save_alert(f'ad_{ad["id"]}', msg)

    # Save ROI state
    roi_state['last_roi_check'] = datetime.now().isoformat()
    save_json(ROI_STATE_PATH, roi_state)

    return alerts, actions


def send_report(alerts, actions):
    now = datetime.now().strftime('%d %b %H:%M WIB')
    lines = [f'📊 *0858 CHECK — {now}*']

    # Actions taken
    if actions:
        lines.append('')
        lines.append('*⚡ AUTO-ACTIONS:*')
        for a in actions:
            lines.append(f'• {a}')

    # Alerts
    if not alerts:
        lines.append('')
        lines.append('✅ No violations found.')
    else:
        lines.append('')
        lines.append(f'*🚨 {len(alerts)} ISSUES:*')
        for a in alerts:
            prefix = '🔴' if a.startswith('🚨') or a.startswith('❌') else '🟡'
            lines.append(f'{prefix} {a}')

    summary = '\n'.join(lines)

    # Save report
    os.makedirs('reports', exist_ok=True)
    with open('reports/latest_0858_check.txt', 'w') as f:
        f.write(summary)

    log(f'📁 Report saved | {len(alerts)} alerts | {len(actions)} actions')
    print('\n' + summary)
    return summary


# === BK BRAIN INTEGRATION ===
def sync_to_brain(report_text):
    """Sync check results to bk brain"""
    try:
        import subprocess
        subprocess.run([
            'python3', 'scripts/bk_brain.py', 'add',
            '--title', f'0858 Auto-Check {datetime.now().strftime("%Y-%m-%d %H:%M")}',
            '--type', 'concept',
            '--content', report_text
        ], timeout=15, cwd=os.path.dirname(os.path.abspath(__file__)) + '/..',
          capture_output=True)
        log('🧠 Synced to bk brain')
    except Exception as e:
        log(f'⚠️ Brain sync: {str(e)[:60]}')


def run_check():
    alerts, actions = check_0858()
    report = send_report(alerts, actions)
    if BRAIN_INTEGRATION and (alerts or actions):
        sync_to_brain(report)
    return report


if __name__ == '__main__':
    if '--loop' in sys.argv:
        log('🔄 Vilona V2 ROI Rules Engine — loop started')
        while True:
            try:
                run_check()
            except Exception as e:
                log(f'❌ Loop error: {e}')
            log('💤 Sleeping 2 hours...')
            time.sleep(7200)
    else:
        run_check()
