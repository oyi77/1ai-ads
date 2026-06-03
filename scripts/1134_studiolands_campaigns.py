#!/usr/bin/env python3
"""
1134 MALAYSIA — StudioLands Campaign Creator
Creates/test campaigns targeting Shopee MY studiolands products.
Part of 1ai-ads (AdForge) — Trakpro Vilona System

Products matched from Shopee MY affiliate data:
- Leggingwanitacotton (40 klik, 3+ orders) → Legging
- longslave → Longsleeve inner
- jerseymulimah → Baju muslimah

Usage:
  python3 1134_studiolands_campaigns.py create --product legging --budget 30000
  python3 1134_studiolands_campaigns.py create --product all --budget 20000
  python3 1134_studiolands_campaigns.py status
  python3 1134_studiolands_campaigns.py pause --product legging
"""
import sys, os, json, argparse, requests, time
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from trakpro_vilona import TOKEN, ACCOUNTS, api as t_api

API = 'https://graph.facebook.com/v19.0'
ACT = 'act_1773760133153789'
ACTOR = '1097815526754095'  # Page/IG actor for ad creative
PIXEL = '26650367991319626'  # Kapsul Soca pixel

# ─── Product Definitions ───
PRODUCTS = {
    'legging': {
        'name': 'Studiolands_Legging',
        'campaign_name': 'TC_Selow1134_Legging_studiolands_Pakaian_0603',
        'adset_name': 'TC_Selow1134_Legging_Leggingshopee_25-55',
        'ad_name': 'Selow1134_Legging_Gambar1_v1',
        'shopee_link': 'https://s.shopee.com.my/2g8NbG5IiU',
        'headline': 'Legging Wanita Cotton — Selesa & Berkualiti',
        'copy': 'Sumpah trauma beli legging online asyik ni. Tapi yang ni lain! 😍\n\n✅ Material cotton premium\n✅ Tak jarang & tak nipis\n✅ FREE shipping Malaysia\n\nKlik link utk harga PROMO! 👇',
        'sub_id': 'studiolands-Leggingwanitacotton-fbads--',
        'interests': [
            [{'id': '6003478942057', 'name': 'Legging (pakaian)'},
             {'id': '6003020572529', 'name': 'celana slim-fit (pakaian)'},
             {'id': '6003425255975', 'name': 'celana ketat (pakaian)'}],
            [{'id': '6003053088645', 'name': 'Online marketplace'},
             {'id': '6003263791114', 'name': 'Belanja (ritel)'},
             {'id': '6003346592981', 'name': 'Belanja online (ritel)'},
             {'id': '6016343989160', 'name': 'Lazada'}],
        ],
    },
    'longsleeve': {
        'name': 'Studiolands_Longsleeve',
        'campaign_name': 'TC_Selow1134_Longsleeve_studiolands_Inner_0603',
        'adset_name': 'TC_Selow1134_Longsleeve_Innerwear_25-55',
        'ad_name': 'Selow1134_Longsleeve_Gambar1_v1',
        'shopee_link': 'https://s.shopee.com.my/3LO4OoWuGf',
        'headline': 'Inner Longsleeve — Selesa Sepanjang Hari',
        'copy': 'Menangis bucu katil kalau tak jumpa inner berkualiti. Ni solution dia! 😭➡️😍\n\n✅ Microfiber sejuk & ringan\n✅ Tak luntur & tak berbulu\n✅ Warna exclusive untuk Muslimah\n\nKlik link utk harga PROMO! 👇',
        'sub_id': 'studiolands-longsleeve-fbads--',
        'interests': [
            [{'id': '6002972838022', 'name': 'Pakaian wanita'},
             {'id': '6003203113251', 'name': 'Fesyen muslimah'}],
            [{'id': '6003053088645', 'name': 'Online marketplace'},
             {'id': '6003346592981', 'name': 'Belanja online (ritel)'},
             {'id': '6016343989160', 'name': 'Lazada'}],
        ],
    },
    'jersey': {
        'name': 'Studiolands_Jersey',
        'campaign_name': 'TC_Selow1134_Jersey_studiolands_Fesyen_0603',
        'adset_name': 'TC_Selow1134_Jersey_MuslimahFesyen_25-55',
        'ad_name': 'Selow1134_Jersey_Gambar1_v1',
        'shopee_link': 'https://s.shopee.com.my/4AxBPr6GhS',
        'headline': 'Baju Muslimah Mikrofiber — Exclusive & Selesa',
        'copy': 'Biar betul wujud baju muslimah mikrofiber selesa & cantik macam ni! 😍\n\n✅ Material premium microfibre\n✅ Design exclusive & elegant\n✅ COD Malaysia available\n\nKlik link utk harga PROMO! 👇',
        'sub_id': 'jerseymulimah-fbads---',
        'interests': [
            [{'id': '6003203113251', 'name': 'Fesyen muslimah'},
             {'id': '6002972838022', 'name': 'Pakaian wanita'}],
            [{'id': '6003053088645', 'name': 'Online marketplace'},
             {'id': '6003346592981', 'name': 'Belanja online (ritel)'},
             {'id': '6016343989160', 'name': 'Lazada'}],
        ],
    },
}

# ─── Targeting ───
BASE_TARGETING = {
    'geo_locations': {'countries': ['MY']},
    'age_min': 25,
    'age_max': 55,
    'genders': [2],  # Women
    'publisher_platforms': ['facebook', 'instagram'],
    'facebook_positions': ['feed', 'facebook_reels', 'marketplace'],
    'instagram_positions': ['stream', 'reels'],
    'device_platforms': ['mobile'],
    'targeting_automation': {'advantage_audience': 0},
}


def make_targeting(interests):
    """Build targeting with given interests."""
    t = json.loads(json.dumps(BASE_TARGETING))
    if interests:
        t['flexible_spec'] = [{'interests': interests}]
    return t


def post(endpoint, data, retries=3):
    """POST with retry and rate limit handling."""
    for attempt in range(retries):
        try:
            r = requests.post(f'{API}/{endpoint}', 
                params={'access_token': TOKEN}, 
                json=data, timeout=20)
            result = r.json()
            if 'error' in result:
                code = result['error'].get('code', 0)
                # Rate limit — wait and retry
                if code in (4, 17, 80000):
                    wait = 30 * (attempt + 1)
                    print(f'  Rate limited, waiting {wait}s...')
                    time.sleep(wait)
                    continue
                # Already exists or duplicate
                if code == 100 and 'Duplicate' in str(result):
                    return {'duplicate': True, 'error': result['error']}
            return result
        except Exception as e:
            if attempt < retries - 1:
                time.sleep(10)
                continue
            return {'error': str(e)}
    return {'error': 'Max retries exceeded'}


def create_campaign(product_key, budget=30000, status='PAUSED', bid=250):
    """Create a full campaign for a product."""
    p = PRODUCTS.get(product_key)
    if not p:
        print(f'Unknown product: {product_key}')
        return None
    
    print(f'\\n=== {p["campaign_name"]} ===')
    
    # 1. Campaign (CBO)
    camp_data = {
        'name': p['campaign_name'],
        'objective': 'OUTCOME_TRAFFIC',
        'status': status,
        'special_ad_categories': [],
        'daily_budget': budget,
        'is_campaign_budget_optimization': True,
    }
    camp = post(f'{ACT}/campaigns', camp_data)
    cid = camp.get('id')
    if not cid:
        print(f'  ❌ Campaign FAILED: {json.dumps(camp, indent=2)[:300]}')
        return None
    print(f'  ✅ Campaign: {cid}')
    
    # 2. Adset
    adset_data = {
        'name': p['adset_name'],
        'campaign_id': cid,
        'status': status,
        'billing_event': 'IMPRESSIONS',
        'optimization_goal': 'LINK_CLICKS',
        'bid_amount': bid,
        'targeting': make_targeting(p['interests']),
        'publisher_platforms': BASE_TARGETING['publisher_platforms'],
        'facebook_positions': BASE_TARGETING['facebook_positions'],
        'instagram_positions': BASE_TARGETING['instagram_positions'],
    }
    adset = post(f'{ACT}/adsets', adset_data)
    aid = adset.get('id')
    if not aid:
        print(f'  ❌ Adset FAILED: {json.dumps(adset, indent=2)[:400]}')
        # Cleanup campaign
        post(cid, {'status': 'DELETED'})
        return None
    print(f'  ✅ Adset: {aid}')
    
    # 3. Creative
    creative_data = {
        'name': f'Creative_{p["campaign_name"]}',
        'object_story_spec': {
            'page_id': ACTOR,
            'link_data': {
                'link': p['shopee_link'],
                'message': p['copy'],
                'name': p['headline'],
                'call_to_action': {'type': 'SHOP_NOW'},
            }
        }
    }
    creative = post(f'{ACT}/adcreatives', creative_data)
    crid = creative.get('id')
    if not crid:
        print(f'  ❌ Creative FAILED: {json.dumps(creative, indent=2)[:300]}')
        post(cid, {'status': 'DELETED'})
        return None
    print(f'  ✅ Creative: {crid}')
    
    # 4. Ad
    ad_data = {
        'name': p['ad_name'],
        'adset_id': aid,
        'creative': {'creative_id': crid},
        'status': status,
    }
    ad = post(f'{ACT}/ads', ad_data)
    adid = ad.get('id')
    if not adid:
        print(f'  ❌ Ad FAILED: {json.dumps(ad, indent=2)[:300]}')
        post(cid, {'status': 'DELETED'})
        return None
    print(f'  ✅ Ad: {adid}')
    
    return {
        'product': product_key,
        'campaign_id': cid,
        'adset_id': aid,
        'creative_id': crid,
        'ad_id': adid,
        'budget': budget,
        'status': status,
        'created': datetime.now().isoformat(),
    }


def get_campaigns_status():
    """Get all 1134 campaign status."""
    camps = t_api(f'{ACT}/campaigns', {
        'fields': 'id,name,status,daily_budget',
        'limit': 50
    })
    
    active = []; paused = []; deleted = []
    for c in camps.get('data', []):
        s = c.get('status', '')
        if s == 'ACTIVE': active.append(c)
        elif s == 'PAUSED': paused.append(c)
        else: deleted.append(c)
    
    return {'active': active, 'paused': paused, 'other': deleted}


def print_status():
    """Print campaign status overview."""
    s = get_campaigns_status()
    print(f"\\n{'='*70}")
    print(f"🇲🇾 1134 MALAYSIA — StudioLands Campaign Status")
    print(f"{'='*70}")
    
    print(f"\\n✅ ACTIVE ({len(s['active'])}):")
    for c in s['active']:
        b = int(c.get('daily_budget', 0)) // 100
        print(f"  {c['name'][:50]:<50} Rp {b:>6,}/day | {c['id']}")
    
    print(f"\\n⏸️ PAUSED ({len(s['paused'])}):")
    for c in s['paused']:
        b = int(c.get('daily_budget', 0)) // 100
        print(f"  {c['name'][:50]:<50} Rp {b:>6,}/day | {c['id']}")
    
    print(f"\\n{'='*70}\\n")


def toggle_campaigns(product_key, action='pause'):
    """Pause/unpause campaigns by product."""
    p = PRODUCTS.get(product_key)
    if not p:
        print(f'Unknown product: {product_key}')
        return
    
    camps = t_api(f'{ACT}/campaigns', {
        'fields': 'id,name,status',
        'limit': 100
    })
    
    target = p['campaign_name'].lower()
    new_status = 'PAUSED' if action == 'pause' else 'ACTIVE'
    
    for c in camps.get('data', []):
        if target in c.get('name', '').lower():
            r = post(c['id'], {'status': new_status})
            print(f"  {c['name'][:45]:<45} → {new_status} {'✅' if r.get('success') else '❌'}")


def main():
    parser = argparse.ArgumentParser(description='1134 StudioLands Campaign Manager')
    parser.add_argument('action', choices=['create', 'status', 'pause', 'unpause', 'list'])
    parser.add_argument('--product', default='all', 
        choices=['all', 'legging', 'longsleeve', 'jersey'])
    parser.add_argument('--budget', type=int, default=30000, 
        help='Daily budget in IDR (default: 30000)')
    parser.add_argument('--bid', type=int, default=250,
        help='Bid amount in IDR (default: 250)')
    parser.add_argument('--status', default='PAUSED',
        choices=['ACTIVE', 'PAUSED'], help='Initial status')
    args = parser.parse_args()
    
    if not TOKEN:
        print('ERROR: META_ACCESS_TOKEN not set')
        sys.exit(1)
    
    if args.action == 'status':
        print_status()
        return
    
    if args.action == 'list':
        print_status()
        print("\\n📦 Available products:")
        for k, p in PRODUCTS.items():
            print(f"  {k:<12} → {p['campaign_name']}")
            print(f"            Link: {p['shopee_link']}")
            print(f"            SubID: {p['sub_id']}")
            print()
        return
    
    if args.action in ('pause', 'unpause'):
        if args.product == 'all':
            for k in PRODUCTS:
                toggle_campaigns(k, args.action)
        else:
            toggle_campaigns(args.product, args.action)
        return
    
    if args.action == 'create':
        results = []
        products_to_create = list(PRODUCTS.keys()) if args.product == 'all' else [args.product]
        
        for pk in products_to_create:
            r = create_campaign(pk, args.budget, args.status, args.bid)
            if r:
                results.append(r)
            time.sleep(3)  # Rate limit spacing
        
        # Save created campaigns log
        log_file = Path(__file__).resolve().parent.parent / 'data' / '1134_campaigns_created.json'
        existing = []
        if log_file.exists():
            try: existing = json.loads(log_file.read_text())
            except: pass
        existing.extend(results)
        log_file.write_text(json.dumps(existing, indent=2, default=str))
        
        print(f"\\n{'='*70}")
        print(f"✅ Created {len(results)}/{len(products_to_create)} campaigns")
        print(f"📁 Log: {log_file}")
        print(f"{'='*70}")
        
        if results:
            print("\\nNext: Review in Ads Manager, then:")
            print("  python3 1134_studiolands_campaigns.py unpause --product all")
        
        return


if __name__ == '__main__':
    main()
