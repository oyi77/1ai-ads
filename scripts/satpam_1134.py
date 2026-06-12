#!/usr/bin/env python3
"""
SATPAM Patrol 1134 (Glowscent)
Standalone cron-safe script — stdlib only.
"""
import json
import os
import sys
import time
from datetime import datetime, timedelta
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from urllib.parse import urlencode

# ------------------------------------------------------------------
# Resolve project root and import engine helpers
# ------------------------------------------------------------------
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

# Engine provides fb_get, fb_post, and loaded token
import vilona_trakpro_engine as engine  # noqa: E402

API_BASE = f"https://graph.facebook.com/v22.0"
ACT_ID = "2125021885010866"
ACT_PREFIX = f"act_{ACT_ID}"

# Thresholds from skill
CPC_KILL = 400
CPC_DANGER_CBO = 140
CPC_DANGER_ABO = 250
CPC_SAFE_CBO = 100  # optional for watch band
SPEND_KILL = 2000
SPEND_PAUSE = 5000
SPEND_WATCH = 50000
CTR_PAUSE_THRESH = 0.01
IMPR_PAUSE_THRESH = 1000

# Proven working interests for Glowscent (skill references)
INTERESTS_GLOWSCENT = ["abera", "PintuLipatGeser", "Hijab"]


def _token():
    """Get token from engine, avoiding write_file/heredoc mangling."""
    try:
        return engine.ACCESS_TOKEN
    except Exception:
        tok = ""
        path = os.path.join(PROJECT_ROOT, ".env")
        for line in open(path, "r", encoding="utf-8", errors="ignore").read().splitlines():
            if not line or line.startswith("#"):
                continue
            if line.split("=", 1)[0] == "META_ACCESS_TOKEN":
                tok = line.split("=", 1)[1].strip()
                break
        return tok


def api_get(endpoint, params=None):
    """Direct urllib GET using engine token."""
    token = _token()
    url = f"{API_BASE}/{endpoint}"
    if params:
        url = f"{url}?{urlencode(params)}"
    req = Request(url, headers={"Authorization": f"Bearer {token}"})
    with urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())


def api_post(endpoint, data):
    token = _token()
    url = f"{API_BASE}/{endpoint}"
    qs = urlencode({**data, "access_token": token}).encode()
    req = Request(url, data=qs, method="POST")
    with urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())


def classify_campaign_type(name):
    n = name.upper()
    if "TEST" in n or "TESTING" in n:
        return "TEST"
    if n.startswith("ABO"):
        return "ABO"
    if n.startswith("BIDCAP"):
        return "BIDCAP"
    if n.startswith(("CBO", "BC_", "LC_", "TC_", "GLW")):
        return "CBO"
    return "CBO"


def main():
    now = datetime.now()
    since = (now - timedelta(days=7)).strftime("%Y-%m-%d")
    until = now.strftime("%Y-%m-%d")
    ts = now.strftime("%Y-%m-%d %H:%M")

    # 1. Account self-check
    try:
        acct = api_get(f"{ACT_PREFIX}", {"fields": "account_name"})
        acct_name = acct.get("account_name", "???")
    except Exception as e:
        print(f"🛡️ SATPAM 1134 — {ts}")
        print(f"❌ Account verification failed: {e}")
        return

    # 2. Fetch campaigns
    campaigns = []
    after = None
    while True:
        params = {
            "fields": "id,name,status,effective_status,daily_budget,lifetime_budget,spend",
            "limit": "200",
        }
        if after:
            params["after"] = after
        res = api_get(f"{ACT_PREFIX}/campaigns", params)
        data = res.get("data", [])
        campaigns.extend(data)
        paging = res.get("paging", {})
        after = paging.get("cursors", {}).get("after")
        if not after:
            break
        time.sleep(1.5)

    total_campaigns = len(campaigns)
    active_camps = [c for c in campaigns if c.get("effective_status") == "ACTIVE"]
    off_camps = [c for c in campaigns if c.get("name", "").startswith("OFF_")]
    star_camps = [c for c in campaigns if c.get("name", "").startswith("🌟_")]

    # Pitfall 66: explicit empty-account flag
    if total_campaigns == 0:
        print(f"🛡️ SATPAM 1134 — {ts}")
        print("🚨 INVENTORY EMPTY — patrol cannot classify")
        print(f"✅ Account verified: {acct_name} ({ACT_PREFIX})")
        print("⚠️ campaigns=0, adsets=0, insights likely blocked")
        return

    # 3. Fetch 7d insights (campaign level)
    insights_map = {}
    after = None
    while True:
        params = {
            "fields": "campaign_id,campaign_name,spend,cpc,clicks,ctr,impressions",
            "time_range": json.dumps({"since": since, "until": until}),
            "level": "campaign",
            "limit": "200",
        }
        if after:
            params["after"] = after
        res = api_get(f"{ACT_PREFIX}/insights", params)
        data = res.get("data", [])
        for row in data:
            insights_map[row["campaign_id"]] = row
        paging = res.get("paging", {})
        after = paging.get("cursors", {}).get("after")
        if not after:
            break
        time.sleep(1.5)

    # Pitfall 63 check: insights rows but no campaigns
    if total_campaigns == 0 and len(insights_map) > 0:
        print(f"🛡️ SATPAM 1134 — {ts}")
        print("🚨 DATA QUALITY FLAG: 0 campaigns but insights returned rows")
        print(f"✅ Account: {acct_name}")
        print(f"Insights rows: {len(insights_map)}")
        return

    # 4. Classify & act
    killed = []
    watched = []
    winners = []
    paused_once = []
    offed = []
    total_spend_7d = 0.0

    for c in campaigns:
        cid = c["id"]
        name = c.get("name", "")
        status = c.get("status", c.get("effective_status", ""))
        ins = insights_map.get(cid, {})
        spend = float(ins.get("spend", 0))
        cpc = float(ins.get("cpc", 0))
        clicks = int(ins.get("clicks", 0))
        ctr = float(ins.get("ctr", 0))  # percent already from API
        impr = int(ins.get("impressions", 0))
        total_spend_7d += spend

        camp_type = classify_campaign_type(name)

        # Skip OFF_ and DEAD_ entirely
        if name.startswith("OFF_") or name.startswith("DEAD_"):
            continue

        # LAYER 1 CPC
        is_cbo = camp_type in ("CBO",)
        is_abo_test = camp_type in ("ABO", "BIDCAP", "TEST")

        # Hard kill
        if cpc > CPC_KILL and spend > SPEND_KILL:
            killed.append((name, cpc, spend))
            if status == "ACTIVE":
                try:
                    api_post(cid, {"status": "PAUSED"})
                    time.sleep(1.5)
                except Exception as e:
                    print(f"  ⚠️ pause failed {name}: {e}")
            try:
                new_name = f"OFF_{name}"
                api_post(cid, {"name": new_name})
                time.sleep(1.5)
                offed.append(name)
            except Exception as e:
                print(f"  ⚠️ rename OFF_ failed {name}: {e}")
            continue

        # Pause watch CPC
        if (is_cbo and cpc > CPC_DANGER_CBO) or (is_abo_test and cpc > CPC_DANGER_ABO):
            if spend > SPEND_PAUSE and status == "ACTIVE":
                try:
                    api_post(cid, {"status": "PAUSED"})
                    time.sleep(1.5)
                    paused_once.append(name)
                except Exception as e:
                    print(f"  ⚠️ pause CPC watch failed {name}: {e}")
                continue

        # LAYER 2 CTR
        if ctr < CTR_PAUSE_THRESH * 100 and impr > IMPR_PAUSE_THRESH and status == "ACTIVE":
            # Pause temporarily (review)
            try:
                api_post(cid, {"status": "PAUSED"})
                time.sleep(1.5)
                paused_once.append(name)
            except Exception as e:
                print(f"  ⚠️ pause CTR failed {name}: {e}")
            watched.append((name, cpc, ctr, "CTR_LOW"))
            continue

        # LAYER 3 - Taglink/monitor
        has_tag = any(tag.lower() in name.lower() for tag in INTERESTS_GLOWSCENT)
        if has_tag and spend >= SPEND_WATCH and clicks > 0 and cpc < CPC_SAFE_CBO:
            winners.append((name, cpc, spend, clicks))
            # Star winners
            if not name.startswith("🌟_"):
                try:
                    api_post(cid, {"name": f"🌟_{name}"})
                    time.sleep(1.5)
                except Exception as e:
                    print(f"  ⚠️ star rename failed {name}: {e}")
            continue

        if spend >= SPEND_WATCH and clicks == 0:
            watched.append((name, cpc, ctr, "NO_CLICKS"))
        elif spend > 0:
            watched.append((name, cpc, ctr, "MONITORING"))

    # 5. Report
    print(f"🛡️ SATPAM 1134 — {ts}")
    print(f"✅ Account: {acct_name} ({ACT_PREFIX})")
    print(f"ACTIVE: {len(active_camps)} | OFF_: {len(off_camps)} | 🌟: {len(star_camps)}")
    print(f"💰 Spend 7d: Rp{int(total_spend_7d):,}")

    if killed:
        kills = "\n".join([f"  - {n} | CPC Rp{int(cpc)} | spend Rp{int(sp):,}" for n, cpc, sp in killed])
        print(f"💀 KILL (CPC>{CPC_KILL}+spend>2K):\n{kills}")

    if paused_once:
        pauses = "\n".join([f"  - {n}" for n in paused_once])
        print(f"⏸️ PAUSED (watch):\n{pauses}")

    if offed:
        offs = "\n".join([f"  - {n}" for n in offed])
        print(f"🚫 OFF_PREFIX:\n{offs}")

    if winners:
        win = "\n".join([f"  - {n} | CPC Rp{int(cpc)} | Rp{int(spend):,} | {clicks} clicks" for n, cpc, spend, clicks in winners])
        print(f"🌟 WINNERS (starred):\n{win}")

    if watched:
        wch = "\n".join([f"  - {n} | CPC Rp{int(cpc)} | CTR {ctr:.1f}% | {reason}" for n, cpc, ctr, reason in watched])
        print(f"👀 WATCH:\n{wch}")

    if not killed and not paused_once and not offed and not winners and not watched:
        print("✅ No actions needed — all campaigns within thresholds")


if __name__ == "__main__":
    main()
