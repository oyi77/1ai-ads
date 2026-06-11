#!/usr/bin/env python3
"""SATPAM PATROL 1041 Nyamiresep — 3-layer decision engine (CPC -> CTR -> ROI)"""
import json, os, sys, time, urllib.request, urllib.parse, datetime, re
from pathlib import Path

# === TOKEN LOADING (runtime, never embed) ===
def load_token():
    # Method 1: from os.environ if already sourced
    try:
        t = os.environ.get('META_ACCESS_TOKEN', '')
        if t and len(t) > 200:
            return t
    except Exception:
        pass
    # Method 2: from os.getenv (sidesteps tool-layer mangling)
    try:
        from os import getenv
        t = getenv('META_ACCESS_TOKEN', '')
        if t and len(t) > 200:
            return t
    except Exception:
        pass
    # Method 3: from file
    # Method 3: from file at runtime
    env_path = Path('/home/openclaw/projects/1ai-ads/.env')
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith('META_ACCESS_TOKEN=***                    return line.split('=', 1)[1].strip()
    raise RuntimeError('META_ACCESS_TOKEN not found')

TOKEN = load_token()
API = 'https://graph.facebook.com/v22.0'

ACT_ID = '380721031313330'
ACCOUNT_NAME = 'Nyamiresep (1041)'

# CPC thresholds
CPC_KILL = 200
CPC_DANGER_CBO = 120
CPC_DANGER_ABO = 250
CPC_SAFE = 80

REQUIRED_TAGS = ['rakdapur3', 'atayasetelankaosanak']

# === API HELPERS ===
def fb_get(endpoint, params=None, retries=3):
    url = f"{API}/{endpoint}"
    if params:
        qs = urllib.parse.urlencode(params)
        url = f"{url}?{qs}"
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={'Authorization': f'Bearer {TOKEN}'})
            with urllib.request.urlopen(req, timeout=15) as resp:
                return json.loads(resp.read())
        except urllib.error.HTTPError as e:
            body = e.read().decode()
            if e.code == 400 and '2446079' in body and attempt < retries - 1:
                wait = (attempt + 1) * 3
                print(f"  [RATE LIMIT] waiting {wait}s...")
                time.sleep(wait)
                continue
            print(f"  [ERROR] {e.code} {body[:120]}")
            return {'data': [], 'error': body}
        except Exception as e:
            if attempt < retries - 1:
                time.sleep(2)
                continue
            print(f"  [EXCEPTION] {e}")
            return {'data': [], 'error': str(e)}
    return {'data': []}

def fb_post(endpoint, body_dict, retries=3):
    url = f"{API}/{endpoint}"
    body_dict['access_token'] = TOKEN
    for k in list(body_dict.keys()):
        if isinstance(body_dict[k], (dict, list)):
            body_dict[k] = json.dumps(body_dict[k])
    qs = urllib.parse.urlencode(body_dict).encode()
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, data=qs, method='POST')
            with urllib.request.urlopen(req, timeout=15) as resp:
                return json.loads(resp.read())
        except urllib.error.HTTPError as e:
            body = e.read().decode()
            if e.code == 400 and '2446079' in body and attempt < retries - 1:
                wait = (attempt + 1) * 3
                print(f"  [RATE LIMIT POST] waiting {wait}s...")
                time.sleep(wait)
                continue
            print(f"  [POST ERROR] {e.code} {body[:150]}")
            return {'error': body}
        except Exception as e:
            if attempt < retries - 1:
                time.sleep(2)
                continue
            print(f"  [POST EXCEPTION] {e}")
            return {'error': str(e)}
    return {'error': 'max retries'}

# === HELPERS ===
def detect_campaign_type(name):
    n = name.upper()
    if 'TEST' in n or 'TESTING' in n:
        return 'TEST'
    if n.startswith('ABO'):
        return 'ABO'
    if n.startswith('BIDCAP'):
        return 'BIDCAP'
    if n.startswith(('CBO', 'BC_', 'LC_', 'TC_', 'GLW', 'ON_LC', 'ON_BC', '🌟')):
        return 'CBO'
    return 'ABO'

def is_off_limits(name):
    return name.startswith('OFF_') or name.startswith('DEAD_')

def is_winner_prefix(name):
    return name.startswith('🌟')

def extract_taglink(name):
    """Extract taglink from campaign name."""
    n = name.lower().replace(' ', '_').replace('-', '_')
    for tag in REQUIRED_TAGS:
        if tag in n:
            return tag
    return None

def money(val):
    try:
        return float(val)
    except Exception:
        return 0.0

# === FETCH DATA ===
def fetch_campaigns():
    print(f"[1] Fetching campaigns for {ACCOUNT_NAME}...")
    camps = []
    url = f"{ACT_ID}/campaigns"
    params = {
        'fields': 'id,name,status,effective_status,daily_budget,lifetime_budget,spend,cpc',
        'limit': 200
    }
    while True:
        resp = fb_get(url, params)
        if 'data' not in resp:
            break
        batch = resp.get('data', [])
        camps.extend(batch)
        next_url = resp.get('paging', {}).get('next', '')
        if not next_url or not batch:
            break
        # Extract endpoint from next URL (discard stale token)
        url = next_url.split('?')[0]
        params = {}
        time.sleep(0.7)
    print(f"    Found {len(camps)} total campaigns")
    return camps

def fetch_insights(campaign_ids):
    print(f"[2] Fetching 7-day insights for {len(campaign_ids)} campaigns...")
    insights = {}
    # Meta v22.0: /insights with campaign filter, batch 20, 1.5s delay
    for i in range(0, len(campaign_ids), 20):
        batch = campaign_ids[i:i+20]
        id_list = json.dumps(batch)
        time.sleep(1.5)  # rate limit courtesy
        resp = fb_get(f'{ACT_ID}/insights', {
            'fields': 'campaign_id,campaign_name,spend,cpc,clicks,ctr,impressions,actions',
            'time_range': json.dumps({'since': (datetime.date.today() - datetime.timedelta(days=7)).isoformat(),
                                      'until': datetime.date.today().isoformat()}),
            'filtering': json.dumps([{'field': 'campaign.id', 'operator': 'IN', 'value': batch}]),
            'level': 'campaign',
            'limit': 50
        })
        if 'data' in resp:
            for row in resp['data']:
                cid = row.get('campaign_id', '')
                if cid:
                    insights[cid] = row
        elif resp.get('error'):
            print(f"    Insights batch error: {resp['error'][:100]}")
    print(f"    Got insights for {len(insights)} campaigns")
    return insights

# === 3-LAYER CLASSIFICATION ===
def classify_campaign(camp, insight):
    cid = camp['id']
    name = camp['name']
    status = camp.get('status', '')

    # OFF_LIMITS — never touch
    if is_off_limits(name):
        return {
            'verdict': 'OFF_LIMITS', 'name': name, 'cid': cid, 'status': status,
            'spend': 0, 'cpc': 0, 'ctr': 0, 'clicks': 0, 'impressions': 0,
            'taglink': extract_taglink(name), 'reason': 'OFF_/DEAD_ protected',
            'action': 'SKIP', 'new_name': name
        }

    spend = money(insight.get('spend', 0))
    cpc = money(insight.get('cpc', 0))
    clicks = int(money(insight.get('clicks', 0)))
    ctr = money(insight.get('ctr', 0))
    impr = int(money(insight.get('impressions', 0)))
    camp_type = detect_campaign_type(name)
    taglink = extract_taglink(name)

    # Determine CPC threshold based on campaign type
    if camp_type in ('CBO',):
        cpc_danger = CPC_DANGER_CBO
    elif camp_type in ('ABO', 'BIDCAP', 'TEST'):
        cpc_danger = CPC_DANGER_ABO
    else:
        cpc_danger = CPC_DANGER_CBO

    # LAYER 1: CPC
    # Hard kill: CPC > 200 + spend > 2k (applies FIRST, before ROI)
    if cpc > CPC_KILL and spend > 2000:
        return {
            'verdict': 'KILL', 'name': name, 'cid': cid, 'status': status,
            'spend': spend, 'cpc': cpc, 'ctr': ctr, 'clicks': clicks, 'impressions': impr,
            'taglink': taglink, 'reason': f'CPC {cpc:.0f} > {CPC_KILL} + spend {spend:.0f} > 2K',
            'action': 'PAUSE_AND_OFF', 'new_name': f'OFF_{name}' if not name.startswith('OFF_') else name,
            'camp_type': camp_type
        }

    # CPC danger zone: > threshold + spend > 5k
    if cpc > cpc_danger and spend > 5000:
        tag_str = taglink if taglink else 'non-taglink'
        return {
            'verdict': 'WATCH', 'name': name, 'cid': cid, 'status': status,
            'spend': spend, 'cpc': cpc, 'ctr': ctr, 'clicks': clicks, 'impressions': impr,
            'taglink': taglink, 'reason': f'CPC {cpc:.0f} > danger {cpc_danger} (type={camp_type}) + spend {spend:.0f}',
            'action': 'PAUSE_WATCH', 'new_name': name,
            'camp_type': camp_type
        }

    # LAYER 2: CTR
    if ctr < 1.0 and impr > 1000:
        return {
            'verdict': 'WATCH', 'name': name, 'cid': cid, 'status': status,
            'spend': spend, 'cpc': cpc, 'ctr': ctr, 'clicks': clicks, 'impressions': impr,
            'taglink': taglink, 'reason': f'CTR {ctr:.2f}% < 1% + impr {impr}',
            'action': 'PAUSE_WATCH', 'new_name': name,
            'camp_type': camp_type
        }

    # LAYER 3: ROI classification (needs commission data — estimate from spend)
    # Without TrackPro, use spend as proxy indicator
    # Spend > 50K + CPC safe + CTROK + clicks > 0 = potential winner
    if spend > 50000 and cpc <= cpc_danger and clicks > 0 and ctr >= 1.0:
        return {
            'verdict': 'WINNER', 'name': name, 'cid': cid, 'status': status,
            'spend': spend, 'cpc': cpc, 'ctr': ctr, 'clicks': clicks, 'impressions': impr,
            'taglink': taglink, 'reason': f'spend {spend:.0f} + CPC {cpc:.0f} safe + CTR {ctr:.1f}% + {clicks} clicks',
            'action': 'RENAME_WINNER', 'new_name': f'🌟_{name}' if not name.startswith('🌟') else name,
            'camp_type': camp_type
        }

    # Non-taglink with spend > 50K
    if not taglink and spend > 50000:
        return {
            'verdict': 'WATCH', 'name': name, 'cid': cid, 'status': status,
            'spend': spend, 'cpc': cpc, 'ctr': ctr, 'clicks': clicks, 'impressions': impr,
            'taglink': None, 'reason': f'non-taglink + spend {spend:.0f} > 50K',
            'action': 'WATCH_NON_TAG', 'new_name': name,
            'camp_type': camp_type
        }

    # ZERO spend
    if spend < 100:
        return {
            'verdict': 'ZERO', 'name': name, 'cid': cid, 'status': status,
            'spend': spend, 'cpc': cpc, 'ctr': ctr, 'clicks': clicks, 'impressions': impr,
            'taglink': taglink, 'reason': f'spend {spend:.0f} < 100',
            'action': 'SKIP', 'new_name': name,
            'camp_type': camp_type
        }

    # KEEP
    return {
        'verdict': 'KEEP', 'name': name, 'cid': cid, 'status': status,
        'spend': spend, 'cpc': cpc, 'ctr': ctr, 'clicks': clicks, 'impressions': impr,
        'taglink': taglink, 'reason': f'CPC {cpc:.0f} <= {cpc_danger}, spend {spend:.0f}',
        'action': 'NONE', 'new_name': name,
        'camp_type': camp_type
    }

# === EXECUTE ===
def execute_action(classification):
    cid = classification['cid']
    name = classification['name']
    action = classification['action']
    new_name = classification.get('new_name', name)
    status = classification.get('status', '')

    if action == 'SKIP':
        return 'skip'

    if action in ('PAUSE_AND_OFF', 'PAUSE_WATCH'):
        # Step 1: Pause if active
        if status == 'ACTIVE':
            result = fb_post(cid, {'status': 'PAUSED'})
            if 'error' in result:
                return f'pause_fail:{result["error"][:60]}'
            # Verify
            time.sleep(1)
            verify = fb_get(cid, {'fields': 'status'})
            v_status = verify.get('status', '')
            if v_status != 'PAUSED':
                # Retry once
                time.sleep(2)
                fb_post(cid, {'status': 'PAUSED'})
                return f'pause_retry:{v_status}'
        # Step 2: Rename to OFF_ if killing
        if action == 'PAUSE_AND_OFF' and not name.startswith('OFF_'):
            result = fb_post(cid, {'name': new_name})
            if 'error' in result:
                return f'off_rename_fail:{result["error"][:60]}'
            time.sleep(0.7)
            return 'paused_and_off'
        return 'paused'

    if action == 'RENAME_WINNER':
        if name != new_name:
            result = fb_post(cid, {'name': new_name})
            if 'error' in result:
                return f'rename_fail:{result["error"][:60]}'
            time.sleep(0.7)
            return 'renamed_winner'
        return 'already_winner'

    if action == 'WATCH_NON_TAG':
        # Just note, no action
        return 'watch_nontag'

    return 'none'

# === REBUILD TARGET URL ===
def rebuild_api_url(next_url):
    """Rebuild Meta paging URL with current token (pitfall #48)."""
    if not next_url:
        return ''
    # Strip existing query, rebuild with current token
    base = next_url.split('?')[0]
    return f"{base}?access_token={TOKEN}&limit=200"

# === MAIN ===
def main():
    timestamp = datetime.datetime.now().strftime('%Y-%m-%d %H:%M WIB')
    since = (datetime.date.today() - datetime.timedelta(days=7)).isoformat()
    until = datetime.date.today().isoformat()

    print(f"🛡️ SATPAM 1041 — {timestamp}")
    print(f"    Account: {ACCOUNT_NAME}")
    print(f"    Act ID: act_{ACT_ID}")
    print(f"    Date range: {since} → {until}")
    print()

    # Fetch campaigns
    all_camps = fetch_campaigns()

    # Separate active and paused
    active_camps = [c for c in all_camps if c.get('status') == 'ACTIVE']
    paused_camps = [c for c in all_camps if c.get('status') == 'PAUSED']
    off_count = len([c for c in all_camps if c['name'].startswith('OFF_')])
    dead_count = len([c for c in all_camps if c['name'].startswith('DEAD_')])

    print(f"    ACTIVE: {len(active_camps)} | PAUSED: {len(paused_camps)} | OFF_: {off_count} | DEAD_: {dead_count}")

    # Fetch insights for all campaigns (both active and paused for CPC sweep)
    all_ids = [c['id'] for c in all_camps]
    insights = fetch_insights(all_ids)

    # Classify all campaigns
    print(f"\n[3] Running 3-layer classification on {len(all_camps)} campaigns...")
    classifications = []
    for camp in all_camps:
        cid = camp['id']
        insight = insights.get(cid, {})
        cl = classify_campaign(camp, insight)
        classifications.append(cl)

    # Group by verdict
    verdicts = {}
    for cl in classifications:
        v = cl['verdict']
        verdicts[v] = verdicts.get(v, 0) + 1

    # Execute actions
    print(f"\n[4] Executing actions...")
    kill_list = []
    watch_list = []
    winner_list = []
    total_spend = 0

    results = {'paused_and_off': 0, 'paused': 0, 'renamed_winner': 0, 'watch_nontag': 0, 'skip': 0, 'errors': 0}

    for cl in classifications:
        if cl['action'] == 'SKIP':
            results['skip'] += 1
            continue

        total_spend += cl.get('spend', 0)

        if cl['verdict'] == 'KILL':
            kill_list.append(cl)
        elif cl['verdict'] == 'WATCH':
            watch_list.append(cl)
        elif cl['verdict'] == 'WINNER':
            winner_list.append(cl)

        result = execute_action(cl)
        if result.startswith('fail') or result.startswith('error'):
            results['errors'] += 1
            print(f"    ⚠️ FAIL {cl['name'][:50]}: {result}")
        else:
            results[result] = results.get(result, 0) + 1

    # Count active after actions
    post_active = len([c for c in all_camps if c.get('status') == 'ACTIVE'])
    post_off = len([c for c in all_camps if c['name'].startswith('OFF_')])

    # Estimate winners newly tagged
    new_winners = [w for w in winner_list if not w['name'].startswith('🌟')]

    # === REPORT ===
    print()
    print("=" * 60)
    print(f"🛡️ SATPAM 1041 — {timestamp}")
    print(f"ACTIVE: {post_active} | OFF_: {post_off} | 🌟: {results.get('renamed_winner', 0) + len([c for c in classifications if c['name'].startswith('🌟') and c['verdict'] != 'KILL'])}")
    print()

    if kill_list:
        print(f"💀 KILL (CPC > {CPC_KILL} + spend > 2K):")
        for k in kill_list:
            print(f"   {k['name'][:60]}")
            print(f"      CPC Rp{k['cpc']:.0f} | Spend Rp{k['spend']:.0f} | {k['reason']}")
        print()

    if watch_list:
        print(f"👀 WATCH:")
        for w in watch_list[:15]:  # Limit output
            print(f"   {w['name'][:60]}")
            print(f"      {w['reason']}")
        if len(watch_list) > 15:
            print(f"   ... and {len(watch_list) - 15} more")
        print()

    if new_winners:
        print(f"🌟 NEW WINNERS (promoted):")
        for w in new_winners:
            print(f"   {w['name'][:60]}")
            print(f"      CPC Rp{w['cpc']:.0f} | Spend Rp{w['spend']:.0f} | Clicks {w['clicks']} | CTR {w['ctr']:.1f}%")
        print()

    print(f"💰 Total 7-day spend: Rp{total_spend:,.0f}")
    print()
    print(f"Actions: paused={results.get('paused',0)} paused+OFF={results.get('paused_and_off',0)} winners={results.get('renamed_winner',0)} skip={results.get('skip',0)} errors={results.get('errors',0)}")
    print()

    # Save patrol log
    log_path = Path('/home/openclaw/projects/1ai-ads/data/patrols')
    log_path.mkdir(parents=True, exist_ok=True)
    log_file = log_path / f'patrol_1041_{datetime.date.today().isoformat()}.json'
    log_data = {
        'timestamp': timestamp,
        'account': '1041',
        'act_id': ACT_ID,
        'total_campaigns': len(all_camps),
        'active': post_active,
        'off': post_off,
        'dead': dead_count,
        'winners_new': len(new_winners),
        'kills': len(kill_list),
        'watch': len(watch_list),
        'total_spend_7d': total_spend,
        'verdicts_counts': verdicts,
        'actions': results,
        'kill_list': [{'name': k['name'], 'cid': k['cid'], 'cpc': k['cpc'], 'spend': k['spend']} for k in kill_list],
        'watch_list': [{'name': w['name'], 'cid': w['cid'], 'reason': w['reason']} for w in watch_list[:20]],
        'winner_list': [{'name': w['name'], 'cid': w['cid'], 'spend': w['spend'], 'cpc': w['cpc'], 'clicks': w['clicks']} for w in new_winners]
    }
    log_path.write_text(json.dumps(log_data, indent=2, ensure_ascii=False))
    print(f"Log saved: {log_file}")

if __name__ == '__main__':
    main()
