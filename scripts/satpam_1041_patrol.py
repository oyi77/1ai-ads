#!/usr/bin/env python3
"""SATPAM 1041 — Patrol 3-layer (CPC → CTR → ROI) untuk act_380721031313330"""

import json
import os
import sys
import time
import urllib.request
import urllib.error
import urllib.parse
from datetime import datetime, timedelta

# ---------- CONFIG ----------
ACT_ID = "380721031313330"
ACT_PREFIX = f"act_{ACT_ID}"
API_BASE = "https://graph.facebook.com/v22.0"
ENV_PATH = "/home/openclaw/projects/1ai-ads/.env"
REPORT_PATH = "/home/openclaw/projects/1ai-ads/data/patrol_1041_latest.json"

# Thresholds from engine + 3-layer
CPC_KILL = 200
CPC_DANGER_CBO = 120
CPC_DANGER_ABO = 250
SPEND_KILL = 2000
SPEND_DANGER = 5000
CTR_DANGER = 1.0
IMPR_DANGER = 1000

# Malay products tracked for 1041
TAGLINKS = {"rakdapur3", "atayasetelankaosanak", "setelanbajukaosmihugajah", "setelangajahthaialand", "pintulipatgeser", "abera"}


def load_token():
    for line in open(ENV_PATH).read().splitlines():
        if not line or line.startswith("#"):
            continue
        if line.split("=", 1)[0] == "META_ACCESS_TOKEN":
            return line.split("=", 1)[1].strip()
    raise RuntimeError("META_ACCESS_TOKEN not found in .env")


def api_get(endpoint, params=None):
    url = f"{API_BASE}/{endpoint}"
    if params:
        url = f"{url}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url)
    token = load_token()
    req.add_header("Authorization", f"Bearer {token}")
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", errors="replace")
            if e.code == 400 and "Tried accessing nonexisting field" in body:
                # Retry with safe fields only
                return {"error": str(e), "body": body}
            if e.code in (429, 400, 500):
                wait = (attempt + 1) * 5
                time.sleep(wait)
                continue
            return {"error": str(e), "body": body}
        except Exception as e:
            time.sleep(2)
    return {"error": "max_retries"}


def api_post(endpoint, data):
    token = load_token()
    data["access_token"] = token
    qs = urllib.parse.urlencode(data).encode()
    req = urllib.request.Request(f"{API_BASE}/{endpoint}", data=qs, method="POST")
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", errors="replace")
            if e.code in (429, 400, 500):
                wait = (attempt + 1) * 5
                time.sleep(wait)
                continue
            return {"error": str(e), "body": body}
        except Exception as e:
            time.sleep(2)
    return {"error": "max_retries"}


def detect_campaign_type(name):
    n = name.upper()
    if "TEST" in n or "TESTING" in n:
        return "ABO"
    if n.startswith("ABO") or n.startswith("BIDCAP"):
        return "ABO"
    if n.startswith(("CBO", "BC_", "LC_", "TC_", "ON_LC_", "ON_BC_", "🌟", "GLW")):
        return "CBO"
    return "CBO"


def taglink_from_name(name):
    # Strip strategy prefix and trailing date/duplicates
    n = name.strip()
    for prefix in ("OFF_", "DEAD_", "🌟", "ON_LC_", "ON_BC_", "LC_", "BC_", "CBO_", "TC_", "BIDCAP_", "Scale_", "ABO_"):
        if n.startswith(prefix):
            n = n[len(prefix):]
            break
    parts = [p.strip().lower() for p in n.replace(" ", "_").split("_") if p.strip()]
    # Return first part that looks like a tag
    for p in parts:
        if p in TAGLINKS or p.startswith(tuple(t[:4] for t in TAGLINKS)):
            return p
    return None


def main():
    now = datetime.utcnow()
    since = (now - timedelta(days=7)).strftime("%Y-%m-%d")
    until = now.strftime("%Y-%m-%d")
    timestamp = now.strftime("%Y-%m-%d %H:%M:%S UTC")

    # 1) Token + account sanity
    token = load_token()
    sanity = api_get(f"{ACT_PREFIX}", {"fields": "account_name,name"})
    if "error" in sanity:
        report = {
            "timestamp": timestamp,
            "status": "BLOCKED",
            "error": sanity,
            "action": "none",
        }
        with open(REPORT_PATH, "w") as f:
            json.dump(report, f, indent=2)
        print(f"⛔ Account checks gagal: {sanity}")
        return

    acct_name = sanity.get("name", "N/A")

    # 2) Fetch campaigns
    camps = api_get(f"{ACT_PREFIX}/campaigns", {
        "fields": "id,name,status,effective_status,daily_budget,lifetime_budget",
        "limit": 200,
    })
    camp_list = camps.get("data", [])
    if not camp_list:
        report = {
            "timestamp": timestamp,
            "status": "EMPTY_INVENTORY",
            "account": acct_name,
            "active": 0,
            "off": sum(1 for c in camp_list if c.get("name", "").startswith("OFF_")),
            "star": 0,
            "action": "none",
            "spend_7d": 0,
        }
        with open(REPORT_PATH, "w") as f:
            json.dump(report, f, indent=2)
        print(f"🚨 1041 INVENTORY EMPTY — patrol tidak bisa klasifikasi")
        return

    # Separate paused campaigns for potential reactivation / kill
    all_ids = [c["id"] for c in camp_list]
    active_camps = [c for c in camp_list if c.get("status") == "ACTIVE"]
    off_camps = [c for c in camp_list if c.get("name", "").startswith("OFF_")]
    star_camps = [c for c in camp_list if c.get("name", "").startswith("🌟")]

    # 3) Fetch insights 7d
    insights_raw = api_get(f"{ACT_PREFIX}/insights", {
        "fields": "campaign_id,campaign_name,spend,cpc,clicks,ctr,impressions",
        "time_range": json.dumps({"since": since, "until": until}),
        "level": "campaign",
        "limit": 200,
        "filtering": json.dumps([{"field": "campaign.id", "operator": "IN", "value": all_ids}]),
    })
    insights = {}
    for row in insights_raw.get("data", []):
        cid = row.get("campaign_id")
        if cid:
            insights[cid] = row

    # 4) 3-Layer classification for ACTIVE campaigns
    kill_list = []
    watch_list = []
    star_list = []

    for c in active_camps:
        cid = c["id"]
        name = c.get("name", "")
        ins = insights.get(cid, {})
        spend = float(ins.get("spend", 0) or 0)
        cpc = float(ins.get("cpc", 0) or 0)
        clicks = int(ins.get("clicks", 0) or 0)
        ctr = float(ins.get("ctr", 0) or 0)
        impr = int(ins.get("impressions", 0) or 0)
        ctype = detect_campaign_type(name)

        # Layer 1: CPC hard kill
        if cpc > CPC_KILL and spend > SPEND_KILL:
            kill_list.append({
                "id": cid, "name": name, "cpc": cpc, "spend": spend,
                "reason": f"CPC {cpc:.0f} > {CPC_KILL} + spend {spend:.0f}",
            })
            continue

        # Layer 1: CPC danger
        danger_thresh = CPC_DANGER_CBO if ctype in ("CBO",) else CPC_DANGER_ABO
        if cpc > danger_thresh and spend > SPEND_DANGER:
            watch_list.append({
                "id": cid, "name": name, "cpc": cpc, "spend": spend,
                "reason": f"CPC {cpc:.0f} > {danger_thresh} + spend {spend:.0f}",
            })
            continue

        # Layer 2: CTR danger
        if ctr < CTR_DANGER and impr > IMPR_DANGER and spend > SPEND_DANGER:
            watch_list.append({
                "id": cid, "name": name, "ctr": ctr, "impr": impr,
                "reason": f"CTR {ctr:.2f}% < {CTR_DANGER}% + impr {impr}",
            })
            continue

        # Layer 3: superstar candidates
        if cpc < 120 and spend > 50000 and clicks > 0:
            star_list.append({
                "id": cid, "name": name, "cpc": cpc, "spend": spend, "clicks": clicks,
            })

    # 5) Execute actions: pause kills
    actions = []
    for item in kill_list:
        r = api_post(item["id"], {"status": "PAUSED"})
        ok = r.get("success") is True or "id" in r
        new_name = f"OFF_{item['name']}"
        api_post(item["id"], {"name": new_name})
        actions.append({
            "type": "KILL",
            "id": item["id"],
            "name": new_name,
            "ok": ok,
        })
        time.sleep(1.5)

    for item in watch_list:
        r = api_post(item["id"], {"status": "PAUSED"})
        ok = r.get("success") is True or "id" in r
        actions.append({"type": "PAUSE_WATCH", "id": item["id"], "name": item["name"], "ok": ok})
        time.sleep(1.5)

    for item in star_list:
        new_name = f"🌟_{item['name']}"
        r = api_post(item["id"], {"name": new_name})
        ok = r.get("success") is True or "id" in r
        actions.append({"type": "STAR", "id": item["id"], "name": new_name, "ok": ok})
        time.sleep(1.5)

    total_spend = sum(float(insights.get(c["id"], {}).get("spend", 0) or 0) for c in active_camps + [c for c in camp_list if c.get("status") == "ACTIVE"])

    report = {
        "timestamp": timestamp,
        "account": acct_name,
        "act_id": ACT_ID,
        "status": "OK",
        "active_count": len(active_camps),
        "off_count": len(off_camps),
        "star_count": len(star_camps),
        "kill_list": kill_list,
        "watch_list": watch_list,
        "star_list": star_list,
        "actions": actions,
        "spend_7d_rp": round(total_spend, 0),
    }
    with open(REPORT_PATH, "w") as f:
        json.dump(report, f, indent=2)

    # 6) Console + header report
    print(f"🛡️ SATPAM 1041 — {timestamp}")
    print(f"Account: {acct_name}")
    print(f"ACTIVE: {len(active_camps)} | OFF_: {len(off_camps)} | 🌟: {len(star_camps)}")
    print(f"💰 Spend 7d: Rp{total_spend:,.0f}")
    print()
    if kill_list:
        print("💀 KILL:")
        for k in kill_list:
            print(f"  • {k['name']} | CPC Rp{k['cpc']:.0f} | Spend Rp{k['spend']:.0f}")
    else:
        print("💀 KILL: (none)")
    print()
    if watch_list:
        print("👀 WATCH:")
        for w in watch_list:
            print(f"  • {w['name']} | {w['reason']}")
    else:
        print("👀 WATCH: (none)")
    print()
    if star_list:
        print("🌟 WINNERS:")
        for s in star_list:
            print(f"  • {s['name']} | CPC Rp{s['cpc']:.0f} | Spend Rp{s['spend']:.0f} | Clicks {s['clicks']}")
    else:
        print("🌟 WINNERS: (none)")
    print()
    if actions:
        print("📝 Actions taken:")
        for a in actions:
            mark = "✅" if a.get("ok") else "❌"
            print(f"  {mark} {a['type']}: {a['name']}")
    else:
        print("📝 No mutasi")


if __name__ == "__main__":
    main()
