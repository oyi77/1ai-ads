#!/usr/bin/env python3
"""SATPAM PATROL 1041 Nyamiresep — 3-layer decision engine (CPC -> CTR -> ROI)"""
import json
import datetime
import time
from vilona_trakpro_engine import fb_get, fb_post

ACT = '380721031313330'
ACCOUNT_NAME = 'Nyamiresep (1041)'
CPC_KILL = 200
CPC_DANGER_CBO = 120
CPC_DANGER_ABO = 250
REQUIRED_TAGS = ['rakdapur3', 'atayasetelankaosanak']

def detect_type(name):
    n = name.upper()
    for p in ['CBO','BC_','LC_','TC_','GLW','ON_LC','ON_BC','🌟']:
        if p in n:
            return 'CBO'
    if n.startswith('ABO') or 'BIDCAP' in n or 'TEST' in n:
        return 'ABO'
    return 'ABO'

def extract_tag(name):
    n = name.lower().replace(' ','_').replace('-','_')
    for t in REQUIRED_TAGS:
        if t in n:
            return t
    return None

ts = datetime.datetime.now().strftime('%Y-%m-%d %H:%M WIB')
print(f'SATPAM PATROL 1041 — {ts}')
print(f'Account: {ACCOUNT_NAME} | act_{ACT}')

# Fetch ALL campaigns
camps = []
params = {'fields':'id,name,status,effective_status,spend,cpc','limit':200}
while True:
    r = fb_get(f'{ACT}/campaigns', **params)
    if isinstance(r, dict):
        data = r.get('data',[])
    else:
        data = []
    camps.extend(data)
    nxt = ''
    if isinstance(r, dict):
        nxt = r.get('paging',{}).get('next','')
    if not nxt or not data:
        break
    params = {}
    time.sleep(0.7)

active_n = len([c for c in camps if c.get('status')=='ACTIVE'])
paused_n = len([c for c in camps if c.get('status')=='PAUSED'])
off_n = len([c for c in camps if c['name'].startswith('OFF_')])
print(f'Total campaigns: {len(camps)} | ACTIVE: {active_n} | PAUSED: {paused_n} | OFF_: {off_n}')

# Fetch 7-day insights
all_ids = [c['id'] for c in camps]
insights = {}
for i in range(0, len(all_ids), 20):
    batch = all_ids[i:i+20]
    since = (datetime.date.today() - datetime.timedelta(days=7)).isoformat()
    until = datetime.date.today().isoformat()
    r = fb_get('insights',
        fields='campaign_id,campaign_name,spend,cpc,clicks,ctr,impressions',
        time_range=json.dumps({'since':since,'until':until}),
        filtering=json.dumps([{'field':'campaign.id','operator':'IN','value':batch}]),
        level='campaign',
        limit=50)
    if isinstance(r, dict):
        for row in r.get('data',[]):
            if row.get('campaign_id'):
                insights[row['campaign_id']] = row
    time.sleep(1.5)
print(f'Insights received: {len(insights)}')

# 3-layer classify + execute
kills=[]
watches=[]
winners=[]
spend_total=0
act_results={'skip':0,'paused':0,'paused_off':0,'winner_tagged':0,'errors':0}

for camp in camps:
    cid = camp['id']
    name = camp['name']
    status = camp.get('status','')
    ins = insights.get(cid,{})
    spend = float(ins.get('spend') or 0)
    cpc = float(ins.get('cpc') or 0)
    clicks = int(float(ins.get('clicks') or 0))
    ctr = float(ins.get('ctr') or 0)
    impr = int(float(ins.get('impressions') or 0))
    ttype = detect_type(name)
    tag = extract_tag(name)
    spend_total += spend

    # Skip protected
    if name.startswith('OFF_') or name.startswith('DEAD_'):
        act_results['skip'] += 1
        continue

    # L1 CPC hard kill (before any ROI check)
    if cpc > CPC_KILL and spend > 2000:
        kills.append({'name':name,'cpc':cpc,'spend':spend,'tag':tag,'ttype':ttype})
        if status == 'ACTIVE':
            r = fb_post(cid, status='PAUSED')
            if 'error' not in r:
                time.sleep(2)
            nn = 'OFF_'+name if not name.startswith('OFF_') else name
            fb_post(cid, name=nn)
            time.sleep(0.7)
            act_results['paused_off'] += 1
        else:
            if not name.startswith('OFF_'):
                fb_post(cid, name='OFF_'+name)
                time.sleep(0.7)
            act_results['paused_off'] += 1
        continue

    # L1 CPC danger
    cpc_d = CPC_DANGER_CBO if ttype=='CBO' else CPC_DANGER_ABO
    if cpc > cpc_d and spend > 5000:
        watches.append({'name':name,'cpc':cpc,'spend':spend,'reason':f'CPC {cpc:.0f}>{cpc_d} (type={ttype}) + spend {spend:.0f}>5K'})
        if status == 'ACTIVE':
            fb_post(cid, status='PAUSED')
            act_results['paused'] += 1
        continue

    # L2 CTR
    if ctr < 1.0 and impr > 1000:
        watches.append({'name':name,'cpc':cpc,'spend':spend,'reason':f'CTR {ctr:.1f}%<1% + impressions {impr}'})
        if status == 'ACTIVE':
            fb_post(cid, status='PAUSED')
            act_results['paused'] += 1
        continue

    # L3 Winner
    if spend > 50000 and cpc <= cpc_d and clicks > 0 and ctr >= 1.0:
        winners.append({'name':name,'cpc':cpc,'spend':spend,'clicks':clicks,'ctr':ctr,'tag':tag})
        if not name.startswith('🌟'):
            r2 = fb_post(cid, name='🌟_'+name)
            time.sleep(0.7)
            act_results['winner_tagged'] += 1
        continue

    # Non-taglink high spend
    if not tag and spend > 50000:
        watches.append({'name':name,'reason':'non-taglink campaign + spend>50K'})
        continue

    act_results['skip'] += 1

# Final state
active_final = len([c for c in camps if c.get('status')=='ACTIVE'])
off_final = len([c for c in camps if c['name'].startswith('OFF_')])
already_w = len([c for c in camps if c['name'].startswith('🌟')])
new_winners = [w for w in winners if not w['name'].startswith('🌟')]

# Save patrol log
from pathlib import Path
log_dir = Path('/home/openclaw/projects/1ai-ads/data/patrols')
log_dir.mkdir(parents=True, exist_ok=True)
log_file = log_dir / f'patrol_1041_{datetime.date.today().isoformat()}.json'
log = {
    'timestamp': ts,
    'account': '1041',
    'total': len(camps),
    'active': active_final,
    'off': off_final,
    'kills': len(kills),
    'watches': len(watches),
    'winners_new': len(new_winners),
    'spend_7d': spend_total,
    'results': act_results,
    'kill_list': [{'name':k['name'],'cpc':k['cpc'],'spend':k['spend'],'tag':k['tag'],'ttype':k['ttype']} for k in kills],
    'watch_list': [{'name':w['name'],'reason':w.get('reason','')} for w in watches[:20]],
    'winner_list': [{'name':w['name'],'spend':w['spend'],'cpc':w['cpc'],'clicks':w['clicks'],'ctr':w['ctr'],'tag':w['tag']} for w in new_winners]
}
log_file.write_text(json.dumps(log, indent=2, ensure_ascii=False))

# REPORT
print()
print('='*60)
print(f'SATPAM 1041 — {ts}')
print(f'ACTIVE: {active_final} | OFF_: {off_final} | 🌟: {already_w + len(new_winners)}')
print()
if kills:
    print(f'💀 KILL ({len(kills)}):')
    for k in kills:
        print(f'  {k["name"][:60]}')
        print(f'     CPC Rp{k["cpc"]:.0f} | Spend Rp{k["spend"]:.0f} | Type: {k["ttype"]} | Tag: {k["tag"]}')
print()
if watches:
    print(f'👀 WATCH ({len(watches)}):')
    for w in watches[:12]:
        print(f'  {w["name"][:60]}')
        print(f'     {w["reason"]}')
    if len(watches)>12:
        print(f'  ... +{len(watches)-12} more')
print()
if new_winners:
    print(f'🌟 WINNERS ({len(new_winners)}):')
    for w in new_winners:
        print(f'  {w["name"][:60]}')
        print(f'     CPC Rp{w["cpc"]:.0f} | Spend Rp{w["spend"]:.0f} | Clicks {w["clicks"]} | CTR {w["ctr"]:.1f}% | Tag: {w["tag"]}')
print()
print(f'💰 Total 7d spend: Rp{spend_total:,.0f}')
print(f'📋 Actions: {act_results}')
print(f'📁 Log: {log_file}')
