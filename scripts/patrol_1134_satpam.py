#!/usr/bin/env python3
"""SATpam Patrol 1134 Glowscent - cron-safe standalone patrol (stdlib only)."""

import json
import os
import sys
import time
import urllib.request
import urllib.parse
import urllib.error
from datetime import datetime, timezone, timedelta

TOKEN_PATH = "/tmp/_tk_1134.txt"
ACT_ID = "2125021885010866"
API_VERSION = "v22.0"
API = f"https://graph.facebook.com/{API_VERSION}"
WIB = timezone(timedelta(hours=7))
TAGLINKS = {"abera", "pintulipatgeser", "hijab"}


def load_token():
    if not os.path.exists(TOKEN_PATH):
        raise RuntimeError(f"Token not found: {TOKEN_PATH}")
    with open(TOKEN_PATH) as f:
        token = f.read().strip()
    if not token:
        raise RuntimeError("Token file empty")
    return token


def api_get(endpoint, params=None, retries=3):
    token = load_token()
    qs = urllib.parse.urlencode({"access_token": token, **(params or {})})
    url = f"{API}/{endpoint}?{qs}"
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "patrol-1134/1.0"})
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read())
        except urllib.error.HTTPError as e:
            msg = e.read().decode()
            if e.code == 400 and "request limit" in msg.lower():
                wait = (attempt + 1) * 5
                print(f"[WARN] Rate limit hit, wait {wait}s...", flush=True)
                time.sleep(wait)
                continue
            if e.code == 400:
                # Some endpoints return error as body — bubble up to caller
                try:
                    return json.loads(msg)
                except Exception:
                    return {"error": msg}
            raise
        except Exception as e:
            if attempt < retries - 1:
                time.sleep(2)
                continue
            raise
    return {}


def api_post(endpoint, data, retries=3):
    if not endpoint.startswith("act_"):
        endpoint = f"act_{ACT_ID}/{endpoint}"
    token = load_token()
    data["access_token"] = token
    for k in list(data.keys()):
        if isinstance(data[k], (list, dict)):
            data[k] = json.dumps(data[k])
    qs = urllib.parse.urlencode(data).encode()
    url = f"{API}/{endpoint}"
    req = urllib.request.Request(url, data=qs, method="POST",
                                headers={"Content-Type": "application/x-www-form-urlencoded"})
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read())
        except urllib.error.HTTPError as e:
            msg = e.read().decode()
            if e.code == 400 and "request limit" in msg.lower():
                wait = (attempt + 1) * 5
                print(f"[WARN] Rate limit on POST, wait {wait}s...", flush=True)
                time.sleep(wait)
                continue
            if e.code == 400:
                try:
                    return json.loads(msg)
                except Exception:
                    return {"error": msg}
            raise
        except Exception as e:
            if attempt < retries - 1:
                time.sleep(2)
                continue
            raise
    return {}


def detect_campaign_type(name):
    n = name.upper()
    if "TEST" in n or "TESTING" in n:
        return "TEST"
    if n.startswith("ABO"):
        return "ABO"
    if n.startswith("BIDCAP"):
        return "BIDCAP"
    if n.startswith(("CBO", "BC_", "LC_", "TC_", "GLW")):
        return "CBO"
    if n.startswith("ON_LC"):
        return "CBO"
    if n.startswith("TC_"):
        return "CBO"
    return "CBO"


def extract_taglink(name):
    """Extract taglink from campaign name — first known tag found."""
    low = name.lower()
    for t in TAGLINKS:
        if t in low:
            return t
    return None


def main():
    print("[INFO] Loading token...", flush=True)
    token = load_token()
    print(f"[INFO] Token length: {len(token)}", flush=True)
    print(f"[INFO] Account: {ACT_ID}", flush=True)

    # 1. Fetch campaigns
    print("[INFO] Fetching campaigns...", flush=True)
    camps_resp = api_get(
        f"act_{ACT_ID}/campaigns",
        {"fields": "id,name,status,daily_budget,effective_status", "limit": 200},
    )
    if "data" not in camps_resp:
        print(f"[ERROR] Campaigns fetch failed: {camps_resp}", flush=True)
        return

    camps = camps_resp["data"]
    time.sleep(1.5)

    print(f"[INFO] Total campaigns fetched: {len(camps)}", flush=True)

    # 2. Fetch 7-day insights (campaign-level)
    since = (datetime.now(WIB) - timedelta(days=7)).strftime("%Y-%m-%d")
    until = datetime.now(WIB).strftime("%Y-%m-%d")
    print(f"[INFO] Insights window: {since} → {until}", flush=True)

    insights_resp = api_get(
        f"act_{ACT_ID}/insights",
        {
            "fields": "campaign_id,campaign_name,spend,cpc,clicks,ctr,impressions",
            "level": "campaign",
            "time_range": json.dumps({"since": since, "until": until}),
            "limit": 200,
        },
    )
    time.sleep(1.5)

    insights = {}
    if "data" in insights_resp:
        for row in insights_resp["data"]:
            cid = row.get("campaign_id", "")
            if cid:
                insights[cid] = row
    print(f"[INFO] Insights rows: {len(insights)}", flush=True)

    # Build campaign lookup
    by_id = {}
    for c in camps:
        by_id[c["id"]] = {
            "id": c["id"],
            "name": c["name"],
            "status": c.get("status", ""),
            "effective_status": c.get("effective_status", ""),
            "campaign_type": detect_campaign_type(c["name"]),
            "taglink": extract_taglink(c["name"]),
            "spend": 0,
            "cpc": 0,
            "clicks": 0,
            "ctr": 0,
            "impressions": 0,
        }

    for cid, ins in insights.items():
        if cid in by_id:
            by_id[cid]["spend"] = float(ins.get("spend", 0) or 0)
            by_id[cid]["cpc"] = float(ins.get("cpc", 0) or 0)
            by_id[cid]["clicks"] = int(float(ins.get("clicks", 0) or 0))
            by_id[cid]["ctr"] = float(ins.get("ctr", 0) or 0)
            by_id[cid]["impressions"] = int(float(ins.get("impressions", 0) or 0))

    # Stats
    active = []
    off_ = []
    stars = []
    killed = []
    watch = []
    total_spend = 0.0

    for c in by_id.values():
        if c["status"] != "ACTIVE":
            if c["name"].startswith("OFF_") or c["name"].startswith("DEAD_"):
                off_.append(c)
            continue

        total_spend += c["spend"]
        cpc = c["pc_h"] if False else c["cpc"]
        spend = c["spend"]
        clicks = c["clicks"]
        ctr = c["ctr"]
        impr = c["impressions"]
        tag = c["taglink"]
        ctype = c["campaign_type"]

        # Win detection
        is_winner = False

        # Layer 1 — CPC kill (hard)
        if cpc > 400 and spend > 2000:
            killed.append(c)
            if __name__ == "__main__":
                pass
        # Layer 1 — CPC watch
        elif ctype == "CBO" and cpc > 140 and spend > 5000:
            watch.append(c)
        elif ctype in ("ABO", "BIDCAP", "TEST") and cpc > 250 and spend > 5000:
            watch.append(c)
        # Layer 2 — CTR watch
        elif ctr < 1.0 and impr > 1000 and spend > 0:
            watch.append(c)
        # Star: CPC < 140 + spend > 50K + clicks > 0
        elif cpc < 140 and spend > 50000 and clicks > 0:
            stars.append(c)
            is_winner = True
        else:
            active.append(c)

    # Print patrol report in required format
    ts = datetime.now(WIB).strftime("%Y-%m-%d %H:%M WIB")
    print("", flush=True)
    print(f"🛡️ SATPAM 1134 — {ts}", flush=True)

    # Kills
    killed_names = []
    for c in killed:
        name = c["name"].replace("ON_", "").replace("LC_", "").replace(c["name"], c["name"])
        killed_names.append(f"{c['name']} (CPC: Rp {int(c['cpc'])}, spend: Rp {int(c['spend'])})")

    # Watch
    watch_names = []
    for c in watch:
        watch_names.append(f"{c['name']} (CPC: Rp {int(c['cpc'])}, spend: Rp {int(c['spend'])})")

    # Winners
    winner_names = []
    for c in stars:
        winner_names.append(f"{c['name']} (spend: Rp {int(c['spend'])}, clicks: {c['clicks']})")

    print(f"ACTIVE: {len(active)} | OFF_: {len(off_)} | 🌟: {len(stars)}", flush=True)
    print(f"⚠️ KILL: {'; '.join(killed_names) if killed_names else 'none'}", flush=True)
    print(f"👀 WATCH: {'; '.join(watch_names[:10]) if watch_names else 'none'}", flush=True)
    print(f"🌟 WINNERS: {'; '.join(winner_names[:10]) if winner_names else 'none'}", flush=True)
    print(f"💰 Spend 7d: Rp{int(total_spend):,}", flush=True)

    # 3. Execute actions
    actions_taken = []
    for c in killed:
        # Rename to OFF_ + pause (already paused?)
        if not c["name"].startswith("OFF_"):
            new_name = f"OFF_{c['name']}"
            r = api_post(c["id"], {"name": new_name})
            time.sleep(1.5)
            actions_taken.append(f"RENAME {c['name']} → {new_name}")

    # Pause watch campaigns
    for c in watch:
        if c["status"] == "ACTIVE":
            r = api_post(c["id"], {"status": "PAUSED"})
            time.sleep(1.5)
            actions_taken.append(f"PAUSE {c['name']}")
            # also rename with 🌟_ prefix if actually winner CPC
            c_type = c["campaign_type"]
            if c["cpc"] < 140 and c["spend"] > 50000 and c["clicks"] > 0:
                new_name = f"🌟_{c['name']}"
                r = api_post(c["id"], {"name": new_name})
                time.sleep(1.5)
                actions_taken.append(f"RENAME → {new_name}")

    print("", flush=True)
    if actions_taken:
        print("ACTIONS:", flush=True)
        for a in actions_taken:
            print(f"  • {a}", flush=True)
    else:
        print("ACTIONS: none required", flush=True)

    print("", flush=True)
    print("[INFO] Patrol 1134 complete.", flush=True)


if __name__ == "__main__":
    main()
