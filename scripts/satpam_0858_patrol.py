#!/usr/bin/env python3
# satpam_0858_patrol.py — cron strict patrol for Kakriput (0858) act_435670549443081
import json
import time
import urllib.request
import urllib.parse
import urllib.error
from datetime import datetime, timedelta

ACT_ID = "act_435670549443081"
API_VER = "v22.0"
ENV_PATH = "/home/openclaw/projects/1ai-ads/.env"

def load_token():
    for line in open(ENV_PATH).read().splitlines():
        if not line or line.startswith("#"):
            continue
        if line.split("=", 1)[0] == "META_ACCESS_TOKEN":
            return line.split("=", 1)[1].strip()
    raise RuntimeError("META_ACCESS_TOKEN missing in .env")

TOKEN = load_token()
print(f"TOKEN_LEN={len(TOKEN)}")

def api_get(endpoint):
    url = f"https://graph.facebook.com/{API_VER}/{endpoint}"
    if "?" in url:
        sep = "&"
    else:
        sep = "?"
    url = url + sep + "access_token=" + urllib.parse.quote(TOKEN, safe="")
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=30) as resp:
        raw = resp.read().decode()
        try:
            return json.loads(raw)
        except Exception:
            return {"_raw": raw}

def api_post(endpoint, payload):
    url = f"https://graph.facebook.com/{API_VER}/{endpoint}"
    data = dict(payload)
    data["access_token"] = TOKEN
    qs = urllib.parse.urlencode(data).encode()
    req = urllib.request.Request(url, data=qs, method="POST")
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode())

def main():
    now = datetime.now()
    since = (now - timedelta(days=7)).strftime("%Y-%m-%d")
    until = now.strftime("%Y-%m-%d")
    today_mmdd = now.strftime("%m%d")
    ts = now.strftime("%Y-%m-%d %H:%M:%S")

    print(f"SATPAM_0858 {ts}")
    print(f"WINDOW: {since} → {until}")

    # 1. Fetch campaigns
    camps_raw = api_get(f"{ACT_ID}/campaigns?fields=id,name,status&limit=200")
    campaigns = camps_raw.get("data", [])
    by_cid = {c["id"]: c for c in campaigns}

    # paging
    nxt = camps_raw.get("paging", {}).get("next")
    while nxt:
        time.sleep(1.5)
        url = nxt + ("&" if "?" in nxt else "?") + "access_token=" + urllib.parse.quote(TOKEN, safe="")
        with urllib.request.urlopen(url, timeout=30) as resp:
            page = json.loads(resp.read().decode())
        campaigns.extend(page.get("data", []))
        for c in page.get("data", []):
            by_cid[c["id"]] = c
        nxt = page.get("paging", {}).get("next")

    active_ids = [c["id"] for c in campaigns if c["status"] == "ACTIVE"]
    paused_ids = [c["id"] for c in campaigns if c["status"] == "PAUSED"]

    print(f"TOTAL_CAMPAIGNS={len(campaigns)} ACTIVE={len(active_ids)} PAUSED={len(paused_ids)}")

    # 2. Fetch insights - level campaign, 7d+ today
    insights_map = {}
    if active_ids:
        # batched by 20
        for i in range(0, len(active_ids), 20):
            batch = active_ids[i:i+20]
            ids_param = json.dumps(batch)
            q = urllib.parse.urlencode({
                "time_range": json.dumps({"since": since, "until": until}),
                "level": "campaign",
                "fields": "campaign_id,campaign_name,spend,cpc,clicks,ctr,impressions",
                "limit": "200",
                "filtering": json.dumps([{"field": "campaign.id", "operator": "IN", "value": batch}]),
            })
            url = f"https://graph.facebook.com/{API_VER}/{ACT_ID}/insights?{q}&access_token=" + urllib.parse.quote(TOKEN, safe="")
            time.sleep(1.5)
            with urllib.request.urlopen(url, timeout=30) as resp:
                data = json.loads(resp.read().decode())
            for row in data.get("data", []):
                cid = row.get("campaign_id")
                if cid:
                    insights_map[cid] = row
            nxt2 = data.get("paging", {}).get("next")
            while nxt2:
                time.sleep(1.5)
                url2 = nxt2 + ("&" if "?" in nxt2 else "?") + "access_token=" + urllib.parse.quote(TOKEN, safe="")
                with urllib.request.urlopen(url2, timeout=30) as resp:
                    page2 = json.loads(resp.read().decode())
                for row in page2.get("data", []):
                    cid = row.get("campaign_id")
                    if cid:
                        insights_map[cid] = row
                nxt2 = page2.get("paging", {}).get("next")

    # 3. Calculate global CPC across ALL active campaigns (all rows)
    total_spend = 0.0
    total_clicks = 0
    for cid in active_ids:
        row = insights_map.get(cid, {})
        try:
            total_spend += float(row.get("spend") or 0)
        except Exception:
            pass
        try:
            total_clicks += int(row.get("clicks") or 0)
        except Exception:
            pass

    global_cpc = (total_spend / total_clicks) if total_clicks > 0 else 0.0
    print(f"GLOBAL_CPC={global_cpc:.2f}")

    mode = "AMAN" if global_cpc < 120 else "NORMAL"
    print(f"MODE={mode}")

    # 4. Layers
    monsters = []
    watch = []
    winners = []
    auto_on = []
    lc_list = []

    for cid in active_ids:
        c = by_cid.get(cid, {})
        row = insights_map.get(cid, {})
        name = c.get("name", "")
        try:
            cpc = float(row.get("cpc") or 0)
        except Exception:
            cpc = 0.0
        try:
            spend = float(row.get("spend") or 0)
        except Exception:
            spend = 0.0
        try:
            clicks = int(row.get("clicks") or 0)
        except Exception:
            clicks = 0

        off = name.startswith("OFF_")
        if off:
            continue

        if cpc >= 500 and spend > 1000:
            monsters.append(name)
        elif cpc > 200 and clicks == 0 and spend > 500:
            monsters.append(name)
        elif cpc > 200 and clicks > 0 and spend > 2000:
            watch.append(name)
        elif cpc < 120 and clicks > 5 and spend > 10000:
            winners.append(name)

        if "ON_LC_" in name and cpc < 120:
            lc_list.append(name)

    # 5. Auto-ON candidates (paused non-OFF_)
    auto_on = []
    for c in campaigns:
        if c["status"] != "PAUSED":
            continue
        name = c.get("name", "")
        if name.startswith("OFF_") or name.startswith("DEAD_"):
            continue
        cid = c["id"]
        row = insights_map.get(cid, {})
        try:
            cpc = float(row.get("cpc") or 0)
        except Exception:
            cpc = 0.0
        try:
            clicks = int(row.get("clicks") or 0)
        except Exception:
            clicks = 0
        try:
            spend = float(row.get("spend") or 0)
        except Exception:
            spend = 0.0
        if cpc < 200 and clicks > 3 and spend > 2000:
            auto_on.append(name)

    # apply actions if NORMAL
    acted_monster = 0
    acted_auto_on = 0
    acted_winner = 0
    if mode == "NORMAL":
        for name in monsters:
            cid = next((c["id"] for c in campaigns if c.get("name") == name and c["status"] == "ACTIVE"), None)
            if cid:
                time.sleep(1.5)
                res = api_post(cid, {"status": "PAUSED"})
                acted_monster += 1
        for name in auto_on:
            cid = next((c["id"] for c in campaigns if c.get("name") == name and c["status"] == "PAUSED"), None)
            if cid:
                time.sleep(1.5)
                res = api_post(cid, {"status": "ACTIVE"})
                acted_auto_on += 1
        for name in winners:
            cid = next((c["id"] for c in campaigns if c.get("name") == name and c["status"] == "ACTIVE"), None)
            if cid:
                time.sleep(1.5)
                res = api_post(cid, {"name": f"🌟_{name}"})
                acted_winner += 1

    # Meta automated rules
    rules_data = api_get(f"{ACT_ID}/adrules_library?fields=id,name&limit=50")
    rules = rules_data.get("data", [])
    pause_rules = [r for r in rules if any(k in (r.get("name") or "").upper() for k in ["OFF", "STOPLOSS", "RULE SPENT", "SENTINEL", "BATAS"])]

    # Report
    print(f"🛡️ SATPAM 0858 {ts}")
    print(f"ACTIVE:{len(active_ids)} | PAUSED:{len(paused_ids)} | Global CPC:Rp{global_cpc:.0f} | Mode:{mode}")
    if monsters:
        print(f"💀 MONSTER ({acted_monster} acted): {monsters}")
    else:
        print("💀 MONSTER: —")
    if watch:
        print(f"👀 WATCH: {watch}")
    else:
        print("👀 WATCH: —")
    print(f"🌟 WINNER: {acted_winner} — {winners if winners else '—'}")
    print(f"✅ AUTO-ON: {acted_auto_on} — {auto_on if auto_on else '—'}")
    print(f"💰 LC: {len(lc_list)} campaigns")
    print(f"⚠️ Meta rules: {len(rules)} ({len(pause_rules)} pause-trigger)")

if __name__ == "__main__":
    main()
