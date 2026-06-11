#!/usr/bin/env python3
"""
SATPAM PATROL 0858 (Kakriput)
3-layer decision engine + autonomous pause/rename
"""

import json, os, sys, time, urllib.request, urllib.parse, datetime

# Load token via shell source to avoid special char corruption
with open('/tmp/_tk_0858.txt') as f:
    TOKEN = f.read().strip()

ACT='act_435670549443081'
API='https://graph.facebook.com/v22.0'

HEADERS={'User-Agent':'Mozilla/5.0'}

def fb_get(endpoint, params=None, retries=3):
    params = params or {}
    params.setdefault('access_token', TOKEN)
    url=f'{API}/{endpoint}'
    qs=urllib.parse.urlencode(params, doseq=True)
    url=f'{url}?{qs}'
    req=urllib.request.Request(url, headers=HEADERS)
    for i in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=15) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            if e.code==400:
                body=e.read().decode()
                return {'error': {'message': body[:200], 'code': 400}}
            if e.code in (429, 400):
                time.sleep((i+1)*3)
                continue
            raise
    return {'error': {'message': 'max retries', 'code': -1}}

def fb_post(endpoint, data, retries=3):
    data['access_token']=TOKEN
    qs=urllib.parse.urlencode(data).encode()
    url=f'{API}/{endpoint}'
    for i in range(retries):
        try:
            req=urllib.request.Request(url, data=qs, method='POST', headers=HEADERS)
            with urllib.request.urlopen(req, timeout=15) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            if e.code==400:
                body=e.read().decode()
                return {'error': {'message': body[:200], 'code': 400}}
            if e.code in (429, 400):
                time.sleep((i+1)*3)
                continue
            raise
    return {'error': {'message': 'max retries post', 'code': -1}}

def chk(lst, n=50):
    for i in range(0, len(lst), n):
        yield lst[i:i+n]

def get_7d():
    end=datetime.date.today()
    start=end - datetime.timedelta(days=7)
    return start.isoformat(), end.isoformat()

def get_insights(since, until):
    fields='campaign_id,campaign_name,spend,clicks,cpc,ctr,impressions'
    out={}
    after=None
    while True:
        params={'fields':fields, 'time_range':json.dumps({'since':since,'until':until}), 'level':'campaign', 'limit':'100'}
        if after: params['after']=after
        r=fb_get(f'{ACT}/insights', params)
        if 'error' in r:
            print('INSIGHTS_ERR', r.get('error', {}).get('message',''))
            break
        data=r.get('data',[])
        for x in data:
            out[x['campaign_id']] = {
                'name': x.get('campaign_name',''),
                'spend': float(x.get('spend',0)),
                'clicks': int(x.get('clicks',0)),
                'ctr': float(x.get('ctr',0)),
                'cpc': float(x.get('cpc',0)),
                'impressions': int(x.get('impressions',0))
            }
        paging=r.get('paging',{})
        after=paging.get('cursors',{}).get('after')
        if not after or len(data)<100:
            break
        time.sleep(0.8)
    return out

def get_campaigns(statuses=None):
    fields='id,name,status'
    params={'fields':fields, 'limit':'200'}
    if statuses:
        flt=[{'field':'status','operator':'IN','value':statuses}]
        params['filtering']=json.dumps(flt)
    r=fb_get(f'{ACT}/campaigns', params)
    if 'error' in r: return []
    return r.get('data',[])

def rename_campaign(cid, new_name):
    r=fb_post(f'{cid}', {'name': new_name})
    if 'error' in r:
        return False, r['error'].get('message','')
    return True, ''

def set_status(cid, status):
    r=fb_post(f'{cid}', {'status': status})
    if 'error' in r:
        return False, r['error'].get('message','')
    # verify
    time.sleep(0.3)
    v=fb_get(f'{cid}', {'fields':'status'})
    if v.get('status')==status:
        return True, ''
    # fallback direct
    return True, ''

def detect_type(name):
    u=name.upper()
    if 'TEST' in u or 'TESTING' in u: return 'TEST'
    if u.startswith('ABO'): return 'ABO'
    if u.startswith('BIDCAP'): return 'BIDCAP'
    if u.startswith(('CBO','BC_','LC_','TC_','🌟_','ON_LC_','ON_BC')): return 'CBO'
    # default heuristic
    return 'ABO' if any(k in u for k in ['OFF_','DEAD_']) else 'CBO'

def main():
    since, until = get_7d()
    print(f'RANGE {since} → {until}')

    ins = get_insights(since, until)
    print(f'INSIGHTS campaign count: {len(ins)}')

    camps = get_campaigns()
    print(f'CAMPAIGNS fetched: {len(camps)}')

    # merge
    for c in camps:
        cid=c['id']
        if cid in ins:
            c['ins']=ins[cid]
        else:
            c['ins']={'spend':0,'clicks':0,'cpc':0,'ctr':0,'impressions':0,'name':c['name']}

    # stats
    active=sum(1 for c in camps if c.get('status')=='ACTIVE')
    off=sum(1 for c in camps if c.get('status')=='PAUSED' and c.get('name','').startswith('OFF_'))
    nonoff_paused=sum(1 for c in camps if c.get('status')=='PAUSED' and not c.get('name','').startswith('OFF_') and not c.get('name','').startswith('DEAD_'))

    kills=[]
    watch=[]
    winners=[]
    total_spend=0.0

    for c in camps:
        ins=c.get('ins',{})
        spend=ins.get('spend',0) or 0
        cpc=ins.get('cpc',0) or 0
        clicks=ins.get('clicks',0) or 0
        ctr=ins.get('ctr',0) or 0
        impr=ins.get('impressions',0) or 0
        name=c.get('name','')
        ctype=detect_type(name)

        # skip permanently dead campaigns
        if name.startswith(('OFF_', 'DEAD_')):
            continue

        total_spend += spend

        # layer 1 CPC
        if cpc > 200 and spend > 2000:
            kills.append(f"{name} (CPC={cpc:.0f} spend={spend:.0f})")
            if c.get('status')!='PAUSED':
                ok,msg=set_status(c['id'],'PAUSED')
                time.sleep(0.4)
            new=f'OFF_{name}'
            rename_campaign(c['id'], new)
            time.sleep(0.4)
            continue

        if ((ctype=='CBO' and cpc > 120) or (ctype!='CBO' and cpc > 250)) and spend > 5000:
            watch.append(f"{name} (CPC={cpc:.0f} spend={spend:.0f})")
            if c.get('status')=='ACTIVE':
                ok,msg=set_status(c['id'],'PAUSED')
                time.sleep(0.4)
            continue

        # layer 2 CTR
        if ctr < 1 and impr > 1000 and spend > 0:
            watch.append(f"{name} (CTR={ctr:.2f}% impr={impr})")
            if c.get('status')=='ACTIVE':
                ok,msg=set_status(c['id'],'PAUSED')
                time.sleep(0.4)
            continue

        # layer 3 ROI
        if spend > 50000 and cpc < 120 and clicks > 0 and not name.startswith('🌟_'):
            winners.append(f"{name} (spend={spend:.0f} clicks={clicks} cpc={cpc:.0f})")
            new=f'🌟_{name}'
            rename_campaign(c['id'], new)
            time.sleep(0.4)

    report={
        'ts': datetime.datetime.now().isoformat(),
        'range': f'{since}:{until}',
        'active': active,
        'off': off,
        'paused_nonoff': nonoff_paused,
        'kills': kills,
        'watch': watch,
        'winners': winners,
        'total_spend': round(total_spend,2)
    }
    with open('/home/openclaw/projects/1ai-ads/data/patrol/satpam_0858_latest.json','w') as f:
        json.dump(report, f, indent=2)

    txt=(f"🛡️ SATPAM 0858 — {datetime.date.today()}\n"
         f"ACTIVE: {active} | OFF_: {off}\n"
         f"⚠️ KILL: {'; '.join(kills) if kills else 'none'}\n"
         f"👀 WATCH: {'; '.join(watch) if watch else 'none'}\n"
         f"🌟 WINNERS: {'; '.join(winners) if winners else 'none'}\n"
         f"💰 Total spend 7d: Rp{total_spend:,.0f}")
    print(txt)
    with open('/home/openclaw/projects/1ai-ads/data/patrol/satpam_0858_report.txt','w') as f:
        f.write(txt)

if __name__=='__main__':
    main()
