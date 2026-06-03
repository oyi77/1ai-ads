#!/usr/bin/env python3
"""
🔥 AUTO SCALE-OUT v2.0 — SIMPLE: duplicate winner → rename → expand audience
Veris Method: Copy campaign, change targeting, ads stay same.

Flow:
  1. Find winner (active campaign with CTR ≥ 3% + spend > 5K)
  2. Deep-copy via POST /{campaign_id}/copies (campaign + adsets + ads)
  3. Rename campaign to {STRATEGI}_{AKUN}_{PRODUK}_{TAGLINK}_{NEW_AUDIENCE}_{DATE}
  4. Update adset targeting with expanded thematic interests
  5. Leave PAUSED for review
  6. Telegram notification

Safety:
  - Max 2 per day, 7-day cooldown per source
  - Thematic clustering only (Veris rule: never cross categories)
"""
import sys, os, json, requests, argparse
from datetime import datetime, timedelta
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
PROJECT_DIR = SCRIPT_DIR.parent
STATE_FILE = PROJECT_DIR / 'data' / 'scale_out_state.json'
LOG_FILE = PROJECT_DIR / 'logs' / 'scale_out.log'

# === CONFIG ===
def load_env():
    env = {}
    env_file = PROJECT_DIR / '.env'
    if env_file.exists():
        with open(env_file) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    k, v = line.split('=', 1)
                    env[k.strip()] = v.strip()
    return env

ENV = load_env()
TOKEN = os.environ.get('META_ACCESS_TOKEN', '')
TELEGRAM_TOKEN = os.environ.get('TELEGRAM_BOT_TOKEN', '')
TELEGRAM_CHAT_ID = os.environ.get('TELEGRAM_CHAT_ID', '157228659')

API = 'https://graph.facebook.com/v19.0'
ACT = 'act_380721031313330'
MAX_PER_DAY = 2
COOLDOWN_DAYS = 7
MIN_CTR = 3.0
MIN_SPEND = 5000

# 🎯 Interest pools — THEMATIC CLUSTERING (Veris rule)
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
    'dressanakperempuan': {
        'primary': [
            {'id': '6003053088645', 'name': 'Pakaian anak'},
        ],
        'expand': [
            {'id': '6003221485467', 'name': 'Fashion anak'},
            {'id': '6003263791114', 'name': 'Belanja fashion'},
        ]
    },
    'bajuanak': {
        'primary': [
            {'id': '6003053088645', 'name': 'Pakaian anak'},
        ],
        'expand': [
            {'id': '6003221485467', 'name': 'Fashion anak'},
        ]
    },
    'benihsayuran': {
        'primary': [
            {'id': '6003121865564', 'name': 'Berkebun'},
        ],
        'expand': [
            {'id': '6003364701153', 'name': 'Pertanian'},
            {'id': '6003520360199', 'name': 'Tanaman hias'},
        ]
    },
    'wallpaperdindingvinyl': {
        'primary': [
            {'id': '6003360332669', 'name': 'Dekorasi rumah'},
        ],
        'expand': [
            {'id': '6003327621683', 'name': 'Rumah'},
            {'id': '6003139266461', 'name': 'Perabot rumah'},
        ]
    },
    'stikerkeramik': {
        'primary': [
            {'id': '6003360332669', 'name': 'Dekorasi rumah'},
        ],
        'expand': [
            {'id': '6003327621683', 'name': 'Rumah'},
            {'id': '6003139266461', 'name': 'Perabot rumah'},
        ]
    },
    'default': {
        'primary': [
            {'id': '6003346592981', 'name': 'Belanja online (ritel)'},
        ],
        'expand': [
            {'id': '6003221485467', 'name': 'Perdagangan elektronik'},
            {'id': '6003263791114', 'name': 'Belanja (ritel)'},
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

# === HELPERS ===

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
    try:
        return requests.get(f"{API}/{path}", params=p, timeout=15).json()
    except:
        return {"error": "timeout"}

def api_post(path, data=None):
    try:
        return requests.post(f"{API}/{path}",
            params={"access_token": TOKEN}, json=data or {}, timeout=15).json()
    except:
        return {"error": "timeout"}

def send_tg(text):
    if not TELEGRAM_TOKEN: return
    try:
        requests.post(f'https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage',
            json={'chat_id': TELEGRAM_CHAT_ID, 'text': text}, timeout=10)
    except: pass

# === CORE LOGIC ===

def get_winners():
    """Find active scale-eligible campaigns with good CTR"""
    today = datetime.now()
    since = (today - timedelta(days=3)).strftime('%Y-%m-%d')
    until = (today - timedelta(days=1)).strftime('%Y-%m-%d')

    camps = api_get(f'{ACT}/campaigns', {
        'fields': 'id,name,status,daily_budget',
        'effective_status': '["ACTIVE"]',
    })

    active = [c for c in camps.get('data', [])
              if 'OFF_' not in c.get('name', '')[:10]]

    if not active:
        return []

    cids = [c['id'] for c in active]

    ins = api_get(f'{ACT}/insights', {
        'level': 'campaign',
        'fields': 'campaign_id,campaign_name,spend,impressions,clicks,cpc,ctr',
        'time_range': json.dumps({'since': since, 'until': until}),
        'filtering': json.dumps([{'field': 'campaign.id', 'operator': 'IN', 'value': cids}])
    })

    results = []
    for i in ins.get('data', []):
        spend = float(i.get('spend', 0))
        ctr = float(i.get('ctr', 0))
        cpc = float(i.get('cpc', 0))
        if spend < MIN_SPEND or cpc == 0 or ctr < MIN_CTR:
            continue

        cid = i.get('campaign_id', '')
        camp_info = next((c for c in active if c['id'] == cid), {})
        budget = int(camp_info.get('daily_budget', 0))

        results.append({
            'id': cid, 'name': i.get('campaign_name', ''),
            'spend': spend, 'ctr': ctr, 'cpc': cpc, 'budget': budget,
        })

    return sorted(results, key=lambda x: -x['ctr'])


def extract_product(name):
    """Extract produk tag from campaign name"""
    parts = name.lower().split('_')
    if len(parts) >= 4:
        return parts[2]
    return name[:30]


def get_pool(name):
    """Get interest pool for campaign product"""
    name_lower = name.lower()
    for key in INTEREST_POOLS:
        if key != 'default' and key in name_lower:
            return INTEREST_POOLS[key]
    return INTEREST_POOLS['default']


def get_existing_interest_ids(campaign_id):
    """Get all interest IDs already targeted in this campaign"""
    adsets = api_get(f'{campaign_id}/adsets', {
        'fields': 'id,targeting', 'limit': 50
    })
    ids = set()
    for a in adsets.get('data', []):
        t = a.get('targeting', {})
        for interest in t.get('interests', []):
            ids.add(interest.get('id', '') if isinstance(interest, dict) else str(interest))
        for spec in t.get('flexible_spec', []):
            for interest in spec.get('interests', []):
                ids.add(interest.get('id', ''))
    return ids


def scale_out(campaign_id, campaign_name, budget):
    """Simple scale-out: copy campaign → rename → expand audience"""
    
    # 1. Deep copy the campaign
    log(f"  📋 Copying campaign...")
    copy_result = api_post(f'{campaign_id}/copies', {
        'deep_copy': True,
        'status_option': 'PAUSED',
    })

    new_id = copy_result.get('copied_campaign_id', '')
    if not new_id:
        log(f"  ❌ Copy failed: {copy_result}")
        return None

    log(f"  ✅ Copied → {new_id}")

    # 2. Rename with new audience
    product = extract_product(campaign_name)
    pool = get_pool(campaign_name)
    existing = get_existing_interest_ids(campaign_id)
    new_interests = [i for i in pool['expand'] if i['id'] not in existing]

    if not new_interests:
        # No new interests — clean up copy and skip
        api_post(f'{new_id}', {'status': 'DELETED'})
        log(f"  ⚠️ No new interests to expand — skipping")
        return None

    interest_name = new_interests[0]['name'].replace(' ', '').replace('(', '').replace(')', '').replace('&', '')[:20]
    date_str = datetime.now().strftime('%d%m')
    akun_name = 'Nyamiresep'
    new_name = f"LC_{akun_name}_{product}_{product}_{interest_name}_{date_str}"[:120]

    api_post(f'{new_id}', {'name': new_name})
    log(f"  📝 Renamed: {new_name}")

    # 3. Update adsets with expanded interests
    adsets = api_get(f'{new_id}/adsets', {
        'fields': 'id,name,targeting', 'limit': 50
    })

    updated = 0
    for i, adset in enumerate(adsets.get('data', [])):
        if i >= len(new_interests):
            break

        interest = new_interests[i]
        ref_targeting = adset.get('targeting', {})

        new_targeting = {
            **BASE_TARGETING,
            'interests': [{'id': interest['id'], 'name': interest['name']}],
        }

        # Copy over any custom fields from original targeting
        for field in ['custom_audiences', 'excluded_custom_audiences', 'locales',
                       'targeting_optimization', 'flexible_spec']:
            if field in ref_targeting:
                new_targeting[field] = ref_targeting[field]

        result = api_post(f'{adset["id"]}', {'targeting': new_targeting})
        if 'error' not in result:
            updated += 1
            log(f"    ✅ Adset → {interest['name']}")

    if updated == 0:
        api_post(f'{new_id}', {'status': 'DELETED'})
        log(f"  ❌ Failed to update any adsets — cleaned up")
        return None

    # Calculate new budget
    new_budget = max(int(budget * 0.5), 20000)

    log(f"  📦 {new_name} | {updated} adsets | Budget: Rp {new_budget:,}")
    return {
        'id': new_id, 'name': new_name,
        'adsets': updated, 'budget': new_budget,
    }


def run():
    if not TOKEN:
        log("❌ No Meta token")
        return

    state = load_state()
    today = datetime.now().strftime('%Y-%m-%d')

    if state.get('last_reset') != today:
        state['daily_count'] = 0
        state['last_reset'] = today

    if state['daily_count'] >= MAX_PER_DAY:
        log(f"⏸️ Daily limit ({MAX_PER_DAY}/day)")
        return

    log("=" * 50)
    log("🔥 AUTO SCALE-OUT v2.0")

    winners = get_winners()
    if not winners:
        log("No eligible winners")
        return

    log(f"Found {len(winners)} candidates")

    for w in winners:
        if state['daily_count'] >= MAX_PER_DAY:
            break

        cid = w['id']
        cname = w['name']

        # Cooldown check
        last = state['scale_outs'].get(cid, {})
        if last:
            days = (datetime.now() - datetime.fromisoformat(last.get('date', '2000-01-01'))).days
            if days < COOLDOWN_DAYS:
                continue

        log(f"\n🎯 {cname[:60]}")
        log(f"   CTR {w['ctr']:.1f}% | CPC Rp {w['cpc']:,.0f} | Budget Rp {w['budget']:,}")

        result = scale_out(cid, cname, w['budget'])

        if result:
            state['scale_outs'][cid] = {
                'name': cname, 'date': today,
                'new': result['name'], 'new_id': result['id'],
                'adsets': result['adsets'], 'budget': result['budget'],
            }
            state['daily_count'] += 1

            send_tg(
                f"🔥 AUTO SCALE-OUT\n\n"
                f"Source: {cname[:50]}\n"
                f"New: {result['name']}\n"
                f"Adsets: {result['adsets']}\n"
                f"Budget: Rp {result['budget']:,}\n\n"
                f"⚠️ PAUSED — review lalu activate"
            )

    save_state(state)
    log(f"\n✅ Done. {state['daily_count']}/{MAX_PER_DAY} today")


if __name__ == '__main__':
    run()
