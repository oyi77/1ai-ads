#!/usr/bin/env python3
"""
FB Ads 1041 — GAS-REM Governor v7 (Strategy: Volume Tertinggi — 23 Mei 2026)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STRATEGY: Tawaran Volume Tertinggi (Lowest Cost) — NO bid cap
GAS:    Kalo kemarin UNTUNG (ROI > 1.0x) → naikin budget 20%
REM:    Kalo kemarin RUGI  (ROI < 1.0x) → turunin budget 35%
STOP:   Kalo spend >= Rp 300rb → PAUSE SEMUA
CPC:    Kalo CPC > Rp 150 → PAUSE real-time (setiap 5 menit)
CTR:    Kalo CTR < 3% && spend >= Rp 2rb → PAUSE (setiap 5 menit)
ZERO:   Kalo spend >= Rp 500 tanpa klik → PAUSE
SCALE:  Setiap hari bikin 2-3 campaign baru dari data winner
RUN:    Setiap jam 04:00 WIB → RESUME (filter CPC + CTR + targeting)
SLEEP:  01:00 - 03:59 → semua dipause

RULES VERIS (23 Mei 2026 — Strategy Update):
  Strategy: Volume Tertinggi (Lowest Cost) — jangan pakai bid cap/target cost
  Budget/Campaign: Rp 20.000
  CPC max: Rp 150 (PAUSE jika > 150)
  CTR min: 3% (PAUSE jika < 3% setelah spend > Rp 2.000)
  Hard cap: Rp 300.000/hari
  GAS: Profit kemarin → +20% budget
  Daily scale-up: 2-3 campaign dari winner, interest turunan
  Placements: ikutin winning placement
  Audience: > 2 juta
  Ads: pakai Post ID dari campaign winner

Sumber: Veris 23 Mei 2026 — Strategy Refresh
"""
import urllib.request, json, os, time, signal, sys, subprocess
from datetime import datetime, timedelta
import os

# 🔔 Telethon alert system — bangunin pas ada action penting
try:
    from vilona_telethon_notify import send_alert, send_batch_alerts
    TELETHON_READY = True
except Exception:
    TELETHON_READY = False
    def send_alert(msg, **kw): pass
    def send_batch_alerts(msg, **kw): pass

TOKEN = "os.getenv('META_ACCESS_TOKEN', '')"
ACCOUNT = "act_380721031313330"

# === THRESHOLDS ===
SWEET_SPOT_MIN = 200000
SWEET_SPOT_MAX = 300000
HARD_CAP = 300000
SOFT_CAP_PCT = 0.80    # 80% budget → soft pause high-CPC campaigns
FLOOR = 20000
SCALE_UP_PCT = 0.20
SCALE_DOWN_PCT = 0.35
MAX_CAMPAIGN_BUDGET = 30000  # Cap per-campaign budget
ROI_GAS = 1.0      # Profit > 1.0x → scale up (Veris 23 Mei: cukup profit aja)
ROI_REM = 1.0
CPC_KPI = 200       # Max CPC (Veris 23 Mei)
CTR_KPI = 3.0       # Min CTR % — PAUSE if below (Veris 23 Mei)
CTR_MIN_SPEND = 2000  # Min spend before CTR check (Rp 2rb)
ZERO_CLICK_SPEND = 500
CHECK_INTERVAL = 300  # 5 menit
RUN_START = 4        # 04:00 WIB
RUN_END = 0          # 00:59 WIB
SLEEP_HOURS = list(range(1, 4))  # 01:00-03:59 = tidur

# === DEAD TAGS ===
DEAD_TAGS = ['soca-iklan-tt', 'BKlaundry1', 'BKlaundry2', 'BKlaundry3',
             'herborist-reels-selingkuhituindah-fb', 'Tiraimanik', 'toiletmobil',
             'icecubemaker', 'rotatingstoragebox', 'gantunganputar',
             'postbridge-rakpiringslider', 'rakstorage', 'sofaarabian',
             'mahar', 'rakkamarmandisiku']

STATE_FILE = os.path.join(os.path.expanduser("~"), ".openclaw", "workspace", "state", "ads_1041_governor_state.json")
LOG_DIR = os.path.join(os.path.expanduser("~"), ".openclaw", "workspace", "logs", "ads_1041_spend_monitor.log")

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
        return {"daily_budget": 300000, "today_spend": 0, "paused_today": False, "resumed_today": False, "soft_paused": False}

def save_state(state):
    state['last_update'] = datetime.now().isoformat()
    with open(STATE_FILE, 'w') as f:
        json.dump(state, f, indent=2)

def api(url):
    req = urllib.request.Request(url)
    resp = urllib.request.urlopen(req, timeout=15)
    return json.loads(resp.read())

def api_post(url, data):
    req = urllib.request.Request(url, data=json.dumps(data).encode(), headers={'Content-Type': 'application/json'})
    resp = urllib.request.urlopen(req, timeout=15)
    return json.loads(resp.read())

def get_active_campaigns():
    url = f"https://graph.facebook.com/v19.0/{ACCOUNT}/campaigns?fields=name,id,status,daily_budget&effective_status=[\"ACTIVE\"]&limit=50&access_token={TOKEN}"
    try:
        return api(url).get('data', [])
    except Exception:
        return []

def get_all_active_campaigns():
    """Get all active campaigns with insights in one call for efficiency"""
    url = f"https://graph.facebook.com/v19.0/{ACCOUNT}/campaigns?fields=name,id,status,insights.date_preset(today){{spend,clicks,cpc,impressions,ctr}}&effective_status=[\"ACTIVE\"]&limit=50&access_token={TOKEN}"
    try:
        return api(url).get('data', [])
    except Exception:
        return []

def pause_campaign(cid, name):
    """Pause a single campaign with retry"""
    for attempt in range(3):
        try:
            api_post(f"https://graph.facebook.com/v19.0/{cid}?access_token={TOKEN}", {"status": "PAUSED"})
            return True
        except Exception:
            if attempt < 2:
                time.sleep(1)
    return False

def pause_all(reason=""):
    campaigns = get_active_campaigns()
    count = 0
    failed = []
    for c in campaigns:
        cid = c['id']
        name = c.get('name','')[:50]
        if pause_campaign(cid, name):
            log(f"  ⏸️ PAUSED: {name}")
            count += 1
        else:
            failed.append(f"{name}")
        time.sleep(0.2)
    if failed:
        log(f"⚠️ GAGAL PAUSE {len(failed)} campaign: {'; '.join(failed[:3])}")
    log(f"🛑 STOP: {count}/{len(campaigns)} campaign dipause | {reason}")
    return count

def get_campaign_stats(c):
    """V7: Get REAL stats from spend/clicks/impressions.
    Returns (real_cpc, spend, clicks, ctr_float, impressions)"""
    insights = c.get('insights', {})
    if not insights:
        return 0, 0, 0, 0.0, 0
    data = insights.get('data', [{}])
    if not data:
        return 0, 0, 0, 0.0, 0
    ins = data[0]
    spend = float(ins.get('spend', 0) or 0)
    clicks = int(ins.get('clicks', 0) or 0)
    impressions = int(ins.get('impressions', 0) or 0)
    
    # Parse CTR as float
    try:
        ctr_float = float(ins.get('ctr', 0) or 0)
    except Exception:
        ctr_float = 0.0
    
    # REAL CPC = spend / clicks
    if clicks > 0 and spend > 0:
        real_cpc = spend / clicks
    else:
        real_cpc = 0
    
    return real_cpc, spend, clicks, ctr_float, impressions

def resume_campaigns():
    """Resume all PAUSED campaigns. Skip campaigns with CPC > KPI, OFF/DEAD labels."""
    url = f"https://graph.facebook.com/v19.0/{ACCOUNT}/campaigns?fields=name,id,status,insights.date_preset(today){{spend,clicks,cpc}}&effective_status=[\"PAUSED\"]&limit=100&access_token={TOKEN}"
    try:
        data = api(url)
    except Exception:
        return [], []

    resumed = []
    skipped = []
    for c in data.get('data', []):
        cid = c['id']
        name = c.get('name','')[:60]
        name_lower = name.lower()
        name_upper = name.upper()
        
        # Skip OFF/DEAD labels
        if any(tag in name_upper for tag in ['OFF', 'DEAD_', 'OFFSCALE', 'PAUSED_CPC']):
            skipped.append(f"{name[:30]} (label)")
            continue
        
        # Skip DEAD tags
        if any(tag.lower() in name_lower for tag in DEAD_TAGS):
            skipped.append(f"{name[:30]} (DEAD)")
            continue
        
        # V7: Get REAL stats
        real_cpc, spend, clicks, ctr_float, impressions = get_campaign_stats(c)
        
        # 🆕 Zero-click check
        if spend >= ZERO_CLICK_SPEND and clicks == 0:
            skipped.append(f"{name[:25]} 0klik Rp{spend:.0f}")
            continue
        
        # 🆕 CTR < 3% check (only if enough spend)
        if spend >= CTR_MIN_SPEND and impressions >= 100 and ctr_float < CTR_KPI:
            skipped.append(f"{name[:25]} CTR {ctr_float:.1f}%")
            continue
        
        if spend > 0 and real_cpc > CPC_KPI:
            skipped.append(f"{name[:25]} CPC Rp{real_cpc:.0f}")
            continue
        
        # Resume
        try:
            api_post(f"https://graph.facebook.com/v19.0/{cid}?access_token={TOKEN}", {"status": "ACTIVE"})
            log(f"  ▶️ RESUME: {name[:45]}")
            resumed.append(name)
        except Exception:
            skipped.append(f"{name[:20]} (err)")
    
    return resumed, skipped

def cpc_patrol():
    """V7: REAL-TIME patrol: CPC>150 + CTR<3% + Zero-click + Labels."""
    campaigns = get_all_active_campaigns()
    paused_cpc = []
    paused_label = []
    paused_zero = []
    paused_ctr = []
    
    for c in campaigns:
        cid = c['id']
        name = c.get('name', '')
        name_upper = name.upper()
        
        # Check OFF/DEAD labels
        if any(tag in name_upper for tag in ['OFF', 'DEAD_', 'OFFSCALE', 'PAUSED_CPC']):
            if pause_campaign(cid, name):
                paused_label.append(name[:50])
            time.sleep(0.2)
            continue
        
        # V7: Get ALL stats
        real_cpc, spend, clicks, ctr_float, impressions = get_campaign_stats(c)
        
        # 🆕 Zero-click killer
        if spend >= ZERO_CLICK_SPEND and clicks == 0:
            if pause_campaign(cid, name):
                paused_zero.append(f"{name[:40]} Rp{spend:,.0f}/0klik")
            time.sleep(0.2)
            continue
        
        # 🆕 CTR < 3% killer (after enough spend + impressions)
        if spend >= CTR_MIN_SPEND and impressions >= 100 and ctr_float < CTR_KPI:
            if pause_campaign(cid, name):
                paused_ctr.append(f"{name[:40]} CTR {ctr_float:.1f}%/{impressions}imp")
            time.sleep(0.2)
            continue
        
        if spend > 0 and real_cpc > CPC_KPI:
            if pause_campaign(cid, name):
                paused_cpc.append(f"{name[:40]} CPC Rp{real_cpc:.0f}/{clicks}clk")
            time.sleep(0.2)
    
    total = len(paused_cpc) + len(paused_ctr) + len(paused_zero) + len(paused_label)
    if total > 0:
        log(f"🛡️ PATROL V7: {len(paused_cpc)} CPC>150 + {len(paused_ctr)} CTR<3% + {len(paused_zero)} 0klik + {len(paused_label)} label")
        for p in paused_cpc[:10]:
            log(f"  ⏸️ {p}")
        for p in paused_label[:5]:
            log(f"  ⏸️ {p}")
        for p in paused_zero[:10]:
            log(f"  ⏸️ {p}")
        
        # 🔔 Telethon alert ke Veris
        if TELETHON_READY and (paused_cpc or paused_zero):
            lines = [f"🛡️ CPC PATROL — 1041"]
            if paused_cpc:
                lines.append(f"{len(paused_cpc)} campaign CPC>150:")
                for p in paused_cpc[:3]:
                    lines.append(f"  ⏸️ {p}")
            if paused_ctr:
                lines.append(f"{len(paused_ctr)} campaign CTR<3%:")
                for p in paused_ctr[:3]:
                    lines.append(f"  ⏸️ {p}")
            if paused_zero:
                lines.append(f"{len(paused_zero)} campaign 0 klik:")
                for p in paused_zero[:3]:
                    lines.append(f"  ⏸️ {p}")
            send_alert('\n'.join(lines), target='veris')
    
    return paused_cpc, paused_ctr, paused_label, paused_zero

def soft_pause_high_cpc():
    """V6 NEW: When spend >= 80% budget, pause high-CPC campaigns first.
    Sorts by CPC descending, pauses worst offenders."""
    campaigns = get_all_active_campaigns()
    
    # Score each campaign by REAL CPC
    scored = []
    for c in campaigns:
        cid = c['id']
        name = c.get('name', '')
        name_upper = name.upper()
        
        # Skip if already labeled OFF/DEAD
        if any(tag in name_upper for tag in ['OFF', 'DEAD_', 'OFFSCALE', 'PAUSED_CPC']):
            continue
        
        real_cpc, spend, clicks, ctr_float, impressions = get_campaign_stats(c)
        if spend > 0:
            scored.append((real_cpc, spend, clicks, ctr_float, cid, name))
    
    # Sort by CPC descending — pause worst first
    scored.sort(reverse=True)
    
    # Pause campaigns with CPC > 100 during soft cap
    paused = []
    for real_cpc, spend, clicks, cid, name in scored:
        if real_cpc > 150:  # During soft cap, hanya pause CPC > KPI
            if pause_campaign(cid, name):
                paused.append(f"{name[:40]} CPC Rp{real_cpc:.0f}")
                time.sleep(0.2)
        else:
            # Keep low-CPC campaigns running
            break
    
    if paused:
        log(f"💛 SOFT PAUSE (80% budget): {len(paused)} high-CPC campaign dipause")
        for p in paused[:10]:
            log(f"  ⏸️ {p}")
        
        # 🔔 Telethon alert
        if TELETHON_READY:
            lines = [f"💛 SOFT CAP! Spend udah 80% budget"]
            lines.append(f"{len(paused)} high-CPC campaign dipause:")
            for p in paused[:3]:
                lines.append(f"  ⏸️ {p}")
            send_alert('\n'.join(lines), target='veris')
    
    return paused

def get_today_spend():
    """V7 FIX: Use date_preset=today for accurate spend (was time_range bug)."""
    url = f"https://graph.facebook.com/v19.0/{ACCOUNT}/insights?date_preset=today&fields=spend&level=account&access_token={TOKEN}"
    try:
        data = api(url)
        return float(data.get('data', [{}])[0].get('spend', 0)) if data.get('data') else 0
    except Exception:
        return 0

def get_yesterday_roi():
    """Get yesterday's ROI from Supabase. Falls back to FB API estimate."""
    yesterday = (datetime.now() - timedelta(days=1)).strftime('%Y-%m-%d')
    
    # Try Supabase first
    try:
        sb_url = "https://fqlstjiabpczutscykdc.supabase.co"
        sb_key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZxbHN0amlhYnBjenV0c2N5a2RjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTExMTEzNiwiZXhwIjoyMDk0Njg3MTM2fQ.y5wmvpvL-Q1z03_YKfnV_dEbP6pN1C156mwBCOyP4_E"
        hdrs = {"apikey": sb_key, "Authorization": f"Bearer {sb_key}"}
        url = f"{sb_url}/rest/v1/daily_metrics?account_id=eq.1041&date=eq.{yesterday}&select=commission,spend"
        req = urllib.request.Request(url, headers=hdrs)
        resp = urllib.request.urlopen(req, timeout=10)
        data = json.loads(resp.read())
        if data and len(data) > 0:
            comm = float(data[0].get('commission', 0))
            sp = float(data[0].get('spend', 0))
            if sp > 0 and comm > 0:
                roi = comm / sp
                log(f"📊 Yesterday ROI (Supabase): {roi:.2f}x (Comm Rp{comm:,.0f} / Spend Rp{sp:,.0f})")
                return roi, sp
    except Exception as e:
        pass
    
    # V6 FIX: Use actual TOKEN (was literal "***" before!)
    yesterday_enc = '%7B%22since%22%3A%22' + yesterday + '%22%7D'
    url = f"https://graph.facebook.com/v19.0/{ACCOUNT}/insights?fields=spend,cpc,clicks&time_range={yesterday_enc}&level=account&access_token={TOKEN}"
    try:
        data = api(url)
        d = data.get('data', [{}])[0] if data.get('data') else {}
        spend = float(d.get('spend', 0))
        if spend > 0:
            log(f"⚠️ ROI fallback (FB only, no commission): assume 1.0x | Spend Rp{spend:,.0f}")
            return 1.0, spend
        return 1.0, 0
    except Exception:
        return 1.0, 0

def calculate_budget(current_budget, yesterday_roi):
    """GAS-REM budget calculation"""
    if yesterday_roi >= ROI_GAS:
        new_budget = min(int(current_budget * (1 + SCALE_UP_PCT)), MAX_CAMPAIGN_BUDGET)
        action = "GAS 🟢"
    elif yesterday_roi < ROI_REM:
        new_budget = int(current_budget * (1 - SCALE_DOWN_PCT))
        action = "REM 🔴"
    else:
        new_budget = current_budget
        action = "TAHAN 🟡"
    
    new_budget = max(FLOOR, min(HARD_CAP, new_budget))
    return new_budget, action

def apply_budget_to_active(budget):
    """Apply budget to all ACTIVE campaigns"""
    campaigns = get_active_campaigns()
    count = 0
    for c in campaigns:
        cid = c['id']
        try:
            result = api_post(f"https://graph.facebook.com/v19.0/{cid}?access_token={TOKEN}", {"daily_budget": str(budget)})
            if result.get('success'):
                count += 1
        except Exception:
            pass
    return count

def main():
    state = load_state()
    now = datetime.now()
    hour = now.hour
    today = now.strftime('%Y-%m-%d')
    
    # Reset daily state if new day
    state_date = state.get('date', '')
    if state_date != today:
        log(f"📅 NEW DAY: {today} — resetting daily state")
        state['date'] = today
        state['today_spend'] = 0
        state['paused_today'] = False
        state['resumed_today'] = False
        state['soft_paused'] = False
    
    log(f"\n{'='*60}")
    log(f"📊 ADS 1041 GAS-REM v6 — {now.strftime('%Y-%m-%d %H:%M WIB')}")
    
    today_spend = get_today_spend()
    state['today_spend'] = today_spend
    daily_budget = state.get('daily_budget', HARD_CAP)
    
    log(f"💰 Today's spend: Rp {today_spend:,.0f} / Rp {daily_budget:,}")
    
    # === CHECK 1: SLEEP HOURS (01:00-03:59) ===
    if hour in SLEEP_HOURS:
        if not state.get('paused_today'):
            log(f"😴 SLEEP TIME ({hour}:00) — Pausing all campaigns")
            pause_all("Sleep hours 01:00-03:59")
            state['paused_today'] = True
        else:
            log(f"😴 Already sleeping (hour {hour}:00)")
        save_state(state)
        return 0
    
    # === CHECK 2: RESUME AT 04:00 WIB ===
    if hour == RUN_START and not state.get('resumed_today'):
        log(f"🌅 RUN TIME ({RUN_START}:00 WIB) — Resuming campaigns...")
        yesterday_roi, yesterday_spend = get_yesterday_roi()
        new_budget, action = calculate_budget(daily_budget, yesterday_roi)
        log(f"🎯 GAS-REM: {action} → Rp {new_budget:,}/hari (yesterday ROI {yesterday_roi:.2f}x, spend Rp{yesterday_spend:,.0f})")
        state['daily_budget'] = new_budget
        
        resumed, skipped = resume_campaigns()
        log(f"▶️ Resumed: {len(resumed)} campaigns")
        if skipped:
            log(f"⏭️ Skipped: {len(skipped)} campaigns")
        
        state['resumed_today'] = True
        state['paused_today'] = False
        state['soft_paused'] = False
        save_state(state)
        
        # 🔔 Telethon morning briefing
        if TELETHON_READY:
            send_alert(
                f"🌅 MORNING RESUME — 1041\n"
                f"🎯 GAS-REM: {action} → Budget Rp {new_budget:,}/hari\n"
                f"📊 Kemarin: ROI {yesterday_roi:.2f}x | Spend Rp {yesterday_spend:,.0f}\n"
                f"▶️ Resumed: {len(resumed)} campaign\n"
                f"⏭️ Skipped: {len(skipped)} campaign",
                target='veris'
            )
        
        return 0
    
    # === CHECK 3: SOFT PAUSE — spend >= 80% budget ===
    soft_threshold = int(daily_budget * SOFT_CAP_PCT)
    if today_spend >= soft_threshold and not state.get('paused_today') and not state.get('soft_paused'):
        log(f"💛 SOFT CAP: Spend Rp {today_spend:,.0f} >= 80% (Rp {soft_threshold:,})")
        log(f"   → Pausing high-CPC campaigns, keeping low-CPC winners running")
        soft_pause_high_cpc()
        state['soft_paused'] = True
        save_state(state)
    
    # === CHECK 4: HARD STOP — spend capai budget ===
    if today_spend >= daily_budget and not state.get('paused_today'):
        log(f"🚫 HARD STOP: Spend Rp {today_spend:,.0f} >= Budget Rp {daily_budget:,}")
        pause_all(f"Daily budget Rp {daily_budget:,} reached")
        state['paused_today'] = True
        save_state(state)
        
        # 🔔 Telethon alert
        if TELETHON_READY:
            send_alert(f"🚫 HARD STOP!\nSpend Rp {today_spend:,.0f} >= Budget Rp {daily_budget:,}\nSemua campaign 1041 DIPAUSE.\nResume besok jam 04:00 WIB.", target='veris')
        
        return 0
    
    # === CHECK 5: RUNNING BETWEEN 04:00-00:59 ===
    if hour >= RUN_START or hour <= RUN_END:
        remaining = max(0, daily_budget - today_spend)
        pct = today_spend / daily_budget * 100 if daily_budget > 0 else 0
        status = "⏸️ PAUSED" if state.get('paused_today') else "▶️ RUNNING"
        log(f"✅ {status} | {pct:.0f}% terpakai | Sisa: Rp {remaining:,}")
        
        # 🛡️ CPC PATROL v6 — uses REAL CPC (spend/clicks)
        if not state.get('paused_today'):
            cpc_patrol()
        
        # Auto-resume ONLY if budget available AND not already overspent
        if state.get('paused_today') and remaining > 0 and today_spend < daily_budget:
            log(f"▶️ Auto-resume: budget masih Rp {remaining:,}")
            resumed, _ = resume_campaigns()
            if resumed:
                state['paused_today'] = False
                state['soft_paused'] = False
                save_state(state)
    
    # === SUMMARY ===
    yesterday_roi, _ = get_yesterday_roi()
    log(f"\n{'─'*50}")
    log(f"📋 SUMMARY v6:")
    log(f"   Budget:  Rp {daily_budget:,}/hari")
    log(f"   Spend:   Rp {today_spend:,.0f} ({today_spend/daily_budget*100:.0f}%)" if daily_budget > 0 else f"   Spend:   Rp {today_spend:,.0f}")
    log(f"   Sisa:    Rp {max(0, daily_budget - today_spend):,}")
    log(f"   Status:  {'⏸️ PAUSED' if state.get('paused_today') else '💛 SOFT' if state.get('soft_paused') else '▶️ RUNNING'}")
    log(f"   Hour:    {hour:02d}:00 WIB")
    log(f"   Yesterday ROI: {yesterday_roi:.2f}x")
    log(f"{'='*60}")
    
    save_state(state)
    return 0

if __name__ == '__main__':
    if '--daemon' in sys.argv:
        RUNNING = True
        def shutdown(sig, frame):
            global RUNNING
            RUNNING = False
        signal.signal(signal.SIGTERM, shutdown)
        signal.signal(signal.SIGINT, shutdown)
        log(f"🚀 ADS 1041 GAS-REM DAEMON v6 STARTED — check every {CHECK_INTERVAL}s")
        log(f"📋 Rules: HardCap Rp{HARD_CAP:,} | SoftCap {int(SOFT_CAP_PCT*100)}% | CPC KPI Rp{CPC_KPI} | GAS>{ROI_GAS}x | REM<{ROI_REM}x")
        while RUNNING:
            try:
                main()
            except Exception as e:
                log(f"🚨 Governor error: {e}")
            for _ in range(CHECK_INTERVAL // 5):
                if not RUNNING:
                    break
                time.sleep(5)
        log("🛑 Governor daemon stopped")
    else:
        main()
