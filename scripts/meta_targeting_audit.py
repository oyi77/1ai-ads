#!/usr/bin/env python3
"""Meta API targeting audit for given ad account.
Queries Graph API v19.0: campaigns -> adsets -> targeting fields.
Captures: gender, age, platforms, flexible_spec, full geo_locations, advantage_audience.
"""

import json
import os
import sys
import time
import requests
from urllib.parse import urlparse, parse_qs

# Config
ACCOUNT_ID = "act_380721031313330"
BASE_URL = "https://graph.facebook.com/v19.0"
OUTPUT_PATH = "/home/openclaw/projects/1ai-ads/outputs/jendralbot_autoscaler/meta_targeting_audit.json"
ENV_PATH = "/home/openclaw/projects/1ai-ads/.env"

# Load token
token = None
with open(ENV_PATH, "r") as f:
    for line in f:
        if "META_ACCESS_TOKEN" in line and not line.startswith("#"):
            token = line.strip().partition("=")[2]
            break

if not token:
    print("ERROR: META_ACCESS_TOKEN not found in .env", file=sys.stderr)
    sys.exit(1)

print(f"Token loaded: {len(token)} chars")

# TARGETING FIELDS to pull from adset
TARGETING_FIELDS = (
    "id,name,campaign_id,status,"
    "targeting{"
    "genders,age_min,age_max,"
    "publisher_platforms,"
    "flexible_spec,"
    "geo_locations{countries,regions,cities{key,name,region,country,radius,distance_unit},location_types},"
    "targeting_automation{advantage_audience}"
    "}"
)

session = requests.Session()
session.headers["Authorization"] = f"Bearer {token}"


def api_get(endpoint, params=None, max_retries=3):
    """GET with retry on transient errors."""
    url = f"{BASE_URL}/{endpoint}"
    for attempt in range(max_retries):
        try:
            resp = session.get(url, params=params, timeout=45)
            if resp.status_code == 400:
                data = resp.json()
                err_msg = data.get("error", {}).get("message", "Unknown")
                if "reduce the amount of data" in err_msg.lower() or "timeout" in err_msg.lower():
                    wait = (attempt + 1) * 3
                    print(f"  Rate/load limit, waiting {wait}s...")
                    time.sleep(wait)
                    continue
                else:
                    print(f"  API error 400: {err_msg}")
                    return None
            if resp.status_code == 429:
                wait = (attempt + 1) * 5
                print(f"  Rate limited, waiting {wait}s...")
                time.sleep(wait)
                continue
            if resp.status_code >= 500:
                wait = (attempt + 1) * 2
                print(f"  Server error {resp.status_code}, waiting {wait}s...")
                time.sleep(wait)
                continue
            resp.raise_for_status()
            return resp.json()
        except requests.exceptions.RequestException as e:
            wait = (attempt + 1) * 2
            print(f"  Request error: {e}, waiting {wait}s...")
            time.sleep(wait)
    print(f"  FAILED after {max_retries} retries: {endpoint}")
    return None


def get_all_paginated(endpoint, params, collection_key="data"):
    """Fetch all pages of a paginated collection."""
    all_items = []
    url_params = dict(params or {})
    url_params["limit"] = 100

    while True:
        data = api_get(endpoint, url_params)
        if not data:
            break
        items = data.get(collection_key, [])
        all_items.extend(items)
        print(f"    Fetched {len(items)} items (total: {len(all_items)})")

        paging = data.get("paging", {})
        next_url = paging.get("next")
        if not next_url:
            break
        parsed = urlparse(next_url)
        qs = parse_qs(parsed.query)
        url_params = {k: v[0] for k, v in qs.items()}
        time.sleep(0.5)

    return all_items


def extract_geo(geo_locations):
    """Extract structured geo info from targeting geo_locations."""
    geo = geo_locations or {}
    countries = geo.get("countries", []) or []
    regions = geo.get("regions", []) or []
    cities_raw = geo.get("cities", []) or []
    location_types = geo.get("location_types", []) or []

    cities = [{"key": c["key"], "name": c["name"], "region": c.get("region", ""),
               "radius": c.get("radius"), "distance_unit": c.get("distance_unit")}
              for c in cities_raw]

    # Unique regions from cities
    unique_regions_from_cities = sorted(set(
        c.get("region", "") for c in cities_raw if c.get("region")
    ))

    return {
        "countries": countries,
        "countries_count": len(countries),
        "regions": [{"key": r["key"], "name": r["name"]} for r in regions],
        "regions_count": len(regions),
        "cities": cities,
        "cities_count": len(cities),
        "unique_regions_from_cities": unique_regions_from_cities,
        "location_types": location_types,
    }


# Step 1: Get all ACTIVE campaigns
print("\n=== Step 1: Fetching active campaigns ===")
campaign_params = {
    "fields": "id,name,status,effective_status",
    "effective_status": json.dumps(["ACTIVE"]),
    "limit": 100,
}
campaigns = get_all_paginated(f"{ACCOUNT_ID}/campaigns", campaign_params)
active_campaigns = [c for c in campaigns if c.get("effective_status") == "ACTIVE" or c.get("status") == "ACTIVE"]
print(f"Active campaigns found: {len(active_campaigns)}")

# Step 2: For each active campaign, get adsets with targeting
results = []
for i, campaign in enumerate(active_campaigns):
    cid = campaign["id"]
    cname = campaign["name"]
    print(f"\n--- Campaign {i+1}/{len(active_campaigns)}: {cname} ({cid}) ---")

    adset_params = {"fields": TARGETING_FIELDS, "limit": 100}
    adsets = get_all_paginated(f"{cid}/adsets", adset_params)

    campaign_entry = {
        "id": cid,
        "name": cname,
        "status": campaign.get("effective_status") or campaign.get("status"),
        "adsets": [],
    }

    for adset in adsets:
        targeting = adset.get("targeting", {}) or {}

        # Extract flexible_spec interests summary
        flexible_spec = targeting.get("flexible_spec", []) or []
        interests_list = []
        for group in flexible_spec:
            interests_list.extend(group.get("interests", []))

        # Extract geo locations (full)
        geo_data = extract_geo(targeting.get("geo_locations", {}))

        # Extract advantage_audience
        targeting_auto = targeting.get("targeting_automation", {}) or {}
        advantage_audience = targeting_auto.get("advantage_audience", None)

        adset_entry = {
            "id": adset["id"],
            "name": adset.get("name", ""),
            "status": adset.get("status", ""),
            "targeting": {
                "genders": targeting.get("genders", []) or [],
                "age_min": targeting.get("age_min"),
                "age_max": targeting.get("age_max"),
                "publisher_platforms": targeting.get("publisher_platforms", []) or [],
                "flexible_spec_interests": [{"id": x["id"], "name": x["name"]} for x in interests_list],
                "flexible_spec_interests_count": len(interests_list),
                "geo_locations": geo_data,
                "advantage_audience": advantage_audience,
            },
        }
        campaign_entry["adsets"].append(adset_entry)

    results.append(campaign_entry)
    time.sleep(0.3)

# Assemble final output
output = {
    "account": ACCOUNT_ID,
    "api_version": "v19.0",
    "total_active_campaigns": len(active_campaigns),
    "total_adsets": sum(len(c["adsets"]) for c in results),
    "campaigns": results,
}

os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)

with open(OUTPUT_PATH, "w") as f:
    json.dump(output, f, indent=2, ensure_ascii=False)

print(f"\n=== DONE ===")
print(f"Output: {OUTPUT_PATH}")
print(f"Active campaigns: {len(active_campaigns)}")
print(f"Total adsets: {output['total_adsets']}")

for c in results:
    print(f"  {c['name']} ({c['id']}): {len(c['adsets'])} adsets")
    for a in c["adsets"]:
        t = a["targeting"]
        g = t["geo_locations"]
        print(f"    Adset {a['name']} ({a['id']}): "
              f"gender={t['genders']}, "
              f"age={t['age_min']}-{t['age_max']}, "
              f"platforms={t['publisher_platforms']}, "
              f"interests={t['flexible_spec_interests_count']}, "
              f"geo: countries={g['countries_count']} regions={g['regions_count']} cities={g['cities_count']} "
              f"loc_types={g['location_types']}, "
              f"advantage_audience={t['advantage_audience']}")
