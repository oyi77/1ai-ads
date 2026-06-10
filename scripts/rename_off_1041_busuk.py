#!/usr/bin/env python3
"""Rename busuk campaigns on 1041 to OFF_ prefix."""
import os, urllib.request, urllib.parse, json, time, sys

# Load token from .env (runtime, never embed)
env_path = "/home/openclaw/projects/1ai-ads/.env"
token = None
with open(env_path) as f:
    for line in f:
        if line.startswith("META_ACCESS_TOKEN="):
            token = line.split("=", 1)[1].strip().strip('"').strip("'")
            break
if not token:
    print("FATAL: token not found")
    sys.exit(1)
print(f"Token loaded: {len(token)} chars")

API = "https://graph.facebook.com/v22.0"
ACT_ID = "act_380721031313330"  # 1041 Nyamiresep

def api_get(endpoint, params=None):
    if params is None:
        params = {}
    params["access_token"] = token
    qs = urllib.parse.urlencode(params)
    url = f"{API}/{endpoint}?{qs}"
    try:
        with urllib.request.urlopen(url, timeout=15) as resp:
            return json.loads(resp.read())
    except Exception as e:
        print(f"  GET ERR {endpoint[:80]}: {e}")
        return {"data": []}

def api_post(endpoint, data_dict):
    data_dict["access_token"] = token
    qs = urllib.parse.urlencode(data_dict).encode()
    url = f"{API}/{endpoint}"
    try:
        req = urllib.request.Request(url, data=qs, method="POST")
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read())
    except Exception as e:
        body = e.read().decode() if hasattr(e, 'read') else str(e)
        print(f"  POST ERR {endpoint[:80]}: {body[:200]}")
        return {"error": body[:200]}

# 1. Fetch ALL campaigns
print("\n=== FETCHING 1041 CAMPAIGNS ===")
camps = api_get(f"{ACT_ID}/campaigns", {"fields": "id,name,status", "limit": "200"})
all_campaigns = camps.get("data", [])
print(f"Total: {len(all_campaigns)}")

# Categorize
non_off = [c for c in all_campaigns if not c["name"].startswith("OFF_")]
off_already = [c for c in all_campaigns if c["name"].startswith("OFF_")]
print(f"Non-OFF_: {len(non_off)}")
print(f"Already OFF_: {len(off_already)}")

# 2. Fetch insights
print("\n=== FETCHING INSIGHTS (7d) ===")
all_insights = {}
for i in range(0, len(non_off), 50):
    batch = non_off[i:i+50]
    ids = [c["id"] for c in batch]
    insights = api_get(f"{ACT_ID}/insights", {
        "fields": "campaign_id,campaign_name,spend,clicks,cpc,impressions,ctr",
        "time_range": json.dumps({"since": "2026-06-04", "until": "2026-06-11"}),
        "level": "campaign",
        "limit": "200",
        "filtering": json.dumps([{"field": "campaign.id", "operator": "IN", "value": ids}])
    })
    for ins in insights.get("data", []):
        all_insights[ins["campaign_id"]] = ins
    time.sleep(2)
    print(f"  Batch {i//50+1}: {len(insights.get('data', []))} insights")
print(f"Total insights: {len(all_insights)}")

# 3. PROVEN tags from Shopee commission
PROVEN_TAGS = ["rakdapur3", "atayasetelankaosanak"]

# 4. Classify
to_off = []
to_keep = []

for c in non_off:
    cid = c["id"]
    name = c["name"]
    status = c["status"]
    ins = all_insights.get(cid, {})
    spend = float(ins.get("spend", 0))
    clicks = int(ins.get("clicks", 0))
    cpc_val = float(ins.get("cpc", 0))
    
    name_lower = name.lower()
    is_proven = any(tag in name_lower for tag in PROVEN_TAGS)
    
    if is_proven:
        to_keep.append({"id": cid, "name": name, "spend": spend, "clicks": clicks, "status": status, "reason": "PROVEN_TAG"})
        continue
    
    # BUSUK criteria: spend > 50rb, no proven tag
    if spend > 50000:
        to_off.append({"id": cid, "name": name, "spend": spend, "clicks": clicks, "status": status, "reason": f"BAD_ROI"})
    elif spend > 10000 and clicks == 0:
        to_off.append({"id": cid, "name": name, "spend": spend, "clicks": clicks, "status": status, "reason": "NO_CLICKS"})

print(f"\n=== CLASSIFICATION ===")
print(f"🔥 KEEP (proven): {len(to_keep)}")
for item in to_keep[:10]:
    print(f"  ✅ {item['name'][:65]} | spend=Rp{int(item['spend']):,} | {item['status']}")
if len(to_keep) > 10:
    print(f"  ... +{len(to_keep)-10} more")

print(f"\n💀 OFF (busuk): {len(to_off)}")
for item in to_off[:15]:
    print(f"  ❌ {item['name'][:65]} | spend=Rp{int(item['spend']):,} | {item['reason']}")
if len(to_off) > 15:
    print(f"  ... +{len(to_off)-15} more")

# 5. RENAME to OFF_
print(f"\n=== RENAMING {len(to_off)} → OFF_ ===")
renamed = 0
already = 0
failed = 0

for item in to_off:
    cid = item["id"]
    old_name = item["name"]
    if old_name.startswith("OFF_"):
        already += 1
        continue
    
    new_name = f"OFF_{old_name}"
    result = api_post(cid, {"name": new_name})
    
    if result.get("success"):
        renamed += 1
        if renamed <= 8:
            print(f"  ✅ {old_name[:55]} → {new_name[:55]}")
    else:
        failed += 1
        err = result.get("error", str(result))
        print(f"  ❌ {old_name[:50]}: {err[:100]}")
    
    time.sleep(0.7)  # rate limit

print(f"\n=== RESULT ===")
print(f"✅ Renamed to OFF_: {renamed}")
print(f"⏭️ Already OFF_: {already}")
print(f"❌ Failed: {failed}")
print(f"🔥 KEPT (proven): {len(to_keep)}")

print(f"\nDone. Account 1041: {len(to_keep)} proven campaigns kept, {renamed} busuk campaigns now OFF_.")
