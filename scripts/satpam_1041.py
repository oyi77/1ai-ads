#!/usr/bin/env python3
import json, os, time, urllib.request, urllib.parse
from datetime import datetime, timedelta

ENV_PATH = "/home/openclaw/projects/1ai-ads/.env"
ACT_ID = "380721031313330"
API_BASE = "https://graph.facebook.com/v22.0"
SINCE = (datetime.utcnow() - timedelta(days=7)).strftime("%Y-%m-%d")
UNTIL = datetime.utcnow().strftime("%Y-%m-%d")

def load_token():
    for line in open(ENV_PATH).read().splitlines():
        if not line or line.startswith("#"):
            continue
        key = line.split("=", 1)[0]
        if key == "META_ACCESS_TOKEN":
            return line.split("=", 1)[1].strip()
    raise RuntimeError("META_ACCESS_TOKEN missing")

TOKEN = load_token()
print(f"Token loaded: {len(TOKEN)} chars", flush=True)

def api_get(path, params=None):
    url = f"{API_BASE}/{path}"
    qs = {"access_token": TOKEN}
    if params:
        qs.update(params)
    full = f"{url}?{urllib.parse.urlencode(qs)}"
    req = urllib.request.Request(full)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())

def safe_post(endpoint, data):
    data["access_token"] = TOKEN
    qs = urllib.parse.urlencode(data).encode()
    req = urllib.request.Request(f"{API_BASE}/{endpoint}", data=qs, method="POST")
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())

def detect_type(name):
    n = name.upper()
    if any(p in n for p in ["CBO", "BC_", "LC_", "TC_", "🌟_", "ON_LC_", "ON_BC"]):
        return "CBO"
    if n.startswith("ABO") or n.startswith("BIDCAP") or "TEST" in n:
        return "ABO"
    return "CBO"

def main():
    print("Fetching campaigns...", flush=True)
    camp_resp = api_get(f"act_{ACT_ID}/campaigns", {"fields": "id,name,status", "limit": 200})
    campaigns = camp_resp.get("data", [])
    print(f"Total campaigns: {len(campaigns)}", flush=True)
    time.sleep(1.5)

    print("Fetching insights...", flush=True)
    insights = {}
    ins_resp = api_get(
        f"act_{ACT_ID}/insights",
        {
            "fields": "campaign_id,campaign_name,spend,clicks,cpc,ctr,impressions",
            "time_range": json.dumps({"since": SINCE, "until": UNTIL}),
            "level": "campaign",
            "limit": 200,
        },
    )
    for row in ins_resp.get("data", []):
        cid = row.get("campaign_id")
        if cid:
            insights[cid] = row
    while ins_resp.get("paging", {}).get("next"):
        req = urllib.request.Request(ins_resp["paging"]["next"])
        with urllib.request.urlopen(req, timeout=30) as resp:
            ins_resp = json.loads(resp.read())
        for row in ins_resp.get("data", []):
            cid = row.get("campaign_id")
            if cid:
                insights[cid] = row
        time.sleep(1.5)
    print(f"Insight rows: {len(insights)}", flush=True)

    killed = []
    watch = []
    winners = []
    total_spend = 0.0
    final_active = 0
    final_off = 0
    final_winner = 0

    for c in campaigns:
        cid = c["id"]
        name = c["name"]
        status = c["status"]
        i = insights.get(cid, {})
        spend = float(i.get("spend", 0) or 0)
        clicks = int(i.get("clicks", 0) or 0)
        cpc = float(i.get("cpc", 0) or 0)
        ctr = float(i.get("ctr", 0) or 0)
        impr = int(i.get("impressions", 0) or 0)
        total_spend += spend
        ctype = detect_type(name)
        is_off = name.startswith("OFF_") or name.startswith("DEAD_")

        if status == "ACTIVE" and not is_off:
            try:
                if cpc > 200 and spend > 2000:
                    new_name = f"OFF_{name}"
                    safe_post(cid, {"name": new_name})
                    time.sleep(0.5)
                    safe_post(cid, {"status": "PAUSED"})
                    killed.append((name, cpc, spend, "CPC>200"))
                    time.sleep(1.5)
                elif (ctype == "CBO" and cpc > 120 and spend > 5000) or (
                    ctype == "ABO" and cpc > 250 and spend > 5000
                ):
                    safe_post(cid, {"status": "PAUSED"})
                    watch.append((name, cpc, spend, f"CPC danger ({ctype})"))
                    time.sleep(1.5)
                elif ctr < 1 and impr > 1000:
                    safe_post(cid, {"status": "PAUSED"})
                    watch.append((name, cpc, spend, f"CTR {ctr:.2f}%"))
                    time.sleep(1.5)
                elif cpc < 120 and spend > 50000 and clicks > 0:
                    new_name = f"🌟_{name}"
                    safe_post(cid, {"name": new_name})
                    winners.append((name, cpc, spend, clicks))
                    time.sleep(1.5)
                else:
                    pass
            except Exception as e:
                print(f"Error acting on {name}: {e}", flush=True)

    print("Re-fetching final state...", flush=True)
    time.sleep(2)
    final = api_get(f"act_{ACT_ID}/campaigns", {"fields": "name,status", "limit": 200})
    data = final.get("data", [])
    final_active = sum(1 for c in data if c["status"] == "ACTIVE" and not c["name"].startswith(("OFF_", "DEAD_")))
    final_off = sum(1 for c in data if c["name"].startswith("OFF_") or c["name"].startswith("DEAD_"))
    final_winner = sum(1 for c in data if c["name"].startswith("🌟_"))

    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    lines = [
        f"🛡️ SATPAM 1041 — {ts}",
        f"ACTIVE: {final_active} | OFF_: {final_off} | 🌟: {final_winner}",
    ]
    if killed:
        lines.append("⚠️ KILL: " + "; ".join([f"{n} (CPC {cp:.0f}, Rp {sp:,.0f})" for n, cp, sp, _ in killed]))
    else:
        lines.append("⚠️ KILL: None")
    if watch:
        lines.append("👀 WATCH: " + "; ".join([f"{n} ({reason})" for n, cp, sp, reason in watch]))
    else:
        lines.append("👀 WATCH: None")
    if winners:
        lines.append("🌟 WINNERS: " + "; ".join([f"{n} (CPC {cp:.0f}, Rp {sp:,.0f}, clicks {cl})" for n, cp, sp, cl in winners]))
    else:
        lines.append("🌟 WINNERS: None")
    lines.append(f"💰 Spend 7d: Rp {total_spend:,.0f}")
    print("\n".join(lines), flush=True)

if __name__ == "__main__":
    main()
