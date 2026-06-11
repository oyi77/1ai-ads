import json
import time
import datetime
import urllib.request
import urllib.error
import urllib.parse

TOKEN_PATH='/tmp/tk_1041.txt'
API = 'https://graph.facebook.com/v22.0'
ACT = 'act_380721031313330'
ACCOUNT_NAME = 'Nyamiresep (1041)'
CPC_KILL = 200
CPC_DANGER_CBO = 120
CPC_DANGER_ABO = 250
REQUIRED_TAGS = ['rakdapur3', 'atayasetelankaosanak']

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
            req = urllib.request.Request(url)
            with urllib.request.urlopen(req, timeout=20) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            body = e.read().decode('utf-8', errors='replace')
            if e.code == 400 and '2446079' in body and attempt < 2:
                time.sleep((attempt + 1) * 5)
                continue
            raise RuntimeError(f"GET {e.code}: {body[:500]}") from e
    raise RuntimeError('GET rate limit exhausted')

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
            if e.code == 400 and '2446079' in body and attempt < 2:
                time.sleep((attempt + 1) * 5)
                continue
            raise RuntimeError(f"POST {e.code}: {body[:500]}") from e
    raise RuntimeError('POST rate limit exhausted')

def detect_type(name):
    n = name.upper()
    for p in ('CBO', 'BC_', 'LC_', 'TC_', 'GLW', 'ON_LC', 'ON_BC', '🌟'):
        if p in n:
            return 'CBO'
    if n.startswith(('ABO', 'BIDCAP')) or 'TEST' in n:
        return 'ABO'
    return 'ABO'

def extract_tag(name):
    n = name.lower().replace(' ', '_').replace('-', '_')
    for t in REQUIRED_TAGS:
        if t in n:
            return t
    return None

def main():
    since = (datetime.date.today() - datetime.timedelta(days=7)).isoformat()
    until = datetime.date.today().isoformat()
    ts = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S WIB')

    # --- Fetch campaigns ---
    camps = []
    after = None
    for _ in range(20):
        p = {'fields': 'id,name,status,effective_status,daily_budget,lifetime_budget,spend,cpc', 'limit': 200}
        if after:
            p['after'] = after
        res = fb_get(f'{ACT}/campaigns', p)
        data = res.get('data') or []
        camps.extend(data)
        pg = res.get('paging', {})
        nxt = pg.get('next', '')
        after = None
        if nxt:
            try:
                qp = urllib.parse.parse_qs(urllib.parse.urlparse(nxt).query)
                after = (qp.get('after') or [None])[0]
            except Exception:
                pass
        time.sleep(1.5)
        if not after or not data:
            break

    active_n = len([c for c in camps if c.get('status') == 'ACTIVE'])
    paused_n = len([c for c in camps if c.get('status') == 'PAUSED'])
    off_n = len([c for c in camps if c['name'].startswith('OFF_')])
    print(f"[FETCH] Total={len(camps)} ACTIVE={active_n} PAUSED={paused_n} OFF_={off_n}")

    # --- Fetch 7d insights ---
    all_ids = [c['id'] for c in camps]
    insights = {}
    for batch_start in range(0, len(all_ids), 20):
        batch = all_ids[batch_start:batch_start+20]
        res = fb_get(f'{ACT}/insights', {
            'fields': 'campaign_id,campaign_name,spend,cpc,clicks,ctr,impressions',
            'time_range': json.dumps({'since': since, 'until': until}),
            'level': 'campaign',
            'filtering': json.dumps([{'field': 'campaign.id', 'operator': 'IN', 'value': batch}]),
            'limit': 50
        })
        for row in res.get('data', []):
            cid = row.get('campaign_id')
            if cid:
                insights[cid] = row
        time.sleep(2.0)

    print(f"[INSIGHTS] Received={len(insights)}")

    # --- 3-Layer classify ---
    kills = []
    watch_pause = []
    winners = []
    winners_new = []
    spend_total = 0.0
    act_stats = {'SKIP': 0, 'KEEP': 0, 'ZERO': 0, 'WATCH_NONTAG': 0}

    for camp in camps:
        cid = camp['id']
        name = camp['name']
        status = camp.get('status', '')
        ins = insights.get(cid, {})
        spend = float(ins.get('spend') or 0)
        cpc = float(ins.get('cpc') or 0)
        clicks = int(float(ins.get('clicks') or 0))
        ctr = float(ins.get('ctr') or 0)
        impr = int(float(ins.get('impressions') or 0))
        ttype = detect_type(name)
        tag = extract_tag(name)
        spend_total += spend

        if name.startswith('OFF_') or name.startswith('DEAD_'):
            act_stats['SKIP'] += 1
            continue

        # LAYER 1: CPC hard kill (before ROI check)
        if cpc > CPC_KILL and spend > 2000:
            kills.append({'name': name, 'cid': cid, 'cpc': cpc, 'spend': spend, 'tag': tag, 'ttype': ttype,
                          'reason': f'CPC Rp{cpc:.0f} > {CPC_KILL} + spend Rp{spend:.0f} > 2K'})
            if status == 'ACTIVE':
                fb_post(cid, {'status': 'PAUSED'})
                time.sleep(1.5)
            fb_post(cid, {'name': 'OFF_' + name if not name.startswith('OFF_') else name})
            time.sleep(0.7)
            continue

        # LAYER 1: CPC danger
        cpc_d = CPC_DANGER_CBO if ttype == 'CBO' else CPC_DANGER_ABO
        if cpc > cpc_d and spend > 5000:
            watch_pause.append({'name': name, 'cid': cid, 'cpc': cpc, 'spend': spend, 'tag': tag,
                                'reason': f'CPC Rp{cpc:.0f} > {cpc_d} ({ttype}) + Rp{spend:.0f} > 5K'})
            if status == 'ACTIVE':
                fb_post(cid, {'status': 'PAUSED'})
                time.sleep(1.5)
            continue

        # LAYER 2: CTR
        if ctr < 1.0 and impr > 1000:
            watch_pause.append({'name': name, 'cid': cid, 'cpc': cpc, 'spend': spend, 'tag': tag,
                                'reason': f'CTR {ctr:.1f}% < 1% + {impr:,} impr'})
            if status == 'ACTIVE':
                fb_post(cid, {'status': 'PAUSED'})
                time.sleep(1.5)
            continue

        # LAYER 3: Winner
        if spend > 50000 and cpc <= cpc_d and clicks > 0 and ctr >= 1.0:
            winners.append({'name': name, 'cid': cid, 'cpc': cpc, 'spend': spend, 'clicks': clicks,
                            'ctr': ctr, 'tag': tag, 'reason': f'Rp{spend:,.0f} + CPC Rp{cpc:.0f} + CTR {ctr:.1f}%'})
            if not name.startswith('🌟'):
                fb_post(cid, {'name': '🌟_' + name})
                time.sleep(0.7)
                winners_new.append(name)
            continue

        if not tag and spend > 50000:
            watch_pause.append({'name': name, 'reason': 'non-taglink + spend>50K'})
            act_stats['WATCH_NONTAG'] += 1
            continue

        if spend < 100:
            act_stats['ZERO'] += 1
            continue

        act_stats['KEEP'] += 1

    # --- Final state ---
    active_f = len([c for c in camps if c.get('status') == 'ACTIVE'])
    off_f = len([c for c in camps if c['name'].startswith('OFF_')])
    already_w = len([c for c in camps if c['name'].startswith('🌟')])

    # --- Log ---
    from pathlib import Path
    log_dir = Path('/home/openclaw/projects/1ai-ads/data/patrols')
    log_dir.mkdir(parents=True, exist_ok=True)
    lf = log_dir / f'patrol_1041_{datetime.date.today().isoformat()}.json'
    lf.write_text(json.dumps({
        'timestamp': ts, 'account': '1041', 'total': len(camps),
        'active': active_f, 'off': off_f,
        'kills': len(kills), 'watches': len(watch_pause),
        'winners_new': len(winners_new),
        'spend_7d': spend_total,
        'kill_list': [{'name': k['name'], 'cpc': k['cpc'], 'spend': k['spend'], 'tag': k['tag']} for k in kills],
        'watch_list': [{'name': w['name'], 'reason': w.get('reason', '')} for w in watch_pause[:20]],
        'winner_list': [{'name': w['name'], 'spend': w['spend'], 'cpc': w['cpc'], 'tag': w['tag']} for w in winners if not w['name'].startswith('🌟')]
    }, indent=2, ensure_ascii=False))
    print(f"[LOG] Saved to {lf}")

    # --- REPORT ---
    print()
    print("=" * 60)
    print(f"SATPAM 1041 — {ts}")
    print(f"ACTIVE: {active_f} | OFF_: {off_f} | 🌟: {already_w + len(winners_new)}")
    print()

    if kills:
        print(f"💀 KILL ({len(kills)}):")
        for k in kills:
            print(f"  {k['name'][:65]}")
            print(f"     CPC Rp{k['cpc']:.0f} | Spend Rp{k['spend']:,.0f} | {k['reason']}")
        print()

    if watch_pause:
        print(f"👀 WATCH ({len(watch_pause)}):")
        for w in watch_pause[:12]:
            print(f"  {w['name'][:65]}")
            print(f"     {w['reason']}")
        if len(watch_pause) > 12:
            print(f"  ... +{len(watch_pause) - 12} more")
        print()

    new_winners_clean = [w for w in winners if not w['name'].startswith('🌟')]
    if new_winners_clean:
        print(f"🌟 NEW WINNERS ({len(new_winners_clean)}):")
        for w in new_winners_clean:
            print(f"  {w['name'][:65]}")
            print(f"     CPC Rp{w['cpc']:.0f} | Spend Rp{w['spend']:,.0f} | Clicks {w['clicks']} | CTR {w['ctr']:.1f}% | Tag: {w['tag']}")
        print()

    print(f"💰 7d spend: Rp{spend_total:,.0f}")
    print(f"📋 Stats: {act_stats}")

if __name__ == '__main__':
    main()
