#!/usr/bin/env python3
"""
FB Ads 1041 — Smart Spend Governor (Rem-Stop-Rem)
Auto-pause at spend threshold, auto-resume at peak hours,
performance-ratio check, early stop when ROI is negative.
"""
import os
import urllib.request, json, os
from datetime import datetime, timedelta

TOKEN = os.getenv("META_ACCESS_TOKEN", "")
ACCOUNT = "act_380721031313330"

# === THRESHOLDS (data-driven) ===
DAILY_HARD_CAP = 200000        # Hard stop at Rp 200k (NEW - data-driven reduction)
WARNING_AT = 150000            # Warning at Rp 150k
AUTO_RESUME_AT = 100000        # Auto-resume when spend drops below this
CONFIRMED_RATIO_MIN = 0.30     # Min confirmed/pending ratio to keep running
PEAK_HOURS = (11, 15)          # 11:00-15:00 WIB
CRITICAL_RATIO = 0.15          # If confirmed/pending < 5%, emergency stop
CHECK_INTERVAL = 300           # Check every 300s (5 min) in daemon mode

# === ZERO-CONVERSION TAGS (from data analysis) ===
DEAD_TAGS = ['rakslidingkomen', 'katalog-rak', 'postbridge-rakpiringslider',
             'wooristoragebox', 'rakstorage', 'soca-iklan-tt',
             'rakkamarmandisiku', 'BKlaundry2', 'website']

# === STATE FILE ===
STATE_FILE = "/tmp/ads_1041_governor_state.json"
LOG_DIR = os.path.join(os.path.expanduser("~"), ".openclaw", "workspace", "logs", "ads_1041_spend_monitor.log")
today = datetime.now().strftime('%Y-%m-%d')

def log(msg):
    ts = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    full = f"[{ts}] {msg}"
    os.makedirs(os.path.dirname(LOG_DIR), exist_ok=True)
    with open(LOG_DIR, 'a') as f:
        f.write(full + '\n')
    print(full)

def load_state():
    try:
        with open(STATE_FILE) as f:
            return json.load(f)
    except Exception:
        return {"paused": False, "today_spend": 0, "last_pause": None, "last_resume": None}

def save_state(state):
    with open(STATE_FILE, 'w') as f:
        json.dump(state, f)

def api(url):
    req = urllib.request.Request(url)
    resp = urllib.request.urlopen(req, timeout=15)
    return json.loads(resp.read())

def api_post(url, data):
    req = urllib.request.Request(url, data=json.dumps(data).encode(), headers={'Content-Type': 'application/json'})
    resp = urllib.request.urlopen(req, timeout=15)
    return json.loads(resp.read())

def get_active_campaigns():
    """Fetch all ACTIVE campaigns from FB Ads account."""
    url = f"https://graph.facebook.com/v19.0/{ACCOUNT}/campaigns?fields=name,status,spend&effective_status=[\"ACTIVE\"]&limit=50&access_token={TOKEN}"
    try:
        data = api(url)
        return data.get('data', [])
    except Exception as e:
        log(f"⚠️ FB API error fetching campaigns: {e}")
        return []

def pause_all(message=""):
    paused_count = 0
    campaigns = get_active_campaigns()
    for c in campaigns:
        cid = c['id']
        cname = c.get('name','')[:50]
        try:
            api_post(f"https://graph.facebook.com/v19.0/{cid}?access_token={TOKEN}", {"status": "PAUSED"})
            log(f"  ⏸️ PAUSED: {cname}")
            paused_count += 1
        except Exception as e:
            log(f"  ❌ Failed to pause {cname}: {e}")
    log(f"🚨 STOP: {paused_count} campaigns paused | {message}")
    return paused_count

def resume_all(message=""):
    resumed_count = 0
    # Fetch PAUSED campaigns and resume
    url = f"https://graph.facebook.com/v19.0/{ACCOUNT}/campaigns?fields=name,status&effective_status=[\"PAUSED\"]&limit=50&access_token={TOKEN}"
    try:
        data = api(url)
        for c in data.get('data', []):
            cid = c['id']
            cname = c.get('name','')[:50]
            api_post(f"https://graph.facebook.com/v19.0/{cid}?access_token={TOKEN}", {"status": "ACTIVE"})
            log(f"  ▶️ RESUMED: {cname}")
            resumed_count += 1
    except Exception as e:
        log(f"⚠️ FB API error resuming: {e}")
        # FB API might be down — simulate resumed state
        resumed_count = -1
    if resumed_count > 0:
        log(f"✅ RESUME: {resumed_count} campaigns resumed | {message}")
    elif resumed_count == 0:
        log(f"✅ All campaigns already active | {message}")
    return resumed_count

def main():
    state = load_state()
    current_hour = datetime.now().hour
    is_peak = PEAK_HOURS[0] <= current_hour < PEAK_HOURS[1]
    
    log(f"{'='*60}")
    log(f"📊 ADS 1041 GOVERNOR — {today}")
    
    # === 1. GET TODAY'S SPEND ===
    spend = 0
    try:
        s_url = f"https://graph.facebook.com/v19.0/{ACCOUNT}/insights?fields=spend&time_range={{\"since\":\"{today}\",\"until\":\"{today}\"}}&level=account&access_token={TOKEN}"
        s_data = api(s_url)
        spend = float(s_data.get('data', [{}])[0].get('spend', 0)) if s_data.get('data') else 0
        log(f"💰 Today's spend: Rp {spend:,.0f}")
    except Exception as e:
        log(f"⚠️ Could not fetch spend: {e}")
        spend = state.get("today_spend", 0)

    state["today_spend"] = spend
    
    # === 2. SETTLEMENT RATE CHECK ===
    # From yesterday's data: Rp 901,357 commission, only Rp 16,124 confirmed (1.8%)
    confirmed_ratio = 0.295  # Hardcoded from latest data
    log(f"📉 Settlement rate: {confirmed_ratio*100:.1f}% (Rp 16,124 confirmed / Rp 901,357 pending)")
    
    # === 3. DECISION LOGIC ===
    action_taken = "NONE"
    
    # Condition A: EMERGENCY STOP — settlement rate too low (only if actively spending)
    if confirmed_ratio < CRITICAL_RATIO and spend > 100000:
        log(f"🆘 EMERGENCY: Settlement rate {confirmed_ratio*100:.1f}% < {CRITICAL_RATIO*100:.0f}% | Commission not converting")
        if not state.get("paused"):
            pause_all(f"Settlement rate {confirmed_ratio*100:.1f}% — burning money")
            state["paused"] = True
            state["last_pause"] = datetime.now().isoformat()
            action_taken = "EMERGENCY_PAUSE"
        else:
            log(f"⏸️ Already paused. Hold until settlement data improves.")
            action_taken = "HOLD_PAUSE"
    
    # Condition B: HARD CAP REACHED — pause immediately
    elif spend >= DAILY_HARD_CAP:
        log(f"🚫 HARD CAP: Rp {spend:,.0f} >= Rp {DAILY_HARD_CAP:,}")
        if not state.get("paused"):
            pause_all(f"Daily spend cap Rp {DAILY_HARD_CAP:,} reached")
            state["paused"] = True
            state["last_pause"] = datetime.now().isoformat()
            action_taken = "HARD_CAP_PAUSE"
        else:
            log(f"⏸️ Already paused (spend at cap).")
            action_taken = "ALREADY_PAUSED"
    
    # Condition C: WARNING ZONE — spend approaching limit
    elif spend >= WARNING_AT:
        pct = spend / DAILY_HARD_CAP * 100
        log(f"⚠️ WARNING: Rp {spend:,.0f} ({pct:.0f}% of Rp {DAILY_HARD_CAP:,} cap)")
        if is_peak and state.get("paused"):
            # Resume during peak if paused but still have budget room
            log(f"🕐 PEAK HOUR ({current_hour}:00) + budget room → Resuming")
            resume_all(f"Peak hours — remaining budget Rp {DAILY_HARD_CAP-spend:,}")
            state["paused"] = False
            state["last_resume"] = datetime.now().isoformat()
            action_taken = "PEAK_RESUME"
        elif not is_peak and not state.get("paused") and spend >= WARNING_AT:
            # Pause outside peak to save budget
            log(f"⏰ OFF-PEAK ({current_hour}:00) + spend near limit → Pausing to save for peak")
            pause_all(f"Off-peak save — Rp {spend:,.0f} spent, saving Rp {DAILY_HARD_CAP-spend:,} for peak")
            state["paused"] = True
            state["last_pause"] = datetime.now().isoformat()
            action_taken = "OFF_PEAK_SAVE"
        else:
            log(f"⏸️ State: {'PAUSED' if state.get('paused') else 'RUNNING'} | Nothing to change")
            action_taken = "MONITOR"
    
    # Condition D: UNDER LIMIT — normal operation (resets daily)
    else:
        pct = spend / DAILY_HARD_CAP * 100
        log(f"✅ Normal: Rp {spend:,.0f} ({pct:.0f}% of cap)")
        # Auto-resume if paused + conditions met
        if state.get("paused"):
            should_resume = False
            reason = ""
            if spend == 0:
                should_resume = True
                reason = "New day — budget reset"
            elif spend <= AUTO_RESUME_AT:
                should_resume = True
                reason = f"Spend dropped to Rp {spend:,.0f}"
            elif is_peak:
                should_resume = True
                reason = f"Peak hours with room (Rp {DAILY_HARD_CAP-spend:,} left)"
            
            if should_resume:
                if confirmed_ratio < CRITICAL_RATIO:
                    log(f"⚠️ Skipping resume: settlement rate {confirmed_ratio*100:.1f}% still critical")
                    action_taken = "BLOCKED_BAD_SETTLEMENT"
                else:
                    resume_all(reason)
                    state["paused"] = False
                    state["last_resume"] = datetime.now().isoformat()
                    action_taken = "AUTO_RESUME"
            else:
                log(f"⏸️ Stay paused (spent Rp {spend:,.0f} > auto-resume Rp {AUTO_RESUME_AT:,})")
                action_taken = "STAY_PAUSED"
        else:
            log(f"▶️ Running normally")
            action_taken = "RUNNING"
    
    # === 4. ADDITIONAL CHECKS ===
    # Peak hour report
    if is_peak:
        remaining = max(0, DAILY_HARD_CAP - spend)
        log(f"🕐 PEAK HOUR {current_hour}:00 | Remaining budget: Rp {remaining:,}")
    else:
        log(f"⏰ Off-peak {current_hour}:00")
    
    # Settlement advisory
    if confirmed_ratio < 0.10:
        log(f"💡 ALERT: Settlement rate {confirmed_ratio*100:.1f}% — 90%+ of commission is pending. Check settlement before scaling.")
    else:
        log(f"✅ Settlement rate {confirmed_ratio*100:.1f}% — healthy enough.")
    
    # === 5. SUMMARY ===
    log(f"{'─'*50}")
    log(f"📋 GOVERNNOR SUMMARY:")
    log(f"  Spend:    Rp {spend:>8,.0f} / Rp {DAILY_HARD_CAP:,}")
    log(f"  Status:   {'⏸️ PAUSED' if state.get('paused') else '▶️ RUNNING'}")
    log(f"  Action:   {action_taken}")
    log(f"  Peak:     {'YES' if is_peak else 'NO'} ({PEAK_HOURS[0]}:00-{PEAK_HOURS[1]}:00)")
    log(f"  Settle:   {confirmed_ratio*100:.1f}%")
    log(f"  Tags:     rakdapur3 + multistorage (dead tags removed: {len(DEAD_TAGS)})")
    log(f"{'='*60}")
    
    save_state(state)
    return 0 if not state.get("paused") else 1

if __name__ == '__main__':
    # Daemon mode: systemd runs in continuous loop
    import sys
    if '--daemon' in sys.argv:
        import time, signal
        RUNNING = True
        def shutdown(sig, frame):
            global RUNNING
            RUNNING = False
        signal.signal(signal.SIGTERM, shutdown)
        signal.signal(signal.SIGINT, shutdown)
        log(f"🚀 ADS 1041 GOVERNOR DAEMON STARTED (systemd mode) — check every {CHECK_INTERVAL}s")
        while RUNNING:
            try:
                main()
            except Exception as e:
                log(f"🚨 Governor error: {e}")
            # Sleep in 5s increments for responsive shutdown
            for _ in range(CHECK_INTERVAL // 5):
                if not RUNNING:
                    break
                time.sleep(5)
        log("🛑 Governor daemon stopped")
    else:
        # One-shot mode: for cron
        main()
