#!/usr/bin/env python3
"""SATPAM 1041 — patrol 5 menit."""
import json, time, urllib.request, urllib.parse, datetime

ACT_ID = "380721031313330"
API = "https://graph.facebook.com/v22.0"
ENV_PATH = "/home/openclaw/projects/1ai-ads/.env"

def load_token():
    with open(ENV_PATH) as f:
        for line in f:
            if line.startswith("META_ACCESS_TOKEN="):
                return line.split("=", 1)[1].strip()
    raise RuntimeError("META_ACCESS_TOKEN not found")

TOKEN = load_token()

def api_get(path, params=None):
    url = f"{API}/act_{ACT_ID}/{path}"
    if params:
        qs = []
        for k, v in params.items():
            if isinstance(v, (dict, list)):
                v = json.dumps(v)
            qs.append(f"{urllib.parse.quote(str(k))}={urllib.parse.quote(str(v))}")
        url = url + "?" + "&".join(qs)
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {TOKEN}"})
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.loads(resp.read())

def api_post(path, data):
    url = f"{API}/act_{ACT_ID}/{path}"
    data["access_token"] = TOKEN
    qs = urllib.parse.urlencode(data)
    req = urllib.request.Request(url, data=qs.encode(), method="POST")
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.loads(resp.read())

def main():
    today = "2026-06-13"
    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")

    try:
        acct = api_get("insights", {
            "time_range": json.dumps({"since": today, "until": today}),
            "level": "account",
            "fields": "spend,clicks,cpc"
        })
        d0 = acct.get("data", [{}])[0]
        acct_spend = float(d0.get("spend", 0))
        acct_clicks = int(d0.get("clicks", 0))
        global_cpc = acct_spend / acct_clicks if acct_clicks > 0 else 0.0
    except Exception:
        global_cpc = 0.0
        acct_spend = 0.0

    mode = "AMAN" if global_cpc < 120 else "WASPADA"

    try:
        camps_raw = api_get("campaigns", {"fields": "id,name,status,daily_budget", "limit": 200})
        camps = camps_raw.get("data", [])
    except Exception:
        camps = []

    if not camps:
        print(f"🛡️ SATPAM 1041 {now_str}")
        print(f"ACTIVE:0 | Global CPC:Rp{global_cpc:.0f} | Mode:{mode}")
        print("💀 MONSTER: none")
        print("👀 WATCH: none")
        print("🌟 WINNER: none")
        print("💰 LC SCALE: 0 naik budget")
        return

    try:
        ins_raw = api_get("insights", {
            "time_range": json.dumps({"since": "2026-06-07", "until": today}),
            "level": "campaign",
            "fields": "campaign_id,spend,cpc,clicks",
            "limit": 200
        })
        ins_map = {r["campaign_id"]: r for r in ins_raw.get("data", [])}
    except Exception:
        ins_map = {}

    rows = []
    for c in camps:
        cid = c["id"]
        ins = ins_map.get(cid, {})
        spend = float(ins.get("spend", 0))
        cpc = float(ins.get("cpc", 0))
        clicks = int(ins.get("clicks", 0))
        rows.append({
            "id": cid,
            "name": c["name"],
            "status": c["status"],
            "spend": spend,
            "cpc": cpc,
            "clicks": clicks,
            "budget": int(c.get("daily_budget", 0))
        })

    active = [r for r in rows if r["status"] == "ACTIVE" and not r["name"].startswith("OFF_") and not r["name"].startswith("DEAD_")]

    monsters = []
    watch = []
    winners = []
    for r in active:
        if (r["cpc"] >= 500 and r["spend"] > 1000) or (r["cpc"] >= 1000 and r["spend"] > 500):
            monsters.append(r)
        elif r["cpc"] > 200 and r["clicks"] == 0 and r["spend"] > 500:
            watch.append(r)
        elif r["cpc"] < 120 and r["clicks"] > 5 and r["spend"] > 10000:
            winners.append(r)

    lc_candidates = [r for r in active if "LC" in r["name"].upper() and r["cpc"] < 120 and r["clicks"] > 0]

    scaled = 0
    for r in monsters:
        if mode == "WASPADA":
            try:
                api_post(f"{r['id']}", {"status": "PAUSED"})
                api_post(f"{r['id']}", {"name": f"OFF_{r['name']}"})
            except Exception:
                pass
        time.sleep(0.5)

    for r in watch:
        if mode == "WASPADA":
            try:
                api_post(f"{r['id']}", {"status": "PAUSED"})
            except Exception:
                pass
        time.sleep(0.5)

    for r in lc_candidates:
        if r["budget"] > 0:
            new_budget = min(int(r["budget"] * 1.2), 50000)
            if new_budget > r["budget"]:
                try:
                    api_post(f"{r['id']}", {"daily_budget": new_budget})
                    scaled += 1
                except Exception:
                    pass
        time.sleep(0.5)

    mon_list = ", ".join(r["name"] for r in monsters) or "none"
    watch_list = ", ".join(r["name"] for r in watch) or "none"
    win_list = ", ".join(r["name"] for r in winners) or "none"
    print(f"🛡️ SATPAM 1041 {now_str}")
    print(f"ACTIVE:{len(active)} | Global CPC:Rp{global_cpc:.0f} | Mode:{mode}")
    print(f"💀 MONSTER: {mon_list}")
    print(f"👀 WATCH: {watch_list}")
    print(f"🌟 WINNER: {win_list}")
    print(f"💰 LC SCALE: {scaled} naik budget")

if __name__ == "__main__":
    main()
