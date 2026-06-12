import json, os, time, urllib.request, urllib.parse
from datetime import datetime, timedelta

ACT = '2125021885010866'
API = 'https://graph.facebook.com/v22.0'
ENV_PATH = '/home/openclaw/projects/1ai-ads/.env'

def load_token():
    for line in open(ENV_PATH).read().splitlines():
        if not line or line.startswith('#'):
            continue
        if line.split('=', 1)[0] == 'META_ACCESS_TOKEN':
            return line.split('=', 1)[1].strip()
    raise RuntimeError('META_ACCESS_TOKEN missing')

TOKEN = load_token()

def fb_get(path, **params):
    url = f'{API}/{path}'
    if params:
        url += '?' + '&'.join(f'{k}={urllib.parse.quote(str(v))}' for k, v in params.items())
    req = urllib.request.Request(url)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read())
    except Exception as e:
        return {'_error': str(e)}

pre = fb_get(f'act_{ACT}', fields='account_name', access_token=TOKEN)
if '_error' in pre:
    print(json.dumps({'status': 'preflight_failed', 'error': pre['_error']}, ensure_ascii=False))
    raise SystemExit(0)

all_camps = []
paging = f'act_{ACT}/campaigns'
params = {'fields': 'id,name,status,effective_status,daily_budget,lifetime_budget,spend', 'limit': 200, 'access_token': TOKEN}
while True:
    resp = fb_get(paging, **params)
    if '_error' in resp:
        print(json.dumps({'status': 'campaign_fetch_failed', 'error': resp['_error']}, ensure_ascii=False))
        raise SystemExit(0)
    all_camps.extend(resp.get('data', []))
    nxt = resp.get('paging', {}).get('next')
    if not nxt:
        break
    paging = nxt
    params = {'access_token': TOKEN}
    time.sleep(1.5)

active = [c for c in all_camps if c.get('effective_status') == 'ACTIVE']
paused = [c for c in all_camps if c.get('effective_status') in ('PAUSED', 'ARCHIVED')]
off_prefix = [c for c in all_camps if c.get('name', '').startswith('OFF_')]
dead_prefix = [c for c in all_camps if c.get('name', '').startswith('DEAD_')]
non_off = [c for c in active + paused if not c.get('name', '').startswith('OFF_') and not c.get('name', '').startswith('DEAD_')]

since = (datetime.now() - timedelta(days=7)).strftime('%Y-%m-%d')
until = datetime.now().strftime('%Y-%m-%d')
insights = []
for i in range(0, max(1, len(non_off)), 50):
    batch = non_off[i:i+50]
    ids = [c['id'] for c in batch]
    filt = json.dumps([{'field':'campaign.id','operator':'IN','value':ids}])
    resp = fb_get(f'act_{ACT}/insights', fields='campaign_id,campaign_name,spend,cpc,clicks,ctr,impressions', time_range=json.dumps({'since': since, 'until': until}), level='campaign', limit=200, filtering=filt, access_token=TOKEN)
    if '_error' not in resp:
        insights.extend(resp.get('data', []))
    time.sleep(1.5)

ins_map = {r.get('campaign_id'): r for r in insights}

winners = []
watch = []
kill = []
spend_total = 0
TRACKED_TAGS = ['abera', 'pintulipatgeser', 'hijab']
non_off_tag_status = {t: 0 for t in TRACKED_TAGS}

for c in non_off:
    i = ins_map.get(c['id'], {})
    spend = float(i.get('spend') or 0)
    cpc = float(i.get('cpc') or 0)
    clicks = int(i.get('clicks') or 0)
    impr = int(i.get('impressions') or 0)
    ctr = float(i.get('ctr') or 0)
    name = c.get('name', '')
    status = c.get('status') or c.get('effective_status')
    spend_total += spend

    lower = name.lower()
    for t in TRACKED_TAGS:
        if t in lower:
            non_off_tag_status[t] += 1

    is_cbo = any(p in name.upper() for p in ['CBO','BC_','LC_','TC_','🌟_','ON_LC_','ON_BC'])

    if cpc > 400 and spend > 2000:
        verdict = 'KILL'
        cpc_action = 'OFF_/PAUSE'
    elif is_cbo and cpc > 140 and spend > 5000:
        verdict = 'WATCH_CPC_CBO'
        cpc_action = 'PAUSE'
    elif (name.upper().startswith(('ABO','BIDCAP','TEST')) or 'test' in lower) and cpc > 250 and spend > 5000:
        verdict = 'WATCH_CPC_ABO'
        cpc_action = 'PAUSE'
    else:
        verdict = 'PASS_CPC'
        cpc_action = None

    if verdict == 'PASS_CPC' and ctr < 1 and impr > 1000:
        verdict = 'WATCH_CTR'
        cpc_action = 'PAUSE'

    tag_hit = any(t in lower for t in TRACKED_TAGS)
    if verdict == 'PASS_CPC' and tag_hit:
        if cpc < 140 and spend > 50000 and clicks > 0:
            verdict = 'WINNER'
            winners.append({'id': c['id'], 'name': name, 'cpc': round(cpc,1), 'ctr': round(ctr,2), 'spend': int(spend), 'clicks': clicks})
        elif spend > 50000:
            verdict = 'WATCH_TAGLINK'
            watch.append({'id': c['id'], 'name': name, 'cpc': round(cpc,1), 'spend': int(spend)})
    elif verdict == 'PASS_CPC' and not tag_hit and spend > 50000:
        verdict = 'WATCH_NONTAG'
        watch.append({'id': c['id'], 'name': name, 'cpc': round(cpc,1), 'spend': int(spend)})

    if verdict in ('KILL',) or verdict.startswith('WATCH_CPC') or verdict == 'WATCH_CTR':
        kill.append({'id': c['id'], 'name': name, 'verdict': verdict, 'cpc': round(cpc,1), 'spend': int(spend), 'clicks': clicks, 'ctr': round(ctr,2), 'cpc_action': cpc_action})

for item in kill:
    cpc_action = item.get('cpc_action')
    if cpc_action == 'PAUSE':
        data = urllib.parse.urlencode({'status': 'PAUSED', 'access_token': TOKEN}).encode()
        req = urllib.request.Request(f"{API}/{item['id']}", data=data, method='POST')
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                item['pause_result'] = json.loads(r.read()).get('success')
        except Exception as e:
            item['pause_result'] = str(e)
        time.sleep(1.5)
    elif cpc_action == 'OFF_/PAUSE':
        rename = urllib.parse.urlencode({'name': f"OFF_{item['name']}", 'access_token': TOKEN}).encode()
        req = urllib.request.Request(f"{API}/{item['id']}", data=rename, method='POST')
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                r1 = json.loads(r.read()).get('success')
        except Exception:
            r1 = False
        time.sleep(1.5)
        data = urllib.parse.urlencode({'status': 'PAUSED', 'access_token': TOKEN}).encode()
        req = urllib.request.Request(f"{API}/{item['id']}", data=data, method='POST')
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                r2 = json.loads(r.read()).get('success')
        except Exception:
            r2 = False
        time.sleep(1.5)
        item['pause_result'] = {'rename': r1, 'pause': r2}

report = {
    'timestamp': datetime.now().isoformat(),
    'preflight_account': pre.get('account_name'),
    'total_campaigns': len(all_camps),
    'active': len(active),
    'paused': len(paused),
    'off_prefix': len(off_prefix),
    'dead_prefix': len(dead_prefix),
    'insight_rows': len(insights),
    'tag_active_counts': non_off_tag_status,
    'winners': winners,
    'watch': watch,
    'kill_list': kill,
    '7d_spend': int(spend_total),
}
print(json.dumps(report, ensure_ascii=False))
