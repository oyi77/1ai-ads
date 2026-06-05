#!/usr/bin/env python3
"""
Malay 1134 RECOVERY MODE
- Validates token + Shopee data freshness
- Unpause eligible campaigns ONLY under governor guardrails
- Optionally enforces taglink mapping via: python3 scripts/1134_recovery_mode.py -u tagged
- Composite scoring: CPC + CTR + TE/orders + taglink freshness
"""

import argparse
import json
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path
import requests

# ── CONFIG ──────────────────────────────────────────────
ACT = "act_1773760133153789"
TOKEN_FILE = Path("/tmp/meta_token.txt")
STATE_FILE = Path("/tmp/1134_governor_state.json")
LOG_DIR = Path.home() / "projects/1ai-ads/logs"
LOG_FILE = LOG_DIR / "1134_recovery.log"
SHOPEE_DIR = Path.home() / "projects/1ai-ads/data/shopee"
TAGLINK_MAP = SHOPEE_DIR / "taglink_mapping_2026-06-04.json"
PLATFORM_MAP = SHOPEE_DIR / "platform_mapping.json"

if not TAGLINK_MAP.exists():
    # Fallback if moved
    TAGLINK_MAP = next(SHOPEE_DIR.glob("taglink_mapping_*.json"), TAGLINK_MAP)
if not PLATFORM_MAP.exists():
    PLATFORM_MAP = next(SHOPEE_DIR.glob("platform_mapping*.json"), PLATFORM_MAP)


# ── THRESHOLDS ──────────────────────────────────────────
CPC_CAP = 500
CTR_MIN = 5.0
DEFAULT_MAX_BUDGET = 120_000
RECOVERY_COOLDOWN_HOURS = 2
REPORTING_DELAY_DAYS = 1  # align with governor grace period


os.makedirs(LOG_DIR, exist_ok=True)


def log(msg):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line)
    with open(LOG_FILE, "a") as f:
        f.write(line + "\n")


def load_token():
    if TOKEN_FILE.exists():
        tok = TOKEN_FILE.read_text().strip()
        if tok:
            return tok
    return None


def load_state():
    if STATE_FILE.exists():
        return json.loads(STATE_FILE.read_text())
    return {"last_run": None, "pause_history": {}, "scale_history": {}, "recovery_history": {}}


def save_state(state):
    state["last_run"] = datetime.now().isoformat()
    STATE_FILE.write_text(json.dumps(state, indent=2))


def api_get(path, params=None):
    token = load_token()
    if not token:
        return {"error": "missing_token"}
    if params is None:
        params = {}
    params["access_token"] = token
    try:
        r = requests.get(f"https://graph.facebook.com/v19.0/{path}", params=params, timeout=15)
        return r.json()
    except Exception as e:
        return {"error": str(e)}


def api_post(path, params=None):
    token = load_token()
    if not token:
        return {"error": "missing_token"}
    if params is None:
        params = {}
    params["access_token"] = token
    try:
        r = requests.post(f"https://graph.facebook.com/v19.0/{path}", params=params, timeout=15)
        return r.json()
    except Exception as e:
        return {"error": str(e)}


def find_shopee_csv():
    candidates = [
        Path.home() / "projects/1ai-ads/data/shopee",
        Path.home() / "projects/1ai-ads/data",
        Path.home() / "projects/1ai-ads",
    ]
    found = []
    for base in candidates:
        if base.exists():
            for f in sorted(base.rglob("*.csv"), key=lambda p: p.stat().st_mtime, reverse=True):
                found.append(f)
    return found[:5]


def load_taglink_map():
    try:
        if TAGLINK_MAP.exists():
            return json.loads(TAGLINK_MAP.read_text()).get("tags", [])
    except Exception:
        pass
    return []


def load_platform_mapping():
    try:
        if PLATFORM_MAP.exists():
            return json.loads(PLATFORM_MAP.read_text())
    except Exception:
        pass
    return []


def campaign_has_taglink(campaign_id: str, campaign_name: str, taglink_map) -> bool:
    """
    Strict mapping check: a campaign is eligible only if it appears inside
    the Taglink mapping for 1134 account.
    Matches either:
      - mapping.campaigns[].id contains CampaignMetaId OR starts with cg:<id>, OR
      - campaign name (case-insensitive) contains a known taglink value.
    """
    cid = str(campaign_id)
    name_lower = (campaign_name or "").lower()

    for tag in taglink_map or []:
        for entry in tag.get("mapping", {}).get("campaigns", []):
            entry_id = str(entry.get("id", ""))
            # match direct meta id or synthetic id referencing campaign
            if cid in entry_id or entry_id in cid:
                return True
            # synthetic prefix fallback cg:<digits> partial match
            if entry_id.startswith("cg:") and entry_id.split(":", 1)[1] in cid:
                return True
        if tag.get("taglink") in name_lower.replace(" ", "_"):
            return True
    return False


def latest_taglink_freshness_days():
    try:
        if TAGLINK_MAP.exists():
            mtime = datetime.fromtimestamp(TAGLINK_MAP.stat().st_mtime)
            return (datetime.now() - mtime).total_seconds() / 86400.0
    except Exception:
        pass
    return 9999.0


def pick_candidates(paused, state, taglink_map, enforce_taglink: bool):
    candidates = []

    for c in paused:
        name = c.get("name", "")
        cid = c.get("id")
        budget = int(c.get("daily_budget") or 0)

        # Hard filters: prefix + budget + state-based CPC/CTR
        if not name.startswith("LC_"):
            continue
        if budget <= 0 or budget > DEFAULT_MAX_BUDGET:
            continue
        est = state.get("pause_history", {}).get(str(cid), {})
        cpc = float(est.get("cpc", 0) or 0)
        ctr = float(est.get("ctr", 0) or 0)
        if cpc == 0 and ctr == 0:
            continue
        if cpc > CPC_CAP:
            continue
        if cpc > 0 and ctr < CTR_MIN:
            continue

        # Taglink guard (mode B)
        if enforce_taglink and not campaign_has_taglink(cid, name, taglink_map):
            continue

        # Cooldown checks
        recovery_hist = state.get("recovery_history", {})
        last = recovery_hist.get(str(cid))
        if last:
            try:
                lr = datetime.fromisoformat(last.get("recovered_at", "2000-01-01"))
                if (datetime.now() - lr).total_seconds() < RECOVERY_COOLDOWN_HOURS * 3600:
                    continue
            except Exception:
                pass

        candidates.append({"id": cid, "name": name, "budget": budget, "cpc": cpc, "ctr": ctr})

    candidates = candidates[:3]
    return candidates


def score_campaign(campaign, platform_data):
    """
    Composite score (higher is better):
      3 if CPC <= 250 (good), else 0
      2 if CTR >= 5%, else 0
      2 if taglink mapping is present (fresh attribution path)
      1 if there is platform activity > 0 (orders/completed), else 0
      1 if TE recent: mapping mtime < 24h
    Max score = 9
    """
    cpc = float(campaign.get("cpc", 0) or 0)
    ctr = float(campaign.get("ctr", 0) or 0)

    score = 0
    score += 3 if cpc <= 250 else 0
    score += 2 if ctr >= 5.0 else 0
    score += 2 if campaign.get("has_taglink") else 0

    # platform activity
    orders = 0
    completed = 0
    for p in platform_data or []:
        if p.get("Tag_link") and (p.get("Tag_link") in campaign.get("name", "").lower()):
            orders += int(p.get("Orders", 0) or 0)
            completed += int(p.get("Completed", 0) or 0)
    score += 1 if orders > 0 else 0

    # Fresness
    if latest_taglink_freshness_days() <= 1.0:
        score += 1

    return score


def main():
    parser = argparse.ArgumentParser(description="1134 recovery controller")
    parser.add_argument("-u", "--user", default="", help="Optional caller tag")
    parser.add_argument("--enforce-taglink", action="store_true", help="Require valid taglink mapping to recover")
    parser.add_argument("--tagged", action="store_true", help="Alias for --enforce-taglink")
    args = parser.parse_args()

    now = datetime.now()
    state = load_state()
    token = load_token()
    taglink_map = load_taglink_map()
    platform_data = load_platform_mapping()

    log("=" * 60)
    log(f"🔁 1134 RECOVERY RUN — {now.strftime('%H:%M:%S')} WIB")
    if args.tagged:
        log("🔖 MODE: tagged (enforce-taglink)")

    if not token:
        log("❌ CRITICAL: Token tidak ditemukan. Recovery dibatalkan.")
        return

    enforce_taglink = bool(args.enforce_taglink or args.tagged)

    # 1) Shopee data freshness check
    csvs = find_shopee_csv()
    if not csvs:
        log("❌ No Shopee CSV / TE data found under 1ai-ads/data/shopee. Recovery blocked until scraper inserts fresh data.")
        return
    latest = csvs[0]
    age_min = (now.timestamp() - latest.stat().st_mtime) / 60.0
    log(f"📦 Latest Shopee data: {latest} ({age_min:.1f} min ago)")
    if age_min > 24 * 60:
        log("⛔ Data terlalu lama (>24 jam). Jalankan Shopee scraper dulu sebelum recovery.")
        return

    # 2) Global recovery cooldown (1h)
    recovery = state.get("recovery_history", {})
    last_recovery_iso = recovery.get("last_recovery_at")
    if last_recovery_iso:
        try:
            last = datetime.fromisoformat(last_recovery_iso)
            if (now - last).total_seconds() < 60 * 60:
                log("⏳ Cooldown: recovery baru saja dijalankan (<1 jam).")
                return
        except Exception:
            pass

    # 3) Fetch campaigns from Meta
    camps_r = api_get(f"{ACT}/campaigns", {"fields": "id,name,status,daily_budget,effective_status", "limit": 100})
    if "error" in camps_r:
        log(f"❌ API ERROR listing campaigns: {str(camps_r.get('error', camps_r))[:200]}")
        return

    campaigns = camps_r.get("data", [])
    paused = [c for c in campaigns if c.get("status") == "PAUSED"]
    log(f"📊 Total campaigns: {len(campaigns)} | Paused: {len(paused)}")

    # 4) Build and score candidate campaigns
    candidates = pick_candidates(paused, state, taglink_map, enforce_taglink)
    if not candidates:
        log("⚪ Tidak ada campaign eligible untuk di-recover.")
        save_state(state)
        return

    # Attach taglink flag and score
    for c in candidates:
        c["has_taglink"] = campaign_has_taglink(c["id"], c["name"], taglink_map)
        c["score"] = score_campaign(c, platform_data)

    candidates.sort(key=lambda x: x["score"], reverse=True)
    candidates = candidates[:3]
    log(f"🎯 Eligible recover: {len(candidates)} campaign(s)")
    for c in candidates:
        log(f"   - {c['name'][:55]} | score={c['score']} | has_taglink={c['has_taglink']} | CPC Rp{c['cpc']:,.0f}")

    # 5) Execute recovery
    results = []
    for c in candidates:
        r = api_post(f"{c['id']}", {"status": "ACTIVE"})
        ok = r.get("success") or (isinstance(r, dict) and r.get("id"))
        results.append({"id": c["id"], "name": c["name"], "ok": bool(ok), "resp": r, "score": c["score"]})
        if ok:
            recovery[c["id"]] = {
                "name": c["name"],
                "recovered_at": now.isoformat(),
                "budget": c["budget"],
                "cpc": c["cpc"],
                "ctr": c["ctr"],
                "score": c["score"],
                "has_taglink": c["has_taglink"],
            }
            log(f"🚀 ACTIVATED | {c['name'][:55]} | Score {c['score']} | Budget Rp{c['budget']:,}")
        else:
            log(f"❌ ACTIVATE FAILED | {c['name'][:55]} | {str(r)[:120]}")

    state["recovery_history"] = recovery
    state["last_recovery_at"] = now.isoformat()
    save_state(state)
    log("💾 Recovery state saved. Normal governor operations will resume in next tick.")


if __name__ == "__main__":
    main()
