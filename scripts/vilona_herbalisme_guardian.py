#!/usr/bin/env python3
"""
Vilona Herbalisme Guardian — Autonomous Meta Ads Monitor
Account: act_1439536310038458 (0858 Herbalisme)
Monitors spend, CTR, CPC, CPM, conversions. Auto-alerts on anomalies.
Integrated: Berdu Conversion Logging, WAHA WhatsApp alerts, Telegram reports.

Run: python3 scripts/vilona_herbalisme_guardian.py
Service: systemctl --user enable vilona-guardian
"""

import requests
import json
import time
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path

# ── CONFIGURATION ──────────────────────────────────────────────
ACCESS_TOKEN = os.getenv('META_ACCESS_TOKEN', '')
AD_ACCOUNT_ID = 'act_1439536310038458'
AD_ACCOUNT_NUM = '1439536310038458'
WAHA_BASE = os.environ.get('WAHA_BASE', 'http://localhost:3003')
WAHA_SESSION = 'herbalisme'

# Telegram Bot (optional — for direct alerts to Veris)
TELEGRAM_BOT_TOKEN = os.environ.get('TELEGRAM_BOT_TOKEN', '')
TELEGRAM_CHAT_ID = '157228659'  # Andik Veris

# Paths
BASE_DIR = Path(__file__).resolve().parent.parent
LOG_DIR = BASE_DIR / 'logs'
BERDU_LOG = LOG_DIR / 'berdu_conversions.log'
GUARDIAN_LOG = LOG_DIR / 'vilona_guardian.log'
GUARDIAN_ERR = LOG_DIR / 'vilona_guardian.err'
STATE_FILE = LOG_DIR / 'vilona_guardian_state.json'

LOG_DIR.mkdir(parents=True, exist_ok=True)

# ── ALERT THRESHOLDS ──────────────────────────────────────────
ALERT_CONFIG = {
    'ctr_min': 0.8,        # Alert if CTR below 0.8%
    'cpc_max': 5000,       # Alert if CPC above IDR 5,000
    'cpm_max': 50000,      # Alert if CPM above IDR 50,000
    'spend_warn': 100000,  # Warn if single ad spends > IDR 100K with no conversions
    'spend_critical': 500000,  # CRITICAL: > IDR 500K with no conversions
    'zero_conversion_spend': 50000,  # Alert if spend > IDR 50K with 0 conversions
    'frequency_max': 4.0,  # Alert if frequency > 4.0
}

# ── LOGGING ────────────────────────────────────────────────────
def log(msg):
    ts = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    line = f"[{ts}] {msg}"
    print(line)
    with open(GUARDIAN_LOG, 'a') as f:
        f.write(line + '\n')

def log_error(msg):
    ts = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    line = f"[{ts}] ERROR: {msg}"
    print(line, file=sys.stderr)
    with open(GUARDIAN_ERR, 'a') as f:
        f.write(line + '\n')

def log_conversion(source, ad_name, value, status):
    """Log Berdu conversion events."""
    ts = datetime.now().isoformat()
    entry = json.dumps({
        'timestamp': ts,
        'source': source,
        'ad_name': ad_name,
        'value': value,
        'status': status
    })
    with open(BERDU_LOG, 'a') as f:
        f.write(entry + '\n')
    log(f"📈 BERDU: {ad_name} | {source} | {status} | IDR {value}")

# ── STATE MANAGEMENT ──────────────────────────────────────────
def load_state():
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text())
        except:
            pass
    return {
        'last_alert_time': {},
        'conversion_total': 0,
        'spend_total': 0,
        'last_report_time': None,
        'ads_paused_today': 0
    }

def save_state(state):
    STATE_FILE.write_text(json.dumps(state, indent=2))

# ── NOTIFICATIONS ─────────────────────────────────────────────
def send_telegram(message):
    """Send alert via Telegram Bot API."""
    if not TELEGRAM_BOT_TOKEN:
        return False
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    try:
        r = requests.post(url, json={
            'chat_id': TELEGRAM_CHAT_ID,
            'text': message,
            'parse_mode': 'Markdown'
        }, timeout=10)
        return r.ok
    except Exception as e:
        log_error(f"Telegram send failed: {e}")
        return False

def send_waha(number, message):
    """Send WhatsApp alert via WAHA."""
    try:
        url = f"{WAHA_BASE}/api/sendText"
        r = requests.post(url, json={
            'session': WAHA_SESSION,
            'chatId': number,
            'text': message
        }, timeout=10)
        if r.ok:
            log(f"📱 WAHA sent to {number}")
        else:
            log_error(f"WAHA send failed: {r.status_code} {r.text[:200]}")
        return r.ok
    except requests.ConnectionError:
        log("WAHA not available (connection refused)")
        return False

def send_alert(message, ad_name=""):
    """Send alert via all available channels."""
    key = ad_name or "system"
    
    # Throttle: same alert max once per 30 min
    state = load_state()
    last_alerts = state.get('last_alert_time', {})
    now = time.time()
    last_time = last_alerts.get(key, 0)
    if now - last_time < 1800:  # 30 min cooldown
        log(f"⏭️ Alert throttled for {key} (last: {int((now-last_time)/60)}m ago)")
        return
    
    # Update state
    last_alerts[key] = now
    state['last_alert_time'] = last_alerts
    save_state(state)
    
    # Send
    log(f"🚨 ALERT: {message}")
    send_telegram(message)
    # send_waha("628xxxx", message)  # Uncomment with actual WAHA number

# ── META ADS API ──────────────────────────────────────────────
GRAPH_URL = "https://graph.facebook.com/v19.0"

def meta_get(endpoint, params=None):
    """Call Meta Graph API with access token."""
    if params is None:
        params = {}
    params['access_token'] = ACCESS_TOKEN
    try:
        r = requests.get(f"{GRAPH_URL}/{endpoint}", params=params, timeout=15)
        data = r.json()
        if 'error' in data:
            log_error(f"Meta API error [{endpoint}]: {data['error'].get('message', 'unknown')}")
            return None
        return data
    except Exception as e:
        log_error(f"Meta API request failed [{endpoint}]: {e}")
        return None

def fetch_ad_insights():
    """Fetch today's ad-level insights."""
    data = meta_get(f"{AD_ACCOUNT_ID}/insights", {
        'date_preset': 'today',
        'level': 'ad',
        'fields': ','.join([
            'ad_id', 'ad_name',
            'spend', 'impressions', 'clicks', 'inline_link_clicks',
            'inline_link_click_ctr', 'cpc', 'cpm', 'cpp',
            'frequency', 'reach',
            'actions', 'action_values',
            'cost_per_action_type',
            'conversions', 'purchase_roas'
        ])
    })
    if not data:
        return []
    return data.get('data', [])

def fetch_campaign_summary():
    """Fetch campaign-level summary for higher-level view."""
    data = meta_get(f"{AD_ACCOUNT_ID}/insights", {
        'date_preset': 'today',
        'level': 'campaign',
        'fields': 'campaign_name,spend,impressions,clicks,cpc,cpm,frequency,reach,actions,action_values'
    })
    if not data:
        return []
    return data.get('data', [])

def pause_ad(ad_id):
    """Pause a Meta ad by ID."""
    result = meta_get(f"{ad_id}", {'fields': 'name,status'})
    if result and result.get('status') == 'ACTIVE':
        data = meta_get(f"{ad_id}", params=None)  # Need POST to update
        # We need a POST request
        try:
            url = f"{GRAPH_URL}/{ad_id}"
            r = requests.post(url, data={
                'access_token': ACCESS_TOKEN,
                'status': 'PAUSED'
            }, timeout=15)
            result_data = r.json()
            if 'success' in result_data:
                log(f"⏸️ PAUSED AD: {ad_id} ({result.get('name', 'unknown')})")
                state = load_state()
                state['ads_paused_today'] = state.get('ads_paused_today', 0) + 1
                save_state(state)
                return True
            else:
                log_error(f"Failed to pause ad {ad_id}: {result_data.get('error', {}).get('message', 'unknown')}")
                return False
        except Exception as e:
            log_error(f"Failed to pause ad {ad_id}: {e}")
            return False
    return False

# ── WAHA INTEGRATION ──────────────────────────────────────────
def check_waha_status():
    """Check if WAHA session is active."""
    try:
        r = requests.get(f"{WAHA_BASE}/api/sessions", timeout=5)
        if r.ok:
            sessions = r.json()
            for s in sessions if isinstance(sessions, list) else [sessions]:
                if s.get('name') == WAHA_SESSION or s.get('session') == WAHA_SESSION:
                    status = s.get('status', '')
                    if status in ('AUTHENTICATED', 'CONNECTED', 'active'):
                        return True
            log("WAHA session not found or not authenticated")
            return False
    except requests.ConnectionError:
        return False
    except Exception as e:
        log_error(f"WAHA status check error: {e}")
    return False

# ── ANALYTICS & ALERTS ────────────────────────────────────────
def extract_actions(ad, action_type='purchase'):
    """Extract specific action count from Meta actions array."""
    actions = ad.get('actions', [])
    if isinstance(actions, list):
        for a in actions:
            if a.get('action_type') == action_type:
                return int(a.get('value', 0))
    return 0

def extract_action_values(ad, action_type='purchase'):
    """Extract specific action conversion value."""
    action_values = ad.get('action_values', [])
    if isinstance(action_values, list):
        for a in action_values:
            if a.get('action_type') == action_type:
                return float(a.get('value', 0))
    return 0.0

def analyze_ad_performance(ad):
    """Analyze single ad, return alerts list."""
    alerts = []
    ad_name = ad.get('ad_name', 'Unknown')
    ad_id = ad.get('ad_id', '')
    spend = float(ad.get('spend', 0))
    ctr = float(ad.get('inline_link_click_ctr', 0))
    cpc = float(ad.get('cpc', 0))
    cpm = float(ad.get('cpm', 0))
    frequency = float(ad.get('frequency', 1.0))
    purchases = extract_actions(ad, 'purchase')
    purchase_value = extract_action_values(ad, 'purchase')

    # Log ad performance
    log_berdu = False

    # 1. LOW CTR
    if spend > 10000 and ctr < ALERT_CONFIG['ctr_min']:
        alerts.append({
            'type': 'LOW_CTR',
            'severity': 'critical' if spend > 100000 else 'warning',
            'message': (
                f"🚨 LOW CTR ALERT\n"
                f"Ad: `{ad_name}`\n"
                f"CTR: {ctr:.2f}% (threshold: {ALERT_CONFIG['ctr_min']}%)\n"
                f"Spend: IDR {spend:,.0f}\n"
                f"Action: Creative fatigue — rotate immediately"
            )
        })

    # 2. HIGH CPC
    if spend > 50000 and cpc > ALERT_CONFIG['cpc_max']:
        alerts.append({
            'type': 'HIGH_CPC',
            'severity': 'warning',
            'message': (
                f"⚠️ HIGH CPC\n"
                f"Ad: `{ad_name}`\n"
                f"CPC: IDR {cpc:,.0f} (threshold: IDR {ALERT_CONFIG['cpc_max']:,})\n"
                f"Action: Check audience targeting"
            )
        })

    # 3. HIGH FREQUENCY
    if frequency > ALERT_CONFIG['frequency_max']:
        alerts.append({
            'type': 'HIGH_FREQUENCY',
            'severity': 'warning',
            'message': (
                f"⚠️ HIGH FREQUENCY\n"
                f"Ad: `{ad_name}`\n"
                f"Freq: {frequency:.1f}x (threshold: {ALERT_CONFIG['frequency_max']}x)\n"
                f"Action: Audience fatigue — refresh creative"
            )
        })

    # 4. ZERO CONVERSIONS WITH HIGH SPEND
    if purchases == 0 and spend > ALERT_CONFIG['zero_conversion_spend']:
        severity = 'critical' if spend > ALERT_CONFIG['spend_critical'] else 'warning'
        alerts.append({
            'type': 'ZERO_CONVERSION',
            'severity': severity,
            'message': (
                f"{'🆘' if severity == 'critical' else '⚠️'} ZERO CONVERSIONS\n"
                f"Ad: `{ad_name}`\n"
                f"Spend: IDR {spend:,.0f} | Purchases: 0\n"
                f"CPM: IDR {cpm:,.0f} | CPC: IDR {cpc:,.0f}\n"
                f"Action: {'⚠️ PAUSE IMMEDIATELY' if severity == 'critical' else 'Check landing page / creative'}"
            )
        })

    # 5. POSITIVE CONVERSIONS — log Berdu
    if purchases > 0:
        log_conversion('facebook', ad_name, purchase_value, 'converted')
        log_berdu = True
        if purchase_value > 0:
            roas = purchase_value / spend if spend > 0 else 0
            log(f"💰 ROAS: {roas:.2f}x | Ad: {ad_name} | Spend: IDR {spend:,.0f} | Revenue: IDR {purchase_value:,.0f}")

    return alerts, log_berdu

# ── SUMMARY REPORTS ───────────────────────────────────────────
def generate_summary():
    """Generate 6-hour performance summary."""
    insights = fetch_ad_insights()
    campaigns = fetch_campaign_summary()
    
    total_spend = sum(float(a.get('spend', 0)) for a in insights)
    total_purchases = sum(extract_actions(a, 'purchase') for a in insights)
    total_revenue = sum(extract_action_values(a, 'purchase') for a in insights)
    total_impressions = sum(int(a.get('impressions', 0)) for a in insights)
    total_clicks = sum(int(a.get('clicks', 0)) for a in insights)
    
    avg_ctr = (total_clicks / total_impressions * 100) if total_impressions > 0 else 0
    avg_cpc = (total_spend / total_clicks) if total_clicks > 0 else 0
    roas = (total_revenue / total_spend) if total_spend > 0 else 0
    
    # Active ad count
    active_ads = len(insights)
    
    # Best & worst ads
    ads_with_data = [(a.get('ad_name', '?'), float(a.get('spend', 0)), extract_actions(a, 'purchase'), extract_action_values(a, 'purchase')) for a in insights]
    ads_with_data.sort(key=lambda x: x[2], reverse=True)
    best_ads = [a for a in ads_with_data if a[2] > 0][:3]
    worst_ads = [a for a in ads_with_data if a[2] == 0 and a[1] > 50000][:3]
    
    # Ad count
    state = load_state()
    ads_paused = state.get('ads_paused_today', 0)
    
    now = datetime.now().strftime('%Y-%m-%d %H:%M')
    report = (
        f"📊 **Vilona 6-Hour Report**\n"
        f"🕐 {now} WIB\n\n"
        f"**📈 Account Summary**\n"
        f"• Active Ads: {active_ads}\n"
        f"• Total Spend: IDR {total_spend:,.0f}\n"
        f"• Impressions: {total_impressions:,}\n"
        f"• Clicks: {total_clicks:,}\n"
        f"• CTR: {avg_ctr:.2f}%\n"
        f"• CPC: IDR {avg_cpc:,.0f}\n\n"
        f"**💰 Conversions**\n"
        f"• Purchases: {total_purchases}\n"
        f"• Revenue: IDR {total_revenue:,.0f}\n"
        f"• ROAS: {roas:.2f}x\n"
    )
    
    if best_ads:
        report += "\n**🏆 Top Performers**\n"
        for name, sp, conv, rev in best_ads:
            report += f"• `{name[:40]}` — {conv} purchases | IDR {rev:,.0f} rev | IDR {sp:,.0f} spend\n"
    
    if worst_ads:
        report += "\n**⚠️ Draining Ads (0 purchases)**\n"
        for name, sp, _, _ in worst_ads:
            report += f"• `{name[:40]}` — IDR {sp:,.0f} spent, 0 sales\n"
    
    report += f"\n**⏸️ Actions**\n"
    report += f"• Auto-paused today: {ads_paused}\n"
    report += f"• Guardian status: ✅ Active\n"
    
    return report

# ── MAIN MONITOR LOOP ────────────────────────────────────────
def monitor_loop():
    log(f"{'='*60}")
    log(f"🔥 Vilona Herbalisme Guardian Activated")
    log(f"📋 Account: {AD_ACCOUNT_NUM}")
    log(f"🕐 Started: {datetime.now().isoformat()}")
    log(f"{'='*60}")
    
    # Check WAHA at startup
    waha_ok = check_waha_status()
    if waha_ok:
        log("📱 WAHA session active ✓")
    else:
        log("📱 WAHA not available (will retry)")
    
    state = load_state()
    last_waha_check = 0
    
    while True:
        try:
            now = datetime.now()
            now_ts = time.time()
            
            # ═══ 1. FETCH META ADS INSIGHTS ═══
            insights = fetch_ad_insights()
            campaigns = fetch_campaign_summary()
            
            if not insights:
                log("No ad insights returned (possibly no active ads)")
            else:
                log(f"📊 Monitoring {len(insights)} ads")
                
                # Analyze each ad
                total_alerts = 0
                for ad in insights:
                    alerts, _ = analyze_ad_performance(ad)
                    for alert in alerts:
                        total_alerts += 1
                        send_alert(alert['message'], ad.get('ad_name', ''))
                        
                        # CRITICAL alerts → auto-pause
                        if alert['severity'] == 'critical' and alert['type'] == 'ZERO_CONVERSION':
                            ad_id = ad.get('ad_id', '')
                            if ad_id:
                                log(f"🆘 AUTO-PAUSING {ad.get('ad_name', '?')} ({ad_id})")
                                pause_ad(ad_id)
                
                if total_alerts == 0:
                    log("✅ All ads healthy — no alerts triggered")
            
            # ═══ 2. CHECK WAHA STATUS (every 30 min) ═══
            if now_ts - last_waha_check > 1800:
                waha_ok = check_waha_status()
                last_waha_check = now_ts
            
            # ═══ 3. SEND 6-HOUR REPORT ═══
            last_report = state.get('last_report_time')
            should_report = False
            if not last_report:
                should_report = True
            else:
                last_report_dt = datetime.fromisoformat(last_report)
                hours_since = (now - last_report_dt).total_seconds() / 3600
                if hours_since >= 6:
                    should_report = True
            
            # Also send at 7/13/19/01 WIB (aligned hours)
            if now.hour in [7, 13, 19, 1] and now.minute < 5:
                should_report = True
            
            if should_report:
                report = generate_summary()
                log(f"\n📊 6-HOUR REPORT:\n{report}")
                send_telegram(report)
                
                # Update state
                state['last_report_time'] = now.isoformat()
                state['spend_total'] = sum(float(a.get('spend', 0)) for a in insights)
                state['conversion_total'] = sum(extract_actions(a, 'purchase') for a in insights)
                save_state(state)
            
            # ═══ 4. LOG STATUS ═══
            with open(GUARDIAN_LOG, 'a') as f:
                f.write(f"[{now}] System Healthy. Monitoring {len(insights)} ads.\n")
            
        except KeyboardInterrupt:
            log("🛑 Guardian stopped by user")
            break
        except Exception as e:
            log_error(f"Monitor loop exception: {e}")
            import traceback
            log_error(traceback.format_exc())
        
        # Sleep 5 minutes between checks
        time.sleep(300)

# ── ENTRY POINT ────────────────────────────────────────────────
if __name__ == "__main__":
    try:
        monitor_loop()
    except KeyboardInterrupt:
        log("Shutting down gracefully...")
        sys.exit(0)
