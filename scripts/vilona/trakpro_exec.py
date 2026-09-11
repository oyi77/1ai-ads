"""VILONA TrakPro — telegram alerts, HITL executor, action execution

Split from vilona_trakpro_engine.py to enforce the 800-line module limit.
"""

import json, os, sys, time, traceback, threading
import urllib.request, urllib.parse
from datetime import datetime, timedelta, timezone
from pathlib import Path
from collections import defaultdict

from trakpro_config import (
    WIB, WORKSPACE, DATA_DIR, LOG_FILE, STATE_FILE, SHOPEE_DATA,
    ACCESS_TOKEN, API, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, TELEGRAM_API,
    EXEC_STATE_FILE, ACCOUNTS, CORE_PORTFOLIO, AUDIENCE_POOL,
    SCALE_SEED_AUDIENCE, log, _load_exec_state, _save_exec_state, exec_state,
)

from trakpro_meta import fb_patch

def send_message_text(chat_id, text, reply_markup=None):
    """Send text to Telegram using urllib (avoids httpx dependency issues)."""
    if not TELEGRAM_BOT_TOKEN or TELEGRAM_BOT_TOKEN == "REPLACE_WITH_REAL_TOKEN":
        log("Telegram token not configured; skip send", "WARN")
        return None
    try:
        params = {"chat_id": chat_id, "text": text[:4000], "parse_mode": "HTML"}
        if reply_markup:
            params["reply_markup"] = json.dumps(reply_markup)
        data = urllib.parse.urlencode(params).encode()
        url = f"{TELEGRAM_API}/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
        req = urllib.request.Request(url, data=data)
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read())
    except Exception as e:
        log(f"Telegram send failed: {e}", "ERROR")
        return None

def send_alert(message, reply_markup=None):
    alert_file = WORKSPACE / "data" / "vilona_trakpro_alerts.jsonl"
    try:
        with open(alert_file, "a") as f:
            f.write(json.dumps({"ts": datetime.now(WIB).isoformat(), "msg": message}) + "\n")
    except Exception:
        pass
    send_message_text(TELEGRAM_CHAT_ID, message, reply_markup=reply_markup)
    log(f"ALERT SENT: {message[:80]}...")

def executor_pause(campaign_id: str, reason: str = "", dry_run: bool = True):
    entry = {
        "ts": datetime.now(WIB).isoformat(),
        "action": "pause",
        "campaign_id": campaign_id,
        "reason": reason,
        "dry_run": dry_run,
        "status": "pending",
    }
    exec_state["queue"].append(entry)
    _save_exec_state(exec_state)
    log(f"EXEC pause queued: {campaign_id} reason={reason} dry_run={dry_run}")
    return entry

def executor_scale(campaign_id: str, pct: float, reason: str = "", dry_run: bool = True):
    entry = {
        "ts": datetime.now(WIB).isoformat(),
        "action": "scale",
        "campaign_id": campaign_id,
        "pct": pct,
        "reason": reason,
        "dry_run": dry_run,
        "status": "pending",
    }
    exec_state["queue"].append(entry)
    _save_exec_state(exec_state)
    log(f"EXEC scale queued: {campaign_id} pct={pct} dry_run={dry_run}")
    return entry

def run_exec_queue(max_items: int = 5):
    processed = []
    for item in list(exec_state.get("queue", []))[:max_items]:
        if item.get("status") != "pending":
            continue
        try:
            if item["action"] == "pause":
                if item.get("dry_run", True):
                    log(f"DRY_RUN pause {item['campaign_id']}")
                    item["status"] = "dry_run_ok"
                else:
                    fb_patch(f"{item['campaign_id']}", status="PAUSED")
                    item["status"] = "executed"
            elif item["action"] == "scale":
                if item.get("dry_run", True):
                    log(f"DRY_RUN scale {item['campaign_id']} {item['pct']}%")
                    item["status"] = "dry_run_ok"
                else:
                    camp = fb_get(f"{item['campaign_id']}", fields="daily_budget")
                    cur = int(camp.get("daily_budget", 0))
                    new = max(1, int(cur * (1 + item["pct"] / 100.0)))
                    fb_patch(f"{item['campaign_id']}", daily_budget=str(new))
                    item["status"] = "executed"
                    item["new_budget"] = new
            processed.append(item)
        except Exception as e:
            log(f"EXEC failed: {e}", "ERROR")
            item["status"] = f"error:{e}"
    if processed:
        exec_state["history"].extend(processed)
        exec_state["queue"] = [x for x in exec_state.get("queue", []) if x.get("status") == "pending"]
        _save_exec_state(exec_state)
    return processed

def execute_actions(account_id, account_config, classifications, acc_key="", insights=None):
    """Execute pause/scale actions based on Veris brain rules.
    
    Scale Rules (2026-06-10 revamp):
    - ALL winners → create ON_LC_ clones (Rp 18k, LOWEST_COST, age-shifted)
    - COST_CAP winner → LC clone (micro-budget bypasses bid cap)
    - LOWEST_COST winner → LC clone (horizontal micro-duplication, NOT vertical scale)
    - SUPER (ROAS > 8x) → priority clone (same mechanism, higher signal)
    - NO MORE vertical budget scaling — horizontal only
    
    Safety:
    - Max 3 clones per cycle
    - CPC threshold still active — pause if > threshold
    - DRY_RUN gate for testing"""
    campaigns = get_all_campaigns(account_id)
    actions_taken = []
    core = CORE_PORTFOLIO.get(acc_key, [])
    clones_created = 0
    max_clones_per_cycle = 1  # 1 per cycle — quality over quantity
    
    # DRY_RUN gate: skip all real API mutations unless explicitly disabled
    dry_run = os.getenv("DRY_RUN", "true").lower() in ("true", "1", "yes")
    if dry_run:
        log(f"  🧪 DRY_RUN active — real API mutations skipped")
    
    # Dynamic budget cap: only enforce 300rb if aggregate CPC exceeds KPI
    dynamic_cap = None
    if insights:
        total_spend = sum(i["spend"] for i in insights.values())
        total_clicks = sum(i.get("clicks", 0) for i in insights.values())
        if total_clicks > 0:
            aggregate_cpc = total_spend / total_clicks
            cpc_danger = account_config.get("cpc_danger_cbo", 140)
            if aggregate_cpc > cpc_danger:
                dynamic_cap = 300000
                log(f"  ⚠️ Dynamic cap ACTIVE: agg CPC Rp{aggregate_cpc:.0f} > Rp{cpc_danger} → cap 300rb")
            else:
                log(f"  ✅ Dynamic cap OFF: agg CPC Rp{aggregate_cpc:.0f} ≤ Rp{cpc_danger} → no cap")
    
    # Startup guard: ensure all core portfolio campaigns are ACTIVE
    for cid, camp in campaigns.items():
        name = camp["name"]
        is_core = name in core  # EXACT match to prevent false positives
        if is_core and camp["status"] != "ACTIVE" and not name.startswith("OFF_"):
            if not dry_run:
                try:
                    fb_post(cid, status="ACTIVE")
                    actions_taken.append(f"🛡️ GUARD: Reactivated {name[:40]}")
                    log(f"GUARD REACTIVATE: {name}")
                except Exception as e:
                    log(f"Guard reactivate failed: {e}", "ERROR")
            else:
                actions_taken.append(f"🧪 DRY_RUN: would reactivate {name[:40]}")
    
    for cid, (verdict, roas, reason) in classifications.items():
        if cid not in campaigns:
            continue
        
        camp = campaigns[cid]
        name = camp["name"]
        status = camp["status"]
        current_budget = int(camp.get("daily_budget", 0) or 0)
        is_core = name in core  # EXACT match
        
        if verdict == "OFF_LIMITS":
            continue
        
        if verdict == "BONCOS":
            if is_core:
                actions_taken.append(f"🛡️ PROTECTED: {name[:40]} (core)")
                continue
            if status == "ACTIVE":
                if not dry_run:
                    try:
                        fb_post(cid, status="PAUSED")
                        actions_taken.append(f"💀 PAUSED: {name[:40]} — {reason}")
                        log(f"BONCOS PAUSE: {name}")
                    except Exception as e:
                        log(f"Pause failed for {name}: {e}", "ERROR")
                else:
                    actions_taken.append(f"🧪 DRY_RUN: would pause {name[:40]} — {reason}")
            else:
                actions_taken.append(f"💤 Already paused: {name[:40]}")
        
        elif verdict in ("WINNER", "SUPER"):
            # Reactivate if core and paused
            if status != "ACTIVE" and is_core:
                try:
                    fb_post(cid, status="ACTIVE")
                    actions_taken.append(f"🔄 REACTIVATED: {name[:40]}")
                except Exception as e:
                    log(f"Reactivate failed: {e}", "ERROR")
            
            # CPC safety gate: only clone if CPC below danger threshold
            cpc_warn = account_config.get("cpc_danger_cbo", 150)
            camp_cpc = insights.get(cid, {}).get("cpc", 0) if insights else 0
            if camp_cpc > cpc_warn:
                actions_taken.append(f"⏸️ HOLD: {name[:40]} — CPC Rp{camp_cpc:.0f} > Rp{cpc_warn} (unsafe to clone)")
                continue

            # 2026-06-10: ALL winners → LC Micro-Scale clone (age-shifted)
            # No more bid_strategy discrimination — clone everything!
            if clones_created < max_clones_per_cycle:
                result = create_lc_clone(camp, account_id, account_config, clones_created)
                if result:
                    clone_id = result["campaign_id"] if isinstance(result, dict) else result
                    clones_created += 1
                    age_info = result.get("age_range", "?") if isinstance(result, dict) else "?"
                    actions_taken.append(
                        f"🧬 LC CLONE: {name[:30]} → ON_LC_ age {age_info} "
                        f"(Rp 18k, LOWEST_COST, ROAS {roas:.1f}x)"
                    )
                else:
                    actions_taken.append(
                        f"⏸️ HOLD: {name[:40]} — clone failed"
                    )
            else:
                actions_taken.append(
                    f"⏸️ MAX CLONES: {name[:40]} — {clones_created}/{max_clones_per_cycle}"
                )
        
        elif verdict == "FATIGUE":
            actions_taken.append(f"🔄 FATIGUE: {name[:40]} — {reason}")
    
    return actions_taken