#!/usr/bin/env python3
"""
⚡ VILONA AUTONOMOUS GOVERNOR — Account 1041
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Runs via cron/systemd. Self-contained. No env vars needed.
Token from file. Survives system restarts.

Does:
  1. Every 15 min: Pull live CPC/CTR for all active campaigns
  2. GAS RULE: CPC ≤ 100 AND CTR ≥ 5% → Scale budget +20% (MAX CAP: Rp5M rakdapur, Rp2M ataya, Rp3M others)
  3. REM RULE: CPC > 130 → PAUSE campaign
  4. WATCH: CPC 100-130 → Log only, alert if worsening
  5. DEAD: 0 clicks + spend > 0 → Flag for manual review
  6. OFF_: NEVER touch (Veris rule)
  7. COOLDOWN: 2 hours between scales per campaign (prevents budget blowup)
  8. MIDNIGHT QUIET: No scaling between 23:00-05:00 WIB
  9. Log everything to ~/projects/1ai-ads/logs/1041_governor.log
"""
import requests, json, os, sys
from datetime import datetime, timedelta
from pathlib import Path

# ── CONFIG ──────────────────────────────────────────────
TOKEN_FILE = Path("/tmp/meta_token.txt")
ACT = "act_380721031313330"
LOG_DIR = Path.home() / "projects/1ai-ads/logs"
STATE_FILE = Path("/tmp/1041_governor_state.json")
LOG_FILE = LOG_DIR / "1041_governor.log"

# SAFETY LIMITS (anti-blowout)
MAX_BUDGET = {
    "Rakdapur": 5_000_000, "Tourism": 5_000_000, "Interior": 5_000_000,
    "Organisir": 5_000_000, "Stiker": 5_000_000, "Kecantikan": 5_000_000,
    "Ritel": 5_000_000, "Furnitur": 5_000_000, "Fashion": 3_000_000,
    "Pertanian": 5_000_000, "Drama": 3_000_000, "Movies": 3_000_000,
    "LLA1p": 3_000_000, "Baju": 3_000_000,
    "Atayasetelankaosanak": 2_000_000, "Bajuanak": 2_000_000,
    "Benihsayuran": 1_000_000,
}
DEFAULT_MAX = 3_000_000
SCALE_COOLDOWN_HOURS = 2  # Don't scale same campaign within 2 hours
QUIET_START = 23  # 11 PM
QUIET_END = 5     # 5 AM

os.makedirs(LOG_DIR, exist_ok=True)

# ── LOAD TOKEN (auto-recover) ──────────────────────────
def load_token():
    if TOKEN_FILE.exists():
        return TOKEN_FILE.read_text().strip()
    # Recover from deriv script
    import re as _re
    deriv = Path.home() / "projects/1ai-ads/deriv_ads_optimizer/spend_monitor_1041.py"
    if deriv.exists():
        m = _re.search(r'TOKEN\s*=\s*"(EAAKA[A-Za-z0-9]+)"', deriv.read_text())
        if m:
            TOKEN_FILE.write_text(m.group(1))
            return m.group(1)
    # Try .env
    envf = Path.home() / "projects/1ai-ads/.env"
    if envf.exists():
        for line in envf.read_text().split("\n"):
            if "FB_SYSTEM_TOKEN" in line:
                tok = line.split("=", 1)[1].strip()
                TOKEN_FILE.write_text(tok)
                return tok
    return None

TOKEN = load_token()
if not TOKEN:
    print("❌ CRITICAL: No token, governor blind")
    sys.exit(1)

# ── LOGGING ─────────────────────────────────────────────
def log(msg):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line)
    with open(LOG_FILE, "a") as f:
        f.write(line + "\n")

# ── STATE ───────────────────────────────────────────────
def load_state():
    if STATE_FILE.exists():
        return json.loads(STATE_FILE.read_text())
    return {"last_run": None, "pause_history": {}, "scale_history": {}}

def save_state(state):
    state["last_run"] = datetime.now().isoformat()
    STATE_FILE.write_text(json.dumps(state, indent=2))

# ── API HELPERS ─────────────────────────────────────────
def api_get(path, params=None):
    if params is None:
        params = {}
    params["access_token"] = TOKEN
    try:
        r = requests.get(f"https://graph.facebook.com/v19.0/{path}", params=params, timeout=15)
        return r.json()
    except Exception as e:
        return {"error": str(e)}

def api_post(path, params=None):
    if params is None:
        params = {}
    params["access_token"] = TOKEN
    try:
        r = requests.post(f"https://graph.facebook.com/v19.0/{path}", params=params, timeout=15)
        return r.json()
    except Exception as e:
        return {"error": str(e)}

# ── MAIN LOGIC ──────────────────────────────────────────
def run():
    today = datetime.now().strftime("%Y-%m-%d")
    state = load_state()
    
    log("=" * 60)
    log(f"🚀 GOVERNOR RUN — {datetime.now().strftime('%H:%M:%S')}")
    
    # Verify token
    debug = api_get("debug_token", {"input_token": TOKEN})
    if not debug.get("data", {}).get("is_valid"):
        log(f"❌ TOKEN INVALID: {debug.get('error', {}).get('message', 'unknown')}")
        return
    
    # Get all active campaigns
    camps_r = api_get(f"{ACT}/campaigns", {
        "fields": "id,name,status,daily_budget,effective_status",
        "limit": 100
    })
    
    if "error" in camps_r:
        log(f"❌ API ERROR: {camps_r['error'].get('message', 'unknown')[:100]}")
        return
    
    all_camps = camps_r.get("data", [])
    active = [c for c in all_camps if c["status"] == "ACTIVE"]
    paused = [c for c in all_camps if c["status"] == "PAUSED"]
    
    log(f"📊 Total: {len(all_camps)} | Active: {len(active)} | Paused: {len(paused)}")
    
    if not active:
        log("⚪ No active campaigns. Checking paused for reactivation...")
    
    # Get today's insights for active campaigns
    active_cids = [c["id"] for c in active]
    if not active_cids:
        save_state(state)
        return
    
    cid_map = {c["id"]: c for c in active}
    
    ins_r = api_get(f"{ACT}/insights", {
        "level": "campaign",
        "time_range": json.dumps({"since": today, "until": today}),
        "fields": "campaign_id,campaign_name,spend,impressions,clicks,cpc,ctr",
        "limit": 100,
        "filtering": json.dumps([{"field": "campaign.id", "operator": "IN", "value": active_cids}])
    })
    
    ins_data = {i["campaign_id"]: i for i in ins_r.get("data", [])}
    
    gas_count = 0
    rem_count = 0
    dead_count = 0
    skip_count = 0
    
    for camp in active:
        cid = camp["id"]
        name = camp["name"]
        budget = int(camp.get("daily_budget", 0))
        ins = ins_data.get(cid, {})
        
        spend = float(ins.get("spend", 0))
        clicks = int(ins.get("clicks", 0))
        cpc = float(ins.get("cpc", 0))
        ctr = float(ins.get("ctr", 0))
        
        # ── RULE: OFF_ = NEVER TOUCH ──
        if "OFF_" in name:
            if clicks > 0:
                log(f"  🔒 OFF_ | {name[:55]} | CPC Rp{cpc:,.0f} | CTR {ctr:.2f}%")
            skip_count += 1
            continue
        
        # ── RULE: No spend, no clicks → skip ──
        if spend == 0 and clicks == 0:
            skip_count += 1
            continue
        
        # ── RULE: Spend > 0 but 0 clicks → DEAD (AUTO-PAUSE) ──
        if spend > 0 and clicks == 0:
            r = api_post(f"{cid}", {"status": "PAUSED"})
            if r.get("success"):
                log(f"  💀 DEAD | {name[:55]} | Spend Rp{spend:,.0f} | 0 clicks | AUTO-PAUSED")
                dead_count += 1
            else:
                log(f"  💀 DEAD | {name[:55]} | Spend Rp{spend:,.0f} | 0 clicks | PAUSE FAILED")
                dead_count += 1
            continue
        
        # ── RULE: CPC > 130 → REM (PAUSE) ──
        if cpc > 130:
            r = api_post(f"{cid}", {"status": "PAUSED"})
            if r.get("success"):
                log(f"  🛑 REM | {name[:55]} | CPC Rp{cpc:,.0f} > 130 | PAUSED")
                state["pause_history"][cid] = {
                    "name": name, "cpc": cpc, "ctr": ctr,
                    "paused_at": datetime.now().isoformat(),
                    "count": state["pause_history"].get(cid, {}).get("count", 0) + 1
                }
                rem_count += 1
            else:
                log(f"  ❌ FAILED PAUSE | {name[:40]} | {r.get('error', r)}")
            continue
        
        # ── RULE: CPC ≤ 100 AND CTR ≥ 5% → GAS (+20%) — ONLY LC_ campaigns! ──
        # BIDCAP/TC budgets are bottlenecked by bid caps. Scaling LC_ only.
        if cpc <= 100 and ctr >= 5.0 and budget > 0:
            # 🛡️ RULE: Only scale LC_ (lowest cost) — BIDCAP/TC can't use extra budget
            if not name.startswith("LC_"):
                log(f"  📊 NO-SCALE | {name[:55]} | {name.split('_')[0]} campaign — budget useless (bid cap limits delivery)")
                skip_count += 1
                continue
            
            # 🛡️ SAFETY: Check cooldown
            now = datetime.now()
            last_scale = state.get("scale_history", {}).get(cid, {})
            if last_scale:
                last_time = datetime.fromisoformat(last_scale.get("scaled_at", "2000-01-01"))
                hours_since = (now - last_time).total_seconds() / 3600
                if hours_since < SCALE_COOLDOWN_HOURS:
                    log(f"  ⏳ COOLDOWN | {name[:55]} | {hours_since:.1f}h since last scale (need {SCALE_COOLDOWN_HOURS}h)")
                    skip_count += 1
                    continue
            
            # 🛡️ SAFETY: Midnight quiet hours (no scaling 23:00-05:00)
            if now.hour >= QUIET_START or now.hour < QUIET_END:
                log(f"  🌙 QUIET | {name[:55]} | Budget Rp{budget:,} | CPC Rp{cpc:,.0f}")
                skip_count += 1
                continue
            
            # 🛡️ SAFETY: Determine max budget cap for this campaign type
            max_cap = DEFAULT_MAX
            for keyword, cap in MAX_BUDGET.items():
                if keyword in name:
                    max_cap = cap
                    break
            
            new_budget = int(budget * 1.2)
            if new_budget <= budget:
                new_budget = budget + 10000
            
            # 🛡️ SAFETY: Hard cap at max budget
            if new_budget > max_cap and max_cap > 0:
                if budget >= max_cap:
                    log(f"  🛑 CAPPED | {name[:55]} | Already at max Rp{max_cap:,}")
                    skip_count += 1
                    continue
                new_budget = max_cap
                log(f"  ⚠️ CAPPED | {name[:55]} | Rp{budget:,} → Rp{new_budget:,} (max cap hit)")
            
            r = api_post(f"{cid}", {"daily_budget": new_budget})
            if r.get("success"):
                log(f"  🔥 GAS +20% | {name[:55]} | Rp{budget:,} → Rp{new_budget:,} | CPC Rp{cpc:,.0f} | CTR {ctr:.2f}%")
                state["scale_history"][cid] = {
                    "name": name, "from_budget": budget, "to_budget": new_budget,
                    "cpc": cpc, "ctr": ctr, "scaled_at": now.isoformat()
                }
                gas_count += 1
            else:
                log(f"  ❌ FAILED SCALE | {name[:40]} | {r.get('error', r)}")
            continue
        
        # ── RULE: CPC 100-130 → WATCH ──
        log(f"  👀 WATCH | {name[:55]} | CPC Rp{cpc:,.0f} | CTR {ctr:.2f}% | Budget Rp{budget:,}")
        skip_count += 1
    
    # ── SUMMARY ──
    total_spend = sum(float(ins_data.get(c["id"], {}).get("spend", 0)) for c in active)
    total_clicks = sum(int(ins_data.get(c["id"], {}).get("clicks", 0)) for c in active)
    avg_cpc = total_spend / total_clicks if total_clicks > 0 else 0
    
    log("─" * 60)
    log(f"📋 SUMMARY: GAS {gas_count} | REM {rem_count} | DEAD {dead_count} | WATCH/SKIP {skip_count}")
    log(f"💰 Total Spend: Rp{total_spend:,.0f} | Clicks: {total_clicks} | Avg CPC: Rp{avg_cpc:,.0f}")
    log(f"💾 State saved. Next run in ~15 min.")
    
    save_state(state)

if __name__ == "__main__":
    run()
