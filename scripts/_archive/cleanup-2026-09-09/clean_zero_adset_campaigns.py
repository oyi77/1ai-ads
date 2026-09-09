#!/usr/bin/env python3
"""
Delete ALL campaigns on act_380721031313330 that have 0 adsets.
Scans every campaign, checks adset count, deletes broken ones.
"""
import os
import json
import urllib.request
import urllib.parse
import time
import sys

ACCESS_TOKEN = os.environ.get('META_ACCESS_TOKEN')
if not ACCESS_TOKEN:
    print("FATAL: META_ACCESS_TOKEN not set")
    sys.exit(1)

BASE = "https://graph.facebook.com/v22.0"
ACT = "act_380721031313330"

def api_get(path, params=None):
    """GET request to Facebook Graph API with pagination"""
    if params is None:
        params = {}
    params['access_token'] = ACCESS_TOKEN
    url = f"{BASE}/{path}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode())

def api_get_all(path, params=None, key='data', limit=500):
    """GET with full pagination"""
    if params is None:
        params = {'limit': limit}
    else:
        params['limit'] = limit
    
    results = []
    url_base = f"{BASE}/{path}"
    url_next = None
    
    while True:
        if url_next:
            # Use the full paging URL, just append access_token
            if '?' in url_next:
                full_url = f"{url_next}&access_token={ACCESS_TOKEN}"
            else:
                full_url = f"{url_next}?access_token={ACCESS_TOKEN}"
        else:
            params['access_token'] = ACCESS_TOKEN
            full_url = f"{url_base}?{urllib.parse.urlencode(params)}"
        
        req = urllib.request.Request(full_url)
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode())
        
        if key in data:
            results.extend(data[key])
        
        # Check for next page
        paging = data.get('paging', {})
        url_next = paging.get('next')
        if not url_next:
            break
        
        # Rate limit safety
        time.sleep(0.1)
    
    return results

def api_post(path, params=None):
    """POST request to Facebook Graph API"""
    if params is None:
        params = {}
    params['access_token'] = ACCESS_TOKEN
    url = f"{BASE}/{path}"
    data = urllib.parse.urlencode(params).encode()
    req = urllib.request.Request(url, data=data, method='POST')
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode())

print("=" * 60)
print("Scanning campaigns for act_380721031313330...")
print("=" * 60)

# Step 1: Fetch ALL campaigns (including those with status DELETED/ARCHIVED to be thorough)
campaigns = api_get_all(f"{ACT}/campaigns", 
    params={'fields': 'id,name,status,effective_status'},
    limit=500)

print(f"\nTotal campaigns found: {len(campaigns)}")

# Step 2: Classify campaigns
active_campaigns = []
deleted_campaigns = []

for c in campaigns:
    status = c.get('status', c.get('effective_status', 'UNKNOWN'))
    if status in ('DELETED', 'ARCHIVED'):
        deleted_campaigns.append(c)
    else:
        active_campaigns.append(c)

print(f"Active (non-deleted/archived): {len(active_campaigns)}")
print(f"Already DELETED/ARCHIVED:      {len(deleted_campaigns)}")

# Step 3: For each active campaign, check adset count
print("\n" + "=" * 60)
print("Checking adsets for each active campaign...")
print("=" * 60)

zero_adset = []
has_adsets = []
errors = []

for i, c in enumerate(active_campaigns):
    cid = c['id']
    cname = c.get('name', 'N/A')
    try:
        adsets = api_get(f"{cid}/adsets", params={'limit': 1, 'fields': 'id'})
        adset_count = len(adsets.get('data', []))
        if adset_count == 0:
            zero_adset.append(c)
            print(f"  [{i+1}/{len(active_campaigns)}] {cid} '{cname}' → 0 adsets ❌")
        else:
            has_adsets.append(c)
            print(f"  [{i+1}/{len(active_campaigns)}] {cid} '{cname}' → {adset_count}+ adsets ✓")
    except Exception as e:
        errors.append((c, str(e)))
        print(f"  [{i+1}/{len(active_campaigns)}] {cid} '{cname}' → ERROR: {e}")
    time.sleep(0.05)  # Rate limit

print(f"\n{'=' * 60}")
print(f"RESULTS:")
print(f"  Campaigns with adsets: {len(has_adsets)}")
print(f"  Campaigns with 0 adsets: {len(zero_adset)}")
print(f"  Errors: {len(errors)}")
print(f"  Already deleted/archived: {len(deleted_campaigns)}")
print(f"{'=' * 60}")

# Step 4: Delete zero-adset campaigns
if not zero_adset:
    print("\nNo campaigns to delete. Done!")
    sys.exit(0)

print(f"\nProceeding to DELETE {len(zero_adset)} campaign(s) with 0 adsets...")
print("=" * 60)

deleted_count = 0
delete_failures = []

for i, c in enumerate(zero_adset):
    cid = c['id']
    cname = c.get('name', 'N/A')
    try:
        result = api_post(f"{cid}", params={'method': 'delete'})
        if result.get('success') or 'success' in result:
            deleted_count += 1
            print(f"  [{i+1}/{len(zero_adset)}] DELETED: {cid} '{cname}' ✓")
        else:
            delete_failures.append((c, str(result)))
            print(f"  [{i+1}/{len(zero_adset)}] FAILED: {cid} '{cname}' → {result}")
    except Exception as e:
        delete_failures.append((c, str(e)))
        print(f"  [{i+1}/{len(zero_adset)}] FAILED: {cid} '{cname}' → {e}")
    time.sleep(0.1)

print(f"\n{'=' * 60}")
print(f"FINAL REPORT:")
print(f"  Total campaigns scanned:        {len(campaigns)}")
print(f"  Already DELETED/ARCHIVED:       {len(deleted_campaigns)}")
print(f"  Had adsets (kept):              {len(has_adsets)}")
print(f"  Had 0 adsets (targeted):        {len(zero_adset)}")
print(f"  Successfully deleted:           {deleted_count}")
print(f"  Delete failures:                {len(delete_failures)}")
print(f"  Check errors:                   {len(errors)}")
print(f"{'=' * 60}")

if delete_failures:
    print("\nDelete failures:")
    for c, err in delete_failures:
        print(f"  - {c['id']}: {err}")

if errors:
    print("\nCheck errors:")
    for c, err in errors:
        print(f"  - {c['id']}: {err}")

# Return non-zero if anything failed
if delete_failures or errors:
    sys.exit(1)
else:
    print("\nAll zero-adset campaigns deleted successfully.")
