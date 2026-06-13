#!/usr/bin/env python3
import requests
import json
import time
from datetime import datetime, timedelta

# === CONFIG ===
ACCOUNT_ID = "act_380721031313330"
TOKEN_PATH = "/home/openclaw/projects/1ai-ads/.env"
API_VERSION = "v22.0"
BASE_URL = f"https://graph.facebook.com/{API_VERSION}/{ACCOUNT_ID}"
DELAY = 0.5

# === LOAD TOKEN ===
def load_token():
    with open(TOKEN_PATH, "r") as f:
        for line in f:
            line = line.strip()
            if line.startswith("META_ACCESS_TOKEN="):
                return line.split("=", 1)[1]
    raise ValueError("META_ACCESS_TOKEN not found in .env")

TOKEN = load_token()

# === API HELPERS ===
def api_get(endpoint, params=None):
    url = f"https://graph.facebook.com/{API_VERSION}/{ACCOUNT_ID}/{endpoint}"
    params = params or {}
    params["access_token"] = TOKEN
    resp = requests.get(url, params=params)
    data = resp.json()
    if "data" not in data and "error" in data:
        print(f"API Error on {endpoint}: {data['error']}")
        return None
    return data

def api_post(endpoint, post_data):
    url = f"https://graph.facebook.com/{API_VERSION}/{ACCOUNT_ID}/{endpoint}"
    post_data["access_token"] = TOKEN
    resp = requests.post(url, data=post_data)
    data = resp.json()
    if "error" in data:
        print(f"API Error on POST {endpoint}: {data['error']}")
    return data

# === STEP 1: FETCH CAMPAIGNS ===
print("Fetching campaigns...")
campaigns_data = api_get("campaigns", {
    "fields": "id,name,status",
    "limit": 200
})

if not campaigns_data or "data" not in campaigns_data:
    print("Failed to fetch campaigns. Exiting.")
    exit(1)

campaigns = campaigns_data["data"]

# === STEP 2: FETCH INSIGHTS 7 DAYS ===
since_dt = (datetime.now() - timedelta(days=7)).date()
until_dt = datetime.now().date()
time_range = json.dumps({"since": since_dt.isoformat(), "until": until_dt.isoformat()})
print(f"Fetching insights for {len(campaigns)} campaigns...")
insights_data = api_get("insights", {
    "fields": "campaign_id,campaign_name,spend,clicks,ctr,cpc",
    "time_range": time_range,
    "level": "campaign",
    "limit": 200,
    "time_increment": 1,
})

if not insights_data or "data" not in insights_data:
    print("No insights data. Using zero values.")
    insights = []
else:
    insights = insights_data["data"]

print(f"Got {len(insights)} insight rows.")

# Build insight map: campaign_id -> {spend, clicks, cpc, name}
insight_map = {}
for row in insights:
    cid = row.get("campaign_id")
    if cid:
        insight_map[cid] = {
            "spend": float(row.get("spend", 0)),
            "clicks": int(row.get("clicks", 0)),
            "cpc": float(row.get("cpc", 0)),
            "ctr": float(row.get("ctr", 0)),
            "name": row.get("campaign_name", "")
        }

# === CALCULATE GLOBAL CPC ===
total_spend = sum(v["spend"] for v in insight_map.values())
total_clicks = sum(v["clicks"] for v in insight_map.values())
global_cpc = total_spend / total_clicks if total_clicks > 0 else 0.0

print(f"Global Spend: Rp{total_spend:,.0f} | Clicks: {total_clicks} | Global CPC: Rp{global_cpc:,.0f}")

# === APPLY RULES ===
monster_list = []     # OFF_ renamed + paused
watch_list = []       # paused only, no rename
winner_list = []      # renamed with 🌟_
scale_list = []       # LC scale +20%

# Applies based on auto rules as per requirements
# LAYER 1: MONSTER (always; override global gate)
# LAYER 2: CPC GOVERNOR
# LAYER 3: ROI WINNER (only if global CPC < 120)
# LC SCALE: +20% budget if CPC < 120 + clicks > 0

for camp in campaigns:
    cid = camp["id"]
    name = camp["name"]
    status = camp["status"]

    info = insight_map.get(cid, {"spend": 0, "clicks": 0, "cpc": 0, "name": name})
    spend = info["spend"]
    clicks = info["clicks"]
    cpc = info["cpc"]

    # Skip already paused off-ish campaigns
    if name.startswith("OFF_") or status in ["PAUSED", "ARCHIVED", "DELETED"]:
        continue

    # === LAYER 1: MONSTER (always) ===
    if cpc >= 1000 and spend > 500:
        new_name = f"OFF_{name}"
        monster_list.append((cid, name, new_name, spend, cpc, clicks))
        if status != "PAUSED":
            res = api_post(f"{cid}", {"status": "PAUSED"})
            print(f"MONSTER PAUSED: {cid} -> {res}")
        else:
            res = api_post(f"{cid}", {"name": new_name})
            print(f"MONSTER RENAME: {cid} -> {res}")
        time.sleep(DELAY)
        continue

    if cpc >= 500 and spend > 2000:
        new_name = f"OFF_{name}"
        monster_list.append((cid, name, new_name, spend, cpc, clicks))
        if status != "PAUSED":
            res = api_post(f"{cid}", {"status": "PAUSED"})
            print(f"MONSTER PAUSED: {cid} -> {res}")
        else:
            res = api_post(f"{cid}", {"name": new_name})
            print(f"MONSTER RENAME: {cid} -> {res}")
        time.sleep(DELAY)
        continue

    # === LAYER 2: CPC GOVERNOR ===
    if cpc > 200 and clicks == 0 and spend > 500:
        watch_list.append((cid, name, spend, cpc, clicks, "CPC>200 0clicks"))
        if status != "PAUSED":
            res = api_post(f"{cid}", {"status": "PAUSED"})
            print(f"WATCH PAUSED (CPC>200 0clicks): {cid} -> {res}")
        time.sleep(DELAY)
        continue

    if cpc > 200 and clicks > 0:
        watch_list.append((cid, name, spend, cpc, clicks, "CPC>200 +clicks"))
        continue

    # === LAYER 3: ROI WINNER (only if global CPC < 120) ===
    if global_cpc < 120:
        if cpc < 80 and clicks > 5 and spend > 10000:
            winner_list.append((cid, name, cpc, spend, clicks))
            new_name = f"🌟_{name}"
            res = api_post(f"{cid}", {"name": new_name})
            print(f"WINNER RENAME: {cid} -> {res}")
            time.sleep(DELAY)
            continue

        if cpc < 120 and clicks > 5 and spend > 20000:
            winner_list.append((cid, name, cpc, spend, clicks))
            new_name = f"🌟_{name}"
            res = api_post(f"{cid}", {"name": new_name})
            print(f"WINNER RENAME: {cid} -> {res}")
            time.sleep(DELAY)
            continue

# === LC SCALE (+20% budget if CPC < 120 + clicks > 0) ===
for camp in campaigns:
    cid = camp["id"]
    name = camp["name"]
    status = camp["status"]

    if status == "PAUSED":
        continue
    if "LC" not in name:
        continue
    if name.startswith("OFF_") or name.startswith("🌟_"):
        continue

    info = insight_map.get(cid)
    if not info:
        continue

    cpc = info["cpc"]
    clicks = info["clicks"]

    if cpc < 120 and clicks > 0:
        adv_data = api_get(f"{cid}/adsets", {
            "fields": "id,name,daily_budget",
            "limit": 100
        })
        if adv_data and "data" in adv_data:
            for adset in adv_data["data"]:
                adset_id = adset["id"]
                current_budget_str = adset.get("daily_budget", "0")
                try:
                    current_budget = float(current_budget_str)
                except Exception:
                    current_budget = 0
                if current_budget > 0:
                    new_budget = round(current_budget * 1.2, 0)
                    url = f"https://graph.facebook.com/{API_VERSION}/{adset_id}"
                    payload = {
                        "daily_budget": int(new_budget),
                        "access_token": TOKEN
                    }
                    resp = requests.post(url, data=payload)
                    scale_list.append((cid, name, adset_id, current_budget, new_budget, cpc))
                    print(f"LC SCALE: {adset_id} budget {current_budget} -> {new_budget} -> {resp.json()}")
                    time.sleep(DELAY)

# === REPORT ===
print("\n" + "="*50)
print("🛡️ SATPAM 1041 REPORT")
print("="*50)
print(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
active_campaigns = [c for c in campaigns if c["status"] == "ACTIVE"]
print(f"ACTIVE: {len(active_campaigns)} | Global CPC: Rp{global_cpc:,.0f}")
print()
print(f"💀 MONSTER ({len(monster_list)}):")
for item in monster_list:
    print(f"  {item[0]} | {item[1]} -> {item[2]} | spend:Rp{item[3]:,.0f} cpc:Rp{item[4]:,.0f} clicks:{item[5]}")
print()
print(f"👀 WATCH ({len(watch_list)}):")
for item in watch_list:
    print(f"  {item[0]} | {item[1]} | spend:Rp{item[2]:,.0f} cpc:Rp{item[3]:,.0f} clicks:{item[4]} reason:{item[5]}")
print()
print(f"🌟 WINNER ({len(winner_list)}):")
for item in winner_list:
    print(f"  {item[0]} | {item[1]} | cpc:Rp{item[2]:,.0f} spend:Rp{item[3]:,.0f} clicks:{item[4]}")
print()
print(f"💰 LC SCALE ({len(scale_list)}):")
for item in scale_list:
    print(f"  {item[0]} | {item[1]} | adset:{item[2]} budget:Rp{item[3]:,.0f}->Rp{item[4]:,.0f} cpc:Rp{item[5]:,.0f}")
print("="*50)
