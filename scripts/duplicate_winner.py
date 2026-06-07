#!/usr/bin/env python3
"""
1041 Campaign Cloner — Clones winning campaigns WITH targeting preserved.

Usage:
  python3 duplicate_winner.py --campaign-id 120XXX --taglink rakdapur3
  python3 duplicate_winner.py --scale 2x --campaign-id 120XXX --taglink rakdapur3

Key difference from old script:
  - Clones TARGETING (interests, gender, age, placements, etc.) from source adset
  - NOT hardcoded BASE_TARGETING template
  - Uses META_TARGET_ACCOUNT from env (falls back to act_380721031313330)
  - Naming: {PREFIX}_{taglink}_{variant}_{date}_{id}
"""
import sys
import os
import json
import argparse
import requests
from datetime import datetime
from pathlib import Path

# ─── Config ───
REPO_ROOT = Path(__file__).resolve().parent.parent
ACCESS_TOKEN = os.environ.get("META_ACCESS_TOKEN", "")
if not ACCESS_TOKEN and (REPO_ROOT / ".env").exists():
    ACCESS_TOKEN = (REPO_ROOT / ".env").read_text().split("META_ACCESS_TOKEN=")[1].split("\n")[0].strip()

TARGET_ACCOUNT = os.environ.get("META_TARGET_ACCOUNT", "act_380721031313330")
API_BASE = "https://graph.facebook.com/v19.0"

# ─── Helpers ───

def api_get(endpoint, params=None):
    params = params or {}
    params["access_token"] = ACCESS_TOKEN
    params.setdefault("limit", 200)
    r = requests.get(f"{API_BASE}/{endpoint}", params=params, timeout=30)
    return r.json()


def api_post(endpoint, data):
    data["access_token"] = ACCESS_TOKEN
    r = requests.post(f"{API_BASE}/{endpoint}", data=data, timeout=30)
    return r.json()


def safe_json(d):
    """Serialize targeting dict safely."""
    return json.dumps(d, ensure_ascii=False) if isinstance(d, dict) else str(d)


# ─── Source readers ───

def get_campaign(campaign_id: str) -> dict:
    return api_get(campaign_id, {"fields": "id,name,status,effective_status,objective,special_ad_categories"})


def get_adsets(campaign_id: str) -> list:
    items = api_get(f"{campaign_id}/adsets", {
        "fields": "id,name,status,effective_status,daily_budget,bid_amount,bid_strategy,"
                  "optimization_goal,billing_event,targeting,promoted_object,"
                  "publisher_platforms,facebook_positions,instagram_positions,device_platforms"
    })
    return items.get("data", [])


def get_ads(adset_id: str) -> list:
    items = api_get(f"{adset_id}/ads", {
        "fields": "id,name,status,effective_status,creative"
    })
    return items.get("data", [])


# ─── Clone Engine ───

def clone_campaign(source_campaign_id: str, taglink: str, prefix: str = "CLONE",
                   budget_override: int = None, bid_override: int = None,
                   dry_run: bool = False, audience_override: str = None) -> dict:
    """Clone a winning campaign DENGAN audience diversification.
    
    Fix 2026-06-07: Tidak lagi copy-paste targeting 1:1.
    Gunakan --audience untuk pilih group berbeda dari original.
    Jika tidak diset, akan otomatis pilih audience yang belum terpakai.
    """

    # 1. Read source
    source = get_campaign(source_campaign_id)
    if "error" in source:
        return {"error": f"Campaign read: {source['error'].get('message', source['error'])}"}

    source_name = source.get("name", "unknown")
    source_obj  = source.get("objective", "OUTCOME_TRAFFIC")
    source_sac  = source.get("special_ad_categories", [])

    source_adsets = get_adsets(source_campaign_id)
    if not source_adsets:
        return {"error": f"No adsets found in source campaign {source_campaign_id}"}

    # 2. Build target name
    ts = datetime.now().strftime("%m%d_%H%M")
    variant = taglink.replace(" ", "_")
    new_camp_name = f"{prefix}_{variant}_{ts}"

    print(f"📋 Source campaign : {source_name}")
    print(f"🆕 Target campaign : {new_camp_name}")
    print(f"🎯 Source adsets   : {len(source_adsets)}")
    print(f"📦 Taglink         : {taglink}")

    if dry_run:
        print("🔍 DRY RUN — no campaigns created")
        for a in source_adsets[:3]:
            tgt = a.get("targeting") or {}
            print(f"   Adset: {a['name'][:40]} | gender={tgt.get('genders')} age={tgt.get('age_min')}-{tgt.get('age_max')} | platforms={tgt.get('publisher_platforms')}")
        return {"dry_run": True, "name": new_camp_name, "adsets_count": len(source_adsets)}

    # 3. Create campaign
    r = api_post(f"{TARGET_ACCOUNT}/campaigns", {
        "name": new_camp_name,
        "objective": source_obj,
        "status": "PAUSED",
        "special_ad_categories": safe_json(source_sac),
    })
    if "error" in r:
        return {"error": f"Campaign create: {r['error'].get('message', r['error'])}"}

    new_camp_id = r["id"]
    print(f"✅ Campaign created: {new_camp_id}")

    # 4. Clone adsets DENGAN audience diversification
    new_adset_ids = []
    new_ad_ids = []

    # Import AUDIENCE_POOL dari engine untuk konsistensi
    try:
        from vilona_trakpro_engine import AUDIENCE_POOL, _pick_diversified_audience
    except ImportError:
        # Fallback pool jika engine tidak bisa di-import
        AUDIENCE_POOL = {
            "Belanja": [{"id": "6003263791114", "name": "Belanja"}, {"id": "6003346592981", "name": "Belanja online"}],
            "Dapur": [{"id": "6003077174939", "name": "Perkakas dapur"}, {"id": "6003113941014", "name": "Kitchen"}],
            "Fashion": [{"id": "6003242077675", "name": "Baju"}, {"id": "6003456388203", "name": "Pakaian"}],
            "IbuRumah": [{"id": "6003107471210", "name": "Ibu rumah tangga"}],
            "Diskon": [{"id": "6003386553489", "name": "Kupon diskon"}],
            "Interior": [{"id": "6003384677038", "name": "Dekorasi rumah"}, {"id": "6003455765814", "name": "Perabotan rumah"}],
        }
        _pick_diversified_audience = None

    # Cari existing clones untuk diversification
    existing_camps = api_get(f"{TARGET_ACCOUNT}/campaigns", {"fields": "name", "limit": 200})
    existing_names = [c.get("name", "") for c in existing_camps.get("data", [])]
    clone_prefix = f"{prefix}_{taglink.replace(' ', '_')}_"
    existing_clones = [n for n in existing_names if clone_prefix.lower() in n.lower()]

    for i, aset in enumerate(source_adsets):
        aset_name = aset.get("name", f"AdSet_{i+1}")
        targeting = aset.get("targeting") or {}

        # ─── AUDIENCE DIVERSIFICATION (2026-06-07 fix) ───────────────
        if audience_override and audience_override in AUDIENCE_POOL:
            # Manual override: user pilih audience tertentu
            new_interests = AUDIENCE_POOL[audience_override]
            if new_interests:
                targeting["flexible_spec"] = [{"interests": new_interests}]
            else:
                targeting.pop("flexible_spec", None)
            audience_label = audience_override
            print(f"   🎯 Audience OVERRIDE: {audience_label}")
        elif _pick_diversified_audience:
            # Auto: engine memilih audience yang belum terpakai
            targeting, audience_label = _pick_diversified_audience(
                targeting, existing_clones, taglink)
            print(f"   🎯 Audience AUTO-diversified: {audience_label}")
        else:
            # Fallback: pilih audience yang belum terpakai secara sederhana
            og_interest_ids = set()
            for spec in targeting.get("flexible_spec", []):
                for interest in spec.get("interests", []):
                    og_interest_ids.add(interest.get("id", ""))
            
            used = set()
            for pool_name, pool_items in AUDIENCE_POOL.items():
                if {it["id"] for it in pool_items} & og_interest_ids:
                    used.add(pool_name)
            available = [k for k in AUDIENCE_POOL if k not in used]
            if available:
                pick = available[len(existing_clones) % len(available)]
                targeting["flexible_spec"] = [{"interests": AUDIENCE_POOL[pick]}]
                audience_label = pick
            else:
                targeting.pop("flexible_spec", None)
                audience_label = "Broad"
            print(f"   🎯 Audience FALLBACK-diversified: {audience_label}")

        budget = budget_override or int(aset.get("daily_budget", 0) or 500000)
        bid    = bid_override    or int(aset.get("bid_amount", 0) or 130)
        opt_goal  = aset.get("optimization_goal", "LINK_CLICKS")
        bill_evt  = aset.get("billing_event", "IMPRESSIONS")
        bid_strat = aset.get("bid_strategy", "COST_CAP")

        print(f"   📋 Cloning adset [{i+1}/{len(source_adsets)}]: {aset_name[:50]}")
        print(f"      targeting: gender={targeting.get('genders')} age={targeting.get('age_min')}-{targeting.get('age_max')} interests={audience_label}")

        r = api_post(f"{TARGET_ACCOUNT}/adsets", {
            "name": f"{prefix}_{aset_name}_{audience_label}_{i+1}",
            "campaign_id": new_camp_id,
            "daily_budget": budget,
            "bid_strategy": bid_strat,
            "bid_amount": bid,
            "billing_event": bill_evt,
            "optimization_goal": opt_goal,
            "targeting": safe_json(targeting),
            "status": "ACTIVE",
        })

        if "error" in r:
            print(f"      ❌ Adset create: {r['error'].get('message', r['error'])[:100]}")
            continue

        new_asid = r["id"]
        new_adset_ids.append(new_asid)
        print(f"      ✅ Adset: {new_asid}")

        # 5. Clone ads
        source_ads = get_ads(aset["id"])
        for j, ad in enumerate(source_ads):
            creative = ad.get("creative") or {}
            creative_id = creative.get("id") if isinstance(creative, dict) else creative

            if not creative_id:
                print(f"         ⚠️ No creative for ad {ad.get('id')}")
                continue

            ad_name = f"{new_camp_name}_{i+1}_{j+1}"
            r = api_post(f"{TARGET_ACCOUNT}/ads", {
                "name": ad_name,
                "adset_id": new_asid,
                "creative": safe_json({"creative_id": creative_id}),
                "status": "ACTIVE",
            })
            if "id" in r:
                new_ad_ids.append(r["id"])
            else:
                print(f"         ❌ Ad create: {r.get('error',{}).get('message','?')[:80]}")

    # 6. Activate campaign
    api_post(new_camp_id, {"status": "ACTIVE"})
    print(f"🚀 Campaign LIVE: {new_camp_id}")

    result = {
        "source_campaign_id": source_campaign_id,
        "campaign_id": new_camp_id,
        "campaign_name": new_camp_name,
        "taglink": taglink,
        "adset_ids": new_adset_ids,
        "ad_ids": new_ad_ids,
        "targeting_preserved": True,
        "timestamp": datetime.now().isoformat(),
    }

    # Log to file
    log_path = REPO_ROOT / "outputs" / "jendralbot_autoscaler" / "clone_log.jsonl"
    log_path.parent.mkdir(parents=True, exist_ok=True)
    with open(log_path, "a") as f:
        f.write(json.dumps(result, ensure_ascii=False) + "\n")

    return result


# ─── CLI ───

def main():
    parser = argparse.ArgumentParser(description="1041 Campaign Cloner — clones winning campaigns with targeting preserved")
    parser.add_argument("--campaign-id", required=True, help="Source winning campaign ID")
    parser.add_argument("--taglink", required=True, help="Taglink/product keyword for naming (e.g., rakdapur3)")
    parser.add_argument("--prefix", default="BIDCAP", help="Campaign name prefix (default: BIDCAP)")
    parser.add_argument("--budget", type=int, help="Daily budget in IDR (optional; copies source if omitted)")
    parser.add_argument("--bid", type=int, help="Bid cap in IDR (optional; copies source if omitted)")
    parser.add_argument("--dry-run", action="store_true", help="Show plan without creating")
    parser.add_argument("--scale", type=int, default=1, help="Number of clones (1 = single duplicate)")
    parser.add_argument("--audience", type=str, default=None,
                        help="Audience group override: Belanja, Dapur, Fashion, IbuRumah, Diskon, Interior, Travel, Resep, Broad. "
                             "Jika tidak diset, otomatis pilih yang belum terpakai.")

    args = parser.parse_args()

    if not ACCESS_TOKEN:
        print("❌ META_ACCESS_TOKEN not set")
        sys.exit(1)

    print(f"🔑 Account: {TARGET_ACCOUNT}")
    print(f"📱 Token:   {'✅ found' if ACCESS_TOKEN else '❌ missing'}")
    if args.audience:
        print(f"🎯 Audience: {args.audience} (manual override)")
    else:
        print(f"🎯 Audience: AUTO-diversify (pilih yang belum terpakai)")

    for n in range(args.scale):
        if args.scale > 1:
            print(f"\n{'='*50}")
            print(f"🔄 Clone {n+1}/{args.scale}")
            print(f"{'='*50}")

        result = clone_campaign(
            args.campaign_id,
            args.taglink,
            prefix=args.prefix,
            budget_override=args.budget,
            bid_override=args.bid,
            dry_run=args.dry_run,
            audience_override=args.audience,
        )

        if "error" in result:
            print(f"❌ {result['error']}")
        elif not args.dry_run:
            print(f"\n✅ Clone complete: {result.get('campaign_id', '?')}")
            print(f"   Adsets: {len(result.get('adset_ids', []))} | Ads: {len(result.get('ad_ids', []))}")
            print(f"   Targeting: {'🎯 diversified' if result.get('targeting_preserved') else '❌ NOT preserved'}")


if __name__ == "__main__":
    main()
