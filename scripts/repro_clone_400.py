#!/usr/bin/env python3
"""Diagnose the 400 seen when creating the 1041 Scale_ clone."""
import json, os, sys, time, urllib.request, urllib.parse, urllib.error
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
os.chdir(str(Path(__file__).resolve().parent.parent))

from vilona_trakpro_engine import (
    ACCESS_TOKEN, API, ACCOUNTS, log, fb_get, fb_post,
)

WIB = __import__('datetime').timedelta(hours=7)
today_str = (__import__('datetime').datetime.utcnow() + WIB).strftime("%m%d")
account_id = ACCOUNTS["1041"]["id"]
account_config = ACCOUNTS["1041"]
taglink = "rakdapur3"
audience = "IbuRumah"

camp_name = f"Scale_{taglink}_{audience}_{today_str}_diag"
adset_name = f"Scale_{taglink}_{audience}_2555_diag"

print(f"Account: 1041 ({account_id})")
print(f"Creating diagnostic campaign: {camp_name}")

# Inspect original
original_name = "ON_BIDCAP_rakdapur_Movies_0306_02"
insights = fb_get(f"{account_id}/campaigns", fields="id,name,status", limit="200")

original_id = None
for c in insights.get("data", []):
    if c.get("name") == original_name:
        original_id = c["id"]
        break

if not original_id:
    print("Original campaign not found")
    sys.exit(1)

adsets = fb_get(f"{original_id}/adsets", fields="name,targeting,optimization_goal,bid_strategy", limit="5")
og_adset = adsets["data"][0]
og_targeting = og_adset.get("targeting", {})

# force audience to IbuRumah
AUDIENCE_POOL = {
    "Belanja": [{"id":"6003263791114","name":"Belanja"},{"id":"6003346592981","name":"Belanja online (ritel)"},{"id":"6016343989160","name":"Lazada"},{"id":"6003220634758","name":"Toko diskon (ritel)"},{"id":"6849890049601","name":"Situs web belanja online"}],
    "Dapur": [{"id":"6003077174939","name":"Perkakas dapur"}],
    "Fashion": [{"id":"6003242077675","name":"Baju"},{"id":"6003456388203","name":"Pakaian"}],
    "IbuRumah": [{"id":"6003107471210","name":""}],
    "Diskon": [{"id":"6003386553489","name":"Kupon diskon"}],
    "Travel": [{"id":"6004078861067","name":"Traveling"}],
    "Interior": [{"id":"6003384677038","name":"Dekorasi rumah"},{"id":"6003455765814","name":"Perabotan rumah"}],
    "Resep": [{"id":"6003397425735","name":"Resep masakan"}],
    "Broad": [],
}
interests = AUDIENCE_POOL.get(audience, [])
diversified_targeting = {k: v for k, v in og_targeting.items()}
diversified_targeting["flexible_spec"] = [{"interests": interests}]
for k in ["publisher_platforms","facebook_positions","instagram_positions","device_platforms"]:
    if k in og_targeting:
        diversified_targeting[k] = og_targeting[k]
if "facebook_positions" in diversified_targeting and "video_feeds" in diversified_targeting["facebook_positions"]:
    diversified_targeting["facebook_positions"] = [p for p in diversified_targeting["facebook_positions"] if p != "video_feeds"]
diversified_targeting.setdefault("targeting_automation", {})["advantage_audience"] = 0

# Campaign
payload = {
    "name": camp_name,
    "objective": "OUTCOME_TRAFFIC",
    "status": "PAUSED",
    "special_ad_categories": json.dumps([]),
    "is_adset_budget_sharing_enabled": "false",
    "access_token": ACCESS_TOKEN,
}
camp_result = fb_post(f"{account_id}/campaigns", **payload)
print("Campaign:", camp_result)
new_camp_id = camp_result.get("id")
if not new_camp_id:
    sys.exit(1)

# Adset
adset_payload = {
    "name": adset_name,
    "campaign_id": new_camp_id,
    "targeting": json.dumps(diversified_targeting),
    "optimization_goal": "LINK_CLICKS",
    "billing_event": "IMPRESSIONS",
    "bid_strategy": "LOWEST_COST_WITHOUT_CAP",
    "daily_budget": "500000",
    "status": "PAUSED",
    "access_token": ACCESS_TOKEN,
}
print("Adset payload:", json.dumps(adset_payload, indent=2)[:1000])
try:
    adset_result = fb_post(f"{account_id}/adsets", **adset_payload)
    print("Adset:", adset_result)
except urllib.error.HTTPError as e:
    print("ADSET HTTPError:", e.code, e.reason)
    body = e.read().decode("utf-8", errors="replace")
    print("Body:", body[:2000])
except Exception as e:
    print("Adset exception:", repr(e))
