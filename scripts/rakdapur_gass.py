#!/usr/bin/env python3
"""
🔥 RAK DAPUR CONTENT KINGDOM — Full Pipeline
=============================================
1. Generate FB page posts with Shopee affiliate links
2. Create Meta Ads campaigns (act_380721031313330 / 1041)
3. Targeting: Women 25-55, BROAD, mobile only, city-level

Usage:
  python3 rakdapur_gass.py --post-pages     # Post to all 16 FB pages
  python3 rakdapur_gass.py --create-ads     # Create Meta Ads test campaigns
  python3 rakdapur_gass.py --full-send      # DO EVERYTHING 🔥
"""

import json, os, sys, time, random, requests
from pathlib import Path
from datetime import datetime
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'lib'))
from credentials import get_meta_token

# ═══════════════════════════════
# CONFIG
# ═══════════════════════════════
META_TOKEN = get_meta_token()
ACCOUNT_ID = "act_380721031313330"  # nyamiresepdapur
FB_PAGE_TOKEN_FILE = Path.home() / ".openclaw/workspace/data/fb_page_tokens.json"
LOG_FILE = Path.home() / "projects/1ai-ads/logs/rakdapur_gass.log"
API_VERSION = "v19.0"
BASE_URL = f"https://graph.facebook.com/{API_VERSION}"

# ═══════════════════════════════
# TOP 8 RAK DAPUR PRODUCTS
# ═══════════════════════════════
PRODUCTS = [
    {
        "name": "Rak Dapur Plastik Aesthetic 4 Layer",
        "komisi": 4389, "harga": 39900,
        "link": "https://s.shopee.co.id/3B4kbrOqD7",
        "hook": "Dapur makin rapi dalam 5 menit! 🔥",
        "desc": "Rak susun aesthetic 4 layer dengan roda. Bikin dapur langsung upgrade!"
    },
    {
        "name": "Rak Piring Wastafel Stainless Steel",
        "komisi": 6992, "harga": 174800,
        "link": "https://s.shopee.co.id/3qKRP5MIrB",
        "hook": "Rak piring stainless AUTO KERING! ✨",
        "desc": "Dish rack stainless steel multifungsi. Piring langsung kering, dapur bebas lembab!"
    },
    {
        "name": "Rel Panci Gantung Tarik Dorong",
        "komisi": 4053, "harga": 29000,
        "link": "https://s.shopee.co.id/6AiMBNDQ7P",
        "hook": "PANCI BERANTAKAN? SOLUSINYA INI! 🍳",
        "desc": "Rel panci tarik dorong bawah dapur + free 5 cantolan. Dapur minimalis!"
    },
    {
        "name": "OKK Rak Bumbu Vertikal 3 Susun",
        "komisi": 4080, "harga": 51000,
        "link": "https://s.shopee.co.id/60Ovz4E3SM",
        "hook": "Bumbu dapur berantakan? LIAT INI! 🧅",
        "desc": "Rak bumbu vertikal OKK Official. Kuat, minimalis, bikin dapur estetik!"
    },
    {
        "name": "OKK Rak Dapur Tempel Tanpa Bor",
        "komisi": 3480, "harga": 43500,
        "link": "https://s.shopee.co.id/2g8U0wQkE2",
        "hook": "TEMPEL DOANG! Gak perlu bor! 🔧",
        "desc": "Rak dapur tempel besi tebal anti karat OKK. Praktis, kuat, gak perlu tukang!"
    },
    {
        "name": "Rak Dapur Susun Sudut 3 Tingkat",
        "komisi": 3289, "harga": 29900,
        "link": "https://s.shopee.co.id/5fm5aSFK8K",
        "hook": "Sudut dapur kosong? SULAP JADI INI! 🪄",
        "desc": "Rak sudut 3 tingkat. Manfaatin space mati jadi storage keren!"
    },
    {
        "name": "Rak Cobek Talenan Besi Anti Karat",
        "komisi": 2400, "harga": 15000,
        "link": "https://s.shopee.co.id/2LVdcKS0u0",
        "hook": "COBEK & TALENAN GAK BERSERAKAN LAGI! 🔪",
        "desc": "Rak cobek talenan besi kokoh anti karat. Komisi 16% — cuan maksimal!"
    },
    {
        "name": "Rak Troli Serbaguna 4 Tingkat Roda",
        "komisi": 1739, "harga": 29000,
        "link": "https://s.shopee.co.id/gNPdGYMGp",
        "hook": "RAK TROLI 4 TINGKAT CUMA 29RB?! 🤯",
        "desc": "Rak troli square serbaguna dengan roda. Bisa buat dapur, kamar mandi, salon!"
    },
]

# ═══════════════════════════════
# HASHTAGS (rotating)
# ═══════════════════════════════
HASHTAG_BANKS = [
    "#RakDapur #DapurMinimalis #OrganizerDapur #RekomendasiProduk #Viral",
    "#PerabotanDapur #DapurRapi #RakDapurMurah #ProdukViral #FYP",
    "#DapurEstetik #HomeOrganizer #RakDapur #ShopeeHaul #BerkahKarya",
    "#RacunShopee #BeliDiShopee #DapurViral #HomeDecor #WajibCoba",
    "#DapurImpian #StorageSolution #RakMultifungsi #PromoShopee #Viral",
]

# ═══════════════════════════════
# POST TEMPLATES (natural FB style)
# ═══════════════════════════════
POST_TEMPLATES = [
    """{hook}

{desc}

🛒 Cek produk & harga terbaru di sini ya 👇
{link}

{hashtags}""",

    """🔥 {hook}

{desc}

Gaskeun cek sendiri kualitasnya! Link produk 👉 {link}

{hashtags}""",

    """Yang butuh {name} merapat! 🎯

{desc}

Harga? Cek langsung aja di link ini ya ges {link}

{hashtags}""",

    """Rekomendasi buat yang mau bikin dapur makin estetik ✨

{name}
✨ {desc}

🛍️ Cek di sini: {link}

{hashtags}""",

    """Hidden gem nemu ini! 😍

{name}

{desc}

Masih ada stok kayaknya. Langsung cek: {link}

{hashtags}""",
]


def log(msg):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line)
    Path(LOG_FILE).parent.mkdir(parents=True, exist_ok=True)
    with open(LOG_FILE, 'a') as f:
        f.write(line + '\n')


def get_fb_pages():
    """Load FB page tokens"""
    if not FB_PAGE_TOKEN_FILE.exists():
        log("❌ No FB page tokens found!")
        return {}
    with open(FB_PAGE_TOKEN_FILE) as f:
        return json.load(f)


def post_to_fb_page(page_id, token, message):
    """Post to a single FB page"""
    try:
        url = f"{BASE_URL}/{page_id}/feed"
        params = {
            "message": message,
            "access_token": token.strip(),
        }
        r = requests.post(url, params=params, timeout=15)
        data = r.json()
        if "id" in data:
            return data["id"]
        else:
            log(f"  ⚠️ Post failed page {page_id}: {data.get('error',{}).get('message','?')}")
            return None
    except Exception as e:
        log(f"  ❌ Error posting to {page_id}: {e}")
        return None


def post_all_pages():
    """Post rak dapur content to ALL 16 FB pages"""
    pages = get_fb_pages()
    if not pages:
        log("❌ No pages to post to!")
        return
    
    products = PRODUCTS
    random.shuffle(products)
    
    results = {"success": 0, "failed": 0, "total": len(pages) * 2}
    
    log(f"🚀 POSTING RAK DAPUR TO {len(pages)} FB PAGES (2 posts each)")
    
    for i, (page_id, token) in enumerate(pages.items()):
        # Pick 2 random products per page
        page_products = random.sample(products, min(2, len(products)))
        
        for j, prod in enumerate(page_products):
            template = random.choice(POST_TEMPLATES)
            hashtags = random.choice(HASHTAG_BANKS)
            
            caption = template.format(
                hook=prod["hook"],
                name=prod["name"],
                desc=prod["desc"],
                link=prod["link"],
                hashtags=hashtags,
            )
            
            post_id = post_to_fb_page(page_id, token, caption)
            if post_id:
                results["success"] += 1
            else:
                results["failed"] += 1
            
            time.sleep(2)  # Rate limit
        
        if (i + 1) % 5 == 0:
            log(f"  Progress: {i+1}/{len(pages)} pages done")
    
    log(f"✅ POSTING DONE: {results['success']}/{results['total']} success")
    return results


def create_meta_campaign(product, index):
    """Create a Meta Ads campaign for one product"""
    try:
        campaign_name = f"V4_RakDapur_{product['name'][:30]}_{index}"
        
        # 1. CREATE CAMPAIGN
        url = f"{BASE_URL}/{ACCOUNT_ID}/campaigns"
        params = {
            "name": campaign_name,
            "objective": "OUTCOME_TRAFFIC",
            "status": "ACTIVE",
            "special_ad_categories": ["NONE"],
            "access_token": META_TOKEN,
        }
        r = requests.post(url, params=params, timeout=15)
        camp_data = r.json()
        
        if "id" not in camp_data:
            log(f"  ❌ Campaign failed: {camp_data.get('error',{}).get('message','?')}")
            return None
        
        campaign_id = camp_data["id"]
        log(f"  ✅ Campaign: {campaign_id} — {campaign_name}")
        
        # 2. CREATE AD SET
        url = f"{BASE_URL}/{campaign_id}/adsets"
        as_params = {
            "name": f"{campaign_name}_AdSet",
            "optimization_goal": "LINK_CLICKS",
            "billing_event": "IMPRESSIONS",
            "bid_amount": 100,  # Rp100 bid cap
            "daily_budget": 20000,  # Rp20K test budget
            "bid_strategy": "LOWEST_COST_WITH_BID_CAP",
            "targeting": json.dumps({
                "geo_locations": {
                    "countries": ["ID"],
                    "location_types": ["home", "recent"],
                },
                "age_min": 25,
                "age_max": 55,
                "genders": [2],  # Women only
                "publisher_platforms": ["facebook", "instagram"],
                "facebook_positions": ["feed", "marketplace"],
                "instagram_positions": ["stream", "explore"],
                "device_platforms": ["mobile"],
                "user_os": ["android", "ios"],
            }),
            "status": "ACTIVE",
            "access_token": META_TOKEN,
        }
        r = requests.post(url, params=as_params, timeout=15)
        adset_data = r.json()
        
        if "id" not in adset_data:
            log(f"  ❌ AdSet failed: {adset_data.get('error',{}).get('message','?')}")
            return None
        
        adset_id = adset_data["id"]
        log(f"  ✅ AdSet: {adset_id}")
        
        # 3. CREATE AD (link ad - no creative needed)
        url = f"{BASE_URL}/{adset_id}/ads"
        ad_params = {
            "name": f"{campaign_name}_Ad",
            "creative": json.dumps({
                "name": f"{product['name'][:40]}",
                "object_story_spec": {
                    "page_id": "1097815526754095",  # Daily Riview
                    "link_data": {
                        "link": product["link"],
                        "message": f"{product['hook']}\n\n{product['desc']}\n\n🛒 Cek harga & beli di Shopee!",
                        "name": product["name"],
                        "description": product["desc"],
                        "call_to_action": {"type": "SHOP_NOW"},
                    },
                },
            }),
            "status": "ACTIVE",
            "access_token": META_TOKEN,
        }
        r = requests.post(url, params=ad_params, timeout=15)
        ad_data = r.json()
        
        if "id" not in ad_data:
            log(f"  ❌ Ad failed: {ad_data.get('error',{}).get('message','?')}")
            return None
        
        ad_id = ad_data["id"]
        log(f"  ✅ Ad: {ad_id}")
        
        return {
            "campaign_id": campaign_id,
            "adset_id": adset_id,
            "ad_id": ad_id,
            "name": campaign_name,
            "product": product["name"],
            "link": product["link"],
        }
        
    except Exception as e:
        log(f"  ❌ Error: {e}")
        return None


def create_all_meta_ads():
    """Create Meta Ads for all 8 products"""
    log(f"\n{'='*60}")
    log(f"🔥 CREATING META ADS — Account {ACCOUNT_ID}")
    log(f"   Targeting: Women 25-55, BROAD, Mobile Only, ID")
    log(f"   Budget: Rp20K/adset, Bid Cap: Rp100")
    log(f"{'='*60}\n")
    
    results = []
    for i, product in enumerate(PRODUCTS):
        log(f"\n📦 Product {i+1}/{len(PRODUCTS)}: {product['name']}")
        log(f"   Komisi: Rp{product['komisi']:,} | Harga: Rp{product['harga']:,}")
        log(f"   Link: {product['link']}")
        
        result = create_meta_campaign(product, i + 1)
        if result:
            results.append(result)
        
        time.sleep(2)  # Rate limit
    
    log(f"\n{'='*60}")
    log(f"✅ ADS CREATED: {len(results)}/{len(PRODUCTS)} campaigns")
    
    # Save results
    results_file = Path.home() / "projects/1ai-ads/data/rakdapur_campaigns.json"
    results_file.parent.mkdir(parents=True, exist_ok=True)
    with open(results_file, 'w') as f:
        json.dump({
            "created_at": datetime.now().isoformat(),
            "account": ACCOUNT_ID,
            "total_created": len(results),
            "campaigns": results,
        }, f, indent=2)
    
    log(f"📁 Saved to: {results_file}")
    
    # Summary
    total_budget = 20000 * len(results)
    log(f"\n💰 TOTAL DAILY BUDGET: Rp{total_budget:,}")
    log(f"   Max potential commission: Rp{sum(PRODUCTS[i]['komisi'] for i in range(len(results))):,}/sale")
    
    return results


def run_full_pipeline():
    """EXECUTE EVERYTHING"""
    log("=" * 60)
    log("🔥 RAK DAPUR CONTENT KINGDOM — FULL SEND 🔥")
    log(f"   Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    log("=" * 60)
    
    # Phase 1: Post to FB Pages
    log("\n📱 PHASE 1: FB PAGE POSTING")
    post_results = post_all_pages()
    
    # Phase 2: Create Meta Ads
    log("\n🎯 PHASE 2: META ADS CREATION")
    ad_results = create_all_meta_ads()
    
    # Summary
    log(f"\n{'='*60}")
    log("🏁 PIPELINE COMPLETE")
    log(f"   FB Posts: {post_results.get('success',0) if post_results else 'N/A'}")
    log(f"   Meta Ads: {len(ad_results) if ad_results else 0} campaigns")
    log(f"   Monitor: python3 scripts/rakdapur_gass.py --status")
    log(f"{'='*60}")


if __name__ == "__main__":
    if "--post-pages" in sys.argv:
        post_all_pages()
    elif "--create-ads" in sys.argv:
        create_all_meta_ads()
    elif "--full-send" in sys.argv:
        run_full_pipeline()
    elif "--status" in sys.argv:
        results_file = Path.home() / "projects/1ai-ads/data/rakdapur_campaigns.json"
        if results_file.exists():
            with open(results_file) as f:
                data = json.load(f)
            print(f"📊 RAK DAPUR CAMPAIGNS")
            print(f"   Created: {data['created_at']}")
            print(f"   Account: {data['account']}")
            print(f"   Total: {data['total_created']} campaigns")
            print(f"   Budget/Day: Rp{20000*data['total_created']:,}")
        else:
            print("❌ No campaigns created yet. Run --create-ads first.")
    else:
        print(__doc__)
        print("Usage:")
        print("  python3 rakdapur_gass.py --post-pages     # Post to all FB pages")
        print("  python3 rakdapur_gass.py --create-ads     # Create Meta Ads")
        print("  python3 rakdapur_gass.py --full-send      # DO EVERYTHING")
        print("  python3 rakdapur_gass.py --status         # Check status")
