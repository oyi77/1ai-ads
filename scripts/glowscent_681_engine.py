#!/usr/bin/env python3
"""
🔥 GLOWSCENT 681 ENGINE — Fully Autonomous Shopee Affiliate Manager
=====================================================================
Account:  act_2125021885010866 (KomAds WL 681)
Product:  PintuLipatGeser
Type:     Shopee Affiliate → TRAFFIC objective
Rules:    Veris Playbook 3 June 2026
Runtime:  systemd service (auto-restart, survives crashes)

GAS-REM Rules:
  CPC ≤ 100 + CTR ≥ 5%  → GAS +20% budget
  CPC 100-130 + CTR 3-5% → JALAN
  CPC > 130              → REM (PAUSE)
  CPC > 200              → INSTANT KILL
  CTR < 3% (500+ imps)   → PAUSE
  Spend > 0 + 0 clicks   → PAUSE

Hard Rules:
  HARD CAP: Rp 300.000/hari → PAUSE ALL
  OFF_ prefix → NEVER TOUCH
  00:00-03:59 WIB → PAUSE ALL
  04:00 WIB → AUTO-REACTIVATE (winners + paused non-OFF_)
  Budget per campaign: Rp 20.000-36.000/hari
  BID CAP: Rp 130
"""

import json, os, sys, time, csv, traceback
import urllib.request, urllib.parse
from datetime import datetime, timedelta, timezone
from pathlib import Path
from collections import defaultdict

# ─── CONFIG ──────────────────────────────────────────────────────────────────
WIB = timezone(timedelta(hours=7))
WORKSPACE = Path(__file__).parent.parent
LOG_FILE = WORKSPACE / "logs" / "glowscent_681_engine.log"
STATE_FILE = WORKSPACE / "data" / "glowscent_681_state.json"
TOKEN_FILE = Path("/tmp/fb_token_glowscent_681.txt")
os.makedirs(WORKSPACE / "logs", exist_ok=True)
os.makedirs(WORKSPACE / "data", exist_ok=True)

def load_token():
    try:
        if TOKEN_FILE.exists():
            return TOKEN_FILE.read_text().strip()
    except:
        pass
    return None

ACCESS_TOKEN = load_token()
API = "https://graph.facebook.com/v19.0"
ACCOUNT_ID = "act_2125021885010866"

# ─── RULES (Veris Playbook) ──────────────────────────────────────────────────
CPC_GAS = 100
CPC_WARN = 130
CPC_KILL = 200
CTR_GAS = 5.0
CTR_MIN = 3.0
CTR_KILL = 2.0
HARD_CAP = 300000
HARD_CAP_WARN = 240000
CAMPAIGN_BUDGET_MIN = 20000
CAMPAIGN_BUDGET_MAX = 36000

# ─── LOGGING ──────────────────────────────────────────────────────────────────
def log(msg, level="INFO"):
    ts = datetime.now(WIB).strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] [{level}] {msg}"
    print(line, flush=True)
    try:
        with open(LOG_FILE, "a") as f:
            f.write(line + "\n")
    except:
        pass

# ─── API HELPERS (resilient) ──────────────────────────────────────────────────
def fb_call(call_type, endpoint, max_retries=3, **params):
    """Make Facebook API call with retry logic."""
    params["access_token"] = ACCESS_TOKEN
    
    for attempt in range(max_retries):
        try:
            if call_type == "GET":
                qs = "&".join(f"{k}={urllib.request.quote(str(v))}" for k, v in params.items())
                url = f"{API}/{endpoint}?{qs}"
                req = urllib.request.Request(url)
            else:
                data = urllib.parse.urlencode(params).encode()
                url = f"{API}/{endpoint}"
                req = urllib.request.Request(url, data=data, method="POST")
            
            with urllib.request.urlopen(req, timeout=20) as resp:
                result = json.loads(resp.read())
            
            # Check for rate limit
            if isinstance(result, dict) and result.get("error", {}).get("code") in (4, 17, 80000, 80004):
                wait = min((attempt + 1) * 30, 120)
                log(f"Rate limited, waiting {wait}s...", "WARN")
                time.sleep(wait)
                continue
            
            return result
        
        except urllib.error.HTTPError as e:
            body = e.read().decode() if hasattr(e, 'read') else str(e)
            try:
                err = json.loads(body).get("error", {})
                code = err.get("code", 0)
            except:
                err = {"message": body[:200]}
                code = 0
            
            if code in (4, 17, 80000, 80004):  # Rate limit
                wait = min((attempt + 1) * 30, 120)
                log(f"Rate limited (code {code}), waiting {wait}s...", "WARN")
                time.sleep(wait)
                continue
            
            if attempt < max_retries - 1:
                log(f"API error (attempt {attempt+1}): {err.get('message', str(e))[:150]}", "WARN")
                time.sleep(5)
                continue
            
            return {"error": err}
        
        except Exception as e:
            if attempt < max_retries - 1:
                log(f"Network error (attempt {attempt+1}): {e}", "WARN")
                time.sleep(10)
                continue
            return {"error": str(e)}
    
    return {"error": "Max retries exceeded"}

def fb_get(endpoint, **params):
    return fb_call("GET", endpoint, **params)

def fb_post(endpoint, **params):
    return fb_call("POST", endpoint, **params)

# ─── DATA FETCHING ────────────────────────────────────────────────────────────
def get_all_campaigns():
    """Get all campaigns for the account."""
    result = fb_get(f"{ACCOUNT_ID}/campaigns",
                    fields="id,name,status",
                    limit=100)
    return result.get("data", [])

def get_campaign_insights(cid):
    """Get insights for a specific campaign."""
    result = fb_get(f"{cid}/insights",
                    fields="spend,impressions,clicks,ctr,cpm,actions",
                    date_preset="last_7d")
    return result.get("data", [{}])[0] if result.get("data") else {}

# ─── DECISION ENGINE ─────────────────────────────────────────────────────────
def evaluate_campaign(camp, insights):
    """Evaluate a single campaign and return action dict."""
    name = camp.get("name", "Unknown")
    cid = camp.get("id", "")
    status = camp.get("status", "PAUSED")
    
    spend = float(insights.get("spend", 0) or 0)
    impr = int(insights.get("impressions", 0) or 0)
    clicks = int(insights.get("clicks", 0) or 0)
    ctr = float(insights.get("ctr", 0) or 0)
    cpc = spend / clicks if clicks > 0 else 999
    
    # OFF_ rule — NEVER TOUCH
    if "OFF_" in name:
        return {"action": "SKIP", "reason": "OFF_ prefix"}
    
    if status != "ACTIVE":
        return {"action": "NONE", "reason": "Not active"}
    
    # No spend yet = still ramping up
    if spend == 0:
        return {"action": "JALAN", "reason": "No spend — learning"}
    
    # Zero clicks = bad creative/targeting
    if clicks == 0:
        return {"action": "PAUSE", "reason": f"Spend Rp{int(spend):,}, 0 clicks"}
    
    # CPC-based decisions
    if cpc > CPC_KILL:
        return {"action": "PAUSE", "reason": f"CPC Rp{int(cpc):,} > {CPC_KILL}"}
    if cpc > CPC_WARN:
        return {"action": "PAUSE", "reason": f"CPC Rp{int(cpc):,} > {CPC_WARN}"}
    
    # CTR-based decisions
    if impr >= 500 and ctr < CTR_KILL:
        return {"action": "PAUSE", "reason": f"CTR {ctr:.1f}% < {CTR_KILL}%"}
    
    # GAS conditions
    if cpc <= CPC_GAS and ctr >= CTR_GAS and clicks >= 10:
        return {"action": "GAS", "reason": f"CPC Rp{int(cpc)} + CTR {ctr:.1f}%"}
    
    return {"action": "JALAN", "reason": f"CPC Rp{int(cpc)} CTR {ctr:.1f}%"}

# ─── MAIN DECISION LOOP ──────────────────────────────────────────────────────
def run_cycle(verbose=False):
    """Single decision cycle — evaluate all campaigns and act."""
    now = datetime.now(WIB)
    hour = now.hour
    
    dead_zone = (0 <= hour < 4)
    reactivate_time = (hour == 4)
    
    camps = get_all_campaigns()
    if not camps:
        log("No campaigns returned", "WARN")
        return {"total_spend": 0, "actions": [], "alerts": [], "dead_zone": dead_zone}
    
    active = [c for c in camps if c.get("status") == "ACTIVE"]
    paused_non_off = [c for c in camps if c.get("status") == "PAUSED" and "OFF_" not in c.get("name", "")]
    
    total_spend = 0
    actions_taken = []
    alerts = []
    
    # ── DEAD ZONE: pause all active ──
    if dead_zone:
        for c in active:
            fb_post(c["id"], status="PAUSED")
        if active:
            log(f"🌙 Dead zone (00-04) — paused {len(active)} campaigns")
            alerts.append(f"🌙 Dead zone: {len(active)} paused")
            actions_taken.append(f"DEAD_ZONE: paused {len(active)}")
    
    # ── REACTIVATE TIME (04:00) — wake up non-OFF_ campaigns ──
    if reactivate_time and not dead_zone:
        to_reactivate = [c for c in paused_non_off if "OFF_" not in c.get("name", "")]
        for c in to_reactivate:
            fb_post(c["id"], status="ACTIVE")
        if to_reactivate:
            log(f"☀️ Morning reactivation — {len(to_reactivate)} campaigns")
            alerts.append(f"☀️ {len(to_reactivate)} campaigns reactivated")
            actions_taken.append(f"REACTIVATE: {len(to_reactivate)}")
    
    # ── Evaluate active campaigns (skip if dead zone) ──
    if not dead_zone:
        check_list = active + paused_non_off  # check paused too for reporting
        
        for camp in check_list:
            name = camp.get("name", "Unknown")
            cid = camp.get("id", "")
            status = camp.get("status", "ACTIVE")
            
            insights = get_campaign_insights(cid)
            
            if isinstance(insights, dict) and "error" in insights:
                continue
            
            spend = float(insights.get("spend", 0) or 0)
            total_spend += spend
            
            result = evaluate_campaign(camp, insights)
            
            if result["action"] == "PAUSE" and status == "ACTIVE":
                log(f"🔴 PAUSE: {name[:50]} — {result['reason']}")
                fb_post(cid, status="PAUSED")
                actions_taken.append(f"PAUSE {name[:40]}: {result['reason']}")
                alerts.append(f"🔴 {name[:40]}: {result['reason']}")
            
            elif result["action"] == "GAS":
                log(f"🚀 GAS: {name[:50]} — {result['reason']}")
                actions_taken.append(f"GAS {name[:40]}: {result['reason']}")
                alerts.append(f"🚀 {name[:40]}: CPC winner!")
            
            elif status == "ACTIVE" and verbose:
                log(f"▶️  {name[:50]} — {result['reason']}")
    
    # ── HARD CAP CHECK ──
    if total_spend >= HARD_CAP:
        log(f"🚨 HARD CAP: Rp{int(total_spend):,} — PAUSE ALL!", "CRITICAL")
        for c in active:
            fb_post(c["id"], status="PAUSED")
        actions_taken.append(f"HARD_CAP: Rp{int(total_spend):,} — pause all")
        alerts.append(f"🚨 HARD CAP BREACH Rp{int(total_spend):,}")
    elif total_spend >= HARD_CAP_WARN:
        remaining = HARD_CAP - total_spend
        log(f"⚠️  Spend Rp{int(total_spend):,} — Rp{int(remaining):,} remaining", "WARN")
    
    # ── SAVE STATE ──
    state = {
        "last_run": now.isoformat(),
        "total_spend": total_spend,
        "active_count": len([c for c in camps if c.get("status") == "ACTIVE"]),
        "hard_cap_percent": round(total_spend / HARD_CAP * 100, 1),
        "hard_cap_breached": total_spend >= HARD_CAP,
        "dead_zone": dead_zone,
        "actions": actions_taken,
        "alerts": alerts,
    }
    
    try:
        with open(STATE_FILE, "w") as f:
            json.dump(state, f, indent=2, default=str)
    except:
        pass
    
    return state

# ─── MAIN ─────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Glowscent 681 Autonomous Engine")
    parser.add_argument("--once", action="store_true", help="Single run")
    parser.add_argument("--monitor", action="store_true", help="Daemon mode (continuous)")
    parser.add_argument("--status", action="store_true", help="Show state")
    args = parser.parse_args()
    
    if args.status:
        try:
            with open(STATE_FILE) as f:
                state = json.load(f)
            print(json.dumps(state, indent=2))
        except FileNotFoundError:
            print('{"status": "No state yet"}')
        sys.exit(0)
    
    if args.once:
        log("🚀 Glowscent 681 — Single Run")
        state = run_cycle(verbose=True)
        
        print(f"\n{'='*55}")
        print(f"💰 Spend: Rp{int(state['total_spend']):,}")
        print(f"📊 Active: {state['active_count']}")
        print(f"📉 Cap: {state['hard_cap_percent']}%")
        print(f"{'🔴 BREACHED!' if state['hard_cap_breached'] else '✅ Under cap'}")
        print(f"{'🌙 Dead zone' if state['dead_zone'] else '☀️ Active'}")
        
        if state["alerts"]:
            print(f"\n📢 Alerts:")
            for a in state["alerts"]:
                print(f"   {a}")
        
        print(f"\n✅ {len(state['actions'])} actions")
        sys.exit(0)
    
    if args.monitor:
        log("🔥 Glowscent 681 — Daemon Mode Started")
        log(f"   Rules: CPC>{CPC_WARN}=pause | CTR<{CTR_MIN}%=pause | Cap=Rp{HARD_CAP:,}")
        log(f"   Token: {'✅ Loaded' if ACCESS_TOKEN else '❌ MISSING'}")
        
        cycle = 0
        while True:
            try:
                cycle += 1
                now = datetime.now(WIB)
                
                # Determine check interval based on time of day
                hour = now.hour
                if 0 <= hour < 4:
                    interval = 600  # 10 min during dead zone (check for reactivation)
                else:
                    interval = 900  # 15 min during active hours
                
                state = run_cycle(verbose=(cycle % 10 == 0))  # verbose every 10th cycle
                
                summary = f"[#{cycle}] 💰 Rp{int(state['total_spend']):,} | "
                summary += f"Active: {state['active_count']} | "
                summary += f"Cap: {state['hard_cap_percent']}% | "
                summary += f"Actions: {len(state['actions'])}"
                
                if state["alerts"]:
                    summary += f" | ⚠️ {len(state['alerts'])} alerts"
                
                log(summary)
                
                # Alert on critical conditions
                if state["hard_cap_breached"]:
                    log("🚨 HARD CAP BREACH — ALL PAUSED", "CRITICAL")
                
                time.sleep(interval)
                
            except KeyboardInterrupt:
                log("Shutting down...")
                break
            except Exception as e:
                log(f"Cycle error: {traceback.format_exc()}", "ERROR")
                log("Restarting in 60s...")
                time.sleep(60)
    
    if not any([args.once, args.monitor, args.status]):
        state = run_cycle(verbose=True)
        print(f"\n💰 Total: Rp{int(state['total_spend']):,} | Active: {state['active_count']} | Actions: {len(state['actions'])}")
