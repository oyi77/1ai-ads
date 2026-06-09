import requests, json, sys, time

import subprocess as _sp
TOKEN = _sp.run(['cat', '/tmp/_meta_token.txt'], capture_output=True, text=True).stdout.strip()


API = 'https://graph.facebook.com/v22.0'
ACT_ID = 'act_380721031313330'

# Existing campaigns (CBO - have campaign-level budget)
CAMP_RDP = "120247747437450121"   # Scale_BIDCAP_rakdapur3_Dapur_1006
CAMP_AT = "120247747438830121"    # Scale_BIDCAP_atayasetelankaosanak_Fashion_1006
CR_RDP = "1009730464865704"
CR_AT = "1562220915426613"

# === MINIMAL INTERESTS (remove broken IDs) ===
rakdapur_interests = [
    {"id": "6003263791114", "name": "Belanja"},
    {"id": "6003077174939", "name": "Perkakas dapur"},
]

ataya_interests = [
    {"id": "6003263791114", "name": "Belanja"},
    {"id": "6003242077675", "name": "Baju"},
]

def make_targeting(interests):
    return {
        "geo_locations": {"countries": ["ID"]},
        "age_min": 23,
        "age_max": 55,
        "genders": [1],
        "publisher_platforms": ["facebook", "instagram"],
        "facebook_positions": ["feed", "facebook_reels", "story"],
        "instagram_positions": ["stream", "story", "reels", "explore"],
        "targeting_automation": {"advantage_audience": 0},
        "flexible_spec": [{"interests": interests}],
    }

adsets = [
    {
        "name": "Scale_rakdapur3_Dapur_2555",
        "campaign_id": CAMP_RDP,
        "targeting": make_targeting(rakdapur_interests),
        "creative_id": CR_RDP,
        "ad_name": "Scale_rakdapur3_Vdo1_v1",
    },
    {
        "name": "Scale_atayasetelankaosanak_Fashion_2555",
        "campaign_id": CAMP_AT,
        "targeting": make_targeting(ataya_interests),
        "creative_id": CR_AT,
        "ad_name": "Scale_atayasetelankaosanak_Vdo1_v1",
    },
]

# First delete any failed adsets from previous attempts
for cid in [CAMP_RDP, CAMP_AT]:
    resp = requests.get(f"{API}/{cid}/adsets", params={"access_token": TOKEN, "fields": "id,name,status", "limit": "50"})
    existing = resp.json()
    if "data" in existing:
        for a in existing["data"]:
            if "Scale_2555" in a.get("name", ""):
                print(f"Deleting old failed adset: {a['name']} ({a['id']})")
                del_resp = requests.delete(f"{API}/{a['id']}", params={"access_token": TOKEN})
                print(f"  Delete result: {del_resp.status_code}")
                time.sleep(1.5)

results = []
for aset in adsets:
    print(f"\n--- Creating: {aset['name']} ---")
    interest_names = [i["name"] for i in aset["targeting"]["flexible_spec"][0]["interests"]]
    print(f"Targeting: Female 23-55, interests: {interest_names}")
    
    # CBO mode: NO daily_budget on adset (campaign has it)
    as_data = {
        "name": aset["name"],
        "campaign_id": aset["campaign_id"],
        "status": "PAUSED",
        "billing_event": "IMPRESSIONS",
        "optimization_goal": "LINK_CLICKS",
        "bid_amount": 180,
        "targeting": json.dumps(aset["targeting"]),
    }
    
    resp = requests.post(f"{API}/{ACT_ID}/adsets", data={**as_data, "access_token": TOKEN})
    as_res = resp.json()
    print(f"AdSet response: {json.dumps(as_res, indent=2)[:500]}")
    
    if "id" not in as_res:
        print(f"FAILED")
        results.append({"name": aset["name"], "error": as_res})
        continue
    
    adset_id = as_res["id"]
    print(f"AdSet: {adset_id}")
    time.sleep(2)
    
    # Create Ad
    ad_data = {
        "name": aset["ad_name"],
        "adset_id": adset_id,
        "status": "PAUSED",
        "creative": json.dumps({"creative_id": aset["creative_id"]}),
    }
    resp = requests.post(f"{API}/{ACT_ID}/ads", data={**ad_data, "access_token": TOKEN})
    ad_res = resp.json()
    print(f"Ad response: {json.dumps(ad_res, indent=2)[:300]}")
    
    if "id" not in ad_res:
        print(f"Ad FAILED")
        results.append({"name": aset["name"], "error": f"Ad failed: {ad_res}", "adset_id": adset_id})
        continue
    
    ad_id = ad_res["id"]
    print(f"Ad: {ad_id}")
    results.append({"name": aset["name"], "adset_id": adset_id, "ad_id": ad_id, "success": True})
    time.sleep(2)

print("\n\n========== FINAL ==========")
for r in results:
    if r.get("success"):
        print(f"✅ {r['name']}: AdSet={r['adset_id']}, Ad={r['ad_id']}")
    else:
        print(f"❌ {r['name']}: {r.get('error','?')}")
