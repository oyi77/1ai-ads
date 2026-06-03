#!/usr/bin/env python3
"""
🔥 VILONA TRAKPRO ENGINE — Autonomous Multi-Account Ads Manager
================================================================
Replaces: vilona_0858_guardian (flawed CPC-only logic)
Mission:  Autonomous winner detection, scaling, and kill decisions
          based on ROAS (not just CPC) across ALL accounts.

Accounts Managed:
  - act_435670549443081  (0858 - Kakriput: rakpiring + organizer)
  - act_380721031313330  (1041 - Nyamiresep)
  - act_1439536310038458 (1208 - Herbal)
  - act_1773760133153789 (1134 - Selow)
  - act_1181078009580337 (1340 - Selow)

Decision Engine:
  📈 WINNER  → SCALE +20% budget, notify /winner
  👀 WATCH   → Monitor, hold current budget
  💀 BONCOS  → PAUSE (high spend, zero return)
  🔄 FATIGUE → Rotate creative, reduce budget
  ⏰ TIME    → 00-04 pause, 04:30 auto-unpause

Rules (per-campaign, last 48h):
  1. ROAS < 0.3x + spend > Rp5K  → BONCOS (pause)
  2. ROAS > 5x + link clicks > 10 → WINNER (scale)
  3. CTR < 1% + impressions > 1K  → FATIGUE (flag)
  4. CPC > Rp250 + spend > Rp2K    → BONCOS (unless ROAS proven)
  5. ROAS > 10x                   → SUPER WINNER (scale 50%)
  6. OFF_ prefix                  → NEVER TOUCH

Telegram Alerts:
  /winner  — New winners detected + auto-scaled
  /boncos  — Campaigns paused (with reason)
  /scale   — Scaling ladder updates
  /pending — Commission pending warnings
  /summary — Daily summary at 09:00 & 21:00
"""

import json, os, sys, time, traceback
import urllib.request, urllib.parse
from datetime import datetime, timedelta, timezone
from pathlib import Path
from collections import defaultdict
from vilona_trakpro_recommendations import generate_recommendations, format_telegram

# ─── CONFIG ──────────────────────────────────────────────────────────────────
WIB = timezone(timedelta(hours=7))
WORKSPACE = Path(__file__).parent.parent
LOG_FILE = WORKSPACE / "logs" / "vilona_trakpro_engine.log"
STATE_FILE = WORKSPACE / "data" / "vilona_trakpro_state.json"
SHOPEE_DATA = Path("/home/openclaw/.openclaw/workspace/data/shopee")
os.makedirs(WORKSPACE / "logs", exist_ok=True)
os.makedirs(WORKSPACE / "data", exist_ok=True)

TOKEN_FILE = Path("/tmp/fb_token.txt")
ACCESS_TOKEN = TOKEN_FILE.read_text().strip() if TOKEN_FILE.exists() else None
API = "https://graph.facebook.com/v19.0"

# ─── TELEGRAM BOT ────────────────────────────────────────────────────────────
TELEGRAM_BOT_TOKEN = "8665546627:AAFp6SSBasBcpN3tGf1jNSpRPotMYwM8DEM"
TELEGRAM_CHAT_ID = "157228659"  # @alwayscuanbos (Andik veris)
TELEGRAM_API = "https://api.telegram.org"

# ─── ACCOUNTS ─────────────────────────────────────────────────────────────────
# FOCUS: Only 0858 Kakriput (per Veris mandate 2026-06-03)
ACCOUNTS = {
    "0858": {
        "id": "act_435670549443081",
        "name": "Kakriput",
        "tags": ["rakpiringpengering", "organizerpullout"],
        "budget_cap_per_camp": 500000,
        "max_campaigns": 15,
        "cpc_warning": 200,
        "cpc_kill": 300,
        "roas_winner": 3.0,
        "roas_super": 8.0,
        "roas_kill": 0.3,
    },
}

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

# ─── API HELPERS ──────────────────────────────────────────────────────────────
def fb_get(endpoint, **params):
    params["access_token"] = ACCESS_TOKEN
    qs = "&".join(f"{k}={urllib.request.quote(str(v))}" for k, v in params.items())
    url = f"{API}/{endpoint}?{qs}"
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read())

def fb_post(endpoint, **params):
    params["access_token"] = ACCESS_TOKEN
    data = urllib.parse.urlencode(params).encode()
    url = f"{API}/{endpoint}"
    req = urllib.request.Request(url, data=data, method="POST")
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read())

# ─── SHOPEE DATA ──────────────────────────────────────────────────────────────
def load_shopee_commissions():
    """Load latest Shopee commission data, aggregated by tag."""
    inbound = Path("/home/openclaw/.openclaw/media/inbound")
    csv_files = sorted(inbound.glob("AffiliateCommissionReport_*.csv"), reverse=True)
    
    if not csv_files:
        log("No Shopee commission CSV found", "WARN")
        return {}
    
    latest = csv_files[0]
    log(f"Loading Shopee data: {latest.name}")
    
    import csv
    tag_commission = defaultdict(float)
    tag_orders = defaultdict(set)
    tag_status = defaultdict(lambda: defaultdict(float))
    
    try:
        with open(latest, "r", encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
            for row in reader:
                tag = (row.get("Tag_link1") or "").strip()
                oid = row.get("ID Pemesanan", "")
                status = row.get("Status Pesanan", "")
                try:
                    komisi = float((row.get("Komisi Bersih Affiliate (Rp)") or "0").replace(",", ""))
                except:
                    komisi = 0.0
                
                if tag:
                    tag_orders[tag].add(oid)
                    tag_commission[tag] += komisi
                    tag_status[tag][status] += komisi
    except Exception as e:
        log(f"CSV parse error: {e}", "ERROR")
        return {}
    
    result = {}
    for tag in tag_commission:
        result[tag] = {
            "total_commission": tag_commission[tag],
            "orders": len(tag_orders[tag]),
            "tertunda": tag_status[tag].get("Tertunda", 0),
            "selesai": tag_status[tag].get("Selesai", 0),
            "dibatalkan": tag_status[tag].get("Dibatalkan", 0),
        }
    
    return result

# ─── META DATA ────────────────────────────────────────────────────────────────
def get_campaign_insights(account_id, days=2):
    """Get campaign-level insights for last N days."""
    today = datetime.now(WIB).strftime("%Y-%m-%d")
    since = (datetime.now(WIB) - timedelta(days=days)).strftime("%Y-%m-%d")
    
    data = fb_get(f"{account_id}/insights",
        fields="campaign_name,campaign_id,spend,clicks,impressions,cpc,ctr,reach,actions",
        time_range=f'{{"since":"{since}","until":"{today}"}}',
        level="campaign",
        limit="100")
    
    results = {}
    for c in data.get("data", []):
        cid = c.get("campaign_id")
        link_clicks = 0
        lp_views = 0
        for a in c.get("actions", []):
            if a["action_type"] == "link_click":
                link_clicks = int(a["value"])
            elif a["action_type"] == "landing_page_view":
                lp_views = int(a["value"])
        
        results[cid] = {
            "name": c.get("campaign_name", "?"),
            "spend": float(c.get("spend", 0)),
            "clicks": int(c.get("clicks", 0)),
            "impressions": int(c.get("impressions", 0)),
            "cpc": float(c.get("cpc", 0)),
            "ctr": float(c.get("ctr", 0)),
            "reach": int(c.get("reach", 0)),
            "link_clicks": link_clicks,
            "lp_views": lp_views,
        }
    return results

def get_all_campaigns(account_id):
    """Get all campaigns with status."""
    data = fb_get(f"{account_id}/campaigns",
        fields="id,name,status,daily_budget,effective_status",
        limit="200")
    return {c["id"]: c for c in data.get("data", [])}

# ─── DECISION ENGINE ──────────────────────────────────────────────────────────
def classify_campaign(camp_insights, shopee_data, account_config, prev_state, all_insights=None):
    """
    Classify campaign and return action:
      - "WINNER"    → Scale budget
      - "SUPER"     → Aggressive scale
      - "WATCH"     → Hold, monitor
      - "BONCOS"    → Pause (bad performance)
      - "FATIGUE"   → Flag for creative rotation
      - "ZERO"      → No delivery, keep watching
    """
    name = camp_insights["name"]
    spend = camp_insights["spend"]
    clicks = camp_insights["clicks"]
    cpc = camp_insights["cpc"]
    ctr = camp_insights["ctr"]
    impressions = camp_insights["impressions"]
    link_clicks = camp_insights["link_clicks"]
    
    # OFF_ prefix = never touch
    if name.startswith("OFF_"):
        return "OFF_LIMITS", 0, "Veris-mandated pause"
    
    # No delivery yet
    if spend < 100:
        return "ZERO", 0, "Minimal delivery"
    
    # Estimate ROAS from tag (per-campaign share)
    est_roas = 0
    matched_tag = None
    for tag in account_config["tags"]:
        if tag in shopee_data:
            tag_total = shopee_data[tag]["total_commission"]
            # Per-campaign: this campaign's share of total tag commission
            tag_total_spend = sum(
                i["spend"] for i in all_insights.values()
                if tag.replace("pengering","").replace("pullout","") in i["name"].lower()
            ) or spend
            campaign_share = spend / max(tag_total_spend, 1)
            est_roas = (tag_total * campaign_share) / max(spend, 1)
            matched_tag = tag
            break
    
    # Super winner: ROAS > 8x
    if est_roas > account_config["roas_super"] and link_clicks >= 10:
        return "SUPER", est_roas, f"ROAS {est_roas:.1f}x [{matched_tag}]"
    
    # Winner: ROAS > 3x + decent link clicks
    if est_roas > account_config["roas_winner"] and link_clicks >= 5:
        return "WINNER", est_roas, f"ROAS {est_roas:.1f}x [{matched_tag}]"
    
    # Boncos: High spend, zero/low return
    if spend > 5000 and est_roas < account_config["roas_kill"] and link_clicks > 0:
        return "BONCOS", est_roas, f"ROAS {est_roas:.2f}x - spend wasted"
    
    # Boncos: Very high CPC
    if cpc > account_config["cpc_kill"] and spend > 2000 and link_clicks < 3:
        return "BONCOS", est_roas, f"CPC Rp{cpc:.0f} > Rp{account_config['cpc_kill']}"
    
    # Fatigue: CTR dropping, CPC rising
    prev = prev_state.get(name, {})
    prev_ctr = prev.get("ctr", ctr)
    prev_cpc = prev.get("cpc", cpc)
    if impressions > 1000 and ctr < prev_ctr * 0.7 and cpc > prev_cpc * 1.3:
        return "FATIGUE", est_roas, f"CTR {prev_ctr:.1f}%→{ctr:.1f}%, CPC Rp{prev_cpc:.0f}→Rp{cpc:.0f}"
    
    # Default: watch
    if link_clicks > 0:
        return "WATCH", est_roas, f"Delivering, ROAS {est_roas:.1f}x"
    else:
        return "WATCH", 0, "No link clicks yet"

# ─── TELEGRAM ALERTS ──────────────────────────────────────────────────────────
def send_telegram(message):
    """Send alert directly to Veris via Telegram bot."""
    try:
        url = f"{TELEGRAM_API}/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
        data = json.dumps({
            "chat_id": TELEGRAM_CHAT_ID,
            "text": message[:4000],  # Telegram limit
            "parse_mode": "HTML"
        }).encode()
        req = urllib.request.Request(url, data=data, method="POST")
        req.add_header("Content-Type", "application/json")
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read())
    except Exception as e:
        log(f"Telegram send failed: {e}", "ERROR")
        return None

def send_alert(message):
    """Queue alert for Telegram delivery + log to file."""
    alert_file = WORKSPACE / "data" / "vilona_trakpro_alerts.jsonl"
    try:
        with open(alert_file, "a") as f:
            f.write(json.dumps({"ts": datetime.now(WIB).isoformat(), "msg": message}) + "\n")
    except:
        pass
    # Send via Telegram
    send_telegram(message)
    log(f"ALERT SENT: {message[:80]}...")

# ─── BID STRATEGY DETECTION ───────────────────────────────────────────────────
def get_campaign_bid_strategy(campaign_id):
    """Detect actual bid strategy from campaign's adsets.
    Returns: (dominant_strategy, avg_bid_amount)
    Veris Rule: COST_CAP → NEVER scale budget, LOWEST_COST → can scale."""
    try:
        adsets = fb_get(f"{campaign_id}/adsets",
            fields="bid_strategy,bid_amount,effective_status",
            limit="50")
        strategies = defaultdict(int)
        bid_amounts = []
        for a in adsets.get("data", []):
            if a.get("effective_status") == "ACTIVE":
                bs = a.get("bid_strategy", "UNKNOWN")
                strategies[bs] += 1
                ba = a.get("bid_amount", 0) or 0
                if ba > 0:
                    bid_amounts.append(int(ba))
        if not strategies:
            return ("UNKNOWN", 0)
        dominant = max(strategies, key=strategies.get)
        avg_bid = sum(bid_amounts) // len(bid_amounts) if bid_amounts else 0
        return (dominant, avg_bid)
    except Exception as e:
        log(f"Bid strategy check failed: {e}", "WARN")
        return ("UNKNOWN", 0)

# ─── LC CLONE CREATOR ─────────────────────────────────────────────────────────
def create_lc_clone(original_campaign, account_id, account_config):
    """Create a LOWEST_COST clone from a winning COST_CAP campaign.
    Veris Strategy: Proven COST_CAP winner → 1 LC copy to unlock volume.
    Clone uses same targeting but LOWEST_COST_WITH_BID_CAP @ Rp200."""
    try:
        # Get original's adsets for targeting
        adsets = fb_get(f"{original_campaign['id']}/adsets",
            fields="name,targeting,optimization_goal,bid_strategy,promoted_object,status",
            limit="5")
        
        if not adsets.get("data"):
            log(f"No adsets found for clone", "WARN")
            return None
        
        og_adset = adsets["data"][0]
        today_str = datetime.now(WIB).strftime("%m%d")
        product = "rakpiring" if "rakpiring" in original_campaign["name"].lower() else "organizer"
        
        # Create new campaign (LOWEST_COST)
        new_camp_name = f"LC_{product}_{today_str}_CLONE"
        camp_result = fb_post(f"{account_id}/campaigns",
            name=new_camp_name,
            objective="OUTCOME_TRAFFIC",
            status="PAUSED",
            special_ad_categories="[]")
        
        if "id" not in camp_result:
            log(f"Clone campaign creation failed: {camp_result}", "WARN")
            return None
        
        new_camp_id = camp_result["id"]
        
        # Create adset with LOWEST_COST_WITH_BID_CAP
        targeting = og_adset.get("targeting", {})
        adset_result = fb_post(f"{account_id}/adsets",
            name=f"LC_{product}_{today_str}",
            campaign_id=new_camp_id,
            targeting=json.dumps(targeting),
            optimization_goal="LINK_CLICKS",
            billing_event="IMPRESSIONS",
            bid_strategy="LOWEST_COST_WITH_BID_CAP",
            bid_amount="20000",  # Rp200 in cents
            daily_budget=str(min(100000, account_config["budget_cap_per_camp"])),
            status="ACTIVE")
        
        if "id" in adset_result:
            # Activate campaign after adset created
            fb_post(new_camp_id, status="ACTIVE")
            log(f"LC CLONE CREATED: {new_camp_name} (from {original_campaign['name'][:30]})")
            return new_camp_id
        else:
            log(f"Clone adset creation failed: {adset_result}", "WARN")
            return None
            
    except Exception as e:
        log(f"Clone creation error: {e}", "ERROR")
        traceback.print_exc()
        return None

# ─── ACTION EXECUTOR ──────────────────────────────────────────────────────────
def execute_actions(account_id, account_config, classifications, acc_key=""):
    """Execute pause/scale actions based on Veris brain rules.
    
    Scale Rules (from bk-brain, 2026-06-03):
    - COST_CAP winner → NEVER scale budget → create LOWEST_COST clone
    - LOWEST_COST winner → scale budget +20%
    - LOWEST_COST_WITH_BID_CAP → scale budget + optimize bid cap
    - SUPER (ROAS > 8x) → scale budget +50% OR create LC clone"""
    campaigns = get_all_campaigns(account_id)
    actions_taken = []
    core = CORE_PORTFOLIO.get(acc_key, [])
    clones_created = 0
    max_clones_per_cycle = 3  # Limit to avoid spam
    
    # Startup guard: ensure all core portfolio campaigns are ACTIVE
    for cid, camp in campaigns.items():
        name = camp["name"]
        is_core = any(c in name for c in core)
        if is_core and camp["status"] != "ACTIVE" and not name.startswith("OFF_"):
            try:
                fb_post(cid, status="ACTIVE")
                actions_taken.append(f"🛡️ GUARD: Reactivated {name[:40]}")
                log(f"GUARD REACTIVATE: {name}")
            except Exception as e:
                log(f"Guard reactivate failed: {e}", "ERROR")
    
    for cid, (verdict, roas, reason) in classifications.items():
        if cid not in campaigns:
            continue
        
        camp = campaigns[cid]
        name = camp["name"]
        status = camp["status"]
        current_budget = int(camp.get("daily_budget", 0) or 0)
        is_core = any(c in name for c in core)
        
        if verdict == "OFF_LIMITS":
            continue
        
        if verdict == "BONCOS":
            if is_core:
                actions_taken.append(f"🛡️ PROTECTED: {name[:40]} (core)")
                continue
            if status == "ACTIVE":
                try:
                    fb_post(cid, status="PAUSED")
                    actions_taken.append(f"💀 PAUSED: {name[:40]} — {reason}")
                    log(f"BONCOS PAUSE: {name}")
                except Exception as e:
                    log(f"Pause failed for {name}: {e}", "ERROR")
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
            
            # Check bid strategy (Veris rule: only scale LOWEST_COST)
            bid_strategy, bid_amount = get_campaign_bid_strategy(cid)
            is_cost_cap = bid_strategy in ("COST_CAP", "LOWEST_COST_WITH_BID_CAP")
            is_lowest_cost = bid_strategy == "LOWEST_COST"
            
            if is_cost_cap and clones_created < max_clones_per_cycle:
                # Veris Rule: COST_CAP winner → create LC clone, NOT scale budget
                if status == "ACTIVE" and roas > account_config["roas_winner"]:
                    clone_id = create_lc_clone(camp, account_id, account_config)
                    if clone_id:
                        clones_created += 1
                        actions_taken.append(
                            f"🧬 LC CLONE: {name[:30]} — COST_CAP→LOWEST_COST "
                            f"(bid Rp{bid_amount}, ROAS {roas:.1f}x)"
                        )
                    else:
                        actions_taken.append(
                            f"⏸️ HOLD: {name[:40]} — COST_CAP winner, clone failed"
                        )
                else:
                    actions_taken.append(
                        f"⏸️ HOLD: {name[:40]} — COST_CAP (budget scale useless, "
                        f"bid Rp{bid_amount} controls spend)"
                    )
            
            elif is_lowest_cost:
                # LOWEST_COST → scale budget (this actually increases spend)
                scale_pct = 0.50 if verdict == "SUPER" else 0.20
                new_budget = min(
                    int(current_budget * (1 + scale_pct)),
                    account_config["budget_cap_per_camp"]
                )
                if new_budget > current_budget:
                    try:
                        fb_post(cid, daily_budget=str(new_budget))
                        actions_taken.append(
                            f"📈 SCALED: {name[:30]} — "
                            f"Rp{current_budget:,}→Rp{new_budget:,} (LC, ROAS {roas:.1f}x)"
                        )
                        log(f"LC SCALE: {name} Rp{current_budget:,}→Rp{new_budget:,}")
                    except Exception as e:
                        log(f"Scale failed: {e}", "ERROR")
            
            else:
                # Unknown strategy - log and hold
                actions_taken.append(
                    f"⏸️ HOLD: {name[:40]} — unknown bid strategy ({bid_strategy})"
                )
        
        elif verdict == "FATIGUE":
            actions_taken.append(f"🔄 FATIGUE: {name[:40]} — {reason}")
    
    return actions_taken

# ─── CORE PORTFOLIO ──────────────────────────────────────────────────────────
# Campaigns proven profitable that should ALWAYS stay active
CORE_PORTFOLIO = {
    "0858": [
        "0858_rakpiring_shopping_BID",
        "0858_rakpiring_VILONA_WINNER_BID",
        "BIDCAP_GEO_rakpiringpengering_INT04",
        "0858_rakpiring_broad_BID",
        "BIDCAP_GEO_rakpiringpengering_INT08",
        "BIDCAP_GEO_rakpiringpengering_INT07",
        "BIDCAP_GEO_rakpiringpengering_INT10",
        "0858_organizer_pelancong_EMPTY",
        "0858_organizer_travel_BID",
        "V2_CBO_organizerpullout_Dapur",
        "0858_organizer_fashion_BID",
        "0858_organizer_tableware_EMPTY",
    ],
}

# ─── MAIN ENGINE ──────────────────────────────────────────────────────────────
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
    
    shopee_data = load_shopee_commissions()
    all_alerts = []
    all_actions = []
    account_summaries = {}
    
    for acc_key, acc_config in ACCOUNTS.items():
        acc_id = acc_config["id"]
        acc_name = acc_config["name"]
        
        try:
            insights = get_campaign_insights(acc_id, days=2)
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
                    cdata, shopee_data, acc_config, prev, insights
                )
                classifications[cid] = (verdict, roas, reason)
                
                if verdict in ("WINNER", "SUPER"):
                    winners.append((cdata["name"], roas, reason))
                elif verdict == "BONCOS":
                    boncos_list.append((cdata["name"], reason))
            
            # Execute actions
            actions = execute_actions(acc_id, acc_config, classifications, acc_key)
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
            
            # Update state
            state[acc_key] = {
                "last_cycle": datetime.now(WIB).isoformat(),
                "campaigns": {
                    cid: {"name": cdata["name"], "ctr": cdata["ctr"], "cpc": cdata["cpc"]}
                    for cid, cdata in insights.items()
                },
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
    # Generate Trakpro-style daily recommendations for 0858
    try:
        acc_insights = get_campaign_insights(ACCOUNTS["0858"]["id"], days=2)
        recs = generate_recommendations(
            acc_insights, shopee_data, ACCOUNTS["0858"], state
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
    
    # Daily midnight report
    if hour == 0:
        daily = [f"📋 DAILY REPORT — {cycle_start.strftime('%d %b %Y')}"]
        for acc_key, s in account_summaries.items():
            daily.append(
                f"  {ACCOUNTS[acc_key]['name']}: "
                f"Spend Rp{s['spend_48h']:,}/48h | "
                f"{s['winners']} winners | {s['boncos']} boncos"
            )
            for w in s["winner_names"][:3]:
                daily.append(f"    🏆 {w}")
        send_alert("\n".join(daily))
    
    cycle_duration = (datetime.now(WIB) - cycle_start).total_seconds()
    log(f"✅ CYCLE DONE — {cycle_duration:.1f}s | "
        f"{sum(s['active'] for s in account_summaries.values())} active across {len(account_summaries)} accounts | "
        f"{sum(s['winners'] for s in account_summaries.values())}W / {sum(s['boncos'] for s in account_summaries.values())}B")
    
    return len(all_actions), len(all_alerts)

# ─── MAIN LOOP ────────────────────────────────────────────────────────────────
def main():
    log("🚀 VILONA TRAKPRO ENGINE STARTING")
    
    if not ACCESS_TOKEN:
        log("No Facebook token found!", "FATAL")
        sys.exit(1)
    
    log(f"Managing {len(ACCOUNTS)} accounts: {', '.join(ACCOUNTS.keys())}")
    
    while True:
        try:
            actions, alerts = run_cycle()
            log(f"💤 Next cycle in 30 min...")
            time.sleep(1800)  # 30 minutes
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
