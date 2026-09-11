#!/usr/bin/env python3
"""VILONA TrakPro Engine — main cycle orchestrator and Telegram HITL router.

Split from the original 1827-line monolith to enforce the 800-line module limit.
Sub-modules: trakpro_config, trakpro_meta, trakpro_clone, trakpro_exec.

Public API is re-exported here so existing importers (auto_clone_winners.py,
patrol_*.py, campaigns/*.py, monitoring/*.py) keep working unchanged.
"""

import json, os, sys, time, traceback, threading
import urllib.request, urllib.parse
from datetime import datetime, timedelta, timezone
from pathlib import Path
from collections import defaultdict

sys.path.insert(0, str(Path(__file__).resolve().parent))

from trakpro_config import (
    WIB, _BASE, _DEFAULT_WORKSPACE, _HERE_BASE, WORKSPACE, DATA_DIR, LOG_FILE,
    STATE_FILE, SHOPEE_DATA, TOKEN_FILE, ACCESS_TOKEN, API,
    TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, TELEGRAM_API,
    EXEC_STATE_FILE, ACCOUNTS, CORE_PORTFOLIO, AUDIENCE_POOL,
    SCALE_SEED_AUDIENCE, log, _load_exec_state, _save_exec_state, exec_state,
)
from trakpro_meta import (
    fb_patch, fb_get, fb_post,
    load_shopee_commissions, load_shopee_for_account, detect_shopee_date_range,
    get_campaign_insights, get_all_campaigns,
    detect_campaign_type, classify_campaign, get_campaign_bid_strategy,
)
from trakpro_clone import (
    _pick_diversified_audience, _pick_scale_audience, create_lc_clone,
)
from trakpro_exec import (
    send_message_text, send_alert,
    executor_pause, executor_scale, run_exec_queue, execute_actions,
)

try:
    from telegram import Bot, Update, CallbackQuery
    from telegram.ext import (
        Application, CommandHandler, CallbackQueryHandler,
        ContextTypes, MessageHandler, filters,
    )
    from telegram.constants import ParseMode
except Exception as e:  # pragma: no cover
    Bot = None
    Update = None
    CallbackQuery = None
    Application = None
    CommandHandler = None
    CallbackQueryHandler = None
    ContextTypes = None
    MessageHandler = None
    filters = None
    ParseMode = None

from vilona_trakpro_recommendations import generate_recommendations, format_telegram

def run_cycle():
    """One full cycle across all accounts."""
    cycle_start = datetime.now(WIB)
    log(f"🔄 CYCLE START — {cycle_start.strftime('%H:%M')} WIB")
    
    state = {}
    if STATE_FILE.exists():
        try:
            state = json.loads(STATE_FILE.read_text())
        except:
            pass
    
    shopee_data = load_shopee_commissions()  # Global fallback
    
    # Detect Shopee date range for accurate ROAS comparison
    shopee_since, shopee_until = detect_shopee_date_range()
    if shopee_since and shopee_until:
        log(f"Aligning Meta insights to Shopee range: {shopee_since} → {shopee_until}")
    all_alerts = []
    all_actions = []
    account_summaries = {}
    
    for acc_key, acc_config in ACCOUNTS.items():
        if not acc_config.get("enabled", True):
            continue
        acc_id = acc_config["id"]
        acc_name = acc_config["name"]
        acc_shopee = load_shopee_for_account(acc_key) or shopee_data
        
        try:
            insights = get_campaign_insights(acc_id, since=shopee_since, until=shopee_until)
            campaigns = get_all_campaigns(acc_id)
            
            active_count = len([c for c in campaigns.values() if c["status"] == "ACTIVE"])
            total_spend_48h = sum(i["spend"] for i in insights.values())
            
            # Classify each campaign
            prev = state.get(acc_key, {}).get("campaigns", {})
            classifications = {}
            winners = []
            boncos_list = []
            
            for cid, cdata in insights.items():
                if cdata["spend"] < 50:  # Skip near-zero campaigns
                    continue
                
                verdict, roas, reason = classify_campaign(
                    cdata, acc_shopee, acc_config, prev, insights, cid
                )
                classifications[cid] = (verdict, roas, reason)
                
                if verdict in ("WINNER", "SUPER"):
                    winners.append((cdata["name"], roas, reason))
                elif verdict == "BONCOS":
                    boncos_list.append((cdata["name"], reason))
            
            # Execute actions
            actions = execute_actions(acc_id, acc_config, classifications, acc_key, insights)
            all_actions.extend(actions)
            
            # Build summary
            summary = {
                "active": active_count,
                "total_campaigns": len(campaigns),
                "spend_48h": int(total_spend_48h),
                "winners": len(winners),
                "boncos": len(boncos_list),
                "winner_names": [w[0][:40] for w in winners],
                "boncos_names": [b[0][:40] for b in boncos_list],
            }
            account_summaries[acc_key] = summary
            
            # Update state with boncos_streak and is_winner tracking
            # CRITICAL: merge with existing state — campaigns not in this cycle's
            # insights (paused, zero spend) must retain their boncos_streak history
            prev_campaigns = prev
            new_campaigns = dict(prev_campaigns)  # Start with existing state
            for cid, cdata in insights.items():
                verdict = classifications.get(cid, ("?", 0, ""))[0]
                prev_c = prev_campaigns.get(cid, {})
                
                # Track boncos streak
                boncos_streak = prev_c.get("boncos_streak", 0)
                if verdict == "BONCOS":
                    boncos_streak += 1
                    cdata["_boncos_count"] = boncos_streak
                else:
                    boncos_streak = 0
                
                # Track winner status
                is_winner = verdict in ("WINNER", "SUPER")
                
                new_campaigns[cid] = {
                    "name": cdata["name"],
                    "ctr": cdata["ctr"],
                    "cpc": cdata["cpc"],
                    "boncos_streak": boncos_streak,
                    "is_winner": is_winner,
                    "last_seen": datetime.now(WIB).isoformat(),
                }
            
            state[acc_key] = {
                "last_cycle": datetime.now(WIB).isoformat(),
                "campaigns": new_campaigns,
                "summary": summary,
            }
            
            log(f"  {acc_name} ({acc_key}): {active_count} active, "
                f"spend Rp{total_spend_48h:,.0f}, "
                f"{len(winners)}W / {len(boncos_list)}B")
            
        except Exception as e:
            log(f"  {acc_name} ({acc_key}): ERROR — {e}", "ERROR")
            traceback.print_exc()
    
    # Save state
    try:
        STATE_FILE.write_text(json.dumps(state, indent=2))
    except:
        pass
    
    # Generate alerts
    for acc_key, summary in account_summaries.items():
        if summary["winners"] > 0:
            all_alerts.append(
                f"🏆 /winner {ACCOUNTS[acc_key]['name']}: "
                + ", ".join(summary["winner_names"][:5])
            )
        if summary["boncos"] > 0:
            all_alerts.append(
                f"💀 /boncos {ACCOUNTS[acc_key]['name']}: "
                + ", ".join(summary["boncos_names"][:5])
            )
    
    # Send alerts if significant
    if all_alerts:
        send_alert("\n".join(all_alerts))
    
    # ─── GENERATE RECOMMENDATIONS ───────────────────────────────────────
    # Generate Trakpro-style daily recommendations for first enabled account
    try:
        rec_acc = next((k for k, v in ACCOUNTS.items() if v.get("enabled", True)), None)
        if rec_acc and rec_acc in ACCOUNTS:
            acc_insights = get_campaign_insights(ACCOUNTS[rec_acc]["id"], days=2)
            recs = generate_recommendations(
                acc_insights, shopee_data, ACCOUNTS[rec_acc], state
            )
            log(f"  📋 Recommendations generated: {len(recs['sections'])} sections")
            
            # Format and queue Telegram alert for recommendations
            telegram_msg = format_telegram(recs)
            if telegram_msg.strip():
                send_alert(telegram_msg)
    except Exception as e:
        log(f"  Recommendations gen failed: {e}", "WARN")
    
    # Morning/evening summary
    hour = datetime.now(WIB).hour
    if hour in (9, 21) and account_summaries:
        summary_lines = [f"📊 TRAKPRO SUMMARY — {cycle_start.strftime('%d %b %H:%M')}"]
        for acc_key, s in account_summaries.items():
            summary_lines.append(
                f"  {ACCOUNTS[acc_key]['name']}: {s['active']} active | "
                f"Spend Rp{s['spend_48h']:,} | {s['winners']}W/{s['boncos']}B"
            )
        summary_lines.append(f"  Actions: {len(all_actions)}")
        send_alert("\n".join(summary_lines))
    
    # Daily midnight report — full campaign mapping for all accounts
    if hour == 0:
        try:
            today_str = datetime.now(WIB).strftime("%Y-%m-%d")
            for acc_key, acc_config in ACCOUNTS.items():
                if not acc_config.get("enabled", True):
                    continue
                acc_id = acc_config["id"]
                acc_name = acc_config["name"]
                try:
                    today_insights = fb_get(f"{acc_id}/insights",
                        fields="campaign_name,campaign_id,spend,clicks,impressions,cpc,ctr,actions",
                        time_range=f'{{"since":"{today_str}","until":"{today_str}"}}',
                        level="campaign", limit="100")
                    camp_statuses = get_all_campaigns(acc_id)
                except Exception as e:
                    log(f"Midnight report fetch failed for {acc_name}: {e}", "ERROR")
                    continue

                lines = [
                    f"📊 <b>{acc_key} {acc_name.upper()} — Daily Mapping {cycle_start.strftime('%d %b %Y')}</b>",
                    ""
                ]
                total_spend = 0
                total_links = 0
                core_spend = 0
                off_spend = 0
                count = 0

                for c in sorted(today_insights.get("data", []), key=lambda x: float(x.get("spend", 0)), reverse=True):
                    spend = float(c.get("spend", 0))
                    if spend < 50:
                        continue
                    name = c.get("campaign_name", "?")
                    link = 0
                    for a in c.get("actions", []):
                        if a.get("action_type") == "link_click":
                            link = int(a.get("value", 0))
                    total_spend += spend
                    total_links += link

                    is_off = name.startswith("OFF_")
                    is_core = name in CORE_PORTFOLIO.get(acc_key, [])
                    if is_off:
                        off_spend += spend
                    if is_core:
                        core_spend += spend
                    tag = "OFF" if is_off else ("CORE" if is_core else "?")
                    lines.append(
                        f"{tag:4s} | Rp{spend:>9,.0f} | {link:>4}L | "
                        f"CPC{float(c.get('cpc',0)):>5.0f} | {name[:40]}"
                    )
                    count += 1
                    if count >= 20:
                        break

                lines.append("")
                lines.append(f"💰 Total: Rp{total_spend:,.0f} | {total_links} link clicks | {count} campaigns")
                if total_spend:
                    lines.append(f"🟢 Core: Rp{core_spend:,.0f} ({core_spend/total_spend*100:.0f}%)")
                    lines.append(f"🔴 OFF: Rp{off_spend:,.0f} ({off_spend/total_spend*100:.0f}%)")

                active_core = len([c for c in camp_statuses.values()
                                 if c["status"] == "ACTIVE" and c["name"] in CORE_PORTFOLIO.get(acc_key, [])])
                lines.append(f"\n✅ Active CORE: {active_core}/{len(CORE_PORTFOLIO.get(acc_key, []))}")
                lines.append(f"📋 Next: 09:00 WIB morning summary")

                send_alert("\n".join(lines))
            log("📋 Daily mapping report sent for all accounts")
        except Exception as e:
            log(f"Daily report failed: {e}", "ERROR")
    
    cycle_duration = (datetime.now(WIB) - cycle_start).total_seconds()
    log(f"✅ CYCLE DONE — {cycle_duration:.1f}s | "
        f"{sum(s['active'] for s in account_summaries.values())} active across {len(account_summaries)} accounts | "
        f"{sum(s['winners'] for s in account_summaries.values())}W / {sum(s['boncos'] for s in account_summaries.values())}B")
    
    return len(all_actions), len(all_alerts)

if Application is not None:
    def make_approve_keyboard(campaign_id: str):
        return {
            "inline_keyboard": [
                [{"text": "✅ Approve", "callback_data": f"APPROVE:{campaign_id}"}],
                [{"text": "❌ Reject", "callback_data": f"REJECT:{campaign_id}"}],
            ]
        }

    async def cmd_scale(update: Update, context: ContextTypes.DEFAULT_TYPE):
        args = context.args
        if not args:
            await update.message.reply_text("Usage: /scale <campaign_id> <pct> [reason]")
            return
        cid, pct, *rest = args
        reason = " ".join(rest) if rest else "manual scale"
        try:
            pct = float(pct)
        except ValueError:
            await update.message.reply_text("Invalid pct"); return
        if pct <= 0 or pct > 100:
            await update.message.reply_text("Pct must be 1-100"); return
        if str(update.effective_chat.id) != str(TELEGRAM_CHAT_ID):
            await update.message.reply_text("Unauthorized"); return
        item = executor_scale(cid, pct, reason=reason, dry_run=True)
        kb = make_approve_keyboard(cid)
        await update.message.reply_text(f"⚖️ Scale request queued: {cid} +{pct}% ({reason})\nApprove to execute:", reply_markup=kb)

    async def cmd_pause(update: Update, context: ContextTypes.DEFAULT_TYPE):
        args = context.args
        if not args:
            await update.message.reply_text("Usage: /pause <campaign_id> [reason]")
            return
        cid = args[0]
        reason = " ".join(args[1:]) if len(args) > 1 else "manual pause"
        if str(update.effective_chat.id) != str(TELEGRAM_CHAT_ID):
            await update.message.reply_text("Unauthorized"); return
        item = executor_pause(cid, reason=reason, dry_run=True)
        kb = make_approve_keyboard(cid)
        await update.message.reply_text(f"⛔ Pause request queued: {cid} ({reason})\nApprove to execute:", reply_markup=kb)

    async def cmd_queue(update: Update, context: ContextTypes.DEFAULT_TYPE):
        if str(update.effective_chat.id) != str(TELEGRAM_CHAT_ID):
            await update.message.reply_text("Unauthorized"); return
        q = exec_state.get("queue", [])
        if not q:
            await update.message.reply_text("Queue empty"); return
        lines = ["📋 Exec Queue:"]
        for i, it in enumerate(q[:20],1):
            lines.append(f"{i}. {it['action'].upper()} {it['campaign_id']} | {it.get('pct','')}{'%' if 'pct' in it else ''} | {it.get('reason','')} | status={it['status']}")
        await update.message.reply_text("\n".join(lines))

    async def cmd_status(update: Update, context: ContextTypes.DEFAULT_TYPE):
        if str(update.effective_chat.id) != str(TELEGRAM_CHAT_ID):
            await update.message.reply_text("Unauthorized"); return
        h = exec_state.get("history", [])[-10:]
        lines = ["🧾 Recent Executions:"]
        for it in h:
            ts = it.get("ts","")
            lines.append(f"- {ts[:19]} | {it['action'].upper()} {it['campaign_id']} | status={it['status']}")
        await update.message.reply_text("\n".join(lines) if len(lines) > 1 else "No history")

    async def callback_query_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
        q: CallbackQuery = update.callback_query
        if not q:
            return
        data = q.data or ""
        if str(q.message.chat.id) != str(TELEGRAM_CHAT_ID):
            await q.answer("Unauthorized", show_alert=True)
            return
        if data.startswith("APPROVE:"):
            cid = data.split("APPROVE:",1)[1]
            pending = next((x for x in exec_state.get("queue", []) if x.get("campaign_id")==cid and x.get("status")=="pending"), None)
            if not pending:
                await q.answer("No pending request", show_alert=True); return
            pending["dry_run"] = False
            _save_exec_state(exec_state)
            processed = run_exec_queue(10)
            await q.answer("Executed", show_alert=False)
            await q.message.reply_text(f"✅ Executed {cid}: status={processed[-1]['status'] if processed else 'unknown'}")
        elif data.startswith("REJECT:"):
            cid = data.split("REJECT:",1)[1]
            for it in exec_state.get("queue", []):
                if it.get("campaign_id")==cid and it.get("status")=="pending":
                    it["status"] = "rejected"
            _save_exec_state(exec_state)
            await q.answer("Rejected", show_alert=False)
            await q.message.reply_text(f"❌ Rejected for {cid}")
        else:
            await q.answer("Unknown action", show_alert=True)

    def start_telegram_router():
        token = TELEGRAM_BOT_TOKEN
        if not token or token == "REPLACE_WITH_REAL_TOKEN":
            log("Telegram token not configured", "WARN"); return
        try:
            app = Application.builder().token(token).build()
        except Exception as e:
            log(f"Telegram init failed: {e}", "ERROR"); return
        app.add_handler(CommandHandler("scale", cmd_scale))
        app.add_handler(CommandHandler("pause", cmd_pause))
        app.add_handler(CommandHandler("queue", cmd_queue))
        app.add_handler(CommandHandler("status", cmd_status))
        app.add_handler(CallbackQueryHandler(callback_query_handler))
        app.run_polling(close_loop=False, drop_pending_updates=True)

if Application is None:
    def make_approve_keyboard(campaign_id: str):
        return None
    def start_telegram_router():
        log("Telegram router not available", "WARN")

def midnight_housekeeping():
    """Daily midnight campaign naming housekeeping.
    
    Renames campaigns based on performance:
      - 3+ consecutive cycles BONCOS → prefix OFF_
      - WINNER ROAS > 5x → prefix 🌟_
      - Removes 🌟_ from fallen winners
    """
    now = datetime.now(WIB)
    if now.hour != 0 and now.hour != 1:  # Only run 00:00-01:59 WIB
        return None
    
    log("🏠 MIDNIGHT HOUSEKEEPING — Campaign rename sweep")
    report_lines = []
    
    # Load state from file
    try:
        if STATE_FILE.exists():
            state = json.loads(STATE_FILE.read_text())
        else:
            state = {}
    except:
        state = {}
    
    for acc_key, acc_config in ACCOUNTS.items():
        if not acc_config.get("enabled", True):
            continue
        acc_id = acc_config["id"]
        acc_name = acc_config["name"]
        
        try:
            campaigns = get_all_campaigns(acc_id)
            if not campaigns:
                continue
            
            # Load state history for 3-day BONCOS detection
            acc_state = state.get(acc_key, {}).get("campaigns", {})
            
            renamed = 0
            for cid, camp in campaigns.items():
                name = camp["name"]
                
                # SKIP: already OFF_ — never touch
                if name.startswith("OFF_"):
                    continue
                
                # SKIP: CORE portfolio — protected
                core = CORE_PORTFOLIO.get(acc_key, [])
                if name in core:
                    continue
                
                # Check state for BONCOS history (3+ days)
                camp_state = acc_state.get(cid, {})
                boncos_streak = camp_state.get("boncos_streak", 0)
                
                new_name = None
                
                if boncos_streak >= 3:
                    new_name = f"OFF_{name}"
                    log(f"  💀 OFF_ rename: {name[:40]} → OFF_ ({boncos_streak}d boncos)")
                elif boncos_streak == 0 and camp_state.get("is_winner"):
                    # Winner but no 🌟_ prefix yet
                    if not name.startswith("🌟_"):
                        new_name = f"🌟_{name}"
                        log(f"  🌟 WINNER rename: {name[:40]}")
                elif boncos_streak == 0 and name.startswith("🌟_") and not camp_state.get("is_winner"):
                    # Fallen from winner status
                    new_name = name[2:]  # Remove 🌟_
                    log(f"  📉 Demoted: {name[:40]}")
                
                if new_name and new_name != name:
                    try:
                        fb_post(cid, name=new_name)
                        renamed += 1
                    except Exception as e:
                        log(f"  Rename failed for {name[:30]}: {e}", "WARN")
            
            if renamed > 0:
                report_lines.append(f"  {acc_name}: {renamed} renamed")
                
        except Exception as e:
            log(f"  {acc_name} housekeeping error: {e}", "ERROR")
    
    summary = "🏠 MIDNIGHT REPORT\\n" + "\\n".join(report_lines) if report_lines else None
    if summary:
        log(summary)
    return summary

def main():
    log("🚀 VILONA TRAKPRO ENGINE STARTING")
    
    if not ACCESS_TOKEN:
        log("No Facebook token found!", "FATAL")
        sys.exit(1)
    
    log(f"Managing {len(ACCOUNTS)} accounts: {', '.join(ACCOUNTS.keys())}")
    
    # Start Telegram router in background thread for /scale /pause /queue /status + HITL
    try:
        router_thread = threading.Thread(target=start_telegram_router, daemon=True)
        router_thread.start()
        log("Telegram HITL router started")
    except Exception as e:
        log(f"Telegram router start failed: {e}", "WARN")
    
    while True:
        try:
            # Midnight housekeeping (00:00-01:59 WIB)
            midnight_housekeeping()
            
            actions, alerts = run_cycle()
            log(f"💤 Next cycle in 15 min...")
            time.sleep(900)  # 15 minutes
        except KeyboardInterrupt:
            log("👋 Shutting down...")
            break
        except Exception as e:
            log(f"💥 CYCLE CRASH: {e}", "ERROR")
            traceback.print_exc()
            log("⏸️ Waiting 5 min before retry...")
            time.sleep(300)

if __name__ == "__main__":
    main()