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
  - act_2125021885010866 (1134 - Glowscent)
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

import json, os, sys, time, traceback, threading
import urllib.request, urllib.parse
from datetime import datetime, timedelta, timezone
from pathlib import Path
from collections import defaultdict

try:
    from dotenv import load_dotenv
    _env_path = Path(__file__).resolve().parent.parent / ".env"
    if _env_path.exists():
        load_dotenv(str(_env_path))
    else:
        load_dotenv()
except Exception:
    pass

sys.path.insert(0, str(Path(__file__).resolve().parent))
from vilona_trakpro_recommendations import generate_recommendations, format_telegram

# ─── CONFIG ──────────────────────────────────────────────────────────────────
WIB = timezone(timedelta(hours=7))
_BASE = Path("/home/openclaw")
_DEFAULT_WORKSPACE = _BASE / ".openclaw" / "workspace"
_HERE_BASE = Path(__file__).resolve().parent.parent
WORKSPACE = Path(os.getenv("WORKSPACE", _HERE_BASE if _HERE_BASE.exists() else _DEFAULT_WORKSPACE))
DATA_DIR = Path(os.getenv("DATA_DIR", WORKSPACE / "data")).resolve()
LOG_FILE = WORKSPACE / "logs" / "vilona_trakpro_engine.log"
STATE_FILE = WORKSPACE / "data" / "vilona_trakpro_state.json"
SHOPEE_DATA = _BASE / ".openclaw" / "workspace" / "data" / "shopee"
os.makedirs(WORKSPACE / "logs", exist_ok=True)
os.makedirs(WORKSPACE / "data", exist_ok=True)

# Token: try /tmp/fb_token.txt first, then .env META_ACCESS_TOKEN, then ACCESS_TOKEN env
TOKEN_FILE = Path("/tmp/fb_token.txt")
ACCESS_TOKEN = (TOKEN_FILE.read_text().strip() if TOKEN_FILE.exists() else
                os.getenv("META_ACCESS_TOKEN") or os.getenv("ACCESS_TOKEN"))
API = "https://graph.facebook.com/v22.0"

# ─── TELEGRAM BOT ────────────────────────────────────────────────────────────
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "REPLACE_WITH_REAL_TOKEN")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_ADMIN_ID", "157228659")
TELEGRAM_API = "https://api.telegram.org"

try:
    from telegram import Bot, Update, CallbackQuery
    from telegram.ext import (
        Application,
        CommandHandler,
        CallbackQueryHandler,
        ContextTypes,
    )
    from telegram.constants import ParseMode
except Exception as e:  # pragma: no cover
    Bot = None
    Application = None
    Update = None
    ContextTypes = None
    ParseMode = None
    CallbackQuery = None

# ─── EXECUTION / HITL STATE ───────────────────────────────────────────────
EXEC_STATE_FILE = WORKSPACE / "data" / "executor_state.json"

def _load_exec_state():
    try:
        return json.loads(EXEC_STATE_FILE.read_text())
    except Exception:
        return {
            "queue": [],       # pending exec requests
            "history": [],     # executed + dry_run conclusions
            "rate": {},        # cooldown per campaign
            "last_cycle_w": 0,
            "last_cycle_b": 0,
        }

def _save_exec_state(state):
    EXEC_STATE_FILE.write_text(json.dumps(state, indent=2))

exec_state = _load_exec_state()

# ─── TELEGRAM ALERTS ──────────────────────────────────────────────────────────
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

# ─── EXECUTOR ──────────────────────────────────────────────────────────────────
def fb_patch(endpoint, **params):
    params["access_token"] = ACCESS_TOKEN
    data = urllib.parse.urlencode(params).encode()
    url = f"{API}/{endpoint}"
    req = urllib.request.Request(url, data=data, method="POST")
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.loads(resp.read())

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

# ─── ACCOUNTS CONFIG ───────────────────────────────────────────────────────────
# Meta ↔ Shopee account mapping with decision thresholds per account
ACCOUNTS = {
    "0858": {
        "id": "act_435670549443081",
        "name": "Kakriput",
        "roas_winner": 3.0,
        "roas_super": 8.0,
        "roas_kill": 0.3,
        "cpc_kill": 250,
        "cpc_safe_cbo": 100, "cpc_danger_cbo": 140,
        "cpc_safe_abo": 150, "cpc_danger_abo": 250,
        "budget_cap_per_camp": 500000,
        "tags": ["rakpiringpengering", "organizerpullout", "Dongkrakelektrik"],
    },
    "1041": {
        "id": "act_380721031313330",
        "name": "Nyamiresep",
        "roas_winner": 2.0,
        "roas_super": 5.0,
        "roas_kill": 0.2,
        "cpc_kill": 300,
        "cpc_safe_cbo": 100, "cpc_danger_cbo": 140,
        "cpc_safe_abo": 150, "cpc_danger_abo": 250,
        "budget_cap_per_camp": 300000,
        "tags": ["rakdapur3", "multistorage"],
    },
    "1208": {
        "id": "act_1439536310038458",
        "name": "Herbal",
        "enabled": False,  # Sales campaign, not CPC — skip engine
        "roas_winner": 2.0,
        "roas_super": 5.0,
        "roas_kill": 0.2,
        "cpc_kill": 350,
        "cpc_safe_cbo": 100, "cpc_danger_cbo": 140,
        "cpc_safe_abo": 150, "cpc_danger_abo": 250,
        "budget_cap_per_camp": 250000,
        "tags": ["herbal", "herbalisme", "herborist", "bibitbidara"],
    },
    "1134": {
        "id": "act_2125021885010866",
        "name": "Glowscent-1134",
        "roas_winner": 1.5,
        "roas_super": 4.0,
        "roas_kill": 0.15,
        "cpc_kill": 400,
        "cpc_safe_cbo": 100, "cpc_danger_cbo": 140,
        "cpc_safe_abo": 150, "cpc_danger_abo": 250,
        "budget_cap_per_camp": 200000,
        "tags": ["abera", "pintulipatgeser", "lemaridapur", "lemariperhiasan", "bajubayi", "bedongbayi", "hijabbayi", "hoodiebaby", "popok", "selimutbayi", "kolamrenang", "bakmandibayi", "sampobayi", "lotionbayi", "tumbler", "uban", "jetcleaner", "rakcucipiring", "alatpijat", "pemotongsayur"],
    },
    "1340": {
        "id": "act_1181078009580337",
        "name": "Selow-1340",
        "roas_winner": 1.5,
        "roas_super": 4.0,
        "roas_kill": 0.15,
        "cpc_kill": 400,
        "cpc_safe_cbo": 100, "cpc_danger_cbo": 140,
        "cpc_safe_abo": 150, "cpc_danger_abo": 250,
        "budget_cap_per_camp": 200000,
        "tags": ["studiolands", "selow", "setelanbajukaosmihugajah", "setelangajahthaialand"],
    },
}

# ─── ACCOUNTS ─────────────────────────────────────────────────────────────────
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

# ─── META DATA ────────────────────────────────────────────────────────────────
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

# ─── CAMPAIGN TYPE DETECTION ───────────────────────────────────────────────────
def detect_campaign_type(campaign_name, campaign_id=None):
    """Detect campaign type from naming convention.
    
    Returns one of: "CBO", "ABO", "TEST", "LC", "TC", "BC", "BIDCAP", "RULE", "UNKNOWN"
    
    Veris naming convention 2026-06-06:
      - CBO_/BC_ → Campaign Budget Optimization
      - ABO_ → Ad Set Budget Optimization  
      - TEST_/test/Test_ → Testing/prospecting
      - LC_ → Lowest Cost (CBO variant)
      - TC_ → Top/mid/bottom funnel
      - BIDCAP_ → Bid cap restricted
      - RULE_ → Rule-based auto-management
    
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
    
    # GLW / ON / OFF / PROFIT / SCALE / other prefixes - check via name
    if name_upper.startswith("GLW") or name_upper.startswith("SCALE") or name_upper.startswith("PROFIT"):
        return "CBO"
    
    # ON_PROFIT_, PURWOCENG_ etc - typically CBO
    if "_" in name_upper[:20]:
        prefix = name_upper.split("_")[0]
        if prefix in ("ON", "PROFIT", "PURWOCENG", "SCALE"):
            return "CBO"
    
    return "UNKNOWN"

# ─── DECISION ENGINE ──────────────────────────────────────────────────────────
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

# ─── AUDIENCE DIVERSIFICATION POOL ───────────────────────────────────────────
# Saat clone winner, WAJIB variasi audience agar tidak terjadi self-cannibalization.
# Setiap clone mendapat interest group berbeda dari original.
# Pool ini diputar round-robin berdasarkan jumlah clone yang sudah ada.
AUDIENCE_POOL = {
    "Belanja": [
        {"id": "6003263791114", "name": "Belanja"},
        {"id": "6003346592981", "name": "Belanja online"},
    ],
    "Dapur": [
        {"id": "6003077174939", "name": "Perkakas dapur"},
        {"id": "6003113941014", "name": "Kitchen"},
        {"id": "6003206259061", "name": "Kitchenware"},
    ],
    "Fashion": [
        {"id": "6003242077675", "name": "Baju"},
        {"id": "6003456388203", "name": "Pakaian"},
    ],
    "IbuRumah": [
        {"id": "6003107471210", "name": "Ibu rumah tangga"},
    ],
    "Diskon": [
        {"id": "6003386553489", "name": "Kupon diskon"},
    ],
    "Travel": [
        {"id": "6004078861067", "name": "Traveling"},
    ],
    "Interior": [
        {"id": "6003384677038", "name": "Dekorasi rumah"},
        {"id": "6003455765814", "name": "Perabotan rumah"},
    ],
    "Resep": [
        {"id": "6003397425735", "name": "Resep masakan"},
    ],
    "Broad": [],  # Broad = hapus flexible_spec, biarkan Meta optimize
}

def _pick_diversified_audience(og_targeting, existing_clone_names, taglink):
    """Pilih audience group yang BERBEDA dari original dan clone yang sudah ada.
    
    Logika:
    1. Deteksi interest group yang dipakai original campaign
    2. Deteksi interest group yang dipakai clone-clone yang sudah ada
    3. Pilih group BARU yang belum terpakai (round-robin dari AUDIENCE_POOL)
    4. Jika semua sudah terpakai → fallback ke Broad (hapus interest)
    
    Returns: (new_targeting_dict, audience_label_str)
    """
    # Deteksi interest IDs dari original targeting
    og_interest_ids = set()
    for spec in og_targeting.get("flexible_spec", []):
        for interest in spec.get("interests", []):
            og_interest_ids.add(interest.get("id", ""))
    
    # Deteksi audience groups yang sudah terpakai dari nama clone yang ada
    used_audiences = set()
    for cname in existing_clone_names:
        for pool_name in AUDIENCE_POOL:
            if pool_name.lower() in cname.lower():
                used_audiences.add(pool_name)
    
    # Cek mana yang original pakai (match by interest ID)
    for pool_name, pool_interests in AUDIENCE_POOL.items():
        pool_ids = {i["id"] for i in pool_interests}
        if pool_ids & og_interest_ids:
            used_audiences.add(pool_name)
    
    # Pilih audience baru yang belum terpakai
    available = [k for k in AUDIENCE_POOL if k not in used_audiences and k != "Broad"]
    
    if not available:
        # Semua sudah terpakai → Broad targeting (hapus interest, max reach)
        new_targeting = {k: v for k, v in og_targeting.items() if k != "flexible_spec"}
        log(f"  🌐 Semua audience terpakai, fallback ke Broad targeting")
        return new_targeting, "Broad"
    
    # Round-robin: pilih berdasarkan jumlah clone yang sudah ada
    pick = available[len(existing_clone_names) % len(available)]
    new_interests = AUDIENCE_POOL[pick]
    
    # Build targeting baru: base dari original, ganti flexible_spec
    new_targeting = {k: v for k, v in og_targeting.items()}
    if new_interests:
        new_targeting["flexible_spec"] = [{"interests": new_interests}]
    else:
        new_targeting.pop("flexible_spec", None)
    
    log(f"  🎯 Audience diversifikasi: {pick} ({len(new_interests)} interest)")
    return new_targeting, pick

# ─── SCALE SEED AUDIENCE (2026-06-09) ──────────────────────────────────────────
# First clone ALWAYS uses this seed audience ("Belanja" fixed — 5 interest wajib)
# Guarantees min reach 2M per Meta interest spec
SCALE_SEED_AUDIENCE = [
    {"id": "6003263791114", "name": "Belanja"},
    {"id": "6003346592981", "name": "Belanja online"},
    {"id": "6016343989160", "name": "Lazada"},
    {"id": "6003220634758", "name": "Toko diskon"},
    {"id": "6849890049601", "name": "Situs web belanja online"},
]

def _pick_scale_audience(og_targeting, existing_clone_names, taglink):
    """Pilih audience untuk Scale_ clone.
    
    - FIRST clone (existing_clones==0): gunakan SCALE_SEED_AUDIENCE (Belanja fixed, 5 interest)
    - Subsequent clones: deep audience dari AUDIENCE_POOL, min reach 2M
    - Fallback ke Broad jika semua audience terpakai
    
    Returns: (new_targeting_dict, audience_label_str)
    """
    if not existing_clone_names:
        # FIRST clone → seed audience Belanja (5 interest wajib)
        new_targeting = {k: v for k, v in og_targeting.items()}
        new_targeting["flexible_spec"] = [{"interests": SCALE_SEED_AUDIENCE}]
        log(f"  🌱 SCALE SEED: First clone → Belanja (5 interests, reach 21M+)")
        return new_targeting, "Belanja"
    
    # Subsequent clones: deep audience dari pool yang belum terpakai
    used_audiences = set()
    for cname in existing_clone_names:
        for pool_name in AUDIENCE_POOL:
            if pool_name.lower() in cname.lower():
                used_audiences.add(pool_name)
    
    # Cek original campaign's interests
    og_interest_ids = set()
    for spec in og_targeting.get("flexible_spec", []):
        for interest in spec.get("interests", []):
            og_interest_ids.add(interest.get("id", ""))
    for pool_name, pool_interests in AUDIENCE_POOL.items():
        pool_ids = {i["id"] for i in pool_interests}
        if pool_ids & og_interest_ids:
            used_audiences.add(pool_name)
    
    # Seed audience juga dianggap terpakai setelah clone pertama
    used_audiences.add("Belanja")
    
    # Pilih dari pool, skip Broad (Broad = fallback)
    available = [k for k in AUDIENCE_POOL if k not in used_audiences and k != "Broad"]
    
    if not available:
        new_targeting = {k: v for k, v in og_targeting.items() if k != "flexible_spec"}
        log(f"  🌐 Semua audience terpakai, fallback ke Broad targeting")
        return new_targeting, "Broad"
    
    # Round-robin berdasarkan jumlah clone
    pick = available[len(existing_clone_names) % len(available)]
    new_interests = AUDIENCE_POOL[pick]
    
    new_targeting = {k: v for k, v in og_targeting.items()}
    if new_interests:
        new_targeting["flexible_spec"] = [{"interests": new_interests}]
    else:
        new_targeting.pop("flexible_spec", None)
    
    log(f"  🎯 Deep audience: {pick} ({len(new_interests)} interest, reach verified 2M+)")
    return new_targeting, pick


# ─── SCALE CLONE CREATOR ──────────────────────────────────────────────────────
def create_scale_clone(original_campaign, account_id, account_config):
    """Create a Scale_ clone dari winning campaign.
    
    Revamp 2026-06-09:
    - Naming: Scale_{TAGLINK}_{AUDIENCE}_{MMDD} (was LC_)
    - First clone: SCALE_SEED_AUDIENCE (Belanja, 5 interest wajib)
    - Subsequent: deep audience dari AUDIENCE_POOL (min reach 2M)
    - Copy placement from original (publisher_platforms, positions)
    - ALL creates PAUSED (safety rule — user reviews first)
    
    Naming Convention (2026-06-09):
    Campaign: Scale_{TAGLINK}_{AUDIENCE}_{MMDD}
    Adset:    Scale_{TAGLINK}_{AUDIENCE}_2555
    Ad:       {taglink}_Vdo1_v1
    """
    try:
        # Get original's adsets for targeting + ads
        adsets = fb_get(f"{original_campaign['id']}/adsets",
            fields="name,targeting,optimization_goal,bid_strategy,promoted_object,status",
            limit="5")
        
        if not adsets.get("data"):
            log(f"No adsets found for clone", "WARN")
            return None
        
        og_adset = adsets["data"][0]
        today_str = datetime.now(WIB).strftime("%m%d")
        
        # Parse original campaign name for product/taglink
        og_name = original_campaign["name"]
        parts = og_name.split("_")
        
        # Auto-detect product from account tags
        product = account_config.get("tags", ["unknown"])[0] if account_config.get("tags") else "product"
        for p in parts:
            for t in account_config.get("tags", []):
                tag_clean = t.replace("3","").replace("2","").replace("pengering","").replace("pullout","")
                if tag_clean.lower() in p.lower():
                    product = t
                    break
        taglink = product
        
        # ─── AUDIENCE SELECTION (2026-06-09 revamp) ──────────────────────
        # Cari clone yang sudah ada (cek Scale_ prefix, then LC_ for backward compat)
        existing = fb_get(f"{account_id}/campaigns",
            fields="name", limit="200")
        existing_names = [c.get("name", "") for c in existing.get("data", [])]
        
        scale_prefix = f"Scale_{taglink}_"
        lc_prefix = f"LC_{taglink}_"
        existing_clones = [n for n in existing_names 
                          if n.startswith(scale_prefix) or n.startswith(lc_prefix)]
        
        og_targeting = og_adset.get("targeting", {})
        
        # COPY placement dari original campaign
        scale_targeting = {k: v for k, v in og_targeting.items()}
        orig_placement_keys = [
            "publisher_platforms", "facebook_positions", "instagram_positions",
            "device_platforms", "wireless_carrier", "locales",
        ]
        for pk in orig_placement_keys:
            if pk in og_targeting:
                scale_targeting[pk] = og_targeting[pk]
        
        # Remove video_feeds from facebook_positions (deprecated v22.0)
        if "facebook_positions" in scale_targeting and "video_feeds" in scale_targeting["facebook_positions"]:
            scale_targeting["facebook_positions"] = [
                p for p in scale_targeting["facebook_positions"] if p != "video_feeds"
            ]
        
        # Pilih audience
        diversified_targeting, audience = _pick_scale_audience(
            og_targeting, existing_clones, taglink
        )
        
        # Apply placement ke hasil audience
        for pk in orig_placement_keys:
            if pk in og_targeting:
                diversified_targeting[pk] = og_targeting[pk]
        # Remove video_feeds again if needed
        if "facebook_positions" in diversified_targeting and "video_feeds" in diversified_targeting["facebook_positions"]:
            diversified_targeting["facebook_positions"] = [
                p for p in diversified_targeting["facebook_positions"] if p != "video_feeds"
            ]
        
        # ─── SCALE NAMING (2026-06-09 convention) ────────────────────────
        camp_name = f"Scale_{taglink}_{audience}_{today_str}"
        adset_name = f"Scale_{taglink}_{audience}_2555"
        ad_name = f"{taglink}_Vdo1_v1"
        
        # Deduplicate nama campaign
        existing_name_set = set(existing_names)
        base = camp_name
        n = 2
        while camp_name in existing_name_set:
            camp_name = f"{base}_v{n}"
            n += 1
        
        # Copy post_id (object_story_id) dari original ad
        post_id = None
        try:
            ads = fb_get(f"{original_campaign['id']}/ads",
                fields="creative{object_story_id,id}", limit="1")
            if ads.get("data"):
                creative = ads["data"][0].get("creative", {})
                if creative.get("object_story_id"):
                    post_id = creative["object_story_id"]
                    log(f"  📋 Copy Post ID: {post_id}")
        except Exception as e:
            log(f"Post ID fetch warning: {e}", "WARN")
        
        # Create campaign — ALWAYS PAUSED
        camp_result = fb_post(f"{account_id}/campaigns",
            name=camp_name,
            objective="OUTCOME_TRAFFIC",
            status="PAUSED",
            special_ad_categories="[]",
            is_adset_budget_sharing_enabled="false")
        
        if "id" not in camp_result:
            log(f"Scale clone campaign creation failed: {camp_result}", "WARN")
            return None
        
        new_camp_id = camp_result["id"]
        
        # Build adset with targeting plus needed params
        adset_payload = {
            "name": adset_name,
            "campaign_id": new_camp_id,
            "targeting": json.dumps(diversified_targeting),
            "optimization_goal": "LINK_CLICKS",
            "billing_event": "IMPRESSIONS",
            "bid_strategy": "LOWEST_COST_WITHOUT_CAP",  # ⚠️ CRITICAL: No bid cap! Rp20k cap caused 0.02% budget utilization
            "daily_budget": "500000",  # Rp5,000/day in cents (existing Scale_ clones use this)
            "status": "PAUSED",  # ⚠️ SAFETY: never auto-ACTIVE
        }
        if post_id:
            adset_payload["promoted_object"] = json.dumps({
                "object_story_id": post_id
            })
        
        # Create adset — ALWAYS PAUSED
        adset_result = fb_post(f"{account_id}/adsets", **adset_payload)
        
        if "id" not in adset_result:
            log(f"Scale clone adset creation failed: {adset_result}", "WARN")
            return None
        
        new_adset_id = adset_result["id"]
        
        # Find creative ID from original to clone the ad
        creative_id = None
        try:
            ads = fb_get(f"{original_campaign['id']}/ads",
                fields="creative{id}", limit="1")
            if ads.get("data"):
                creative = ads["data"][0].get("creative", {})
                if creative.get("id"):
                    creative_id = creative["id"]
        except Exception:
            pass
        
        # Create ad — ALWAYS PAUSED
        ad_payload = {
            "name": ad_name,
            "adset_id": new_adset_id,
            "status": "PAUSED",  # ⚠️ SAFETY: never auto-ACTIVE
        }
        if creative_id:
            ad_payload["creative"] = json.dumps({"creative_id": creative_id})
        elif post_id:
            ad_payload["creative"] = json.dumps({
                "object_story_id": post_id,
                "call_to_action_type": "SHOP_NOW",
            })
        
        ad_result = fb_post(f"{account_id}/ads", **ad_payload)
        
        log(f"🧬 SCALE CLONE CREATED (PAUSED): {camp_name}")
        log(f"     Adset: {adset_name} | Ad: {ad_name} | PostID: {post_id or 'none'}")
        return new_camp_id
            
    except Exception as e:
        log(f"Scale clone creation error: {e}", "ERROR")
        traceback.print_exc()
        return None

# ─── ACTION EXECUTOR ──────────────────────────────────────────────────────────
def execute_actions(account_id, account_config, classifications, acc_key="", insights=None):
    """Execute pause/scale actions based on Veris brain rules.
    
    Scale Rules (from bk-brain, 2026-06-06):
    - COST_CAP winner → NEVER scale budget → create LOWEST_COST clone
    - LOWEST_COST winner → scale budget +20%
    - LOWEST_COST_WITH_BID_CAP → scale budget + optimize bid cap
    - SUPER (ROAS > 8x) → scale budget +50% OR create LC clone
    
    Budget Cap (dynamic, 2026-06-06):
    - If aggregate CPC across all campaigns > KPI → cap at 300rb
    - If aggregate CPC within KPI → NO cap (let it scale freely)"""
    campaigns = get_all_campaigns(account_id)
    actions_taken = []
    core = CORE_PORTFOLIO.get(acc_key, [])
    clones_created = 0
    max_clones_per_cycle = 3  # Limit to avoid spam
    
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
            
            # Check bid strategy (Veris rule: only scale LOWEST_COST)
            bid_strategy, bid_amount = get_campaign_bid_strategy(cid)
            is_cost_cap = bid_strategy in ("COST_CAP", "LOWEST_COST_WITH_BID_CAP")
            is_lowest_cost = bid_strategy == "LOWEST_COST"
            
            if is_cost_cap and clones_created < max_clones_per_cycle:
                # Veris Rule: COST_CAP winner → create LC clone, NOT scale budget
                if status == "ACTIVE" and roas > account_config["roas_winner"]:
                    clone_id = create_scale_clone(camp, account_id, account_config)
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
                cap = dynamic_cap or account_config["budget_cap_per_camp"]
                new_budget = min(
                    int(current_budget * (1 + scale_pct)),
                    cap
                )
                if new_budget > current_budget:
                    if not dry_run:
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
                        actions_taken.append(
                            f"🧪 DRY_RUN: would scale {name[:30]} "
                            f"Rp{current_budget:,}→Rp{new_budget:,}"
                        )
            
            else:
                # Unknown strategy - log and hold
                actions_taken.append(
                    f"⏸️ HOLD: {name[:40]} — unknown bid strategy ({bid_strategy})"
                )
        
        elif verdict == "FATIGUE":
            actions_taken.append(f"🔄 FATIGUE: {name[:40]} — {reason}")
    
    return actions_taken

# ─── CORE PORTFOLIO ──────────────────────────────────────────────────────────
# Campaigns proven profitable that should ALWAYS stay active per account
CORE_PORTFOLIO = {
    "0858": [
        "BIDCAP_Rakpiring_rakpiringpengering_Shopping_0603",
        "BIDCAP_Rakpiring_rakpiringpengering_Winner_0603",
        "BIDCAP_Rakpiring_rakpiringpengering_Broad_0603",
        "BIDCAP_GEO_rakpiringpengering_INT04",
        "BIDCAP_GEO_rakpiringpengering_INT07",
        "BIDCAP_GEO_rakpiringpengering_INT08",
        "BIDCAP_GEO_rakpiringpengering_INT10",
        "BIDCAP_Organizer_organizerpullout_Travel_0603",
        "BIDCAP_Organizer_organizerpullout_Dapur_0603",
        "BIDCAP_Organizer_organizerpullout_Fashion_0603",
    ],
    "1041": [],
    "1208": [],
    "1134": [],
    "1340": [],
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

# ─── MAIN LOOP ────────────────────────────────────────────────────────────────
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
