"""VILONA TrakPro — Meta Graph API, Shopee data, decision engine

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

def fb_patch(endpoint, **params):
    params["access_token"] = ACCESS_TOKEN
    data = urllib.parse.urlencode(params).encode()
    url = f"{API}/{endpoint}"
    req = urllib.request.Request(url, data=data, method="POST")
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.loads(resp.read())

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

def load_shopee_commissions():
    """Load latest Shopee commission data, aggregated by tag across MULTIPLE CSVs.
    Merges data from all sources to ensure all accounts have commission data."""
    search_roots = [
        Path("/home/openclaw/projects/1ai-ads/data/shopee"),       # Malay accounts (1134, 1340)
        Path("/home/openclaw/.openclaw/data/media/inbound"),        # Indo accounts (0858, 1041, 1208)
        Path("/home/openclaw/.openclaw/workspace/data/shopee"),
    ]
    # Collect all CSV files
    csv_files = []
    for root in search_roots:
        if not root.is_dir():
            continue
        csv_files.extend(root.glob("AffiliateCommissionReport_*.csv"))
        for sub in root.rglob("*"):
            if sub.is_dir():
                try:
                    csv_files.extend(sub.glob("AffiliateCommissionReport_*.csv"))
                except Exception:
                    pass
    csv_files = sorted(set(csv_files), key=lambda p: p.stat().st_mtime, reverse=True)
    if not csv_files:
        log("No Shopee commission CSV found", "WARN")
        return {}

    # Merge ALL CSVs from last 7 days to capture all accounts
    cutoff = datetime.now(WIB) - timedelta(days=7)
    recent_csvs = [f for f in csv_files if datetime.fromtimestamp(f.stat().st_mtime, tz=WIB) > cutoff]
    if not recent_csvs:
        recent_csvs = csv_files[:1]  # fallback to latest

    log(f"Merging Shopee data from {len(recent_csvs)} CSVs: {[f.name[:30] for f in recent_csvs[:5]]}")

    try:
        import csv as _csv
        from decimal import Decimal, InvalidOperation
    except Exception as e:
        log(f"CSV import error: {e}", "ERROR")
        return {}

    tag_commission = defaultdict(float)
    tag_orders = defaultdict(set)
    tag_status = defaultdict(lambda: defaultdict(float))

    def _to_float(v):
        if v is None:
            return 0.0
        s = str(v).replace(",", "").strip()
        if not s:
            return 0.0
        try:
            return float(Decimal(s))
        except (InvalidOperation, ValueError):
            try:
                return float(s)
            except Exception:
                return 0.0

    for csv_path in recent_csvs[:10]:  # Max 10 CSVs
        try:
            with open(csv_path, "r", encoding="utf-8-sig", newline="") as f:
                reader = _csv.DictReader(f)
                if not reader.fieldnames:
                    continue
                fieldnames = [h.strip() for h in reader.fieldnames]
                # Auto-detect tag column
                tag_key = next((h for h in fieldnames if h.lower() in {"sub_id1", "tag_link1", "taglink1"}), None)
                order_key = next((h for h in fieldnames if "pesanan" in (h or "").lower()), "ID Pemesanan")
                status_key = next((h for h in fieldnames if "status" in (h or "").lower() and "produk" not in (h or "").lower()), "Status Pesanan")
                # Detect commission column: prefer "Bersih Affiliate" net commission
                commission_keys = [h for h in fieldnames
                    if ("komisi" in (h or "").lower() or "komisen" in (h or "").lower())
                    and "persentase" not in (h or "").lower()]
                # Prefer "Bersih" column (net), otherwise use first available
                pref = [h for h in commission_keys if "bersih" in (h or "").lower()]
                commission_key = pref[0] if pref else (commission_keys[0] if commission_keys else None)
                if not commission_key or not tag_key:
                    continue

                for row in reader:
                    tag = (row.get(tag_key, "") or "").strip()
                    oid = (row.get(order_key, "") or "").strip()
                    status = (row.get(status_key, "") or "").strip()
                    komisi = _to_float(row.get(commission_key))
                    if not tag:
                        continue
                    tag_orders[tag].add(oid)
                    tag_commission[tag] += komisi
                    tag_status[tag][status] += komisi
        except Exception as e:
            log(f"CSV {csv_path.name} parse error: {e}", "WARN")
            continue

    result = {}
    for tag in tag_commission:
        result[tag] = {
            "total_commission": tag_commission[tag],
            "orders": len(tag_orders[tag]),
            "tertunda": tag_status[tag].get("Tertunda", 0),
            "selesai": tag_status[tag].get("Selesai", 0),
            "dibatalkan": tag_status[tag].get("Dibatalkan", 0),
        }
    log(f"Shopee tags loaded: {len(result)} (merged from {len(recent_csvs)} CSVs)")
    return result

def load_shopee_for_account(account_key):
    """Load Shopee commission data filtered for a specific Meta account's tags.
    Falls back to load_shopee_commissions() if no account-specific CSV found."""
    all_data = load_shopee_commissions()
    if not all_data:
        return {}
    tags = ACCOUNTS.get(account_key, {}).get("tags", [])
    if not tags:
        return all_data
    # Filter: only return tags that match this account's config
    filtered = {}
    for t in tags:
        for k in (t, t.replace("3", ""), t.replace("2", "")):
            if k in all_data:
                filtered[k] = all_data[k]
                break
    return filtered

def detect_shopee_date_range():
    """Detect date range from merged Shopee CSV data (orders Waktu Pemesanan).
    Returns (since_YYYY-MM-DD, until_YYYY-MM-DD) or defaults to 30d window."""
    search_roots = [
        Path("/home/openclaw/projects/1ai-ads/data/shopee"),
        Path("/home/openclaw/.openclaw/data/media/inbound"),
    ]
    csv_files = []
    for root in search_roots:
        if not root.is_dir(): continue
        csv_files.extend(root.glob("AffiliateCommissionReport_*.csv"))
    csv_files = sorted(set(csv_files), key=lambda p: p.stat().st_mtime, reverse=True)
    if not csv_files:
        return None, None
    mind, maxd = None, None
    import csv as _csv
    for f in csv_files[:5]:
        try:
            with open(f, encoding='utf-8-sig') as fh:
                r = _csv.DictReader(fh)
                for row in r:
                    w = (row.get('Waktu Pemesanan','') or '').strip()[:10]
                    if len(w)==10 and w[4]=='-':
                        if mind is None or w < mind: mind = w
                        if maxd is None or w > maxd: maxd = w
        except: pass
    if mind and maxd:
        log(f"Shopee date range: {mind} → {maxd}")
    return mind, maxd

def get_campaign_insights(account_id, days=2, since=None, until=None):
    """Get campaign-level insights. If since/until provided, use exact date range."""
    if since and until:
        time_range = f'{{"since":"{since}","until":"{until}"}}'
    else:
        today = datetime.now(WIB).strftime("%Y-%m-%d")
        since = (datetime.now(WIB) - timedelta(days=days)).strftime("%Y-%m-%d")
        time_range = f'{{"since":"{since}","until":"{today}"}}'
    
    data = fb_get(f"{account_id}/insights",
        fields="campaign_name,campaign_id,spend,clicks,impressions,cpc,ctr,reach,actions",
        time_range=time_range,
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

def detect_campaign_type(campaign_name, campaign_id=None):
    """Detect campaign type from naming convention.
    
    Returns one of: "CBO", "ABO", "TEST", "LC", "TC", "BC", "BIDCAP", "RULE", "UNKNOWN"
    
    Veris naming convention 2026-06-10:\n      - ON_LC_ → Lowest Cost Micro-Scale (Rp 18k, age-shifted)\n      - CBO_/BC_ → Campaign Budget Optimization\n      - ABO_ → Ad Set Budget Optimization\n      - TEST_/test/Test_ → Testing/prospecting\n      - LC_ → Lowest Cost (legacy)\n      - TC_ → Top/mid/bottom funnel\n      - BIDCAP_ → Bid cap restricted\n      - RULE_ → Rule-based auto-management
    
    ABO/TEST campaigns get wider CPC tolerance in classification.
    """
    name_upper = campaign_name.upper()
    
    # Strip winner prefix if present
    if name_upper.startswith("🌟_"):
        name_upper = name_upper[2:]
    
    # Test/experimental campaigns - most lenient
    if "TEST" in name_upper or "TESTING" in name_upper or "PENGUJIAN" in name_upper:
        return "TEST"
    
    # ABO campaigns
    if name_upper.startswith("ABO") or "ABO_" in name_upper or "ABO " in name_upper:
        return "ABO"
    
    # Bid cap restricted - treat as ABO-equivalent (constrained delivery)
    if name_upper.startswith("BIDCAP"):
        return "BIDCAP"
    
    # Rule-managed
    if name_upper.startswith("RULE"):
        return "RULE"
    
    # CBO variants
    if name_upper.startswith("CBO") or name_upper.startswith("BC_"):
        return "CBO"
    
    # LC, TC - typically CBO variants (budget at campaign level)
    if name_upper.startswith("LC_") or name_upper.startswith("TC_"):
        return "CBO"
    
    # GLW / ON / OFF / PROFIT / SCALE / ON_LC / other prefixes - check via name
    if name_upper.startswith("GLW") or name_upper.startswith("SCALE") or name_upper.startswith("PROFIT") or name_upper.startswith("ON_LC"):
        return "CBO"
    
    # ON_PROFIT_, PURWOCENG_, ON_LC_ etc - typically CBO
    if "_" in name_upper[:20]:
        prefix = name_upper.split("_")[0]
        if prefix in ("ON", "PROFIT", "PURWOCENG", "SCALE"):
            return "CBO"
    
    return "UNKNOWN"

def classify_campaign(camp_insights, shopee_data, account_config, prev_state, all_insights=None, campaign_id=None):
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
    
    # Detect campaign type for 2-tier CPC rules
    ctype = detect_campaign_type(name)
    is_constrained = ctype in ("ABO", "TEST", "BIDCAP")
    
    # OFF_ prefix = never touch
    if name.startswith("OFF_"):
        return "OFF_LIMITS", 0, "Veris-mandated pause"
    
    # No delivery yet
    if spend < 100:
        return "ZERO", 0, "Minimal delivery"
    
    # Estimate ROAS from tag (per-campaign share)
    est_roas = 0
    matched_tag = None
    if shopee_data:
        for tag in account_config["tags"]:
            for key in (tag, tag.replace("3", ""), tag.replace("2", "")):
                if key in shopee_data:
                    tag_total = shopee_data[key]["total_commission"]
                    # Per-campaign ROAS: attribute commission by link_clicks ratio (not just spend)
                    tag_total_clicks = sum(
                        i.get("link_clicks", 0) or i.get("clicks", 0)
                        for i in (all_insights or {}).values()
                        if key in i["name"].lower().replace("pengering","").replace("pullout","")
                    )
                    campaign_share = link_clicks / max(tag_total_clicks, 1)
                    est_roas = (tag_total * campaign_share) / max(spend * 1.06, 1)  # PPN 6%
                    matched_tag = key
                    break
            if matched_tag:
                break
    
    # Degrade gracefully when Shopee data is missing: avoid false boncos
    # Use engagement-only thresholds instead.
    missing_shopee = not shopee_data or matched_tag is None
    
    if not missing_shopee:
        # ─── HARD CPC KILL (BEFORE winner check) ───────────────────
        # 2026-06-11: CPC > cpc_kill → BONCOS regardless of ROAS
        cpc_kill = account_config.get("cpc_kill", 250)
        if cpc > cpc_kill and spend > 2000:
            return "BONCOS", est_roas, f"CPC Rp{cpc:.0f} > Rp{cpc_kill} (HARD KILL) [{ctype}]"

        # Super winner: ROAS > 8x
        if est_roas > account_config["roas_super"] and link_clicks >= 10:
            return "SUPER", est_roas, f"ROAS {est_roas:.1f}x [{matched_tag}]"
        
        # Winner: ROAS > 3x + decent link clicks
        if est_roas > account_config["roas_winner"] and link_clicks >= 5:
            return "WINNER", est_roas, f"ROAS {est_roas:.1f}x [{matched_tag}]"
        
        # Boncos: High spend, zero/low return
        if spend > 5000 and est_roas < account_config["roas_kill"] and link_clicks > 0:
            return "BONCOS", est_roas, f"ROAS {est_roas:.2f}x [{ctype}] - spend wasted"
        
        # Boncos: CPC too high for campaign type (2-tier)
        cpc_safe = account_config.get("cpc_safe_abo" if is_constrained else "cpc_safe_cbo", account_config["cpc_kill"])
        cpc_danger = account_config.get("cpc_danger_abo" if is_constrained else "cpc_danger_cbo", account_config["cpc_kill"] * 2)
        
        if cpc > cpc_danger and spend > 2000 and link_clicks < 3:
            return "BONCOS", est_roas, f"CPC Rp{cpc:.0f} > Rp{cpc_danger} [{ctype}:DANGER]"
        
        # Test campaigns: only kill if burning >100k with zero result
        if ctype == "TEST" and spend > 100000 and link_clicks == 0:
            return "BONCOS", est_roas, f"TEST burn: Rp{spend:,.0f} spent, 0 clicks [{ctype}]"
    else:
        # No Shopee data — use engagement-only CPC thresholds (more aggressive)
        cpc_danger = account_config.get("cpc_danger_abo" if is_constrained else "cpc_danger_cbo", account_config.get("cpc_kill", 200))
        if cpc > cpc_danger and spend > 5000 and link_clicks < 3:
            return "BONCOS", 0, f"CPC Rp{cpc:.0f} > Rp{cpc_danger} [{ctype}:DANGER, no Shopee]"
        
        # Test burn with no Shopee
        if ctype == "TEST" and spend > 100000 and link_clicks == 0:
            return "BONCOS", 0, f"TEST burn: Rp{spend:,.0f} spent, 0 clicks [{ctype}]"
    
    # Fatigue: CTR dropping, CPC rising
    prev = prev_state.get(campaign_id, {}) or prev_state.get(name, {})
    prev_ctr = prev.get("ctr", ctr)
    prev_cpc = prev.get("cpc", cpc)
    if impressions > 1000 and ctr < prev_ctr * 0.7 and cpc > prev_cpc * 1.3:
        return "FATIGUE", est_roas, f"CTR {prev_ctr:.1f}%->{ctr:.1f}%, CPC Rp{prev_cpc:.0f}->Rp{cpc:.0f}"
    
    # Default: watch
    if link_clicks > 0:
        return "WATCH", est_roas, f"Delivering{'(no Shopee mapping)' if missing_shopee else ''}, ROAS {est_roas:.1f}x"
    else:
        return "WATCH", 0, "No link clicks yet"

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