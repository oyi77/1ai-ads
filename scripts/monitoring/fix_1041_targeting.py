#!/usr/bin/env python3
"""
Fix targeting for all adsets on account 1041:
- Age: 25-55
- Gender: Female
- Geo: Jakarta, Jawa Barat, Jawa Tengah, Jawa Timur, Pulau Bali
- Keep existing interests/behaviors

Retries automatically if rate limited.
"""

import requests, json, time, sys, os

TOKEN_FILE = "/tmp/meta_token.txt"
AD_ACCT = "act_380721031313330"

REGIONS = [
    {"key": "1103", "name": "Jakarta"},
    {"key": "1104", "name": "Jawa Barat"},
    {"key": "1105", "name": "Jawa Tengah"},
    {"key": "1106", "name": "Jawa Timur"},
    {"key": "1102", "name": "Pulau Bali"},
]


def get_token():
    # Try file first
    if os.path.exists(TOKEN_FILE):
        with open(TOKEN_FILE) as f:
            return f.read().strip()
    # Try env
    return os.environ.get("META_ACCESS_TOKEN", "")


def check_targeting(adset):
    t = adset.get("targeting", {})
    g = t.get("genders", [])
    amin = t.get("age_min", 0)
    amax = t.get("age_max", 99)
    geo = t.get("geo_locations", {})
    regions = sorted([r["key"] for r in geo.get("regions", [])])
    target_regions = sorted([r["key"] for r in REGIONS])

    age_ok = amin >= 25 and amax <= 55
    gender_ok = g == [2]
    geo_ok = regions == target_regions

    return age_ok and gender_ok and geo_ok, {
        "age": f"{amin}-{amax}",
        "gender": g,
        "regions": regions,
        "age_ok": age_ok,
        "gender_ok": gender_ok,
        "geo_ok": geo_ok,
    }


def fix_adset(token, adset):
    t = adset.get("targeting", {})
    update = {
        "age_min": 25,
        "age_max": 55,
        "genders": [2],
        "geo_locations": {"regions": [{"key": r["key"]} for r in REGIONS]},
    }
    if "flexible_spec" in t:
        update["flexible_spec"] = t["flexible_spec"]

    r = requests.post(
        f'https://graph.facebook.com/v19.0/{adset["id"]}',
        params={"access_token": token, "targeting": json.dumps(update)},
    )
    return r.json()


def main():
    token = get_token()
    if not token:
        print("❌ No token found!")
        sys.exit(1)

    max_retries = 10
    for attempt in range(max_retries):
        print(f"\n=== Attempt {attempt+1}/{max_retries} ===")

        r = requests.get(
            f"https://graph.facebook.com/v19.0/{AD_ACCT}/adsets",
            params={"access_token": token, "fields": "id,name,targeting", "limit": 50},
        )

        if r.status_code != 200:
            err = r.json().get("error", {})
            print(f"⏳ Rate limited (attempt {attempt+1}). Waiting 5 min...")
            time.sleep(300)
            continue

        adsets = r.json().get("data", [])
        print(f"Found {len(adsets)} adsets")

        needs_fix = []
        ok_count = 0
        for a in adsets:
            is_ok, info = check_targeting(a)
            if is_ok:
                ok_count += 1
            else:
                needs_fix.append(a)

        print(f"✅ OK: {ok_count}")
        print(f"❌ Needs fix: {len(needs_fix)}")

        if not needs_fix:
            print("\n🎉 ALL ADSETS HAVE CORRECT TARGETING!")
            sys.exit(0)

        fixed = 0
        for a in needs_fix:
            time.sleep(15)
            res = fix_adset(token, a)
            if res.get("success"):
                fixed += 1
                print(f"  ✅ {a['name']}")
            else:
                print(f"  ❌ {a['name']}: {res.get('error',{}).get('message','')[:60]}")

        if fixed == len(needs_fix):
            print(f"\n🎉 ALL {fixed} ADSETS FIXED!")
            sys.exit(0)
        else:
            print(f"\n⚠️ Fixed {fixed}/{len(needs_fix)}. Retrying in 5 min...")
            time.sleep(300)

    print("\n❌ Max retries reached. Some adsets may still need fixing.")
    sys.exit(1)


if __name__ == "__main__":
    main()
