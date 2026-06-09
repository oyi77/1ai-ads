import requests, json, sys, time
import os

tk = os.environ.get('META_ACCESS_TOKEN', '')
if not tk:
    print("ERROR: no token"); sys.exit(1)

API = 'https://graph.facebook.com/v22.0'
ACT_ID = 'act_380721031313330'
TODAY = '1006'

# LOWEST_COST campaigns with DIFFERENT audience from BIDCAP ones
# BIDCAP rakdapur3: Belanja(6003263791114) + Perkakas dapur(6003077174939)
# BIDCAP ataya:      Belanja(6003263791114) + Baju(6003242077675)
# LOWEST_COST must use DIFFERENT interests to avoid cannibalization

campaigns = [
    {
        "taglink": "rakdapur3",
        "label": "BelanjaOnline",
        "interest": [{"id": "6003346592981", "name": "Belanja online"}],
        "post_id": "122109158625125943",
    },
    {
        "taglink": "atayasetelankaosanak",
        "label": "Pakaian",
        "interest": [{"id": "6003456388203", "name": "Pakaian"}],
        "post_id": "122114371641125943",
    }
]

results = []
PAGE_ID = "1014428148422867"

for camp in campaigns:
    tag = camp["taglink"]
    label = camp["label"]
    iname = camp["interest"][0]["name"]
    
    print(f"\n{'='*50}")
    print(f"LOWEST_COST: {tag} ({iname})")
    print(f"{'='*50}")
    
    # Step 1: Campaign (ABO - no campaign budget, LOWEST_COST default strategy)
    cname = f"TC_{tag}_{label}_{TODAY}"
    cdata = {
        "name": cname,
        "objective": "OUTCOME_TRAFFIC",
        "status": "PAUSED",
        "special_ad_categories": "[]",
        "is_adset_budget_sharing_enabled": "false",
    }
    print(f"Campaign: {cname}")
    resp = requests.post(f"{API}/{ACT_ID}/campaigns", data={**cdata, "access_token": tk})
    cr = resp.json()
    if "id" not in cr:
        print(f"FAILED: {cr}")
        continue
    cid = cr["id"]
    print(f"✅ Campaign: {cid}")
    time.sleep(2)
    
    # Step 2: Creative
    sid = f"{PAGE_ID}_{camp['post_id']}"
    cr_data = {"name": f"Creative_{tag}_{TODAY}_LC", "object_story_id": sid}
    resp = requests.post(f"{API}/{ACT_ID}/adcreatives", data={**cr_data, "access_token": tk})
    crr = resp.json()
    if "id" not in crr:
        print(f"Creative FAILED: {crr}")
        continue
    crid = crr["id"]
    print(f"✅ Creative: {crid}")
    time.sleep(2)
    
    # Step 3: AdSet (LOWEST_COST, budget Rp20rb, NO bid_amount)
    aname = f"TC_{tag}_{label}_2555"
    targeting = {
        "geo_locations": {"countries": ["ID"]},
        "age_min": 23,
        "age_max": 55,
        "genders": [2],  # FEMALE!
        "publisher_platforms": ["facebook", "instagram"],
        "facebook_positions": ["feed", "facebook_reels", "story"],
        "instagram_positions": ["stream", "story", "reels", "explore"],
        "targeting_automation": {"advantage_audience": 0},
        "flexible_spec": [{"interests": camp["interest"]}],
    }
    as_data = {
        "name": aname,
        "campaign_id": cid,
        "status": "PAUSED",
        "billing_event": "IMPRESSIONS",
        "optimization_goal": "LINK_CLICKS",
        "daily_budget": 20000,
        "targeting": json.dumps(targeting),
    }
    print(f"AdSet: {aname}")
    print(f"  Interest: {iname}, Gender: FEMALE, Budget: Rp20.000")
    resp = requests.post(f"{API}/{ACT_ID}/adsets", data={**as_data, "access_token": tk})
    asr = resp.json()
    if "id" not in asr:
        print(f"AdSet FAILED: {asr}")
        continue
    asid = asr["id"]
    print(f"✅ AdSet: {asid}")
    time.sleep(2)
    
    # Step 4: Ad
    adname = f"TC_{tag}_Vdo1_v1"
    ad_data = {
        "name": adname,
        "adset_id": asid,
        "status": "PAUSED",
        "creative": json.dumps({"creative_id": crid}),
    }
    resp = requests.post(f"{API}/{ACT_ID}/ads", data={**ad_data, "access_token": tk})
    adr = resp.json()
    if "id" not in adr:
        print(f"Ad FAILED: {adr}")
        continue
    adid = adr["id"]
    print(f"✅ Ad: {adid}")
    
    results.append({
        "tag": tag, "label": label, "interest": iname,
        "campaign": cname, "campaign_id": cid,
        "adset_id": asid, "ad_id": adid
    })
    time.sleep(2)

print(f"\n\n{'='*50}")
print("RESULTS")
print(f"{'='*50}")
for r in results:
    print(f"\n✅ {r['tag']} ({r['interest']}):")
    print(f"   Campaign: {r['campaign']} | ID: {r['campaign_id']}")
    print(f"   AdSet ID: {r['adset_id']}")
    print(f"   Ad ID: {r['ad_id']}")
    print(f"   Status: PAUSED | Budget: Rp20.000 | LOWEST_COST")
