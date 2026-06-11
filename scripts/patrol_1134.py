#!/usr/bin/env python3
"""Standalone patrol for Meta Ads act_2125021885010866 (Glowscent)."""
import json
import os
import time
import urllib.request
import urllib.parse
import urllib.error
from datetime import datetime, timezone, timedelta

TOKEN_PATH = "/tmp/_tk_1134.txt"
ACCT = "act_2125021885010866"
API = "https://graph.facebook.com/v22.0"
WIB = timezone(timedelta(hours=7))


def load_token():
    with open(TOKEN_PATH) as f:
        token = f.read().strip()
    if not token:
        raise RuntimeError("Token file empty")
    return token


def api_get(endpoint, params=None):
    token = load_token()
    qs = urllib.parse.urlencode({**(params or {}), "access_token": token})
    url = f"{API}/{endpoint}?{qs}"
    req = urllib.request.Request(url, headers={"User-Agent": "patrol-1134/1.1"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())


def paginated_get(endpoint, params):
    items = []
    next_url = None
    while True:
        if next_url:
            req = urllib.request.Request(next_url, headers={"User-Agent": "patrol-1134/1.1"})
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read())
        else:
            data = api_get(endpoint, params)
        if "data" in data:
            items.extend(data["data"])
        if data.get("paging", {}).get("next"):
            next_url = data["paging"]["next"]
            time.sleep(1.5)
        else:
            break
    return items


def classify_type(name):
    n = name.upper()
    if n.startswith(("ABO", "TEST")):
        return "ABO"
    if n.startswith(("CBO", "BC_", "LC_", "TC_", "GLW", "ON_LC")):
        return "CBO"
    return "CBO"


def main():
    token = load_token()
    if not ACCT.startswith("act_"):
        acct = f"act_{ACCT}"
    else:
        acct = ACCT

    # Verify account access
    me = api_get("me")
    if "error" in me:
        raise SystemExit(f"[FATAL] Token invalid or access denied: {me['error']}")

    acct_info = api_get(acct, {"fields": "id,name"})
    if "error" in acct_info:
        raise SystemExit(f"[FATAL] Account access denied: {acct_info['error']}")
    acct_name = acct_info.get("name", "Unknown")

    # 1. Fetch campaigns
    campaigns = paginated_get(
        f"{acct}/campaigns",
        {"fields": "id,name,status", "limit": 200},
    )
    time.sleep(1.5)

    # 2. Fetch 7-day insights in batches of 50
    now = datetime.now(WIB)
    since = (now - timedelta(days=7)).strftime("%Y-%m-%d")
    until = now.strftime("%Y-%m-%d")
    insights = {}
    ids = [c["id"] for c in campaigns]
    for i in range(0, len(ids), 50):
        batch = ids[i:i+50]
        batch_filter = json.dumps({"campaign.id": {"in": batch}})
        rows = paginated_get(
            f"{acct}/insights",
            {
                "fields": "campaign_id,spend,cpc,ctr,clicks,impressions",
                "level": "campaign",
                "time_range": json.dumps({"since": since, "until": until}),
                "filtering": batch_filter,
                "limit": 200,
            },
        )
        for r in rows:
            cid = r.get("campaign_id")
            if cid:
                insights[cid] = r
        time.sleep(1.5)

    lookup = {}
    for c in campaigns:
        lookup[c["id"]] = {
            "id": c["id"],
            "name": c.get("name", ""),
            "status": c.get("status", ""),
            "ctype": classify_type(c.get("name", "")),
            "spend": 0.0,
            "cpc": 0.0,
            "ctr": 0.0,
            "clicks": 0,
            "impressions": 0,
        }
    for cid, ins in insights.items():
        if cid in lookup:
            lookup[cid]["spend"] = float(ins.get("spend", 0) or 0)
            lookup[cid]["cpc"] = float(ins.get("cpc", 0) or 0)
            lookup[cid]["ctr"] = float(ins.get("ctr", 0) or 0)
            lookup[cid]["clicks"] = int(float(ins.get("clicks", 0) or 0))
            lookup[cid]["impressions"] = int(float(ins.get("impressions", 0) or 0))

    active, off_paused, winners = [], [], []
    killed_list, watch_list = [], []
    total_spend = 0.0

    for c in lookup.values():
        if c["status"] != "ACTIVE":
            off_paused.append(c)
            continue
        total_spend += c["spend"]
        cpc = c["cpc"]
        spend = c["spend"]
        clicks = c["clicks"]
        ctr = c["ctr"]
        impr = c["impressions"]
        ctype = c["ctype"]

        if cpc > 400 and spend > 2000:
            killed_list.append(c)
        elif ctype == "CBO" and cpc > 140 and spend > 5000:
            watch_list.append(c)
        elif ctype == "ABO" and cpc > 250 and spend > 5000:
            watch_list.append(c)
        elif ctr < 1.0 and impr > 1000:
            watch_list.append(c)
        elif cpc < 140 and spend > 50000 and clicks > 0:
            winners.append(c)
        else:
            active.append(c)

    ts = datetime.now(WIB).strftime("%Y-%m-%d %H:%M WIB")
    print()
    print(f"🛡️ SATPAM 1134 — {ts}")
    print(f"ACCOUNT: {acct_name}")
    print(f"ACTIVE: {len(active)} | OFF/PAUSED: {len(off_paused)} | 🌟: {len(winners)}")

    print(f"⚠️ KILL ({len(killed_list)}):")
    for c in killed_list:
        print(f"  • {c['name']} | CPC Rp{c['cpc']:.0f} | spend Rp{c['spend']:.0f}")

    print(f"👀 WATCH ({len(watch_list)}):")
    for c in watch_list:
        print(f"  • {c['name']} | CTR {c['ctr']:.2f}% | impressions {c['impressions']} | spend Rp{c['spend']:.0f}")

    print(f"🌟 WINNERS ({len(winners)}):")
    for c in winners:
        print(f"  • {c['name']} | spend Rp{c['spend']:.0f} | clicks {c['clicks']} | CPC Rp{c['cpc']:.0f}")

    print(f"💰 Spend 7d: Rp{int(total_spend):,}")


if __name__ == "__main__":
    main()
