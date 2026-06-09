#!/usr/bin/env python3
"""
REVIVE 3 TAGLINKS — Create new Meta Ads campaigns
Date: 2026-06-10 (tanggal kembar = 2-3x CVR boost)
Account: act_435670549443081
Budget: Rp 20,000/adset, LOWEST_COST, NO cost cap
"""
import requests, json, sys, time
from pathlib import Path
from datetime import datetime

# ─── Token ───
def get_token():
    for ep in [Path('/home/openclaw/projects/1ai-ads/scripts/.env'), Path('/home/openclaw/projects/1ai-ads/.env')]:
        if ep.exists():
            t = ep.read_text()
            for line in t.split('\n'):
                line = line.strip()
                if 'META_ACCESS_TOKEN' in line and '=' in line:
                    val = line.partition('=')[2].strip().strip('"').strip("'")
                    if len(val) > 50:
                        return val
    return None

TOKEN = get_token()
if not TOKEN:
    print("ERROR: No token found")
    sys.exit(1)
API = 'https://graph.facebook.com/v19.0'
ACT = 'act_435670549443081'
PAGE_ID = '1014428148422867'

# ─── Post IDs per taglink ───
POST_IDS = {
    'rakpiringpengering': [
        '1014428148422867_122112585633125943',  # Primary rakpiring creative
    ],
    'setelanbajukaosmihugajah': [
        '1014428148422867_122115152205125943',  # Setelan creative 1
        '1014428148422867_122115152517125943',  # Setelan creative 2
        '1014428148422867_122115151911125943',  # Setelan creative 3
    ],
    'setelangajahthaialand': [
        '1014428148422867_122115151911125943',  # Gajah Thailand creative 1
        '1014428148422867_122115152205125943',  # Gajah Thailand creative 2
    ],
}

# ─── Campaign Definitions ───
# Format: (taglink, campaign_name, targeting, platform_preference)
CAMPAIGNS = [
    # === rakpiringpengering (CVR 26.32%) - 2 campaigns ===
    {
        'taglink': 'rakpiringpengering',
        'name': 'REVIVE_rakpiring_GEO_Java_0610',
        'objective': 'OUTCOME_TRAFFIC',
        'adsets': [
            {
                'name': 'REVIVE_rakpiring_JavaCore_0610',
                'daily_budget': 20000,
                'bid_strategy': 'LOWEST_COST_WITHOUT_CAP',
                'optimization_goal': 'LINK_CLICKS',
                'billing_event': 'IMPRESSIONS',
                'targeting': {
                    'geo_locations': {
                        'countries': ['ID'],
                        'regions': [
                            {'key': '1685'},  # West Java
                            {'key': '1666'},  # Central Java
                            {'key': '1667'},  # East Java
                            {'key': '1664'},  # Jakarta
                            {'key': '1669'},  # Yogyakarta
                            {'key': '4143'},  # Banten
                        ],
                        'location_types': ['home', 'recent'],
                    },
                    'age_min': 20,
                    'age_max': 55,
                    'genders': [1],  # Women
                    'publisher_platforms': ['facebook', 'instagram'],
                    'facebook_positions': ['feed', 'story', 'facebook_reels'],
                    'instagram_positions': ['stream', 'story', 'reels'],
                    'device_platforms': ['mobile'],
                    'flexible_spec': [
                        {
                            'interests': [
                                {'id': '6003349260311', 'name': 'Rak piring'},
                                {'id': '6003139266461', 'name': 'Kitchen'},
                                {'id': '6003355228067', 'name': 'Home storage'},
                            ]
                        },
                        {
                            'behaviors': [{'id': '6002714895372', 'name': 'Engaged Shoppers'}],
                        }
                    ],
                },
                'post_idx': 0,
            },
            {
                'name': 'REVIVE_rakpiring_JavaDapur_0610',
                'daily_budget': 20000,
                'bid_strategy': 'LOWEST_COST_WITHOUT_CAP',
                'optimization_goal': 'LINK_CLICKS',
                'billing_event': 'IMPRESSIONS',
                'targeting': {
                    'geo_locations': {
                        'countries': ['ID'],
                        'regions': [
                            {'key': '1685'},  # West Java
                            {'key': '1666'},  # Central Java
                            {'key': '1667'},  # East Java
                        ],
                        'location_types': ['home', 'recent'],
                    },
                    'age_min': 20,
                    'age_max': 55,
                    'genders': [1],  # Women
                    'publisher_platforms': ['facebook', 'instagram'],
                    'facebook_positions': ['feed', 'story'],
                    'instagram_positions': ['stream', 'story', 'reels'],
                    'device_platforms': ['mobile'],
                    'flexible_spec': [
                        {
                            'interests': [
                                {'id': '6003349260311', 'name': 'Peralatan dapur'},
                                {'id': '6003468038653', 'name': 'Home appliance'},
                                {'id': '6003408375823', 'name': 'Cooking'},
                            ]
                        },
                    ],
                },
                'post_idx': 0,
            },
        ],
    },
    {
        'taglink': 'rakpiringpengering',
        'name': 'REVIVE_rakpiring_BroadID_0610',
        'objective': 'OUTCOME_TRAFFIC',
        'adsets': [
            {
                'name': 'REVIVE_rakpiring_Shopping_0610',
                'daily_budget': 20000,
                'bid_strategy': 'LOWEST_COST_WITHOUT_CAP',
                'optimization_goal': 'LINK_CLICKS',
                'billing_event': 'IMPRESSIONS',
                'targeting': {
                    'geo_locations': {
                        'countries': ['ID'],
                        'location_types': ['home', 'recent'],
                    },
                    'age_min': 22,
                    'age_max': 55,
                    'genders': [1],
                    'publisher_platforms': ['facebook', 'instagram', 'threads'],
                    'facebook_positions': ['feed', 'story', 'facebook_reels'],
                    'instagram_positions': ['stream', 'story', 'reels'],
                    'device_platforms': ['mobile'],
                    'flexible_spec': [
                        {
                            'interests': [
                                {'id': '6003349260311', 'name': 'Belanja (ritel)'},
                                {'id': '6003139266461', 'name': 'Belanja online (ritel)'},
                                {'id': '6003355228067', 'name': 'Online marketplace'},
                            ],
                            'behaviors': [
                                {'id': '6002714895372', 'name': 'Engaged Shoppers'},
                            ],
                        },
                    ],
                },
                'post_idx': 0,
            },
            {
                'name': 'REVIVE_rakpiring_Rumah_0610',
                'daily_budget': 20000,
                'bid_strategy': 'LOWEST_COST_WITHOUT_CAP',
                'optimization_goal': 'LINK_CLICKS',
                'billing_event': 'IMPRESSIONS',
                'targeting': {
                    'geo_locations': {
                        'countries': ['ID'],
                        'location_types': ['home', 'recent'],
                    },
                    'age_min': 22,
                    'age_max': 55,
                    'genders': [1],
                    'publisher_platforms': ['facebook', 'instagram'],
                    'facebook_positions': ['feed', 'story', 'facebook_reels'],
                    'instagram_positions': ['stream', 'story', 'reels'],
                    'device_platforms': ['mobile'],
                    'flexible_spec': [
                        {
                            'interests': [
                                {'id': '6003349260311', 'name': 'Dekorasi interior'},
                                {'id': '6003139266461', 'name': 'Dekorasi rumah'},
                                {'id': '6003355228067', 'name': 'Rumah'},
                            ]
                        },
                    ],
                },
                'post_idx': 0,
            },
        ],
    },

    # === setelanbajukaosmihugajah (CVR 7.14%) - 1 campaign ===
    {
        'taglink': 'setelanbajukaosmihugajah',
        'name': 'REVIVE_setelanMihu_Fashion_0610',
        'objective': 'OUTCOME_TRAFFIC',
        'adsets': [
            {
                'name': 'REVIVE_setelanMihu_FashionShop_0610',
                'daily_budget': 20000,
                'bid_strategy': 'LOWEST_COST_WITHOUT_CAP',
                'optimization_goal': 'LINK_CLICKS',
                'billing_event': 'IMPRESSIONS',
                'targeting': {
                    'geo_locations': {
                        'countries': ['ID'],
                        'location_types': ['home', 'recent'],
                    },
                    'age_min': 18,
                    'age_max': 45,
                    'genders': [1],  # Women
                    'publisher_platforms': ['facebook', 'instagram', 'threads'],
                    'facebook_positions': ['feed', 'story', 'facebook_reels', 'marketplace'],
                    'instagram_positions': ['stream', 'story', 'reels'],
                    'device_platforms': ['mobile'],
                    'flexible_spec': [
                        {
                            'interests': [
                                {'id': '6003349260311', 'name': 'Fashion'},
                                {'id': '6003139266461', 'name': 'Pakaian kasual'},
                                {'id': '6003355228067', 'name': 'Belanja (ritel)'},
                                {'id': '6003395685922', 'name': 'Belanja online (ritel)'},
                            ],
                            'behaviors': [
                                {'id': '6002714895372', 'name': 'Engaged Shoppers'},
                            ],
                        },
                    ],
                },
                'post_idx': 0,
            },
            {
                'name': 'REVIVE_setelanMihu_Marketplace_0610',
                'daily_budget': 20000,
                'bid_strategy': 'LOWEST_COST_WITHOUT_CAP',
                'optimization_goal': 'LINK_CLICKS',
                'billing_event': 'IMPRESSIONS',
                'targeting': {
                    'geo_locations': {
                        'countries': ['ID'],
                        'location_types': ['home', 'recent'],
                    },
                    'age_min': 18,
                    'age_max': 45,
                    'genders': [1],
                    'publisher_platforms': ['facebook', 'instagram', 'threads'],
                    'facebook_positions': ['feed', 'story', 'facebook_reels'],
                    'instagram_positions': ['stream', 'story', 'reels'],
                    'device_platforms': ['mobile'],
                    'flexible_spec': [
                        {
                            'interests': [
                                {'id': '6003349260311', 'name': 'Online marketplace'},
                                {'id': '6003139266461', 'name': 'Perdagangan elektronik (ritel)'},
                                {'id': '6003355228067', 'name': 'Shopee'},
                            ],
                        },
                    ],
                },
                'post_idx': 1,
            },
        ],
    },

    # === setelangajahthaialand (CVR 5.46%) - 1 campaign ===
    {
        'taglink': 'setelangajahthaialand',
        'name': 'REVIVE_gajahThai_Fashion_0610',
        'objective': 'OUTCOME_TRAFFIC',
        'adsets': [
            {
                'name': 'REVIVE_gajahThai_FashionShop_0610',
                'daily_budget': 20000,
                'bid_strategy': 'LOWEST_COST_WITHOUT_CAP',
                'optimization_goal': 'LINK_CLICKS',
                'billing_event': 'IMPRESSIONS',
                'targeting': {
                    'geo_locations': {
                        'countries': ['ID'],
                        'location_types': ['home', 'recent'],
                    },
                    'age_min': 18,
                    'age_max': 45,
                    'genders': [1],
                    'publisher_platforms': ['facebook', 'instagram'],
                    'facebook_positions': ['feed', 'story', 'facebook_reels', 'marketplace'],
                    'instagram_positions': ['stream', 'story', 'reels'],
                    'device_platforms': ['mobile'],
                    'flexible_spec': [
                        {
                            'interests': [
                                {'id': '6003349260311', 'name': 'T-shirt'},
                                {'id': '6003139266461', 'name': 'Fashion'},
                                {'id': '6003355228067', 'name': 'Pakaian (merek)'},
                            ],
                            'behaviors': [
                                {'id': '6002714895372', 'name': 'Engaged Shoppers'},
                            ],
                        },
                    ],
                },
                'post_idx': 0,
            },
            {
                'name': 'REVIVE_gajahThai_Belanja_0610',
                'daily_budget': 20000,
                'bid_strategy': 'LOWEST_COST_WITHOUT_CAP',
                'optimization_goal': 'LINK_CLICKS',
                'billing_event': 'IMPRESSIONS',
                'targeting': {
                    'geo_locations': {
                        'countries': ['ID'],
                        'location_types': ['home', 'recent'],
                    },
                    'age_min': 20,
                    'age_max': 50,
                    'genders': [1],
                    'publisher_platforms': ['facebook', 'instagram'],
                    'facebook_positions': ['feed', 'story', 'facebook_reels'],
                    'instagram_positions': ['stream', 'story', 'reels'],
                    'device_platforms': ['mobile'],
                    'flexible_spec': [
                        {
                            'interests': [
                                {'id': '6003349260311', 'name': 'Belanja (ritel)'},
                                {'id': '6003139266461', 'name': 'Belanja online (ritel)'},
                                {'id': '6003355228067', 'name': 'Kaos oblong'},
                            ],
                        },
                    ],
                },
                'post_idx': 1,
            },
        ],
    },
]

# ─── Execute ───
results = {
    'date': '2026-06-10',
    'account': ACT,
    'total_campaigns': 0,
    'total_adsets': 0,
    'total_budget_per_day': 0,
    'campaigns': [],
    'errors': [],
}

print("="*60)
print(f"REVIVE 3 TAGLINKS — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
print(f"Tanggal Kembar: 10 Juni 2026 → 2-3x CVR boost expected")
print(f"Account: {ACT}")
print("="*60)

for camp_def in CAMPAIGNS:
    taglink = camp_def['taglink']
    print(f"\n{'='*60}")
    print(f"CREATING: {camp_def['name']}")
    print(f"  Taglink: {taglink}")
    print(f"  Adsets: {len(camp_def['adsets'])}")
    
    # Step 1: Create Campaign
    camp_params = {
        'name': camp_def['name'],
        'objective': camp_def['objective'],
        'status': 'ACTIVE',
        'special_ad_categories': [],
        'access_token': TOKEN,
    }
    
    r_camp = requests.post(f'{API}/{ACT}/campaigns', params=camp_params, timeout=15).json()
    
    if 'error' in r_camp:
        err_msg = r_camp['error'].get('message', str(r_camp))
        print(f"  ❌ Campaign FAILED: {err_msg}")
        results['errors'].append({'campaign': camp_def['name'], 'error': err_msg})
        continue
    
    campaign_id = r_camp['id']
    print(f"  ✅ Campaign: {campaign_id}")
    
    campaign_result = {
        'campaign_id': campaign_id,
        'name': camp_def['name'],
        'taglink': taglink,
        'adsets': [],
    }
    
    # Step 2: Create Adsets
    for i, adset_def in enumerate(camp_def['adsets']):
        post_idx = adset_def['post_idx']
        post_id = POST_IDS[taglink][post_idx % len(POST_IDS[taglink])]
        
        # For promoted_object, use page_id for LINK_CLICKS
        adset_params = {
            'name': adset_def['name'],
            'campaign_id': campaign_id,
            'daily_budget': adset_def['daily_budget'],
            'bid_strategy': adset_def['bid_strategy'],
            'optimization_goal': adset_def['optimization_goal'],
            'billing_event': adset_def['billing_event'],
            'targeting': json.dumps(adset_def['targeting']),
            'promoted_object': json.dumps({'page_id': PAGE_ID}),
            'status': 'ACTIVE',
            'access_token': TOKEN,
        }
        
        r_adset = requests.post(f'{API}/{ACT}/adsets', params=adset_params, timeout=15).json()
        
        if 'error' in r_adset:
            err_msg = r_adset['error'].get('message', str(r_adset))
            print(f"  ❌ Adset [{adset_def['name']}] FAILED: {err_msg}")
            results['errors'].append({
                'campaign': camp_def['name'],
                'adset': adset_def['name'],
                'error': err_msg
            })
            continue
        
        adset_id = r_adset['id']
        print(f"  ✅ Adset: {adset_id} | Budget: Rp {adset_def['daily_budget']:,} | {adset_def['name']}")
        
        # Step 3: Create Ad
        ad_params = {
            'name': f"{adset_def['name']}_Ad",
            'adset_id': adset_id,
            'creative': json.dumps({'object_story_id': post_id}),
            'status': 'ACTIVE',
            'access_token': TOKEN,
        }
        
        r_ad = requests.post(f'{API}/{ACT}/ads', params=ad_params, timeout=15).json()
        
        if 'error' in r_ad:
            err_msg = r_ad['error'].get('message', str(r_ad))
            print(f"  ❌ Ad FAILED: {err_msg}")
            results['errors'].append({
                'campaign': camp_def['name'],
                'adset': adset_def['name'],
                'adset_id': adset_id,
                'error': err_msg
            })
            continue
        
        ad_id = r_ad['id']
        print(f"     ✅ Ad: {ad_id} | Post: {post_id}")
        
        campaign_result['adsets'].append({
            'adset_id': adset_id,
            'name': adset_def['name'],
            'ad_id': ad_id,
            'post_id': post_id,
            'budget': adset_def['daily_budget'],
        })
        
        results['total_adsets'] += 1
        results['total_budget_per_day'] += adset_def['daily_budget']
        
        # Small delay to avoid rate limiting
        time.sleep(0.5)
    
    results['campaigns'].append(campaign_result)
    results['total_campaigns'] += 1
    
    # Delay between campaigns
    time.sleep(1)

# ─── Summary ───
print("\n" + "="*60)
print("REVIVE COMPLETE — SUMMARY")
print("="*60)

for camp in results['campaigns']:
    print(f"\n📊 {camp['name']} ({camp['taglink']})")
    print(f"   Campaign ID: {camp['campaign_id']}")
    for adset in camp['adsets']:
        print(f"   ├─ Adset: {adset['adset_id']} | Rp {adset['budget']:,} | {adset['name']}")
        print(f"   │  └─ Ad: {adset['ad_id']} | Post: {adset['post_id']}")

print(f"\n{'='*60}")
print(f"TOTAL: {results['total_campaigns']} campaigns, {results['total_adsets']} adsets")
print(f"TOTAL DAILY BUDGET: Rp {results['total_budget_per_day']:,}")
print(f"ERRORS: {len(results['errors'])}")
if results['errors']:
    for e in results['errors']:
        print(f"  ❌ {e}")

# Save results
out_path = Path('/home/openclaw/projects/1ai-ads/data/revive_0610_results.json')
out_path.parent.mkdir(parents=True, exist_ok=True)
with open(out_path, 'w') as f:
    json.dump(results, f, indent=2, default=str)
print(f"\nResults saved to: {out_path}")
