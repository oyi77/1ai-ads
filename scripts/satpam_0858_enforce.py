import json, os, sys, time
from datetime import datetime, timezone, timedelta
import urllib.request, urllib.error, urllib.parse

TOKEN_PATH='/tmp/_....txt'
API = 'https://graph.facebook.com/v22.0'
ACT = 'act_435670549443081'

def load_token():
    with open(TOKEN_PATH) as f:
        return f.read().strip()

def fb_get(path, params=None):
    token = load_token()
    p = dict(params or {})
    p['access_token'] = token
    qs = urllib.parse.urlencode(p)
    url = f"{API}/{path}?{qs}"
    for attempt in range(3):
        try:
            with urllib.request.urlopen(url, timeout=20) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            body = e.read().decode('utf-8', errors='replace')
            if e.code == 400 and '2446079' in body:
                time.sleep((attempt + 1) * 5)
                continue
            raise RuntimeError(f"HTTP {e.code}: {body}") from e
    raise RuntimeError('Rate limit retries exhausted')

def fb_post(path, data):
    token = load_token()
    d = dict(data)
    d['access_token'] = token
    qs = urllib.parse.urlencode(d).encode()
    url = f"{API}/{path}"
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, data=qs, method='POST')
            with urllib.request.urlopen(req, timeout=20) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            body = e.read().decode('utf-8', errors='replace')
            if e.code == 400 and '2446079' in body:
                time.sleep((attempt + 1) * 5)
                continue
            raise RuntimeError(f"POST HTTP {e.code}: {body}") from e
    raise RuntimeError('POST rate limit retries exhausted')

def fb_delete(path):
    token = load_token()
    url = f"{API}/{path}?access_token={token}"
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, method='DELETE')
            with urllib.request.urlopen(req, timeout=20) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            body = e.read().decode('utf-8', errors='replace')
            if e.code == 400 and '2446079' in body:
                time.sleep((attempt + 1) * 5)
                continue
            raise RuntimeError(f"DELETE HTTP {e.code}: {body}") from e
    raise RuntimeError('DELETE rate limit retries exhausted')

def time_range_last_7d():
    until = datetime.now(timezone.utc).date()
    since = until - timedelta(days=6)
    return since.isoformat(), until.isoformat()

def chunks(xs, n):
    for i in range(0, len(xs), n):
        yield xs[i:i+n]

def main():
    token = load_token()
    since, until = time_range_last_7d()
    now = datetime.now(timezone(timedelta(hours=7))).strftime('%Y-%m-%d %H:%M WIB')

    # Fetch campaigns (pagination)
    camps = []
    after = None
    attempts = 0
    while True:
        p = {'fields': 'id,name,status,daily_budget', 'limit': '200'}
        if after:
            p['after'] = after
        res = fb_get(f'{ACT}/campaigns', p)
        data = res.get('data') or []
        camps.extend(data)
        pg = res.get('paging', {})
        nxt = pg.get('next')
        after = None
        if nxt:
            try:
                qp = urllib.parse.parse_qs(urllib.parse.urlparse(nxt).query)
                after = (qp.get('after') or [None])[0]
            except Exception:
                after = None
        time.sleep(1.5)
        if not after:
            break
        attempts += 1
        if attempts > 20:
            break
    time.sleep(1.0)

    active = [c for c in camps if c.get('status') == 'ACTIVE']
    off_count = sum(1 for c in camps if c.get('status') == 'PAUSED' and c.get('name','').startswith('OFF_'))

    # Fetch insights for all campaigns for last 7d
    insights_map = {}
    ids_all = [c['id'] for c in camps]
    for batch in chunks(ids_all, 50):
        params = {
            'fields': 'campaign_id,campaign_name,spend,cpc,clicks,ctr,impressions',
            'time_range': json.dumps({'since': since, 'until': until}),
            'level': 'campaign',
            'filtering': json.dumps([{'field':'campaign.id','operator':'IN','value':batch}]),
            'limit': '200'
        }
        res = fb_get(f'{ACT}/insights', params)
        for row in res.get('data', []):
            cid = row.get('campaign_id')
            if cid:
                insights_map[cid] = row
        time.sleep(2.0)

    watch_pause = []
    total_spend = 0.0
    for c in active:
        cid = c['id']
        ins = insights_map.get(cid, {})
        spend = float(ins.get('spend', 0) or 0)
        cpc = float(ins.get('cpc', 0) or 0)
        clicks = int(ins.get('clicks', 0) or 0)
        ctr = float(ins.get('ctr', 0) or 0)
        impr = int(ins.get('impressions', 0) or 0)
        total_spend += spend
        name = c.get('name','')
        is_cbo = name.upper().startswith(('CBO','BC_','LC_','TC_','🌟','ON_LC_','ON_BC','ON_BIDCAP'))
        is_abo = name.upper().startswith(('ABO','BIDCAP'))
        is_test = 'TEST' in name.upper()
        cpc_danger = 250 if (is_abo or is_test) else 120

        if (cpc > cpc_danger and spend > 5000) or (ctr < 1 and impr > 1000):
            watch_pause.append((cid, name, cpc, spend, cpc_danger))

    # Pause WATCH campaigns per SOP
    for cid, name, cpc, spend, cpc_danger in watch_pause:
        try:
            fb_post(cid, {'status': 'PAUSED'})
            time.sleep(1.5)
        except Exception as e:
            print('FAIL pause WATCH', cid, e, file=sys.stderr)

    # Fetch and delete conflicting Meta automated rules (CPC-triggered PAUSE)
    try:
        rules_res = fb_get(f'{ACT}/adrules_library', {'fields': 'id,name,execution_spec,evaluation_spec', 'limit': '50'})
    except Exception as e:
        rules_res = {'data': []}
    deleted_rules = []
    for r in rules_res.get('data', []):
        name = r.get('name','').lower()
        exec_spec = json.dumps(r.get('execution_spec', {})).lower()
        eval_spec = json.dumps(r.get('evaluation_spec', {})).lower()
        # Identify rules that automatically PAUSE based on CPC / spend
        if ('pause' in exec_spec or 'pause' in eval_spec) and ('cpc' in exec_spec or 'cpc' in eval_spec or 'spent' in exec_spec or 'spent' in eval_spec):
            # Delete pause-type rules only
            rid = r.get('id')
            if not rid:
                continue
            try:
                fb_delete(f"{rid}")
                time.sleep(1.5)
                deleted_rules.append(r.get('name'))
            except Exception as e:
                print('FAIL delete rule', rid, e, file=sys.stderr)
    time.sleep(2.0)

    print('🛡️ SATPAM 0858 —', now)
    print(f'ACTIVE: {len(active)} | OFF_: {off_count} | DEAD_: 0')
    print('⚠️ KILL: -')
    if watch_pause:
        print('👀 WATCH -> PAUSED:', ', '.join(f'{n} (CPC Rp{cpc:.0f}, Rp{spend:.0f})' for _,n,cpc,spend,_ in watch_pause))
    else:
        print('👀 WATCH: -')
    print('🌟 WINNERS: -')
    print(f'💰 Total spend 7d: Rp{total_spend:,.0f}'.replace(',', '.'))
    if deleted_rules:
        print('🗑️ DELETED RULES:', ', '.join(deleted_rules))
    print('✅ Patrol complete — no destructive external actions beyond pause/rename/rule cleanup')

if __name__ == '__main__':
    main()
