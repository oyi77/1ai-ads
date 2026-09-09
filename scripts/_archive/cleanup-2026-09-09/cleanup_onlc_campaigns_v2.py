#!/usr/bin/env python3
"""
Delete all ON_LC_ campaigns with 0 adsets on act_435670549443081.
V2: Uses nested fields (adsets.limit(1)) to avoid extra API calls.
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
    print(f"--- Cleanup: ON_LC_ campaigns with 0 adsets (V2: nested fields) ---\n")

    # === Fetch all ON_LC_ campaigns WITH adsets embedded ===
    print("[1] Fetching ON_LC_ campaigns (with adsets.limit(1)...")
    print("    ⏳ Waiting 30s for rate limit reset...")
    time.sleep(30)
    
    campaigns = []
    after = None

    while True:
        path = f"{ACT_ID}/campaigns"
        params = {
            "access_token": token,
            "fields": "id,name,status,adsets.limit(1){id}",
            "limit": 25,  # Smaller pages to be gentle
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
            error_body = resp.get("body", "")
            if "2446079" in error_body or "limit reached" in error_body:
                print(f"  ⚠️  Rate limited! Waiting 60s...")
                time.sleep(60)
                resp = api_req(f"{path}?{query}")
                if resp.get("_error"):
                    print(f"  ❌ Still rate limited after wait: {resp}")
                    break
            
        if resp.get("_error"):
            print(f"  ERROR: {resp}")
            break

        data_list = resp.get("data", [])
        campaigns.extend(data_list)
        print(f"  Fetched {len(data_list)} campaigns (total: {len(campaigns)})")

        paging = resp.get("paging", {})
        cursors = paging.get("cursors", {})
        after = cursors.get("after")
        if not after:
            break
        time.sleep(1)  # Gentle pacing

    print(f"\n  Total ON_LC_ campaigns found: {len(campaigns)}")

    if not campaigns:
        print("  No ON_LC_ campaigns to process.")
        # Still try Scale_ check
        campaigns = []
        to_delete = []
        to_keep = []
    else:
        # Parse adsets from embedded data
        to_delete = []
        to_keep = []

        for c in campaigns:
            cid = c["id"]
            cname = c["name"]
            adsets_data = c.get("adsets", {})
            adsets_list = adsets_data.get("data", []) if isinstance(adsets_data, dict) else []
            adset_count = len(adsets_list)

            if adset_count == 0:
                print(f"    ZERO adsets: {cname} ({cid}) → WILL DELETE")
                to_delete.append(c)
            else:
                print(f"    {adset_count}+ adsets: {cname} ({cid}) → KEEP")
                to_keep.append(c)

        print(f"\n  Summary: {len(to_keep)} campaigns with adsets (keep), {len(to_delete)} with 0 adsets (delete)")

    # === Delete campaigns with 0 adsets ===
    print(f"\n[2] Deleting {len(to_delete)} ON_LC_ campaigns with 0 adsets...")

    deleted = 0
    failed = 0

    for i, c in enumerate(to_delete):
        cid = c["id"]
        cname = c["name"]
        cstatus = c.get("status", "UNKNOWN")

        if cstatus in ("DELETED", "ARCHIVED"):
            print(f"  [{i+1}/{len(to_delete)}] SKIP {cname} — already {cstatus}")
            continue

        path = f"{cid}"
        params = {"access_token": token}
        query = "&".join(f"{k}={urllib.request.quote(str(v))}" for k, v in params.items())

        resp = api_req(f"{path}?{query}", method="DELETE")
        if resp.get("_error"):
            err_body = resp.get("body", "")
            if "2446079" in err_body or "limit reached" in err_body:
                print(f"  [{i+1}/{len(to_delete)}] RATE LIMITED on delete for {cname}, waiting 30s...")
                time.sleep(30)
                resp = api_req(f"{path}?{query}", method="DELETE")

            if resp.get("_error"):
                print(f"  [{i+1}/{len(to_delete)}] FAILED: {cname}: {resp}")
                failed += 1
            else:
                print(f"  [{i+1}/{len(to_delete)}] DELETED {cname} ({cid}) [retry]")
                deleted += 1
        else:
            print(f"  [{i+1}/{len(to_delete)}] DELETED {cname} ({cid})")
            deleted += 1

        time.sleep(0.5)

    # === Check Scale_setelangajahthaialand_Belanja_0610 ===
    print(f"\n[3] Checking Scale_setelangajahthaialand_Belanja_0610...")

    scale_name = "Scale_setelangajahthaialand_Belanja_0610"
    path = f"{ACT_ID}/campaigns"
    params = {
        "access_token": token,
        "fields": "id,name,status,adsets.limit(100){id,name,status}",
        "limit": 1,
        "filtering": json.dumps([{
            "field": "name",
            "operator": "EQUAL",
            "value": scale_name
        }])
    }
    query = "&".join(f"{k}={urllib.request.quote(str(v))}" for k, v in params.items())

    time.sleep(1)
    resp = api_req(f"{path}?{query}")

    scale_result = None
    if resp.get("_error"):
        err_body = resp.get("body", "")
        if "2446079" in err_body or "limit reached" in err_body:
            print(f"  ⚠️  Rate limited on Scale check, waiting 30s...")
            time.sleep(30)
            resp = api_req(f"{path}?{query}")

        if resp.get("_error"):
            scale_result = f"ERROR: {resp}"
            print(f"  {scale_result}")
        else:
            sc = resp["data"][0]
            adsets_data = sc.get("adsets", {})
            adsets_list = adsets_data.get("data", []) if isinstance(adsets_data, dict) else []
            adset_count = len(adsets_list)
            print(f"  Found: {sc['id']} | {sc['name']} | status={sc['status']} | AdsSets: {adset_count}")
            for ads in adsets_list:
                print(f"    - {ads['id']} | {ads['name']} | status={ads.get('status')}")
            scale_result = f"Has {adset_count} adsets"
    elif not resp.get("data"):
        # Try CONTAIN fallback
        params2 = params.copy()
        params2["filtering"] = json.dumps([{
            "field": "name",
            "operator": "CONTAIN",
            "value": "Scale_setelangajahthaialand"
        }])
        query2 = "&".join(f"{k}={urllib.request.quote(str(v))}" for k, v in params2.items())
        resp2 = api_req(f"{path}?{query2}")
        if resp2.get("data"):
            for c2 in resp2["data"]:
                adset_c = c2.get("adsets", {}).get("data", []) if isinstance(c2.get("adsets"), dict) else []
                print(f"  Similar: {c2['id']} | {c2['name']} | status={c2['status']} | AdsSets: {len(adset_c)}")
                for ads in adset_c:
                    print(f"    - {ads['id']} | {ads['name']} | status={ads.get('status')}")
            scale_result = "Not found by exact name; similar campaigns shown above"
        else:
            scale_result = f"Campaign '{scale_name}' NOT FOUND"
            print(f"  {scale_result}")
    else:
        sc = resp["data"][0]
        adsets_data = sc.get("adsets", {})
        adsets_list = adsets_data.get("data", []) if isinstance(adsets_data, dict) else []
        adset_count = len(adsets_list)
        print(f"  Found: {sc['id']} | {sc['name']} | status={sc['status']} | AdsSets: {adset_count}")
        for ads in adsets_list:
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
