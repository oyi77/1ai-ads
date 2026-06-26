#!/usr/bin/env python3
"""
Delete ALL campaigns on act_2125021885010866 that have 0 adsets.
Scan every campaign, check each for adsets. Any with 0 adsets and NOT already
DELETED/ARCHIVED: DELETE. Report exact count.
"""
import os
import json
import urllib.request
import urllib.error
import time
import sys

# Load token from .env
env_path = os.path.expanduser("~/projects/1ai-ads/.env")
token = None
with open(env_path) as f:
    for line in f:
        line = line.strip()
        if line.startswith("META_ACCESS_TOKEN="):
            token = line.split("=", 1)[1].strip().strip('"').strip("'")
            break

if not token:
    print("ERROR: META_ACCESS_TOKEN not found in .env")
    sys.exit(1)

print(f"Token loaded (length={len(token)})")

BASE = "https://graph.facebook.com/v22.0"
ACT = "act_2125021885010866"

def fb_get(endpoint, params=None):
    """GET request to Facebook Graph API, handles pagination."""
    url = f"{BASE}/{endpoint}"
    if params:
        query = "&".join(f"{k}={urllib.request.quote(str(v))}" for k, v in params.items())
        url += f"?{query}"
    
    req = urllib.request.Request(url)
    req.add_header("Authorization", f"Bearer {token}")
    
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode() if e.fp else ""
        return {"error": {"code": e.code, "message": body}}

def fb_delete(endpoint):
    """DELETE request to Facebook Graph API."""
    url = f"{BASE}/{endpoint}"
    req = urllib.request.Request(url, method="DELETE")
    req.add_header("Authorization", f"Bearer {token}")
    
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode() if e.fp else ""
        return {"error": {"code": e.code, "message": body}}

def get_all_paginated(endpoint, params, key):
    """Fetch all pages of a paginated endpoint."""
    all_items = []
    url_params = dict(params)
    
    while True:
        result = fb_get(endpoint, url_params)
        if "error" in result:
            print(f"  ERROR fetching {endpoint}: {result['error']}")
            break
        
        items = result.get(key, [])
        all_items.extend(items)
        
        # Check for next page
        paging = result.get("paging", {})
        cursors = paging.get("cursors", {})
        after = cursors.get("after")
        if not after:
            break
        
        url_params["after"] = after
        time.sleep(0.2)
    
    return all_items

# Step 1: Fetch ALL campaigns
print("\n=== STEP 1: Fetching ALL campaigns ===")
campaigns = get_all_paginated(
    f"{ACT}/campaigns",
    {
        "access_token": token,
        "fields": "id,name,status,effective_status",
        "limit": 100
    },
    "data"
)

print(f"Total campaigns found: {len(campaigns)}")

# Step 2: Check each campaign for adsets
print("\n=== STEP 2: Checking adsets for each campaign ===")
to_delete = []
stats_by_status = {}

for i, camp in enumerate(campaigns):
    camp_id = camp["id"]
    camp_name = camp.get("name", "N/A")
    camp_status = camp.get("status", "UNKNOWN")
    eff_status = camp.get("effective_status", "UNKNOWN")
    
    key = f"{camp_status}/{eff_status}"
    stats_by_status[key] = stats_by_status.get(key, 0) + 1
    
    # Skip already deleted or archived campaigns
    if camp_status in ("DELETED", "ARCHIVED") or eff_status in ("DELETED", "ARCHIVED"):
        if (i + 1) % 50 == 0 or (i + 1) == len(campaigns):
            print(f"  ... scanned {i+1}/{len(campaigns)} (skipping deleted/archived)")
        continue
    
    # Fetch adsets for this campaign
    adsets = get_all_paginated(
        f"{camp_id}/adsets",
        {
            "access_token": token,
            "fields": "id",
            "limit": 500
        },
        "data"
    )
    
    adset_count = len(adsets)
    
    if adset_count == 0:
        to_delete.append({
            "id": camp_id,
            "name": camp_name,
            "status": camp_status,
            "effective_status": eff_status
        })
        print(f"  [{i+1}/{len(campaigns)}] 0 adsets -> DELETE: {camp_name} ({camp_id}) status={camp_status}/{eff_status}")
    elif (i + 1) % 20 == 0 or (i + 1) == len(campaigns):
        print(f"  ... scanned {i+1}/{len(campaigns)} (latest: {adset_count} adsets)")
    
    time.sleep(0.15)

print(f"\nCampaigns with 0 adsets to delete: {len(to_delete)}")

# Status distribution
print("\n=== Campaign Status Distribution ===")
for status_key, count in sorted(stats_by_status.items()):
    print(f"  {status_key}: {count}")

# Step 3: Delete campaigns with 0 adsets
print(f"\n=== STEP 3: Deleting {len(to_delete)} campaigns ===")
deleted_count = 0
failed = []

for i, camp in enumerate(to_delete):
    camp_id = camp["id"]
    camp_name = camp["name"]
    
    print(f"  [{i+1}/{len(to_delete)}] Deleting: {camp_name} ({camp_id}) ...", end=" ", flush=True)
    
    result = fb_delete(f"{camp_id}?access_token={urllib.request.quote(token)}")
    
    if "error" in result:
        err = result["error"]
        print(f"FAILED: {err.get('code', '?')} - {err.get('message', 'Unknown')[:120]}")
        failed.append({"id": camp_id, "name": camp_name, "error": err})
    else:
        success = result.get("success", result)
        print(f"OK: {json.dumps(success)}")
        deleted_count += 1
    
    time.sleep(0.3)

# Final report
print("\n" + "=" * 60)
print("FINAL REPORT")
print("=" * 60)
print(f"Total campaigns scanned:    {len(campaigns)}")
print(f"Campaigns with 0 adsets:    {len(to_delete)}")
print(f"Successfully deleted:       {deleted_count}")
print(f"Failed to delete:           {len(failed)}")

if failed:
    print("\nFailed deletions:")
    for f in failed:
        print(f"  - {f['name']} ({f['id']}): {f['error'].get('message', 'Unknown')[:200]}")

print(f"\nEXACT COUNT OF DELETED CAMPAIGNS: {deleted_count}")
