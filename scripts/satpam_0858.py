#!/usr/bin/env python3
"""SATPAM 0858 — 3-Layer Decision Engine Patrol"""
import os, sys, json, time, urllib.request, urllib.parse, urllib.error
from datetime import datetime, timedelta

ACT_ID = "435670549443081"
ACCOUNT = "0858"
BASE = f"https://graph.facebook.com/v22.0/act_{ACT_ID}"

# cfg
CPC_KILL = 200
CPC_DANGER_CBO = 120
CPC_DANGER_ABO = 250
SPEND_KILL = 2000
SPEND_WATCH = 5000
SPEND_WINNER = 50000
CTR_WATCH = 1.0
WIN_DELAY = 1.5

def get_token():
    with open("/home/openclaw/projects/1ai-ads/.env") as f:
        for line in f:
            if line.startswith("META_ACCESS_TOKEN="):
                return line.strip().split("=", 1)[1]
    raise RuntimeError("META_ACCESS_TOKEN not found")

def api_get(endpoint, params=""):
    url = f"{BASE}/{endpoint}?{params}&access_token={urllib.parse.quote(get_token(), safe='')}"
    req = urllib.request.Request(url)
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            body = e.read().decode()
            if e.code == 400 or "request limit" in body.lower() or "2446079" in body:
                wait = (attempt + 1) * 5
                print(f"[RATE] Sleeping {wait}s (attempt {attempt+1})")
                time.sleep(wait)
                continue
            raise
    raise RuntimeError("Meta API: max retries exceeded")

def api_post(endpoint, data):
    d = dict(data)
    d["access_token"] = get_token()
    qs = urllib.parse.urlencode(d).encode()
    path = f"{BASE}/{endpoint}"
    for attempt in range(3):
        try:
            req = urllib.request.Request(path, data=qs, method="POST")
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            body = e.read().decode()
            if "request limit" in body.lower() or "2446079" in body:
                wait = (attempt + 1) * 5
                print(f"[RATE_POST] Sleeping {wait}s")
                time.sleep(wait)
                continue
            raise
    raise RuntimeError("Meta API POST: max retries exceeded")

def detect_type(name):
    n = name.upper()
    if "TEST" in n or "TESTING" in n:
        return "TEST"
    if n.startswith("ABO"):
        return "ABO"
    if n.startswith("BIDCAP"):
        return "BIDCAP"
    if n.startswith(("CBO", "BC_", "LC_", "TC_")):
        return "CBO"
    if n.startswith("ON_LC_") or n.startswith("🌟_"):
        return "CBO"
    return "CBO"  # default

def main():
    print("=== SATPAM 0858 ===")
    since = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
    until = datetime.now().strftime("%Y-%m-%d")

    # campaigns
    camps_raw = api_get("campaigns", 'fields=id,name,status,campaign_type&limit=200')
    camps = {c["id"]: c for c in camps_raw.get("data", [])}
    all_ids = list(camps.keys())
    time.sleep(WIN_DELAY)

    # insights
    insights_raw = api_get("insights",
        f'fields=campaign_id,campaign_name,spend,cpc,clicks,ctr,impressions&level=campaign&time_range={{"since":"{since}","until":"{until}"}}&limit=500')
    insights = {}
    for row in insights_raw.get("data", []):
        cid = row["campaign_id"]
        spend = float(row.get("spend", 0) or 0)
        cpc = float(row.get("cpc", 0) or 0)
        clicks = int(row.get("clicks", 0) or 0)
        ctr = float(row.get("ctr", 0) or 0)
        impr = int(row.get("impressions", 0) or 0)
        insights[cid] = {"spend": spend, "cpc": cpc, "clicks": clicks, "ctr": ctr, "impressions": impr}
    time.sleep(WIN_DELAY)

    # adrules
    try:
        rules_raw = api_get("adrules_library", 'fields=id,name,execution_spec&limit=50')
        rules = rules_raw.get("data", [])
    except Exception as e:
        print(f"[WARN] adrules fetch failed: {e}")
        rules = []
    time.sleep(WIN_DELAY)

    # analysis
    kills = []
    watches = []
    winners = []
    total_spend = 0.0
    active_counter = 0
    off_counter = 0
    conflicting = []

    for r in rules:
        name = r.get("name", "").lower()
        if "cp" in name or "kill" in name or "spent" in name:
            conflicting.append(r.get("name", r.get("id")))

    for cid, camp in camps.items():
        total_spend += insights.get(cid, {}).get("spend", 0)
        st = camp.get("status", "")
        name = camp.get("name", "")
        if "OFF_" in name:
            off_counter += 1
            continue
        if st == "ACTIVE":
            active_counter += 1
        ins = insights.get(cid, {})
        spend = ins.get("spend", 0)
        cpc = ins.get("cpc", 0)
        clicks = ins.get("clicks", 0)
        ctr = ins.get("ctr", 0)
        impr = ins.get("impressions", 0)
        ctype = detect_type(name)

        # Layer 1 CPC
        cpc_danger = CPC_DANGER_CBO if ctype == "CBO" else CPC_DANGER_ABO
        if cpc > CPC_KILL and spend > SPEND_KILL:
            kills.append((name, f"CPC Rp{cpc:,.0f} > {CPC_KILL} + spend Rp{spend:,.0f}"))
        elif cpc > cpc_danger and spend > SPEND_WATCH:
            watches.append((name, f"CPC Rp{cpc:,.0f} > {cpc_danger}"))

        # Layer 2 CTR
        if ctr < CTR_WATCH and impr > 1000:
            s = f"CTR {ctr:.2f}% < {CTR_WATCH}% + impr {impr:,}"
            if (name, s) not in watches:
                watches.append((name, s))

        # Layer 3 winner
        if cpc < CPC_DANGER_CBO and spend > SPEND_WINNER and clicks > 0 and not name.startswith("OFF_") and not name.startswith("🌟_"):
            winners.append(name)

    # execute actions
    for cid, camp in camps.items():
        name = camp.get("name", "")
        ins = insights.get(cid, {})
        spend = ins.get("spend", 0)
        cpc = ins.get("cpc", 0)
        ctype = detect_type(name)
        cpc_danger = CPC_DANGER_CBO if ctype == "CBO" else CPC_DANGER_ABO

        # KILL
        if cpc > CPC_KILL and spend > SPEND_KILL and not name.startswith("OFF_"):
            new = f"OFF_{name}"
            api_post(str(cid), {"name": new})
            api_post(str(cid), {"status": "PAUSED"})
            print(f"  🔴 KILL → {name} — OFF_ + PAUSED")
            time.sleep(WIN_DELAY)

        # WATCH (CPC danger or CTR low) → PAUSE if CBO
        if camp.get("status") == "ACTIVE":
            cpc_dng = (cpc > cpc_danger and spend > SPEND_WATCH)
            ctr_low = (ins.get("ctr", 0) < CTR_WATCH and ins.get("impressions", 0) > 1000)
            if cpc_dng or ctr_low:
                api_post(str(cid), {"status": "PAUSED"})
                print(f"  🟡 WATCH → {name} — PAUSED (cpc={cpc:,.0f} ctr={ins.get('ctr',0):.1f}%)")
                time.sleep(WIN_DELAY)

        # WINNER → 🌟_
        if cpc < CPC_DANGER_CBO and spend > SPEND_WINNER and ins.get("clicks", 0) > 0 and not name.startswith("🌟_") and not name.startswith("OFF_"):
            api_post(str(cid), {"name": f"🌟_{name}"})
            print(f"  🟢 WINNER → {name} → 🌟_")
            time.sleep(WIN_DELAY)

    print("\n=== REPORT ===")
    print(f"🛡️ SATPAM 0858 — {datetime.now().strftime('%Y-%m-%d %H:%M WIB')}")
    print(f"ACTIVE: ~{active_counter} | OFF_: {off_counter}")
    print(f"⚠️ KILL ({len(kills)}): " + "; ".join(n for n,_ in kills[:10]) if kills else "⚠️ KILL: 0")
    print(f"👀 WATCH ({len(watches)}):")
    for n, r in watches[:10]:
        print(f"   • {n}: {r}")
    print(f"🌟 WINNERS ({len(winners)}): " + ", ".join(winners[:10]) if winners else "🌟 WINNERS: 0")
    print(f"💰 Total spend 7d: Rp{total_spend:,.0f}")
    if conflicting:
        print(f"⚠️ CONFLICTING RULES: {', '.join(conflicting[:5])}")
    print("=== END ===")

if __name__ == "__main__":
    main()
