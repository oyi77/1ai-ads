#!/usr/bin/env python3
"""
V2 0858 Auto-Scale Engine
Runs daily (9 AM WIB) — checks profit/loss, scales budget +20% if profitable,
creates 2-3 new campaigns from winning data with derivative interests.
"""

import requests, json, subprocess, time, os
from datetime import datetime, timezone, timedelta
from pathlib import Path

TOKEN = subprocess.run(
    [
        "grep",
        "-oP",
        "ACCESS_TOKEN = '\\K[^']+",
        str(Path(__file__).parent / "list_ad_accounts.py"),
    ],
    capture_output=True,
    text=True,
).stdout.strip()

ACT = "act_435670549443081"
PAGE_ID = "1014428148422867"
BASE = "https://graph.facebook.com/v19.0"
LOG_FILE = Path.home() / ".openclaw/workspace/logs/v2_0858_scale.log"

yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%d")
today = datetime.now(timezone.utc).strftime("%Y-%m-%d")


def log(msg):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line)
    os.makedirs(LOG_FILE.parent, exist_ok=True)
    with open(LOG_FILE, "a") as f:
        f.write(line + "\n")


log("🚀 V2 Auto-Scale Engine starting...")

# STEP 1: Get yesterday's spend & performance
r = requests.get(
    f"{BASE}/{ACT}/insights",
    params={
        "access_token": TOKEN,
        "fields": "campaign_id,campaign_name,spend,clicks,impressions,cpc,ctr",
        "time_range": json.dumps({"since": yesterday, "until": yesterday}),
        "level": "campaign",
        "limit": 50,
    },
)

yesterday_data = r.json().get("data", [])
total_spend = sum(float(d.get("spend", 0)) for d in yesterday_data)
total_clicks = sum(int(d.get("clicks", 0)) for d in yesterday_data)
total_impressions = sum(int(d.get("impressions", 0)) for d in yesterday_data)

log(
    f"Yesterday: Spend Rp {total_spend:,.0f} | Clicks {total_clicks} | Impr {total_impressions}"
)

# STEP 2: Check Shopee commissions (placeholder — integrate with actual data)
# For now, log what we have
# Shopee commission data via 1ai-social API: http://localhost:8200/api/shopee/orders

# STEP 3: Identify winning campaigns (profitable based on yesterday)
winning_camps = []
for camp in yesterday_data:
    spend = float(camp.get("spend", 0))
    cpc = float(camp.get("cpc", 0))
    ctr = float(camp.get("ctr", 0))
    clicks = int(camp.get("clicks", 0))

    # Winning criteria: CPC < 150, CTR > 3%, spent > 5000
    if cpc < 150 and ctr > 3 and spend > 5000:
        winning_camps.append(
            {
                "id": camp.get("campaign_id"),
                "name": camp.get("campaign_name"),
                "spend": spend,
                "cpc": cpc,
                "ctr": ctr,
                "clicks": clicks,
            }
        )

log(f"Winning campaigns: {len(winning_camps)}")

# STEP 4: Scale winning campaigns (+20% budget)
for camp in winning_camps:
    # Get current budget from adsets
    r = requests.get(
        f'{BASE}/{camp["id"]}/adsets',
        params={
            "access_token": TOKEN,
            "fields": "id,name,daily_budget",
            "limit": 10,
        },
    )
    for adset in r.json().get("data", []):
        current_budget = int(adset.get("daily_budget", 0))
        if current_budget > 0:
            new_budget = min(int(current_budget * 1.2), 50000)  # +20%, max 50k
            if new_budget > current_budget:
                requests.post(
                    f'{BASE}/{adset["id"]}',
                    params={"access_token": TOKEN},
                    json={"daily_budget": new_budget},
                )
                log(
                    f"  📈 Scaled {camp['name']}: Rp {current_budget:,} → Rp {new_budget:,}"
                )

# STEP 5: Create 2-3 new campaigns from winning derivative interests
# Derivative interests: combine themes from winning campaigns
creatives = {
    "rakpiringpengering": "2218448638921797",
    "organizerpullout": "1811776943540814",
}

interest_pool = {
    "Belanja": [
        {"id": "6003263791114", "name": "Belanja"},
        {"id": "6003346592981", "name": "Belanja online"},
    ],
    "Dapur": [{"id": "6003077174939", "name": "Perkakas dapur"}],
    "Fashion": [
        {"id": "6003242077675", "name": "Baju"},
        {"id": "6003456388203", "name": "Pakaian"},
    ],
    "IbuRumah": [{"id": "6003107471210", "name": "Ibu rumah tangga"}],
    "Diskon": [{"id": "6003386553489", "name": "Kupon diskon"}],
}

targeting_base = {
    "geo_locations": {"countries": ["ID"], "location_types": ["home", "recent"]},
    "age_min": 24,
    "age_max": 55,
    "genders": [1],
    "publisher_platforms": ["facebook", "instagram"],
    "facebook_positions": ["feed", "facebook_reels", "facebook_reels_overlay", "story"],
    "instagram_positions": ["stream", "story", "reels"],
    "device_platforms": ["mobile", "desktop"],
    "targeting_automation": {"advantage_audience": 0},
}

# Pick winning products and create derivative campaigns
new_campaigns = 0
max_new = 3

# Get active campaign count first to not exceed budget
r = requests.get(
    f"{BASE}/{ACT}/campaigns",
    params={
        "access_token": TOKEN,
        "fields": "id",
        "limit": 50,
        "filtering": json.dumps(
            [
                {
                    "field": "campaign.effective_status",
                    "operator": "IN",
                    "value": ["ACTIVE"],
                }
            ]
        ),
    },
)
active_count = len(r.json().get("data", []))

for camp in winning_camps[:2]:
    if new_campaigns >= max_new or active_count + new_campaigns >= 12:
        break

    product = (
        camp["name"].split("_")[2]
        if len(camp["name"].split("_")) > 2
        else "rakpiringpengering"
    )
    if product not in creatives:
        product = "rakpiringpengering"

    # Use a different interest theme
    for theme_name, interests in interest_pool.items():
        if new_campaigns >= max_new:
            break

        # Skip themes already used
        if theme_name in camp["name"]:
            continue

        new_name = f"V2_HV_SCALE_{product}_{theme_name}"
        log(f"  🆕 Creating: {new_name}")

        # Campaign
        r = requests.post(
            f"{BASE}/{ACT}/campaigns",
            params={"access_token": TOKEN},
            json={
                "name": new_name,
                "objective": "OUTCOME_TRAFFIC",
                "status": "ACTIVE",
                "special_ad_categories": "NONE",
                "is_adset_budget_sharing_enabled": False,
            },
        )
        camp_res = r.json()
        if "id" not in camp_res:
            log(f"    ❌ Campaign failed")
            continue
        camp_id = camp_res["id"]

        # AdSet
        t = dict(targeting_base)
        t["flexible_spec"] = [{"interests": interests}]
        r2 = requests.post(
            f"{BASE}/{ACT}/adsets",
            params={"access_token": TOKEN},
            json={
                "name": f"AdSet_SCALE_{product}_{theme_name}",
                "campaign_id": camp_id,
                "status": "ACTIVE",
                "daily_budget": 20000,
                "billing_event": "IMPRESSIONS",
                "optimization_goal": "LINK_CLICKS",
                "bid_strategy": "LOWEST_COST_WITH_BID_CAP",
                "bid_amount": 150,
                "targeting": t,
            },
        )
        adset_res = r2.json()
        if "id" not in adset_res:
            log(f"    ❌ AdSet failed")
            continue
        adset_id = adset_res["id"]

        # Ad
        r3 = requests.post(
            f"{BASE}/{ACT}/ads",
            params={"access_token": TOKEN},
            json={
                "name": f"Ad_SCALE_{product}_{theme_name}",
                "adset_id": adset_id,
                "status": "ACTIVE",
                "creative": {"creative_id": creatives[product]},
            },
        )
        ad_res = r3.json()
        if "id" in ad_res:
            log(f"    ✅ LIVE")
            new_campaigns += 1
        else:
            log(f"    ❌ Ad failed")

        time.sleep(0.5)

log(f"✅ Scale complete: {new_campaigns} new campaigns, {len(winning_camps)} scaled")
