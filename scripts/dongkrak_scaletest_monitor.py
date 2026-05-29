#!/usr/bin/env python3
"""
Dongkrak Elektrik Scale Test — 10-Minute Monitor Cron
Per Veris Rules (2026-05-18):
- Data Gates: HOLD if minimum impressions/spend not met
- Kill Rules: PAUSE on CPC > 300 | CTR < 0.5% | Spend >= Rp5K + 0 clicks
- Resume Rules: TURN ON if ROAS T-1 > 2.0x (Shopee data injected)
- Scale Rules: +20% budget if ROAS > 2.0x AND CPC < 150 (max 1x/day/adset)
- No OpenClaw dependency — runs via cron.
"""
import urllib.request, json, os, sys, urllib.parse
from datetime import datetime
import os

# ─── CONFIG ───────────────────────────────────────────────────────────────
TOKEN = "os.getenv('META_ACCESS_TOKEN', '')"
CAMPAIGN_ID = "120248835386290416"
ADSET_IDS = [
    "120248835533980416",  # DongkrakElektrik_BelanjaOnline_IGonly_23-55
    "120248835539130416",  # DongkrakElektrik_Tersembunyi_IGonly_23-55
]
LOG_DIR = os.path.join(os.path.expanduser("~"), ".openclaw", "workspace", "logs", "dongkrak_scaletest.log")

# ─── DATA GATES (HOLD thresholds — MUST be met before evaluating) ─────────
GATE = {
    "CPC_MIN_IMPRESSIONS": 200,      # CPC evaluation: impressions >= 200
    "CTR_MIN_IMPRESSIONS": 500,      # CTR evaluation: impressions >= 500
    "ZEROCLICK_MIN_SPEND": 5000,     # Zero-click evaluation: spend >= Rp5.000
}

# ─── KILL THRESHOLDS ─────────────────────────────────────────────────────
KILL = {
    "CPC_MAX": 300,          # CPC > 300 → PAUSE
    "CTR_MIN": 0.5,          # CTR < 0.5% → PAUSE
    "ZEROCLICK_SPEND": 5000, # Spend >= Rp5K + 0 clicks → PAUSE
}

# ─── SCALE THRESHOLDS ────────────────────────────────────────────────────
SCALE = {
    "ROAS_MIN": 2.0,  # ROAS T-1 > 2.0x
    "CPC_MAX": 150,   # CPC today < 150
    "BUDGET_INCREASE_PCT": 20,  # +20%
    "MAX_PER_ADSET_DAILY": 1,   # max 1x scale per day
}

# Keep track of today's scale actions (resets each day by T-1 data injection)
SCALE_HISTORY_FILE = os.path.join(os.path.expanduser("~"), ".openclaw", "workspace", "logs", "dongkrak_scaletest_scale_history.json")

# ─── HELPERS ──────────────────────────────────────────────────────────────

def log(msg):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    os.makedirs(os.path.dirname(LOG_DIR), exist_ok=True)
    with open(LOG_DIR, "a") as f:
        f.write(line + "\n")
    print(line)

def action_log(action, adset_name, reason):
    """Structured log format for actions."""
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] - {action} - {adset_name} - {reason}"
    os.makedirs(os.path.dirname(LOG_DIR), exist_ok=True)
    with open(LOG_DIR, "a") as f:
        f.write(line + "\n")
    print(line)

def api_get(url_suffix):
    url = f"https://graph.facebook.com/v22.0/{url_suffix}&access_token={TOKEN}"
    req = urllib.request.Request(url)
    try:
        resp = urllib.request.urlopen(req, timeout=15)
        return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode()[:200]
        log(f"  ⚠️ API GET error: {e.code} {body[:100]}")
        return None
    except Exception as e:
        log(f"  ⚠️ Request error: {str(e)[:100]}")
        return None

def api_post(url_suffix, data):
    url = f"https://graph.facebook.com/v22.0/{url_suffix}"
    data["access_token"] = TOKEN
    data_enc = urllib.parse.urlencode(data).encode()
    req = urllib.request.Request(url, data=data_enc)
    try:
        resp = urllib.request.urlopen(req, timeout=15)
        return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode()[:200]
        log(f"  ⚠️ API POST error: {e.code} {body[:100]}")
        return None

def get_today_scales():
    """Read scale actions done today."""
    today = datetime.now().strftime("%Y-%m-%d")
    try:
        with open(SCALE_HISTORY_FILE, "r") as f:
            data = json.load(f)
        if data.get("date") == today:
            return data.get("scaled", [])
    except (FileNotFoundError, json.JSONDecodeError):
        pass
    return []

def save_scale_action(as_id):
    """Record a scale action for today."""
    today = datetime.now().strftime("%Y-%m-%d")
    scales = get_today_scales()
    if as_id not in scales:
        scales.append(as_id)
    with open(SCALE_HISTORY_FILE, "w") as f:
        json.dump({"date": today, "scaled": scales}, f)

# ─── CORE MONITOR LOGIC ──────────────────────────────────────────────────

def check_adset(as_id, as_name):
    """
    Evaluate ONE adset against Veris rules.
    - Data Gates (HOLD) first
    - Kill Rules second
    Returns True if still running, False if paused.
    """

    # ── Fetch insights ──
    url = f"{as_id}/insights?date_preset=today&fields=spend,impressions,inline_link_clicks,outbound_clicks,cpc,inline_link_click_ctr&level=adset"
    raw = api_get(url)
    if not raw or not raw.get("data"):
        log(f"  ℹ️ {as_name}: No data yet (new campaign)")
        return True

    ins = raw["data"][0]

    # Parse metrics (API returns monetary in cents — /100 = IDR)
    spend_idr = float(ins.get("spend", 0)) / 100
    impressions = int(ins.get("impressions", 0))
    clicks = int(ins.get("inline_link_clicks", 0))
    outbound_clicks = int(ins.get("outbound_clicks", 0))
    cpc_idr = float(ins.get("cpc", 0)) / 100 if ins.get("cpc") else 0
    ctr_pct = float(ins.get("inline_link_click_ctr", 0)) if ins.get("inline_link_click_ctr") else 0

    log(f"  📊 {as_name}: Rp{spend_idr:,.0f} spent | {impressions} impr | {clicks} click | {outbound_clicks} outbound | CTR {ctr_pct:.2f}% | CPC Rp{cpc_idr:,.0f}")

    # ── DATA GATES (HOLD checks) ──
    # If gate not passed, skip kill evaluation (let it run)
    can_eval_cpc = impressions >= GATE["CPC_MIN_IMPRESSIONS"]
    can_eval_ctr = impressions >= GATE["CTR_MIN_IMPRESSIONS"]
    can_eval_zeroclick = spend_idr >= GATE["ZEROCLICK_MIN_SPEND"]

    if not can_eval_cpc and not can_eval_ctr and not can_eval_zeroclick:
        log(f"  ⏳ {as_name}: HOLD — impressions ({impressions}) < min gates, letting it run")
        return True

    # ── KILL RULES (only if relevant data gate is passed) ──

    # 1. CPC > 300 (gate: impressions >= 200)
    if can_eval_cpc and cpc_idr > KILL["CPC_MAX"] and clicks > 0:
        reason = f"CPC Rp{cpc_idr:,.0f} > threshold {KILL['CPC_MAX']} (impressions: {impressions})"
        action_log("PAUSE_ADSET", as_name, reason)
        api_post(as_id, {"status": "PAUSED"})
        return False

    # 2. CTR < 0.5% (gate: impressions >= 500)
    if can_eval_ctr and ctr_pct < KILL["CTR_MIN"]:
        reason = f"CTR {ctr_pct:.2f}% < threshold {KILL['CTR_MIN']}% (impressions: {impressions})"
        action_log("PAUSE_ADSET", as_name, reason)
        api_post(as_id, {"status": "PAUSED"})
        return False

    # 3. Zero click: spend >= Rp5.000 AND outbound clicks == 0
    if can_eval_zeroclick and outbound_clicks == 0:
        reason = f"Rp{spend_idr:,.0f} spent with 0 outbound clicks (threshold: Rp{GATE['ZEROCLICK_MIN_SPEND']:,})"
        action_log("PAUSE_ADSET", as_name, reason)
        api_post(as_id, {"status": "PAUSED"})
        return False

    log(f"  ✅ {as_name}: All checks passed")
    return True

def toggle_balance_resume():
    """
    Resume rule: If campaign was auto-paused due to insufficient balance
    and balance is now available → TURN ON.
    Check campaign status — if PAUSED and no kill reasons, resume.
    """
    camp = api_get(f"{CAMPAIGN_ID}?fields=name,status")
    if not camp:
        return
    if camp["status"] == "PAUSED":
        # Check if all adsets are also paused — if yes, check reason
        # This is triggered externally when balance is refilled
        pass  # Reserved for future use

def check_campaign_health():
    """Main check — evaluate all adsets."""
    log("=" * 55)
    now = datetime.now().strftime("%H:%M WIB")
    log(f"🔍 DONGKRAK CHECK — {now}")

    # Check campaign status
    camp = api_get(f"{CAMPAIGN_ID}?fields=name,status")
    if not camp:
        log("  ❌ Cannot fetch campaign — skipping")
        return

    if camp["status"] != "ACTIVE":
        log(f"  ⏸️ Campaign is {camp['status']} — skipping checks")
        return

    log(f"  ✅ Campaign ACTIVE")

    # Check each adset
    all_killed = True
    for as_id in ADSET_IDS:
        as_data = api_get(f"{as_id}?fields=name,status")
        if not as_data:
            continue
        as_name = as_data.get("name", as_id)
        as_status = as_data.get("status")

        if as_status == "PAUSED":
            log(f"  ⏸️ {as_name}: Already paused")
            continue

        alive = check_adset(as_id, as_name)
        if alive:
            all_killed = False

    # If both adsets were killed, pause the campaign too
    if all_killed:
        action_log("PAUSE_CAMPAIGN", "ABO_DongkrakElektrik_ScaleTest_BIDCAP130_VILONA",
                    "Both adsets killed — pausing campaign to prevent waste")
        api_post(CAMPAIGN_ID, {"status": "PAUSED"})
        log("  🛑 Campaign paused — both adsets killed")

    log(f"  ✅ Check complete")

# ─── EXTERNAL ENTRY POINTS ───────────────────────────────────────────────

def resume_by_roas(as_id, as_name, roas_t1):
    """
    Called externally when Shopee data (T-1) is injected.
    If adset is PAUSED but ROAS T-1 > 2.0x → TURN ON.
    """
    if roas_t1 > SCALE["ROAS_MIN"]:
        as_data = api_get(f"{as_id}?fields=status")
        if as_data and as_data.get("status") == "PAUSED":
            result = api_post(as_id, {"status": "ACTIVE"})
            if result:
                action_log("TURN_ON_ADSET", as_name,
                           f"ROAS T-1 {roas_t1:.1f}x > threshold {SCALE['ROAS_MIN']}x")
                return True
    return False

def scale_by_roas(as_id, as_name, roas_t1, cpc_today):
    """
    Called externally when Shopee data (T-1) is injected.
    If ROAS T-1 > 2.0x AND CPC today < 150 → +20% budget (max 1x/day).
    """
    if roas_t1 <= SCALE["ROAS_MIN"]:
        return False
    if cpc_today >= SCALE["CPC_MAX"]:
        return False

    # Check daily limit
    today_scales = get_today_scales()
    if as_id in today_scales:
        log(f"  ⏸️ {as_name}: Already scaled today — skipping")
        return False

    # Get current budget
    as_data = api_get(f"{as_id}?fields=daily_budget")
    if not as_data:
        return False

    current_budget = int(as_data.get("daily_budget", 0))
    new_budget = int(current_budget * (1 + SCALE["BUDGET_INCREASE_PCT"] / 100))

    result = api_post(as_id, {"daily_budget": new_budget})
    if result:
        action_log("INCREASE_BUDGET", as_name,
                   f"ROAS {roas_t1:.1f}x > {SCALE['ROAS_MIN']}x, CPC {cpc_today:.0f} < {SCALE['CPC_MAX']}, "
                   f"Rp{current_budget/100:,.0f} → Rp{new_budget/100:,.0f} (+{SCALE['BUDGET_INCREASE_PCT']}%)")
        save_scale_action(as_id)
        return True
    return False

def resume_by_balance_refill():
    """
    Called when account balance is refilled.
    Resume any paused adsets that were killed by balance issues.
    """
    camp = api_get(f"{CAMPAIGN_ID}?fields=status")
    if not camp:
        return
    if camp["status"] != "PAUSED":
        return

    # Resume campaign
    api_post(CAMPAIGN_ID, {"status": "ACTIVE"})
    action_log("TURN_ON_CAMPAIGN", "ABO_DongkrakElektrik_ScaleTest_BIDCAP130_VILONA",
               "Balance refilled — resuming campaign")
    return True

# ─── CLI ENTRY POINT ─────────────────────────────────────────────────────

if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "check"

    if mode == "check":
        # Default: run one check cycle (for cron)
        check_campaign_health()

    elif mode == "resume_roas":
        # Called with: --resume_roas <as_id> <roas_t1>
        # pragma: file injector will parse Shopee data and call this
        print("Use resume_by_roas() function directly via Python import")

    elif mode == "scale_roas":
        # Called with: --scale_roas <as_id> <roas_t1> <cpc_today>
        print("Use scale_by_roas() function directly via Python import")
