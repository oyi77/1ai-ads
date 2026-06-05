#!/usr/bin/env python3
"""
🔥 DECISION CENTER AUTO-EXECUTE — Multi-Account Autonomous Ad Manager
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RUNS analysis → AUTO-EXECUTES → REPORTS what happened.

EXECUTION RULES:
  🟢 WINNER (ROAS > 1.3x, profit > 0): AUTO-SCALE budget +20%
  🔴 BONCOS (ROAS < 0.8x): AUTO-PAUSE
  🟡 WATCH incomplete: Notify only
  ⚪ PENDING low spend: Skip

SAFETY: OFF_ never touch, cooldown 4h, quiet hours 23-06, max Rp500K

Usage:
  python3 decision_center_autoexec.py                  # All accounts, execute
  python3 decision_center_autoexec.py --dry-run         # Preview only
  python3 decision_center_autoexec.py --account 0858    # Single account
  python3 decision_center_autoexec.py --telegram        # Execute + send report
"""

import sys, os, json, time
from datetime import datetime, timedelta
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
LOG_DIR = PROJECT_DIR / "logs"
STATE_DIR = PROJECT_DIR / "data" / "shopee"

# Import trakpro functions directly
sys.path.insert(0, str(SCRIPT_DIR))
from trakpro_vilona import (
    ACCOUNTS, analyze, rekomendasi, execute_rekomendasi,
    fmt_cli, fmt_telegram, send_tg, TOKEN as TRAKPRO_TOKEN
)

ALL_ACCOUNTS = ['1041', '0858', '1208', '1134']

# Execution thresholds
MIN_SPEND_FOR_DECISION = 5000
MAX_BUDGET = 500000
MIN_BUDGET = 20000
SCALE_INCREMENT = 0.20
COOLDOWN_HOURS = 4
QUIET_START = 23
QUIET_END = 6
MAX_AUTO_PAUSE_PER_RUN = 5     # Safety: don't pause more than 5 at once
MAX_AUTO_SCALE_PER_RUN = 5     # Safety: don't scale more than 5 at once

os.makedirs(LOG_DIR, exist_ok=True)
os.makedirs(STATE_DIR, exist_ok=True)

# ── STATE ───────────────────────────────────────────────
def load_state():
    sf = STATE_DIR / "decision_center_state.json"
    if sf.exists():
        return json.loads(sf.read_text())
    return {"cooldowns": {}, "history": []}

def save_state(state):
    sf = STATE_DIR / "decision_center_state.json"
    state["last_run"] = datetime.now().isoformat()
    state["history"] = state["history"][-500:]
    sf.write_text(json.dumps(state, indent=2, ensure_ascii=False))

def is_quiet_hours():
    now = datetime.now()
    return QUIET_START <= now.hour or now.hour < QUIET_END

def on_cooldown(camp_id, state):
    cd = state.get("cooldowns", {}).get(camp_id, "")
    if cd:
        return datetime.now() - datetime.fromisoformat(cd) < timedelta(hours=COOLDOWN_HOURS)
    return False

def set_cooldown(camp_id, state):
    state.setdefault("cooldowns", {})[camp_id] = datetime.now().isoformat()

# ── EXECUTION ───────────────────────────────────────────
def run_account(acc_key, dry_run=False):
    """Run analysis + execute for one account. Returns results dict."""
    acc = ACCOUNTS.get(acc_key)
    if not acc:
        return {"account": acc_key, "error": "Unknown account"}
    
    acc_name = acc['nm']
    act_id = acc['id']
    
    print(f"\n{'='*60}")
    print(f"📊 {acc_name} ({acc_key}) — {act_id}")
    print(f"{'='*60}")
    
    state = load_state()
    
    # Step 1: Analyze
    print("🔍 Analyzing campaigns + Shopee data...")
    try:
        r = analyze(acc_key, days=3)
    except Exception as e:
        print(f"❌ Analysis failed: {e}")
        return {"account": acc_key, "name": acc_name, "error": str(e)[:200]}
    
    if not r:
        return {"account": acc_key, "name": acc_name, "error": "No data"}
    
    all_camps = r['wins'] + r['bons'] + r['scales'] + r['watch'] + r['pend']
    print(f"  {r['n']} campaigns | Spend: Rp{r['total_spend']:,.0f} | Profit: Rp{r['total_profit']:,.0f}")
    print(f"  {len(r['wins'])}W / {len(r['bons'])}L / {len(r['scales'])}S / {len(r['watch'])}WATCH / {len(r['pend'])}PEND")
    
    # Step 2: Get recommendations
    reko = rekomendasi(all_camps, acc_key, days=3) if all_camps else None
    
    results = {
        "account": acc_key,
        "name": acc_name,
        "act_id": act_id,
        "analyzed": len(all_camps),
        "wins": len(r['wins']),
        "bons": len(r['bons']),
        "paused": [],
        "scaled": [],
        "skipped_cooldown": [],
        "skipped_quiet": [],
        "skipped_data": [],
        "errors": [],
        "recommendations": [],
    }
    
    if is_quiet_hours() and not dry_run:
        print(f"🌙 QUIET HOURS (23:00-06:00) — execution paused")
        results["skipped_quiet"] = [f"All {len(all_camps)} campaigns — quiet hours"]
        return results
    
    if not reko:
        print("✅ No recommendations — nothing to execute")
        return results
    
    # Build recommendation summary
    for rc in reko.get('reco', []):
        results["recommendations"].append({
            "aksi": rc.get('aksi', '?'),
            "tag": rc.get('tag', '?'),
            "roas": rc.get('roas', 0),
            "detail": rc.get('detail', ''),
            "camp_count": len(rc.get('camps', [])),
        })
    
    # Step 3: Execute PAUSE for BONCOS
    reco_list = reko.get('reco', [])
    pause_count = 0
    scale_count = 0
    
    for rc in reco_list:
        aksi = rc.get('aksi', '')
        camps = rc.get('camps', [])
        tag = rc.get('tag', '?')
        roas = rc.get('roas', 0)
        
        if aksi == 'PAUSE':
            for c in camps:
                cid = c.get('id', '')
                cname = c.get('name', '?')
                spend = c.get('spend', 0)
                
                if not cid:
                    continue
                if "OFF_" in cname:
                    results["skipped_data"].append(f"{cname[:40]} | OFF_ prefix — never touch")
                    continue
                if spend < MIN_SPEND_FOR_DECISION:
                    continue
                if on_cooldown(cid, state):
                    results["skipped_cooldown"].append(f"{cname[:40]}")
                    continue
                if pause_count >= MAX_AUTO_PAUSE_PER_RUN:
                    continue
                
                if dry_run:
                    print(f"  [DRY RUN] Would PAUSE: {cname[:50]} | ROAS {roas:.2f}x")
                    results["paused"].append(f"{cname[:40]} | ROAS {roas:.2f}x | DRY RUN")
                    pause_count += 1
                else:
                    result = execute_rekomendasi(
                        {'reco': [{'aksi': 'PAUSE', 'tag': tag, 'camps': [c]}]},
                        acc_key, dry_run=False
                    )
                    if result.get('paused', 0) > 0:
                        results["paused"].append(f"{cname[:40]} | ROAS {roas:.2f}x")
                        set_cooldown(cid, state)
                        state["history"].append({
                            "time": datetime.now().isoformat(),
                            "account": acc_key, "action": "PAUSE",
                            "campaign": cname[:60], "roas": roas,
                        })
                        pause_count += 1
                    elif result.get('errors'):
                        results["errors"].extend(result['errors'])
        
        elif aksi in ('GAS', 'GAS+CREATIVE'):
            for c in camps:
                cid = c.get('id', '')
                cname = c.get('name', '?')
                budget = c.get('budget', 0)
                spend = c.get('spend', 0)
                
                if not cid or budget <= 0:
                    continue
                if "OFF_" in cname:
                    continue
                if spend < MIN_SPEND_FOR_DECISION:
                    continue
                if on_cooldown(cid, state):
                    results["skipped_cooldown"].append(f"{cname[:40]}")
                    continue
                if budget >= MAX_BUDGET:
                    continue
                if scale_count >= MAX_AUTO_SCALE_PER_RUN:
                    continue
                
                if dry_run:
                    new_b = min(int(budget * 1.2), MAX_BUDGET)
                    print(f"  [DRY RUN] Would SCALE: {cname[:40]} | Rp{budget:,} → Rp{new_b:,} | ROAS {roas:.2f}x")
                    results["scaled"].append(f"{cname[:40]} | ROAS {roas:.2f}x | DRY RUN")
                    scale_count += 1
                else:
                    result = execute_rekomendasi(
                        {'reco': [{'aksi': 'GAS', 'tag': tag, 'camps': [c]}]},
                        acc_key, dry_run=False
                    )
                    if result.get('scaled', 0) > 0:
                        new_b = min(int(budget * 1.2), MAX_BUDGET)
                        results["scaled"].append(f"{cname[:40]} | ROAS {roas:.2f}x | Rp{new_b:,}")
                        set_cooldown(cid, state)
                        state["history"].append({
                            "time": datetime.now().isoformat(),
                            "account": acc_key, "action": "SCALE",
                            "campaign": cname[:60], "roas": roas,
                            "detail": f"Rp{budget:,} → Rp{new_b:,}",
                        })
                        scale_count += 1
                    elif result.get('errors'):
                        results["errors"].extend(result['errors'])
    
    save_state(state)
    results["_pause_count"] = pause_count
    results["_scale_count"] = scale_count
    return results


def format_telegram(all_results, dry_run):
    """Generate clean Telegram report."""
    now = datetime.now()
    lines = [
        f"⚡ <b>DECISION CENTER</b> — {now.strftime('%H:%M WIB')}",
    ]
    
    if dry_run:
        lines.append("🔍 <i>DRY RUN — no changes</i>")
    elif is_quiet_hours():
        lines.append("🌙 <i>QUIET HOURS — execution paused</i>")
    else:
        lines.append("🔥 <i>AUTO-EXECUTE ACTIVE</i>")
    
    lines.append("")
    
    total_paused = 0
    total_scaled = 0
    total_errors = 0
    
    for r in all_results:
        if r.get("error"):
            lines.append(f"❌ {r['name']}: {r['error'][:80]}")
            continue
        
        label = f"<b>{r['name']}</b> ({r['account']})"
        paused = len(r["paused"])
        scaled = len(r["scaled"])
        errors = len(r["errors"])
        
        total_paused += paused
        total_scaled += scaled
        total_errors += errors
        
        # Always show summary line
        summary = f"{label} | Spend: {r.get('analyzed',0)} camps | {r.get('wins',0)}W/{r.get('bons',0)}L"
        lines.append(summary)
        
        if paused > 0:
            lines.append(f"  🔴 <b>PAUSED ({paused}):</b>")
            for p in r["paused"][:5]:
                lines.append(f"    • {p}")
        
        if scaled > 0:
            lines.append(f"  🟢 <b>SCALED ({scaled}):</b>")
            for s in r["scaled"][:5]:
                lines.append(f"    • {s}")
        
        if errors > 0:
            lines.append(f"  ⚠️ Errors ({errors})")
            for e in r["errors"][:3]:
                lines.append(f"    • {e[:100]}")
        
        lines.append("")
    
    # Summary
    lines.append(f"📋 <b>TOTAL: {total_paused} paused | {total_scaled} scaled | {total_errors} errors</b>")
    
    if total_paused == 0 and total_scaled == 0:
        lines.append("✅ No actions needed")
    
    return "\n".join(lines)


# ── MAIN ────────────────────────────────────────────────
def main():
    import argparse
    parser = argparse.ArgumentParser(description="Decision Center Auto-Execute")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--account")
    parser.add_argument("--telegram", action="store_true", help="Send report to Telegram")
    args = parser.parse_args()
    
    if not TRAKPRO_TOKEN:
        print("❌ No Meta Ads token")
        sys.exit(1)
    
    accounts = [args.account] if args.account else ALL_ACCOUNTS
    all_results = []
    
    for acc_key in accounts:
        if acc_key not in ACCOUNTS:
            print(f"❌ Unknown: {acc_key}")
            continue
        
        result = run_account(acc_key, dry_run=args.dry_run)
        all_results.append(result)
    
    # CLI report
    print(f"\n{'='*60}")
    total_p = sum(len(r.get("paused",[])) for r in all_results)
    total_s = sum(len(r.get("scaled",[])) for r in all_results)
    total_e = sum(len(r.get("errors",[])) for r in all_results)
    print(f"⚡ DONE: {total_p} paused | {total_s} scaled | {total_e} errors")
    print(f"{'='*60}")
    
    # Save log
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    log_path = LOG_DIR / f"dc_{ts}.json"
    log_path.write_text(json.dumps({
        "timestamp": datetime.now().isoformat(),
        "dry_run": args.dry_run,
        "results": all_results,
    }, indent=2, ensure_ascii=False, default=str))
    print(f"📁 {log_path}")
    
    # Telegram
    if args.telegram:
        tg_msg = format_telegram(all_results, args.dry_run)
        try:
            send_tg(tg_msg)
            print("📤 Telegram sent")
        except Exception as e:
            print(f"⚠️ Telegram: {e}")

if __name__ == "__main__":
    main()
