import requests, time, json, sys
from datetime import datetime, timedelta

ACT_ID = "act_380721031313330"
TOKEN = "EAAKA2OT1FroBRot0MWOi39slvmVLfZAPYWFFYoSO4ZAYvZAq0X7wnLBvAmgp0vai9KHZBOjXQ5VmvWYZCwNDJkUhrdlDwSUXGvb0LZACz9v4DkQj33B2cDrizSrH49UCIDnoebkQPaRg3YoxDwgwT6nrgZA2IvZAXQ77A99YS1hm6VVbA9i2Dn3PPgD794QJNZCAMqyYEGXqOyzmOUc7IirP4KMXWxUzwZBtOSgQIx5v19Mz8oB2GB4TKcPQZDZD"
BASE = f"https://graph.facebook.com/v22.0/{ACT_ID}"

def api_get(url, params=None):
    params = params or {}
    params["access_token"] = TOKEN
    r = requests.get(url, params=params, timeout=30)
    data = r.json()
    if "error" in data:
        print(f"ERROR: {data['error']}")
    return data

def api_post(url, params=None):
    params = params or {}
    params["access_token"] = TOKEN
    r = requests.post(url, data=params, timeout=30)
    try:
        data = r.json()
    except Exception:
        data = {"raw": r.text}
    return data

# 1. Fetch campaigns
print("Fetching campaigns...")
camps_data = api_get(f"{BASE}/campaigns", {"fields": "id,name,status", "limit": 200})
time.sleep(0.5)
campaigns = {c["id"]: c for c in camps_data.get("data", [])}
print(f"Total campaigns fetched: {len(campaigns)}")

# 2. Fetch 7-day insights
end_dt = datetime.now()
start_dt = end_dt - timedelta(days=7)
time_range = json.dumps({
    "since": start_dt.strftime("%Y-%m-%d"),
    "until": end_dt.strftime("%Y-%m-%d")
})

print("Fetching insights (7d)...")
insights_data = api_get(f"{BASE}/insights", {
    "fields": "campaign_id,campaign_name,spend,clicks,cpc,ctr",
    "time_range": time_range,
    "level": "campaign"
})
time.sleep(0.5)
insights_list = insights_data.get("data", [])
print(f"Insights rows fetched: {len(insights_list)}")

# 3. Aggregate
total_spend = 0.0
total_clicks = 0
camp_metrics = {}
for row in insights_list:
    cid = row.get("campaign_id")
    spend = float(row.get("spend", 0))
    clicks = int(row.get("clicks", 0))
    cpc = float(row.get("cpc", 0)) if row.get("cpc") else None
    ctr = float(row.get("ctr", 0)) if row.get("ctr") else None
    total_spend += spend
    total_clicks += clicks
    if cid not in camp_metrics:
        camp_metrics[cid] = {"spend": 0.0, "clicks": 0, "cpc": cpc, "ctr": ctr, "name": row.get("campaign_name")}
    camp_metrics[cid]["spend"] += spend
    camp_metrics[cid]["clicks"] += clicks
    # keep latest cpc/ctr
    if cpc is not None:
        camp_metrics[cid]["cpc"] = cpc
    if ctr is not None:
        camp_metrics[cid]["ctr"] = ctr

global_cpc = total_spend / total_clicks if total_clicks > 0 else 0.0
print(f"Global spend: Rp{total_spend:,.0f} clicks:{total_clicks} global_cpc:Rp{global_cpc:,.0f}")

# 4. Decision layer
actions = {
    "off": [],   # (id, name, reason)
    "pause": [], # (id, name, reason)
    "watch": [], # (id, name, reason)
    "winner": [], # (id, name, reason)
    "lc_scale": []
}

for cid, m in camp_metrics.items():
    cpc = m["cpc"] if m["cpc"] is not None else (m["spend"] / m["clicks"] if m["clicks"] > 0 else 0)
    spend = m["spend"]
    clicks = m["clicks"]
    name = m["name"] or cid
    # Layer 0: Global CPC gate affects some rules
    is_full = global_cpc >= 120

    # MONSTER (always)
    if cpc >= 1000 and spend > 1000:
        actions["off"].append((cid, name, f"CPC>=1000+spend>1K"))
    elif cpc >= 500 and spend > 2000:
        actions["off"].append((cid, name, f"CPC>=500+spend>2K"))

    # CPC layer
    if cpc > 200 and clicks == 0 and spend > 500:
        actions["pause"].append((cid, name, f"CPC>200+0 clicks+spend>500"))
    elif cpc > 200 and clicks > 0:
        actions["watch"].append((cid, name, f"CPC>200+clicks>0"))

    # Winners only if global_cpc < 120
    if global_cpc < 120:
        if cpc < 120 and clicks > 5 and spend > 10000:
            actions["winner"].append((cid, name, f"CPC<120+clicks>5+spend>10K"))

    # LC scale
    if "LC" in name and cpc < 120 and clicks > 0:
        actions["lc_scale"].append((cid, name, f"LC+CPC<120+clicks>0"))

# 5. Execute
def rename_campaign(cid, new_name):
    res = api_post(f"https://graph.facebook.com/v22.0/{cid}", {"name": new_name})
    return res

def pause_campaign(cid):
    res = api_post(f"https://graph.facebook.com/v22.0/{cid}", {"status": "PAUSED"})
    return res

# Execute OFF_
for cid, name, reason in actions["off"]:
    new_name = f"OFF_{name}"
    print(f"OFF_ {cid} -> {new_name} ({reason})")
    res = rename_campaign(cid, new_name)
    time.sleep(0.5)
    if "error" in res:
        print(f"  rename error: {res['error']}")
    else:
        print(f"  renamed OK")
    # pause
    res2 = pause_campaign(cid)
    time.sleep(0.5)
    if "error" in res2:
        print(f"  pause error: {res2['error']}")
    else:
        print(f"  paused OK")

# Execute PAUSE
for cid, name, reason in actions["pause"]:
    print(f"PAUSE {cid} ({reason})")
    res = pause_campaign(cid)
    time.sleep(0.5)
    if "error" in res:
        print(f"  pause error: {res['error']}")
    else:
        print(f"  paused OK")

# Winners: rename with 🌟_
for cid, name, reason in actions["winner"]:
    new_name = f"🌟_{name}"
    print(f"WINNER {cid} -> {new_name} ({reason})")
    res = rename_campaign(cid, new_name)
    time.sleep(0.5)
    if "error" in res:
        print(f"  rename error: {res['error']}")
    else:
        print(f"  renamed OK")

# LC scale: +20% budget, max 100K
for cid, name, reason in actions["lc_scale"]:
    # need current budget from adsets under this campaign. For now placeholder if not available.
    # We'll fetch adsets.
    print(f"LC SCALE {cid} ({reason})")
    adset_resp = api_get(f"{BASE}/adsets", {"fields": "id,name,budget_amount,campaign_id", "filtering": [{"field":"campaign.id","operator":"EQUAL","value":cid}]})
    time.sleep(0.5)
    for ad in adset_resp.get("data", []):
        cur = float(ad.get("budget_amount", 0))
        new_bud = int(cur * 1.2)
        if new_bud > 100000:
            new_bud = 100000
        if new_bud == cur:
            continue
        # update adset budget
        upd = api_post(f"https://graph.facebook.com/v22.0/{ad['id']}", {"budget_amount": new_bud})
        time.sleep(0.5)
        if "error" in upd:
            print(f"  adset {ad['id']} update error: {upd['error']}")
        else:
            print(f"  adset {ad['id']} budget Rp{cur:,.0f} -> Rp{new_bud:,.0f}")

# 6. Report
now_str = datetime.now().strftime("%Y-%m-%d %H:%M")
off_names = [n for _, n, _ in actions["off"]]
pause_names = [n for _, n, _ in actions["pause"]]
watch_names = [n for _, n, _ in actions["watch"]]
winner_names = [n for _, n, _ in actions["winner"]]
lc_names = [n for _, n, _ in actions["lc_scale"]]

report = f"""🛡️ SATPAM 1041 {now_str}
ACTIVE:{len(campaigns)} | Global CPC:Rp{global_cpc:,.0f}
💀 MONSTER: {', '.join(off_names) if off_names else 'None'}
👀 WATCH: {', '.join(watch_names) if watch_names else 'None'}
🌟: {', '.join(winner_names) if winner_names else 'None'}
💰 LC: {', '.join(lc_names) if lc_names else 'None'}"""

print("\n=== REPORT ===")
print(report)

with open("/home/openclaw/projects/1ai-ads/reports/satpat_1041_last.md", "w") as f:
    f.write(report)
