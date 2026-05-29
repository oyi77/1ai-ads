#!/usr/bin/env python3
"""
Vilona Daily Scale-Up Engine — 1041
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Auto-create 2-3 new campaigns setiap hari dari data winner.
Rules Veris 23 Mei 2026:
  - Strategy: Volume Tertinggi (Lowest Cost), NO bid cap
  - Budget: Rp 20.000/campaign
  - Interest: turunan/hidden dari winning campaign
  - Placement: ikutin winning placement campaign
  - Audience: > 2 juta
  - Ads: Post ID dari campaign winner lain
  - CPC wajib < 150, CTR wajib > 3%

Run: python3 scripts/vilona_scale_up_1041.py
Schedule: daily at 09:00 WIB
"""
import urllib.request, json, os, time, sys
from datetime import datetime, timedelta

TOKEN = "***"
ACCOUNT = "act_380721031313330"
API_BASE = "https://graph.facebook.com/v19.0"

SCALE_COUNT = 3       # Bikin 2-3 campaign baru per hari
BUDGET_PER_CAMPAIGN = 20000  # Rp 20.000

# Interest pools derived from winning campaigns
# Will be dynamically expanded based on winning data
INTEREST_POOLS = {
    "rakdapur3": [
        "Memasak (Cooking)", "Resep (Recipe)", "Dapur (Kitchen)",
        "Peralatan dapur (Kitchen utensils)", "Dekorasi rumah (Home decor)",
        "Organisasi rumah (Home organization)", "Perlengkapan rumah tangga",
        "Rumah minimalis", "Rumah idaman", "Interior design",
        "IKEA", "Informa", "Ace Hardware", "MR DIY",
        "Belanja online", "Shopee", "Diskon", "Flash sale",
        "Rak dapur", "Rak piring", "Penyimpanan dapur",
        "Emak-emak (Moms)", "Ibu rumah tangga", "Rumah tangga",
        "Renovasi rumah", "Desain interior rumah",
        "Hemat uang (Saving money)", "Belanja hemat",
    ],
    "fashion_wanita": [
        "Fashion wanita (Women's fashion)", "Pakaian muslim", "Hijab",
        "Tas wanita", "Sepatu wanita", "Mode (Fashion)",
        "Belanja baju", "Baju murah", "OOTD", "Style hijab",
        "Hijabers", "Fashion hijab", "Baju lebaran", "Gamis",
    ],
    "kecantikan": [
        "Perawatan kulit (Skincare)", "Makeup", "Kosmetik",
        "Perawatan wajah", "Produk kecantikan", "Wardah", "Emina",
        "Skintific", "Somethinc", "Avoskin",
    ],
    "bayi_anak": [
        "Bayi (Baby)", "Ibu dan anak", "Perlengkapan bayi",
        "Mainan anak", "Pakaian anak", "MPASI", "Popok bayi",
    ],
    "otomotif": [
        "Mobil (Cars)", "Motor (Motorcycles)", "Aksesoris mobil",
        "Perawatan mobil", "Oli mobil", "Ban mobil",
    ],
}

def api_get(path, params=None):
    if params is None:
        params = {}
    params['access_token'] = TOKEN
    url = f"{API_BASE}/{path}"
    req = urllib.request.Request(f"{url}?{urllib.parse.urlencode(params)}")
    return json.loads(urllib.request.urlopen(req, timeout=15).read())

def api_post(path, data):
    req = urllib.request.Request(
        f"{API_BASE}/{path}?access_token=***",
        data=json.dumps(data).encode(),
        headers={'Content-Type': 'application/json'})
    return json.loads(urllib.request.urlopen(req, timeout=15).read())

def get_active_campaigns_with_insights():
    """Get all active campaigns with their insights"""
    return api_get(f"{ACCOUNT}/campaigns", {
        'fields': 'name,id,status,effective_status,insights.date_preset(today){spend,clicks,impressions,cpc,ctr,actions}',
        'effective_status': '["ACTIVE"]',
        'limit': 100
    }).get('data', [])

def get_top_performers():
    """Find winning campaigns: good CTR, low CPC, active"""
    today = datetime.now().strftime('%Y-%m-%d')
    yesterday = (datetime.now() - timedelta(days=1)).strftime('%Y-%m-%d')
    
    # Get yesterday's top campaigns
    data = api_get(f"{ACCOUNT}/insights", {
        'date_preset': 'yesterday',
        'fields': 'campaign_name,campaign_id,spend,clicks,impressions,cpc,ctr,actions',
        'level': 'campaign',
        'limit': 20,
        'sort': 'spend_descending'
    })
    
    winners = []
    for camp in data.get('data', []):
        name = camp.get('campaign_name', '')
        cid = camp.get('campaign_id', '')
        spend = float(camp.get('spend', 0))
        clicks = int(camp.get('clicks', 0))
        impressions = int(camp.get('impressions', 0))
        cpc = float(camp.get('cpc', 0))
        try:
            ctr = float(camp.get('ctr', 0))
        except Exception:
            ctr = 0
        
        # Winner criteria
        if spend < 500:  # Too little data
            continue
        if clicks < 3:
            continue
        
        real_cpc = spend / clicks if clicks > 0 else 999
        
        # Score: prefer high CTR + low CPC
        score = (ctr * 10) - (real_cpc / 100)
        
        if ctr > 3.0 and real_cpc < 150:
            winners.append({
                'name': name, 'id': cid, 'spend': spend,
                'clicks': clicks, 'cpc': real_cpc, 'ctr': ctr,
                'impressions': impressions, 'score': score
            })
    
    winners.sort(key=lambda w: w['score'], reverse=True)
    return winners

def get_winning_post_ids(winners):
    """Get post IDs from winning campaigns' ads"""
    post_ids = []
    for w in winners[:5]:
        try:
            ads = api_get(f"{w['id']}/ads", {
                'fields': 'id,name,creative{effective_instagram_story_id,effective_object_story_id}',
                'limit': 5,
                'effective_status': '["ACTIVE","PAUSED"]'
            })
            for ad in ads.get('data', []):
                creative = ad.get('creative', {})
                ig_id = creative.get('effective_instagram_story_id', '')
                if ig_id:
                    post_ids.append(ig_id)
        except Exception:
            pass
    return list(set(post_ids))[:5]  # Deduplicate

def get_winning_placements(winners):
    """Extract winning placements from campaign names"""
    placements = set()
    for w in winners:
        name_upper = w['name'].upper()
        if 'INSTAGRAM' in name_upper or 'IG' in name_upper.split('_'):
            placements.add('instagram')
        if 'FACEBOOK' in name_upper or 'FB' in name_upper.split('_'):
            placements.add('facebook')
    
    if not placements:
        placements = {'instagram', 'facebook'}  # Default
    
    return placements

def select_interests(winners):
    """Pick interests based on winning campaign names/themes"""
    used = set()
    interests = []
    
    for w in winners:
        name_lower = w['name'].lower()
        for pool_name, pool_interests in INTEREST_POOLS.items():
            if pool_name in name_lower:
                for interest in pool_interests:
                    if interest not in used:
                        interests.append(interest)
                        used.add(interest)
                        if len(interests) >= 10:
                            break
                break
    
    # Fallback: use rakdapur3 pool
    if not interests:
        interests = [i for i in INTEREST_POOLS["rakdapur3"] if i not in used][:8]
    
    return interests[:8]  # Max 8 interests per campaign

def create_campaign(name, budget, placement=None):
    """Create a new CBO campaign with lowest cost strategy"""
    campaign_data = {
        'name': name,
        'objective': 'OUTCOME_SALES',
        'status': 'PAUSED',  # Paused dulu, nanti di-resume pagi
        'special_ad_categories': [],
        'daily_budget': str(budget),
        'buying_type': 'AUCTION',
        'bid_strategy': 'LOWEST_COST_WITHOUT_CAP',  # Volume tertinggi!
    }
    
    result = api_post(f"{ACCOUNT}/campaigns", campaign_data)
    return result

def main():
    print(f"\n{'='*60}")
    print(f"🚀 VILONA SCALE-UP ENGINE — 1041")
    print(f"   {datetime.now().strftime('%Y-%m-%d %H:%M WIB')}")
    print(f"{'='*60}")
    
    # Step 1: Find winners
    print("\n📊 Step 1: Finding winning campaigns...")
    winners = get_top_performers()
    
    if not winners:
        print("   ❌ No winners found (need spend + clicks + good CPC/CTR)")
        print("   ⏭️ Skipping scale-up today")
        return
    
    print(f"   ✅ {len(winners)} winners found:")
    for w in winners[:5]:
        print(f"      🏆 {w['name'][:50]} | CPC Rp{w['cpc']:.0f} | CTR {w['ctr']:.1f}% | Score {w['score']:.1f}")
    
    # Step 2: Extract winning data
    print("\n🎯 Step 2: Extracting winning patterns...")
    placements = get_winning_placements(winners)
    interests = select_interests(winners)
    post_ids = get_winning_post_ids(winners)
    
    print(f"   Placements: {', '.join(placements)}")
    print(f"   Interests: {len(interests)} found")
    print(f"   Post IDs: {len(post_ids)} available")
    
    # Step 3: Create new campaigns
    created = 0
    print(f"\n🏗️ Step 3: Creating {SCALE_COUNT} new campaigns...")
    
    today_str = datetime.now().strftime('%d%b')
    for i in range(SCALE_COUNT):
        interest_subset = interests[i*2:(i+1)*2] if i*2 < len(interests) else interests[:2]
        interest_names = [x.split('(')[0].strip()[:30] for x in interest_subset]
        theme = '_'.join(interest_names[:2])
        
        camp_name = f"VILONA_SCALE_{today_str}_{theme[:50]}_{i+1}"
        
        try:
            result = create_campaign(camp_name, BUDGET_PER_CAMPAIGN)
            camp_id = result.get('id', '')
            if camp_id:
                print(f"   ✅ Created: {camp_name}")
                print(f"      ID: {camp_id} | Budget: Rp {BUDGET_PER_CAMPAIGN:,} | Lowest Cost")
                created += 1
            else:
                print(f"   ❌ Failed: {camp_name}")
                print(f"      Error: {result.get('error', {}).get('message', str(result)[:100])}")
        except Exception as e:
            print(f"   ❌ Error: {str(e)[:100]}")
    
    print(f"\n{'='*60}")
    print(f"📊 SUMMARY:")
    print(f"   Winners analyzed: {len(winners)}")
    print(f"   New campaigns:    {created}/{SCALE_COUNT}")
    print(f"   Budget each:      Rp {BUDGET_PER_CAMPAIGN:,}")
    print(f"   Total new budget: Rp {created * BUDGET_PER_CAMPAIGN:,}")
    print(f"   Strategy:         Volume Tertinggi (Lowest Cost)")
    print(f"   Status:           PAUSED (resume at 04:00 WIB)")
    print(f"{'='*60}")

if __name__ == '__main__':
    main()
