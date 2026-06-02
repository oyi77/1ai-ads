#!/usr/bin/env python3
"""
0858 Campaign Duplicator — Scale winning campaigns with interest expansion
Part of 1ai-ads (AdForge)

Usage:
  python3 duplicate_winner.py --campaign-id 120XXX --product organizerpullout --interests "Dapur,Rumah,Belanja"
  python3 duplicate_winner.py --campaign-id 120XXX --scale 2x  # duplicate with 2 new interest sets
"""
import sys, os, json, argparse, requests
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / ".openclaw" / "workspace" / "scripts"))
try:
    from ads_dashboard import ACCESS_TOKEN as TOKEN
except:
    TOKEN = os.environ.get('META_ACCESS_TOKEN', '')

API = 'https://graph.facebook.com/v19.0'
ACT = 'act_435670549443081'
PAGE_ID = '1014428148422867'

# ─── Interest Library (hidden interests for expansion) ───
INTEREST_POOLS = {
    'dapur_perabot': [
        {'id': '6002897751962', 'name': 'Dapur (rumah & taman)'},
        {'id': '6003077174939', 'name': 'Perkakas dapur (dapur & ruang makan)'},
        {'id': '6003399722806', 'name': 'Dapur (Memasak)'},
    ],
    'shopping_buyer': [
        {'id': '6003053088645', 'name': 'Online marketplace'},
        {'id': '6003221485467', 'name': 'Perdagangan elektronik (ritel)'},
        {'id': '6003263791114', 'name': 'Belanja (ritel)'},
        {'id': '6003346592981', 'name': 'Belanja online (ritel)'},
    ],
    'home_living': [
        {'id': '6003327621683', 'name': 'Rumah'},
        {'id': '6003139266461', 'name': 'Perabot rumah'},
        {'id': '6003360332669', 'name': 'Dekorasi rumah'},
    ],
    'lifestyle': [
        {'id': '6003461723252', 'name': 'Resep'},
        {'id': '6003139266461', 'name': 'Perabot rumah'},
    ],
}

BASE_TARGETING = {
    'geo_locations': {'countries': ['ID']},
    'age_min': 25,
    'age_max': 55,
    'genders': [2],
    'publisher_platforms': ['facebook', 'instagram'],
    'facebook_positions': ['feed', 'facebook_reels', 'story'],
    'instagram_positions': ['stream', 'story', 'reels'],
    'device_platforms': ['mobile'],
    'targeting_automation': {'advantage_audience': 0},
}

CREATIVES = {
    'rakpiringpengering': '1291424389870415',
    'organizerpullout': '1215307210568390',
}


def make_targeting(interest_pool_names):
    """Build targeting with given interest pools combined."""
    interests = []
    for pool_name in interest_pool_names:
        if pool_name in INTEREST_POOLS:
            interests.extend(INTEREST_POOLS[pool_name])
    
    t = json.loads(json.dumps(BASE_TARGETING))
    t['flexible_spec'] = [{'interests': interests}]
    return t


def get_campaign_info(campaign_id):
    """Fetch campaign metadata."""
    r = requests.get(f'{API}/{campaign_id}', params={
        'fields': 'id,name,status,daily_budget,objective',
        'access_token': TOKEN
    }, timeout=15).json()
    return r


def get_adsets(campaign_id):
    """Get all adsets in a campaign with targeting + ads."""
    r = requests.get(f'{API}/{campaign_id}/adsets', params={
        'fields': 'id,name,status,daily_budget,bid_amount,bid_strategy,targeting,optimization_goal,billing_event',
        'access_token': TOKEN
    }, timeout=15).json()
    
    adsets = r.get('data', [])
    for a in adsets:
        # Get ads for each adset
        r2 = requests.get(f'{API}/{a["id"]}/ads', params={
            'fields': 'id,name,status,creative{id}',
            'access_token': TOKEN
        }, timeout=15).json()
        a['ads'] = r2.get('data', [])
    
    return adsets


def duplicate_campaign(original_id, product, interest_pools, budget=500000, bid=130, prefix='SCALE'):
    """
    Duplicate a winning campaign with new interest sets.
    
    Args:
        original_id: Source campaign ID
        product: 'rakpiringpengering' or 'organizerpullout'
        interest_pools: List of pool names from INTEREST_POOLS
        budget: Daily budget in IDR
        bid: Bid cap in IDR
        prefix: Campaign name prefix
    
    Returns:
        dict with campaign_id, adset_ids, ad_ids
    """
    original = get_campaign_info(original_id)
    if 'error' in original:
        return {'error': original['error']['message']}
    
    creative_id = CREATIVES.get(product)
    if not creative_id:
        return {'error': f'Unknown product: {product}'}
    
    timestamp = datetime.now().strftime('%d%H%M')
    interest_label = '_'.join(interest_pools)
    camp_name = f'{prefix}_{product}_{interest_label}_{timestamp}'
    
    print(f'📋 Duplicating: {original.get("name", "?")}')
    print(f'🆕 New campaign: {camp_name}')
    print(f'🎯 Interests: {interest_pools}')
    print(f'💰 Budget: Rp{budget:,} | Bid: Rp{bid}')
    
    # Step 1: Create campaign
    r = requests.post(f'{API}/{ACT}/campaigns', data={
        'name': camp_name,
        'objective': original.get('objective', 'OUTCOME_TRAFFIC'),
        'status': 'PAUSED',
        'special_ad_categories': 'NONE',
        'is_adset_budget_sharing_enabled': 'false',
        'access_token': TOKEN
    }, timeout=15).json()
    
    if 'error' in r:
        return {'error': f"Campaign: {r['error']['message']}"}
    camp_id = r['id']
    print(f'✅ Campaign: {camp_id}')
    
    # Step 2: Create adsets (one per interest combination)
    targeting = make_targeting(interest_pools)
    adset_ids = []
    ad_ids = []
    
    for i, pool_name in enumerate(interest_pools):
        adset_name = f'AdSet_{interest_label}_{i+1}'
        
        r = requests.post(f'{API}/{ACT}/adsets', data={
            'name': adset_name,
            'campaign_id': camp_id,
            'daily_budget': budget,
            'bid_strategy': 'COST_CAP',
            'bid_amount': bid,
            'billing_event': 'IMPRESSIONS',
            'optimization_goal': 'LINK_CLICKS',
            'targeting': json.dumps(targeting),
            'status': 'ACTIVE',
            'access_token': TOKEN
        }, timeout=15).json()
        
        if 'error' in r:
            print(f'❌ Adset {adset_name}: {r["error"]["message"][:80]}')
            continue
        
        adset_id = r['id']
        adset_ids.append(adset_id)
        print(f'✅ Adset: {adset_name} ({adset_id})')
        
        # Step 3: Create ad
        r = requests.post(f'{API}/{ACT}/ads', data={
            'name': f'Ad_{camp_name}_{i+1}',
            'adset_id': adset_id,
            'creative': json.dumps({'creative_id': creative_id}),
            'status': 'ACTIVE',
            'access_token': TOKEN
        }, timeout=15).json()
        
        if 'id' in r:
            ad_ids.append(r['id'])
            print(f'✅ Ad: {r["id"]}')
        else:
            print(f'❌ Ad: {r.get("error",{}).get("message","?")[:80]}')
    
    # Step 4: Activate campaign
    r = requests.post(f'{API}/{camp_id}', data={
        'status': 'ACTIVE',
        'access_token': TOKEN
    }, timeout=15).json()
    
    if 'error' in r:
        print(f'⚠️ Activate warning: {r["error"]["message"][:80]}')
    else:
        print(f'🚀 CAMPAIGN LIVE')
    
    return {
        'campaign_id': camp_id,
        'campaign_name': camp_name,
        'adset_ids': adset_ids,
        'ad_ids': ad_ids,
        'budget': budget,
        'bid': bid,
        'interests': interest_pools,
    }


def scale_winner(campaign_id, product, scale_factor=2, budget=500000, bid=120):
    """
    Scale a winning campaign by creating N duplicates with different interest sets.
    """
    results = []
    
    # Predefined expansion plans
    expansion_plans = [
        ['dapur_perabot', 'shopping_buyer'],      # Dapur + Belanja
        ['dapur_perabot', 'home_living'],          # Dapur + Rumah
        ['home_living', 'shopping_buyer'],         # Rumah + Belanja
        ['lifestyle', 'shopping_buyer'],           # Lifestyle + Belanja
    ]
    
    for plan in expansion_plans[:scale_factor]:
        result = duplicate_campaign(
            campaign_id, product, plan, budget, bid,
            prefix='SCALE'
        )
        results.append(result)
        if 'error' in result:
            print(f'❌ {result["error"]}')
    
    success = sum(1 for r in results if 'campaign_id' in r)
    print(f'\n✅ {success}/{len(results)} campaigns created')
    return results


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='0858 Campaign Duplicator')
    parser.add_argument('--campaign-id', required=True, help='Source winning campaign ID')
    parser.add_argument('--product', required=True, choices=['rakpiringpengering', 'organizerpullout'])
    parser.add_argument('--interests', help='Comma-separated interest pool names')
    parser.add_argument('--scale', type=int, default=1, help='Number of duplicates (2-4)')
    parser.add_argument('--budget', type=int, default=500000, help='Daily budget in IDR')
    parser.add_argument('--bid', type=int, default=120, help='Bid cap in IDR')
    parser.add_argument('--dry-run', action='store_true', help='Show plan without creating')
    
    args = parser.parse_args()
    
    if args.scale > 1:
        if args.dry_run:
            print(f'🔍 DRY RUN: Would create {args.scale}x duplicates of {args.campaign_id}')
        else:
            scale_winner(args.campaign_id, args.product, args.scale, args.budget, args.bid)
    elif args.interests:
        pools = [p.strip() for p in args.interests.split(',')]
        if args.dry_run:
            print(f'🔍 DRY RUN: Would duplicate {args.campaign_id} with interests: {pools}')
        else:
            duplicate_campaign(args.campaign_id, args.product, pools, args.budget, args.bid, prefix='DUP')
    else:
        print("Usage: --scale N (auto-scale) OR --interests 'pool1,pool2'")
