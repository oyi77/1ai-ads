#!/usr/bin/env python3
"""Clone a winning BIDCAP campaign to a fresh BIDCAP campaign in 1041 with stable targeting."""
import json, os, sys, time, urllib.request, urllib.parse
from pathlib import Path
from datetime import datetime

sys.path.insert(0, str(Path(__file__).resolve().parent))
os.chdir(str(Path(__file__).resolve().parent.parent))

from vilona_trakpro_engine import (
    ACCESS_TOKEN, API, ACCOUNTS, log, fb_get, fb_post,
)

WIB = __import__('datetime').timezone(__import__('datetime').timedelta(hours=7))
account_id = ACCOUNTS["1041"]["id"]
original_name = "ON_BIDCAP_rakdapur_Movies_0306_02"

# Find original
campaigns = fb_get(f"{account_id}/campaigns", fields="id,name,status", limit="200")
original_id = next((c["id"] for c in campaigns.get("data", []) if c.get("name") == original_name), None)
if not original_id:
    print("Original campaign not found:", original_name)
    sys.exit(1)

# Minimal fresh targeting that won't blow up
minimal_targeting = {
    "geo_locations": {"countries": ["ID"], "location_types": ["home"]},
    "age_min": 18, "age_max": 65,
    "genders": [1],
    "publisher_platforms": ["facebook", "instagram"],
    "facebook_positions": ["feed", "story", "facebook_reels"],
    "instagram_positions": ["stream", "story", "reels"],
    "device_platforms": ["mobile", "desktop"],
    "targeting_automation": {"advantage_audience": 0},
}

today_str = datetime.now(WIB).strftime("%m%d")
camp_name = f"BIDCAP_rakdapur_Movies_{today_str}_fresh"
adset_name = f"rakdapur_Movies_2555_{today_str}"
ad_name = f"rakdapur3_Vdo1_v1"

print("Creating BIDCAP clone:", camp_name)

# try fetching original ad creative to reuse Post ID
post_id = None
try:
    ads = fb_get(f"{original_id}/ads", fields="creative{object_story_id,id}", limit="1")
    creative = (ads.get("data") or [{}])[0].get("creative", {})
    post_id = creative.get("object_story_id")
    print("Post ID:", post_id)
except Exception as e:
    print("Ads fetch error:", repr(e))

# Campaign
camp_payload = {
    "name": camp_name,
    "objective": "OUTCOME_TRAFFIC",
    "status": "PAUSED",
    "special_ad_categories": json.dumps([]),
    "is_adset_budget_sharing_enabled": "false",
    "access_token": ACCESS_TOKEN,
}
camp_result = fb_post(f"{account_id}/campaigns", **camp_payload)
print("Campaign:", camp_result)
new_camp_id = camp_result.get("id")
if not new_camp_id:
    sys.exit(1)

# Adset
adset_payload = {
    "name": adset_name,
    "campaign_id": new_camp_id,
    "targeting": json.dumps(minimal_targeting),
    "optimization_goal": "LINK_CLICKS",
    "billing_event": "IMPRESSIONS",
    "bid_strategy": "LOWEST_COST_WITHOUT_CAP",
    "daily_budget": "500000",
    "status": "PAUSED",
    "access_token": ACCESS_TOKEN,
}
try:
    adset_result = fb_post(f"{account_id}/adsets", **adset_payload)
    print("Adset:", adset_result)
except Exception as e:
    print("Adset error:", repr(e))
    sys.exit(1)
new_adset_id = adset_result.get("id")
if not new_adset_id:
    print("No adset id")
    sys.exit(1)

# Ad creative payload
creative_payload = {
    "name": ad_name,
    "adset_id": new_adset_id,
    "status": "PAUSED",
    "access_token": ACCESS_TOKEN,
}
if post_id:
    creative_payload["creative"] = json.dumps({
        "object_story_id": post_id,
        "call_to_action_type": "SHOP_NOW",
    })

ad_result = fb_post(f"{account_id}/ads", **creative_payload)
print("Ad:", ad_result)
print("DONE:", camp_name, new_camp_id)
