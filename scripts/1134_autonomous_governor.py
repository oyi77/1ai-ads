#!/usr/bin/env python3
"""
⚡ VILONA AUTONOMOUS GOVERNOR — Account 1134 (MALAYSIA via IDR)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Runs via cron/systemd. Self-contained.
Account: act_1773760133153789 ("Selow ID 1134") — Shopee Malaysia
Currency: IDR (account bills in Rupiah, targets Malaysia market)

Does:
  1. Every 15 min: Pull live CPC/CTR for all active campaigns
  2. GAS+ RULE: CPC ≤ Rp 180 AND CTR ≥ 7% → Scale budget +30%
  3. GAS RULE: CPC ≤ Rp 250 AND CTR ≥ 5% → Scale budget +20%
  4. REM RULE: CPC > Rp 500 → PAUSE campaign
  5. WATCH: CPC Rp 250-500 → Log only
  6. DEAD: 0 clicks + spend > 0 → Flag
  7. OFF_: NEVER touch
  8. COOLDOWN: 2 hours between scales
  9. MIDNIGHT QUIET: No scaling 23:00-05:00 WIB
  10. HARD CAP: Rp 400,000 total daily spend → pause all
  11. Log to ~/projects/1ai-ads/logs/1134_governor.log
"""
import requests, json, os, sys
from datetime import datetime, timedelta
from pathlib import Path

# ── CONFIG ──────────────────────────────────────────────
TOKEN_FILE = Path("/tmp/meta_token.txt")  # Same token as Indonesia accounts
ACT = "act_1773760133153789"
LOG_DIR = Path.home() / "projects/1ai-ads/logs"
STATE_FILE = Path("/tmp/1134_governor_state.json")
LOG_FILE = LOG_DIR / "1134_governor.log"

# ── MALAYSIA THRESHOLDS (IDR) ───────────────────────────
# Commission MY: Rp 9,000-18,000/order (RM 2-4 × 4,512)
# 3-6x Indonesia commission → thresholds bisa lebih tinggi
CPC_REM = 500         # Pause if CPC > Rp 500
CPC_GAS = 250         # Scale if CPC ≤ Rp 250
CPC_GAS_PLUS = 180    # Aggressive scale if CPC ≤ Rp 180
CTR_GAS = 5.0         # Scale if CTR ≥ 5%
CTR_GAS_PLUS = 7.0    # Aggressive scale if CTR ≥ 7%
CTR_MIN = 3.0         # Below this = evaluate creative

# ── BUDGET LIMITS (IDR) ─────────────────────────────────
HARD_CAP_DAILY = 400_000  # Rp 400K total across all campaigns
MAX_BUDGET = {
    "Home": 200_000, "Kitchen": 200_000, "Dapur": 200_000, "Rak": 200_000,
    "Fashion": 150_000, "Baju": 150_000, "Pakaian": 150_000, "Blouse": 150_000,
    "Kids": 120_000, "Baby": 120_000, "Anak": 120_000,
    "Beauty": 150_000, "Kecantikan": 150_000, "Skincare": 150_000,
    "Electronics": 180_000, "Gadget": 180_000, "Phone": 180_000,
    "Health": 150_000, "Kesihatan": 150_000,
    "Food": 120_000, "Makanan": 120_000,
}
DEFAULT_MAX = 120_000
SCALE_COOLDOWN_HOURS = 2
QUIET_START = 23  # 11 PM WIB
QUIET_END = 5     # 5 AM WIB

os.makedirs(LOG_DIR, exist_ok=True)

# ── LOAD TOKEN ──────────────────────────────────────────
def load_token():
    if TOKEN_FILE.exists():
        tok = TOKEN_FILE.read_text().strip()
        if tok:
            return tok
    # Try .env
    envf = Path.home() / "projects/1ai-ads/.env"
    if envf.exists():
        for line in envf.read_text().split("\n"):
            if "FB_SYSTEM_TOKEN" in line or "FB_TOKEN" in line:
                tok = line.split("=", 1)[1].strip().strip('"')
                TOKEN_FILE.write_text(tok)
                return tok
    return None

TOKEN = load_token()
if not TOKEN:
    print("❌ CRITICAL: No token for Malaysia 1134, governor blind")
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
    now = datetime.now()
    state = load_state()

    log("=" * 60)
    log(f"🚀 1134 GOVERNOR RUN — {now.strftime('%H:%M:%S')} WIB")

    # Get all campaigns
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
        log("⚪ No active campaigns.")
        save_state(state)
        return

    active_cids = [c["id"] for c in active]
    cid_map = {c["id"]: c for c in active}

    # Get today's insights
    ins_r = api_get(f"{ACT}/insights", {
        "level": "campaign",
        "time_range": json.dumps({"since": today, "until": today}),
        "fields": "campaign_id,campaign_name,spend,impressions,clicks,cpc,ctr",
        "limit": 100,
        "filtering": json.dumps([{"field": "campaign.id", "operator": "IN", "value": active_cids}])
    })

    ins_data = {i["campaign_id"]: i for i in ins_r.get("data", [])}

    # ── HARD CAP CHECK ──────────────────────────────────
    total_spend = sum(float(ins_data.get(c["id"], {}).get("spend", 0)) for c in active)
    if total_spend > HARD_CAP_DAILY:
        log(f"🚨🚨🚨 HARD CAP BREACH: Rp {total_spend:,.0f} > Rp {HARD_CAP_DAILY:,} — PAUSING ALL!")
        for camp in active:
            if "OFF_" in camp["name"]:
                continue
            r = api_post(f"{camp['id']}", {"status": "PAUSED"})
            log(f"  🛑 PAUSED: {camp['name'][:55]}")
        save_state(state)
        return
    elif total_spend > HARD_CAP_DAILY * 0.8:
        log(f"⚠️ HARD CAP WARNING: Rp {total_spend:,.0f} / Rp {HARD_CAP_DAILY:,} ({total_spend/HARD_CAP_DAILY*100:.0f}%)")

    gas_count = 0
    gas_plus_count = 0
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

        # ── OFF_ = NEVER TOUCH ──
        if "OFF_" in name:
            if clicks > 0:
                log(f"  🔒 OFF_ | {name[:55]} | CPC Rp{cpc:,.0f} | CTR {ctr:.2f}%")
            skip_count += 1
            continue

        # ── No spend, no clicks → skip ──
        if spend == 0 and clicks == 0:
            skip_count += 1
            continue

        # ── Spend > 0 but 0 clicks → DEAD ──
        if spend > 0 and clicks == 0:
            log(f"  💀 DEAD | {name[:55]} | Spend Rp{spend:,.0f} | 0 clicks")
            dead_count += 1
            continue

        # ── CPC > Rp 500 → REM ──
        if cpc > CPC_REM:
            r = api_post(f"{cid}", {"status": "PAUSED"})
            if r.get("success"):
                log(f"  🛑 REM | {name[:55]} | CPC Rp{cpc:,.0f} > {CPC_REM:,} | PAUSED")
                state["pause_history"][cid] = {
                    "name": name, "cpc": cpc, "ctr": ctr,
                    "paused_at": now.isoformat(),
                    "count": state["pause_history"].get(cid, {}).get("count", 0) + 1
                }
                rem_count += 1
            else:
                log(f"  ❌ FAILED PAUSE | {name[:40]} | {r.get('error', r)}")
            continue

        # ── GAS+ (Elite): CPC ≤ 180, CTR ≥ 7% ──
        if cpc <= CPC_GAS_PLUS and ctr >= CTR_GAS_PLUS and budget > 0:
            if not name.startswith("LC_"):
                log(f"  📊 NO-SCALE | {name[:55]} | BIDCAP/TC — budget useless")
                skip_count += 1
                continue

            last_scale = state.get("scale_history", {}).get(cid, {})
            if last_scale:
                last_time = datetime.fromisoformat(last_scale.get("scaled_at", "2000-01-01"))
                hours_since = (now - last_time).total_seconds() / 3600
                if hours_since < SCALE_COOLDOWN_HOURS:
                    log(f"  ⏳ COOLDOWN | {name[:55]} | {hours_since:.1f}h since last scale")
                    skip_count += 1
                    continue

            if now.hour >= QUIET_START or now.hour < QUIET_END:
                log(f"  🌙 QUIET | {name[:55]} | Budget Rp{budget:,} | CPC Rp{cpc:,.0f}")
                skip_count += 1
                continue

            max_cap = DEFAULT_MAX
            for keyword, cap in MAX_BUDGET.items():
                if keyword.lower() in name.lower():
                    max_cap = cap
                    break

            new_budget = int(budget * 1.3)
            if new_budget <= budget:
                new_budget = budget + 5_000  # +Rp 5K minimum

            if new_budget > max_cap:
                if budget >= max_cap:
                    log(f"  🛑 CAPPED | {name[:55]} | Already at max Rp{max_cap:,}")
                    skip_count += 1
                    continue
                new_budget = max_cap
                log(f"  ⚠️ CAPPED | {name[:55]} | Rp{budget:,} → Rp{new_budget:,}")

            r = api_post(f"{cid}", {"daily_budget": new_budget})
            if r.get("success"):
                log(f"  🔥🔥 GAS+ 30% | {name[:55]} | Rp{budget:,} → Rp{new_budget:,} | CPC Rp{cpc:,.0f} | CTR {ctr:.2f}%")
                state["scale_history"][cid] = {
                    "name": name, "from_budget": budget, "to_budget": new_budget,
                    "cpc": cpc, "ctr": ctr, "scaled_at": now.isoformat(), "tier": "elite"
                }
                gas_plus_count += 1
            else:
                log(f"  ❌ FAILED SCALE | {name[:40]} | {r.get('error', r)}")
            continue

        # ── GAS: CPC ≤ 250, CTR ≥ 5% ──
        if cpc <= CPC_GAS and ctr >= CTR_GAS and budget > 0:
            if not name.startswith("LC_"):
                log(f"  📊 NO-SCALE | {name[:55]} | BIDCAP/TC — budget useless")
                skip_count += 1
                continue

            last_scale = state.get("scale_history", {}).get(cid, {})
            if last_scale:
                last_time = datetime.fromisoformat(last_scale.get("scaled_at", "2000-01-01"))
                hours_since = (now - last_time).total_seconds() / 3600
                if hours_since < SCALE_COOLDOWN_HOURS:
                    log(f"  ⏳ COOLDOWN | {name[:55]} | {hours_since:.1f}h since last scale")
                    skip_count += 1
                    continue

            if now.hour >= QUIET_START or now.hour < QUIET_END:
                log(f"  🌙 QUIET | {name[:55]} | Budget Rp{budget:,} | CPC Rp{cpc:,.0f}")
                skip_count += 1
                continue

            max_cap = DEFAULT_MAX
            for keyword, cap in MAX_BUDGET.items():
                if keyword.lower() in name.lower():
                    max_cap = cap
                    break

            new_budget = int(budget * 1.2)
            if new_budget <= budget:
                new_budget = budget + 5_000

            if new_budget > max_cap:
                if budget >= max_cap:
                    log(f"  🛑 CAPPED | {name[:55]} | Already at max Rp{max_cap:,}")
                    skip_count += 1
                    continue
                new_budget = max_cap
                log(f"  ⚠️ CAPPED | {name[:55]} | Rp{budget:,} → Rp{new_budget:,}")

            r = api_post(f"{cid}", {"daily_budget": new_budget})
            if r.get("success"):
                log(f"  🔥 GAS +20% | {name[:55]} | Rp{budget:,} → Rp{new_budget:,} | CPC Rp{cpc:,.0f} | CTR {ctr:.2f}%")
                state["scale_history"][cid] = {
                    "name": name, "from_budget": budget, "to_budget": new_budget,
                    "cpc": cpc, "ctr": ctr, "scaled_at": now.isoformat(), "tier": "standard"
                }
                gas_count += 1
            else:
                log(f"  ❌ FAILED SCALE | {name[:40]} | {r.get('error', r)}")
            continue

        # ── WATCH: CPC Rp 250-500 ──
        log(f"  👀 WATCH | {name[:55]} | CPC Rp{cpc:,.0f} | CTR {ctr:.2f}% | Budget Rp{budget:,}")

    # ── SUMMARY ──
    total_clicks = sum(int(ins_data.get(c["id"], {}).get("clicks", 0)) for c in active)
    avg_cpc = total_spend / total_clicks if total_clicks > 0 else 0

    log("─" * 60)
    log(f"📋 SUMMARY: GAS+ {gas_plus_count} | GAS {gas_count} | REM {rem_count} | DEAD {dead_count} | WATCH/SKIP {skip_count}")
    log(f"💰 Total Spend: Rp{total_spend:,.0f} / Rp{HARD_CAP_DAILY:,} | Clicks: {total_clicks} | Avg CPC: Rp{avg_cpc:,.0f}")
    log(f"💾 State saved. Next run in ~15 min.")

    save_state(state)


if __name__ == "__main__":
    run()
