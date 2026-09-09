#!/usr/bin/env python3
"""
Delete all ON_LC_ campaigns with 0 adsets on act_435670549443081.
Also check Scale_setelangajahthaialand_Belanja_0610 for adsets.
"""

import os
import sys
import json
import urllib.request
import urllib.error
import time

ACT_ID = "act_435670549443081"
BASE = "https://graph.facebook.com/v22.0"

def api_req(path, method="GET", data=None):
    """Make a request to the Facebook Graph API."""
    url = f"{BASE}/{path}"
    headers = {"Content-Type": "application/json"}
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        err_body = e.read().decode()
        return {"_error": True, "code": e.code, "body": err_body}

def get_token():
    return os.environ.get("META_ACCESS_TOKEN", os.environ.get("META_TOKEN", ""))

def main():
    token = get_token()
    if not token:
        print("ERROR: META_ACCESS_TOKEN not found in environment")
        sys.exit(1)

    print(f"--- Meta Ads Account: {ACT_ID} ---")
    print(f"--- Cleanup: ON_LC_ campaigns with 0 adsets ---\n")

    # === Fetch all ON_LC_ campaigns ===
    print("[1] Fetching ON_LC_ campaigns...")
    campaigns = []
    after = None

    while True:
        path = f"{ACT_ID}/campaigns"
        params = {
            "access_token": token,
            "fields": "id,name,status",
            "limit": 100,
            "filtering": json.dumps([{
                "field": "name",
                "operator": "CONTAIN",
                "value": "ON_LC_"
            }])
        }
        query = "&".join(f"{k}={urllib.request.quote(str(v))}" for k, v in params.items())
        if after:
            query += f"&after={after}"

        resp = api_req(f"{path}?{query}")
        if resp.get("_error"):
            print(f"  ERROR fetching campaigns: {resp}")
            break

        data_list = resp.get("data", [])
        campaigns.extend(data_list)
        print(f"  Fetched {len(data_list)} campaigns (total: {len(campaigns)})")

        paging = resp.get("paging", {})
        cursors = paging.get("cursors", {})
        after = cursors.get("after")
        if not after:
            break
        time.sleep(0.2)

    print(f"\n  Total ON_LC_ campaigns found: {len(campaigns)}")

    if not campaigns:
        print("  No ON_LC_ campaigns to process.")
    else:
        for c in campaigns:
            print(f"    - {c['id']} | {c['name']} | status={c['status']}")

    # === Check adsets for each ON_LC_ campaign ===
    to_delete = []
    to_keep = []

    print(f"\n[2] Checking adsets for each ON_LC_ campaign...")

    for i, c in enumerate(campaigns):
        cid = c["id"]
        cname = c["name"]

        # Fetch adsets
        path = f"{cid}/adsets"
        params = {
            "access_token": token,
            "fields": "id,name,status",
            "limit": 500
        }
        query = "&".join(f"{k}={urllib.request.quote(str(v))}" for k, v in params.items())

        resp = api_req(f"{path}?{query}")
        if resp.get("_error"):
            print(f"  [{i+1}/{len(campaigns)}] ERROR checking {cname}: {resp}")
            continue

        adset_count = len(resp.get("data", []))
        status = c.get("status", "UNKNOWN")

        if adset_count == 0:
            print(f"  [{i+1}/{len(campaigns)}] ZERO adsets: {cname} ({cid}) status={status} → WILL DELETE")
            to_delete.append(c)
        else:
            print(f"  [{i+1}/{len(campaigns)}] {adset_count} adsets: {cname} ({cid}) → KEEP")
            to_keep.append(c)

        time.sleep(0.2)

    # === Delete campaigns with 0 adsets ===
    print(f"\n[3] Deleting {len(to_delete)} ON_LC_ campaigns with 0 adsets...")

    deleted = 0
    failed = 0

    for i, c in enumerate(to_delete):
        cid = c["id"]
        cname = c["name"]
        cstatus = c.get("status", "UNKNOWN")

        # If campaign is not active/paused (maybe deleted/archived already), skip
        if cstatus in ("DELETED", "ARCHIVED"):
            print(f"  [{i+1}/{len(to_delete)}] SKIP {cname} — already {cstatus}")
            continue

        # DELETE via /{campaign_id}
        path = f"{cid}"
        params = {"access_token": token}
        query = "&".join(f"{k}={urllib.request.quote(str(v))}" for k, v in params.items())

        resp = api_req(f"{path}?{query}", method="DELETE")
        if resp.get("_error"):
            print(f"  [{i+1}/{len(to_delete)}] FAILED to delete {cname}: {resp}")
            failed += 1
        elif resp.get("success") == True or resp.get("success") == "true":
            print(f"  [{i+1}/{len(to_delete)}] DELETED {cname} ({cid})")
            deleted += 1
        else:
            # Some DELETE responses just return {success: true}
            print(f"  [{i+1}/{len(to_delete)}] DELETE response for {cname}: {resp}")
            deleted += 1

        time.sleep(0.3)

    # === Check Scale_setelangajahthaialand_Belanja_0610 ===
    print(f"\n[4] Checking Scale_setelangajahthaialand_Belanja_0610...")

    scale_name = "Scale_setelangajahthaialand_Belanja_0610"
    path = f"{ACT_ID}/campaigns"
    params = {
        "access_token": token,
        "fields": "id,name,status",
        "limit": 100,
        "filtering": json.dumps([{
            "field": "name",
            "operator": "EQUAL",
            "value": scale_name
        }])
    }
    query = "&".join(f"{k}={urllib.request.quote(str(v))}" for k, v in params.items())
    resp = api_req(f"{path}?{query}")

    scale_result = None
    if resp.get("_error"):
        scale_result = f"ERROR fetching campaign: {resp}"
    elif not resp.get("data"):
        print(f"  Campaign '{scale_name}' NOT FOUND (maybe already deleted or name mismatch)")

        # Try CONTAIN search as fallback
        params2 = {
            "access_token": token,
            "fields": "id,name,status",
            "limit": 100,
            "filtering": json.dumps([{
                "field": "name",
                "operator": "CONTAIN",
                "value": "Scale_setelangajahthaialand"
            }])
        }
        query2 = "&".join(f"{k}={urllib.request.quote(str(v))}" for k, v in params2.items())
        resp2 = api_req(f"{path}?{query2}")
        if resp2.get("data"):
            for c2 in resp2.get("data", []):
                print(f"  Found similar: {c2['id']} | {c2['name']} | status={c2['status']}")
                # Check adsets for this campaign
                cid2 = c2["id"]
                params3 = {
                    "access_token": token,
                    "fields": "id,name,status",
                    "limit": 500
                }
                query3 = "&".join(f"{k}={urllib.request.quote(str(v))}" for k, v in params3.items())
                resp3 = api_req(f"{cid2}/adsets?{query3}")
                adset_count = len(resp3.get("data", [])) if not resp3.get("_error") else "ERROR"
                print(f"    AdsSets: {adset_count}")
            scale_result = "Not found by exact name, similar campaigns listed above"
        else:
            scale_result = f"Campaign '{scale_name}' not found"
            print(f"  '{scale_name}' NOT FOUND in account")
    else:
        sc = resp["data"][0]
        print(f"  Found: {sc['id']} | {sc['name']} | status={sc['status']}")

        # Check adsets
        params3 = {
            "access_token": token,
            "fields": "id,name,status",
            "limit": 500
        }
        query3 = "&".join(f"{k}={urllib.request.quote(str(v))}" for k, v in params3.items())
        resp3 = api_req(f"{sc['id']}/adsets?{query3}")

        if resp3.get("_error"):
            scale_result = f"ERROR checking adsets: {resp3}"
            print(f"  AdsSets: ERROR - {resp3}")
        else:
            adset_data = resp3.get("data", [])
            adset_count = len(adset_data)
            print(f"  AdsSets: {adset_count}")
            for ads in adset_data:
                print(f"    - {ads['id']} | {ads['name']} | status={ads.get('status')}")
            scale_result = f"Has {adset_count} adsets"

    # === SUMMARY ===
    print(f"\n{'='*60}")
    print(f"SUMMARY")
    print(f"{'='*60}")
    print(f"ON_LC_ campaigns found:    {len(campaigns)}")
    print(f"ON_LC_ with adsets:        {len(to_keep)} (kept)")
    print(f"ON_LC_ with 0 adsets:      {len(to_delete)}")
    print(f"ON_LC_ successfully deleted: {deleted}")
    print(f"ON_LC_ delete failures:      {failed}")
    print(f"Scale_setelangajahthaialand_Belanja_0610: {scale_result}")

if __name__ == "__main__":
    main()
