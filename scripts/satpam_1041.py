#!/usr/bin/env python3
"""SATPAM 1041 — 5-minute patrol for act_380721031313330"""
import json
import time
import urllib.request
import urllib.error
from datetime import datetime

ACCOUNT_ID = "380721031313330"
TOKEN_PATH = "/home/openclaw/projects/1ai-ads/.env"
BASE_URL = f"https://graph.facebook.com/v22.0/act_{ACCOUNT_ID}"
HEADERS = {"User-Agent": "Mozilla/5.0"}

# --- helpers ---
def api_get(path, params=None):
    """GET with token from .env, delay 0.5s"""
    time.sleep(0.5)
    params = params or {}
    params["access_token"] = read_token()
    url = f"{BASE_URL}{path}?" + "&".join(f"{k}={urllib.parse.quote(str(v))}" for k,v in params.items())
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        try:
            return {"error": json.loads(body)}
        except Exception:
            return {"error": {"message": body, "code": e.code}}


def api_post(path, body):
    """POST with token, delay 0.5s"""
    time.sleep(0.5)
    body["access_token"] = read_token()
    data = json.dumps(body).encode()
    url = f"{BASE_URL}{path}"
    req = urllib.request.Request(url, data=data, headers=HEADERS, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        body_r = e.read().decode()
        try:
            return {"error": json.loads(body_r)}
        except Exception:
            return {"error": {"message": body_r, "code": e.code}}


def read_token():
    line = open(TOKEN_PATH).readline()
    if "=" in line:
        return line.split("=", 1)[1].strip().strip('"').strip("'")
    return line.strip()


def rupiah(amount):
    """Format float to Rp integer"""
    return f"Rp{int(round(amount)):,}"


# --- MAIN ---
import urllib.parse

def main():
    ts = datetime.now().strftime("%Y-%m-%d %H:%M WIB")

    # LANGKAH 1: Fetch campaigns
    print(f"[{ts}] Fetching campaigns...", flush=True)
    camp_resp = api_get("/campaigns", {
        "fields": "id,name,status",
        "limit": 200
    })

    if "error" in camp_resp:
        print(f"ERROR fetching campaigns: {camp_resp['error']}", flush=True)
        return

    campaigns = camp_resp.get("data", [])
    print(f"  Found {len(campaigns)} campaigns", flush=True)

    # LANGKAH 1b: Fetch insights 7 hari (level=campaign)
    print(f"  Fetching 7d insights...", flush=True)
    insights_resp = api_get("/insights", {
        "fields": "campaign_id,campaign_name,spend,clicks,cpc,ctr",
        "time_range": json.dumps({"since": (datetime.now().timestamp() - 7*24*3600)//1, "until": datetime.now().timestamp()//1}),
        "level": "campaign"
    })

    if "error" in insights_resp:
        print(f"ERROR fetching insights: {insights_resp['error']}", flush=True)
        return

    insights_raw = insights_resp.get("data", [])
    print(f"  Got {len(insights_raw)} insight rows", flush=True)

    # Build insight map by campaign_id
    insights_by_camp = {}
    for row in insights_raw:
        cid = row.get("campaign_id")
        if cid:
            insights_by_camp[cid] = row

    # Calculate totals
    total_spend = 0.0
    total_clicks = 0
    active_count = 0
    camp_stats = []

    for c in campaigns:
        if c.get("status") not in ("ACTIVE", "PAUSED"):
            continue
        cid = c["id"]
        ins = insights_by_camp.get(cid, {})
        spend = float(ins.get("spend", 0) or 0)
        clicks = int(ins.get("clicks", 0) or 0)
        cpc = float(ins.get("cpc", 0) or 0)
        ctr = float(ins.get("ctr", 0) or 0)
        name = c.get("name", "")
        status = c.get("status", "")

        if status == "ACTIVE":
            active_count += 1

        total_spend += spend
        total_clicks += clicks

        camp_stats.append({
            "id": cid,
            "name": name,
            "status": status,
            "spend": spend,
            "clicks": clicks,
            "cpc": cpc,
            "ctr": ctr
        })

    global_cpc = total_spend / total_clicks if total_clicks > 0 else 0.0
    print(f"\n[GLOBAL] spend={rupiah(total_spend)} clicks={total_clicks} cpc={global_cpc:.2f}", flush=True)

    # LANGKAH 2: Decision logic
    # Layer 0: Global CPC gate
    if global_cpc >= 120:
        gate_mode = "FULL"
    elif global_cpc >= 81:
        gate_mode = "WATCH"
    else:
        gate_mode = "AMAN"

    print(f"[GATE] mode={gate_mode}", flush=True)

    monster_list = []
    watch_list = []
    winner_list = []
    lc_scale_list = []

    for c in camp_stats:
        cid = c["id"]
        name = c["name"]
        status = c["status"]
        spend = c["spend"]
        clicks = c["clicks"]
        cpc = c["cpc"]

        if status != "ACTIVE":
            continue

        # 💀 MONSTER always applies
        if cpc >= 500 and spend > 1000:
            # Rename OFF_ + PAUSE
            off_name = f"OFF_{name}" if not name.startswith("OFF_") else name
            r = api_post(f"/{cid}", {"name": off_name, "status": "PAUSED"})
            print(f"  💀 MONSTER: {name} → OFF_ + PAUSE (cpc={cpc:.2f} spend={rupiah(spend)})", flush=True)
            if "error" in r:
                print(f"     ERROR: {r['error']}", flush=True)
            monster_list.append(name)
            continue

        if cpc >= 1000 and spend > 500:
            off_name = f"OFF_{name}" if not name.startswith("OFF_") else name
            r = api_post(f"/{cid}", {"name": off_name, "status": "PAUSED"})
            print(f"  💀 MONSTER: {name} → OFF_ + PAUSE (cpc={cpc:.2f} spend={rupiah(spend)})", flush=True)
            if "error" in r:
                print(f"     ERROR: {r['error']}", flush=True)
            monster_list.append(name)
            continue

        # 👀 CPC > 200 + 0 clicks + spend > 500 → PAUSE
        if cpc > 200 and clicks == 0 and spend > 500:
            r = api_post(f"/{cid}", {"status": "PAUSED"})
            print(f"  👀 WATCH PCR: {name} → PAUSE (cpc={cpc:.2f} clicks=0 spend={rupiah(spend)})", flush=True)
            if "error" in r:
                print(f"     ERROR: {r['error']}", flush=True)
            watch_list.append(name)
            continue

        # CPC > 200 + clicks > 0 → report JANGAN pause
        if cpc > 200 and clicks > 0:
            print(f"  👀 WATCH RPT: {name} (cpc={cpc:.2f} clicks={clicks} spend={rupiah(spend)}) — no action", flush=True)
            watch_list.append(name)

        # 🌟 WINNER only if global CPC < 120
        if gate_mode == "AMAN" or gate_mode == "WATCH":
            if cpc < 120 and clicks > 5 and spend > 10000:
                star_name = f"🌟_{name}" if not name.startswith("🌟_") else name
                r = api_post(f"/{cid}", {"name": star_name})
                print(f"  🌟 WINNER: {name} → 🌟_ (cpc={cpc:.2f} clicks={clicks} spend={rupiah(spend)})", flush=True)
                if "error" in r:
                    print(f"     ERROR: {r['error']}", flush=True)
                winner_list.append(name)

        # 💰 LC SCALE: campaign with "LC" in name, CPC < 120, clicks > 0
        if "LC" in name.upper() and cpc < 120 and clicks > 0:
            lc_scale_list.append(name)
            print(f"  💰 LC SCALE: {name} (cpc={cpc:.2f} clicks={clicks})", flush=True)
            # Note: budget scaling logic requires current campaign data; 
            # actual scaling would need campaign details — flagging here

    # Report
    print("\n" + "="*60, flush=True)
    print(f"🛡️ SATPAM 1041 {ts}", flush=True)
    print(f"ACTIVE:{active_count} | Global CPC:{rupiah(global_cpc)}", flush=True)
    print(f"💀 MONSTER: {', '.join(monster_list) if monster_list else 'none'}", flush=True)
    print(f"👀 WATCH: {', '.join(watch_list) if watch_list else 'none'}", flush=True)
    print(f"🌟: {', '.join(winner_list) if winner_list else 'none'}", flush=True)
    print(f"💰 LC: {', '.join(lc_scale_list) if lc_scale_list else 'none'}", flush=True)
    print("="*60, flush=True)

if __name__ == "__main__":
    main()
