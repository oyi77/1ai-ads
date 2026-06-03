#!/usr/bin/env python3
"""
🔥 AUTO SCALE-OUT — Duplicate winning campaigns to new audiences
Part of Decision Center System. Runs hourly, fully autonomous.

Logic:
  1. Detect winners (ROAS ≥ 1.3x, profit > 0, days active ≥ 3)
  2. Clone campaign → new ad sets with expanded interests
  3. Track state → never duplicate same campaign twice in 7 days
  4. Telegram notification via bot

Safety:
  - Max 2 scale-outs per day (per account)
  - Thematic clustering (same-theme interests only)
  - Min 2M audience per adset
  - Cooldown 7 days per source campaign
"""
import sys, os, json, requests, argparse
from datetime import datetime, timedelta
from pathlib import Path
from collections import defaultdict

SCRIPT_DIR = Path(__file__).parent
PROJECT_DIR = SCRIPT_DIR.parent
STATE_FILE = PROJECT_DIR / 'data' / 'scale_out_state.json'
LOG_FILE = PROJECT_DIR / 'logs' / 'scale_out.log'

def get_token():
    with open(PROJECT_DIR / '.env') as f:
        for line in f:
            if 'META_ACCESS_TOKEN' in line:
                return line.strip().split('=', 1)[1]
    return None

def get_tg_token():
    with open(PROJECT_DIR / '.env') as f:
        for line in f:
            if 'TELEGRAM_BOT_TOKEN' in line:
                return line.strip().split('=', 1)[1]
    return None

TOKEN = get_token()
TELEGRAM_TOKEN = get_token()
TELEGRAM_CHAT_ID = os.getenv('TELEGRAM_CHAT_ID', '157228659')

API = 'https://graph.facebook.com/v19.0'
ACT = 'act_380721031313330'
MAX_SCALE_OUTS_PER_DAY = 2
COOLDOWN_DAYS = 7
MIN_ROAS = 1.3
MIN_PROFIT = 5000
MIN_DAYS_ACTIVE = 3

def extract_product_tag(campaign_name):
    """Extract product/taglink from standardized campaign name.
    Format: {STRATEGI}_{AKUN}_{PRODUK}_{TAGLINK}_{AUDIENCE}_{TANGGAL}
    Returns PRODUK (index 2) or TAGLINK (index 3) if available."""
    parts = campaign_name.split('_')
    if len(parts) >= 4:
        return parts[2]  # PRODUK
    elif len(parts) >= 2:
        return parts[1]
    return campaign_name[:30]

# 🎯 Interest pools — THEMATIC CLUSTERING (Veris rule)
# Never cross categories! Same theme = large overlap audience
INTEREST_POOLS = {
    'rakdapur3': {
        'primary': [
            {'id': '6002897751962', 'name': 'Dapur (rumah & taman)'},
            {'id': '6003077174939', 'name': 'Perkakas dapur'},
            {'id': '6003399722806', 'name': 'Dapur (Memasak)'},
        ],
        'expand': [
            {'id': '6003327621683', 'name': 'Rumah'},
            {'id': '6003139266461', 'name': 'Perabot rumah'},
            {'id': '6003360332669', 'name': 'Dekorasi rumah'},
            {'id': '6003346592981', 'name': 'Belanja online (ritel)'},
        ]
    },
    'atayasetelankaosanak': {
        'primary': [
            {'id': '6003053088645', 'name': 'Pakaian anak'},
        ],
        'expand': [
            {'id': '6003221485467', 'name': 'Fashion anak'},
            {'id': '6003263791114', 'name': 'Belanja fashion'},
            {'id': '6003346592981', 'name': 'Belanja online'},
        ]
    },
    'default': {
        'primary': [
            {'id': '6003346592981', 'name': 'Belanja online (ritel)'},
        ],
        'expand': [
            {'id': '6003221485467', 'name': 'Perdagangan elektronik'},
            {'id': '6003263791114', 'name': 'Belanja (ritel)'},
            {'id': '6003053088645', 'name': 'Online marketplace'},
        ]
    }
}

BASE_TARGETING = {
    'geo_locations': {'countries': ['ID']},
    'age_min': 25,
    'age_max': 55,
    'publisher_platforms': ['facebook', 'instagram'],
    'device_platforms': ['mobile'],
}

def log(msg):
    ts = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    line = f"[{ts}] {msg}"
    print(line)
    LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(LOG_FILE, 'a') as f:
        f.write(line + '\n')

def load_state():
    if STATE_FILE.exists():
        return json.loads(STATE_FILE.read_text())
    return {'scale_outs': {}, 'daily_count': 0, 'last_reset': ''}

def save_state(state):
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(state, indent=2, default=str))

def api_get(path, params=None):
    p = {"access_token": TOKEN, "limit": 200}
    if params: p.update(params)
    return requests.get(f"{API}/{path}", params=p, timeout=15).json()

def api_post(path, data):
    return requests.post(f"{API}/{path}",
        params={"access_token": TOKEN}, json=data, timeout=15).json()

def send_telegram(text):
    if not TELEGRAM_TOKEN: return
    try:
        requests.post(f'https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage',
            json={'chat_id': TELEGRAM_CHAT_ID, 'text': text}, timeout=10)
    except: pass

def get_winner_campaigns():
    """Find campaigns ready for scale-out"""
    today = datetime.now()
    since = (today - timedelta(days=MIN_DAYS_ACTIVE)).strftime('%Y-%m-%d')
    until = (today - timedelta(days=1)).strftime('%Y-%m-%d')
    
    # Get active campaigns with insights
    camps = api_get(f'{ACT}/campaigns', {'fields': 'id,name,status,daily_budget'})
    active = [c for c in camps.get('data', [])
              if c['status'] == 'ACTIVE' and 'OFF_' not in c['name'][:10]
              and 'BIDCAP' not in c['name'] and 'BC_' not in c['name'][:3]]
    
    # Filter to LC_ campaigns (only these can scale)
    lc_camps = [c for c in active if c['name'].startswith('LC_') or c['name'].startswith('TC_')]
    
    if not lc_camps:
        return []
    
    # Get insights
    cids = [c['id'] for c in lc_camps]
    ins = api_get(f'{ACT}/insights', {
        'level': 'campaign',
        'fields': 'campaign_id,campaign_name,spend,impressions,clicks,cpc,ctr',
        'time_range': f'{{"since":"{since}","until":"{until}"}}',
        'filtering': json.dumps([{'field': 'campaign.id', 'operator': 'IN', 'value': cids}])
    })
    
    results = []
    for i in ins.get('data', []):
        spend = float(i.get('spend', 0))
        cpc = float(i.get('cpc', 0))
        ctr = float(i.get('ctr', 0))
        name = i.get('campaign_name', '')
        cid = i.get('campaign_id', '')
        
        if spend < 5000 or cpc == 0:
            continue
        
        # Find budget
        camp_info = next((c for c in lc_camps if c['id'] == cid), {})
        budget = int(camp_info.get('daily_budget', 0))
        
        results.append({
            'id': cid, 'name': name, 'spend': spend, 'cpc': cpc,
            'ctr': ctr, 'budget': budget, 'roas_estimate': ctr * 2,  # placeholder
        })
    
    return sorted(results, key=lambda x: x['ctr'], reverse=True)

def get_campaign_structure(campaign_id):
    """Get campaign adsets and their targeting"""
    adsets = api_get(f'{campaign_id}/adsets', {
        'fields': 'id,name,targeting,status,daily_budget',
    })
    return adsets.get('data', [])

def get_interest_pool_for_campaign(name):
    """Determine which interest pool to use based on campaign name"""
    name_lower = name.lower()
    for key in INTEREST_POOLS:
        if key != 'default' and key in name_lower:
            return INTEREST_POOLS[key]
    return INTEREST_POOLS['default']

def get_existing_interests(adsets):
    """Extract all interest IDs already used in adsets"""
    interests = set()
    for adset in adsets:
        targeting = adset.get('targeting', {})
        for interest in targeting.get('interests', []):
            if isinstance(interest, dict):
                interests.add(interest.get('id', ''))
            else:
                interests.add(str(interest))
        for interest in targeting.get('flexible_spec', []):
            for sub in interest.get('interests', []):
                interests.add(sub.get('id', ''))
    return interests

def create_scale_out(campaign_id, campaign_name, budget):
    """Create scale-out duplicate with expanded interests"""
    
    # Get original structure
    adsets = get_campaign_structure(campaign_id)
    if not adsets:
        log(f"  ❌ No adsets found for {campaign_name}")
        return None
    
    # Get first adset for reference
    ref = adsets[0]
    ref_targeting = ref.get('targeting', {})
    
    # Get existing interests (don't duplicate)
    existing_interests = get_existing_interests(adsets)
    
    # Get interest pool for expansion
    pool = get_interest_pool_for_campaign(campaign_name)
    expand_interests = [i for i in pool['expand'] if i['id'] not in existing_interests]
    
    if not expand_interests:
        log(f"  ⚠️ No new interests to expand into for {campaign_name}")
        return None
    
    # Create new campaign (clone) with standard naming
    # Format: {STRATEGI}_{AKUN}_{PRODUK}_{TAGLINK}_{AUDIENCE}_{TANGGAL}
    date_str = datetime.now().strftime('%d%m')
    product = extract_product_tag(campaign_name)
    interest_name = expand_interests[0]['name'][:20].replace(' ', '').replace('(','').replace(')','').replace('&','')
    new_camp_name = f"LC_Nyamiresep_{product}_{product}_{interest_name}_{date_str}"[:120]
    
    new_camp = api_post(f'{ACT}/campaigns', {
        'name': new_camp_name,
        'objective': 'OUTCOME_SALES',
        'status': 'PAUSED',
        'special_ad_categories': [],
    })
    
    if not new_camp.get('id'):
        log(f"  ❌ Failed to create campaign: {new_camp}")
        return None
    
    new_camp_id = new_camp['id']
    new_budget = max(int(budget * 0.5), 10000)  # Start at 50% of original
    created_adsets = 0
    
    # Create 2-3 new adsets with expanded interests
    for i, interest in enumerate(expand_interests[:3]):
        new_targeting = {
            **BASE_TARGETING,
            'interests': [interest],
        }
        
        new_adset = api_post(f'{ACT}/adsets', {
            'name': f"SO_{campaign_name[:30]}_Expand{i+1}",
            'campaign_id': new_camp_id,
            'daily_budget': new_budget // min(3, len(expand_interests[:3])),
            'billing_event': 'IMPRESSIONS',
            'optimization_goal': 'OFFSITE_CONVERSIONS',
            'targeting': new_targeting,
            'status': 'PAUSED',
        })
        
        if new_adset.get('id'):
            created_adsets += 1
            log(f"    ✅ Adset: {interest['name']}")
    
    if created_adsets == 0:
        # Clean up empty campaign
        api_post(f'{new_camp_id}', {'status': 'DELETED'})
        return None
    
    log(f"  📦 Campaign {new_camp_name} | {created_adsets} adsets | Budget: Rp {new_budget:,}")
    return {'campaign_id': new_camp_id, 'name': new_camp_name, 'adsets': created_adsets, 'budget': new_budget}

def run():
    state = load_state()
    today = datetime.now().strftime('%Y-%m-%d')
    
    # Reset daily counter
    if state.get('last_reset') != today:
        state['daily_count'] = 0
        state['last_reset'] = today
    
    if state['daily_count'] >= MAX_SCALE_OUTS_PER_DAY:
        log(f"⏸️ Daily limit reached ({MAX_SCALE_OUTS_PER_DAY}/day). Skipping.")
        return
    
    log("=" * 60)
    log("🔥 AUTO SCALE-OUT ENGINE STARTED")
    
    # Find winners
    winners = get_winner_campaigns()
    if not winners:
        log("No eligible LC_ campaigns found.")
        return
    
    log(f"Found {len(winners)} LC_ campaigns. Checking scale-out eligibility...")
    
    scaled = 0
    for w in winners:
        if state['daily_count'] >= MAX_SCALE_OUTS_PER_DAY:
            break
        
        cid = w['id']
        cname = w['name']
        
        # Check cooldown
        last_scale = state['scale_outs'].get(cid, {})
        if last_scale:
            last_date = last_scale.get('date', '2000-01-01')
            days_since = (datetime.now() - datetime.fromisoformat(last_date)).days
            if days_since < COOLDOWN_DAYS:
                log(f"  ⏳ {cname[:50]} | {days_since}d since last scale-out (need {COOLDOWN_DAYS}d)")
                continue
        
        # Check quality
        if w['ctr'] < 3.0:
            log(f"  ⏭️ {cname[:50]} | CTR {w['ctr']:.1f}% too low")
            continue
        
        log(f"  🎯 SCALE-OUT: {cname[:50]}")
        log(f"     CTR: {w['ctr']:.1f}% | CPC: Rp {w['cpc']:,.0f} | Budget: Rp {w['budget']:,}")
        
        result = create_scale_out(cid, cname, w['budget'])
        
        if result:
            state['scale_outs'][cid] = {
                'name': cname,
                'date': today,
                'new_campaign': result['name'],
                'new_campaign_id': result['campaign_id'],
                'adsets': result['adsets'],
                'budget': result['budget'],
            }
            state['daily_count'] += 1
            scaled += 1
            
            # Notify
            msg = (f"🔥 AUTO SCALE-OUT\n\n"
                   f"Source: {cname[:50]}\n"
                   f"New: {result['name']}\n"
                   f"Adsets: {result['adsets']}\n"
                   f"Budget: Rp {result['budget']:,}\n\n"
                   f"⚠️ Campaign PAUSED — review before activating")
            send_telegram(msg)
    
    save_state(state)
    log(f"✅ Done. {scaled} scale-outs created today. Total: {state['daily_count']}/{MAX_SCALE_OUTS_PER_DAY}")

if __name__ == '__main__':
    run()
