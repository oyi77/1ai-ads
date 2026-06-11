#!/usr/bin/env python3
"""SATPAM 0858 Patrol — Kakriput (act_435670549443081)"""
import json, os, time, urllib.request, urllib.parse, urllib.error
from datetime import datetime, timedelta

ACT = 'act_435670549443081'
API = 'https://graph.facebook.com/v22.0'

# Load token via runtime file read (never embed in source)
with open('/tmp/tk_0858.txt') as f:
    TOKEN = f.read().strip()

def fb_get(endpoint, params=None):
    url = f'{API}/{endpoint}'
    if params:
        qs = urllib.parse.urlencode(params)
        url = f'{url}?{qs}'
    url = f'{url}&access_token={TOKEN}'
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=30) as r:
        time.sleep(1.5)
        return json.loads(r.read())

def fb_post(endpoint, data):
    data['access_token'] = TOKEN
    qs = urllib.parse.urlencode(data).encode()
    req = urllib.request.Request(f'{API}/{endpoint}', data=qs, method='POST')
    with urllib.request.urlopen(req, timeout=30) as r:
        time.sleep(1.5)
        return json.loads(r.read())

# 7-day range
since = (datetime.now() - timedelta(days=7)).strftime('%Y-%m-%d')
until = datetime.now().strftime('%Y-%m-%d')

print(f'🛡️ SATPAM 0858 — {datetime.now().strftime("%Y-%m-%d %H:%M")}')
print(f'Range: {since} to {until}')
print()

# 1. Fetch campaigns
camps = fb_get(f'{ACT}/campaigns', {'fields':'id,name,status', 'limit':'200'})
all_camps = camps.get('data', [])
print(f'Total campaigns: {len(all_camps)}')

# 2. Fetch insights
insights = fb_get(f'{ACT}/insights', {
    'fields': 'campaign_id,campaign_name,spend,clicks,cpc,ctr,impressions',
    'time_range': json.dumps({'since': since, 'until': until}),
    'level': 'campaign',
    'limit': '200'
})
ins_data = {i['campaign_id']: i for i in insights.get('data', [])}
print(f'Insights records: {len(ins_data)}')

# 3. Check automated rules
rules = fb_get(f'{ACT}/adrules_library', {'fields':'id,name,execution_spec,evaluation_spec', 'limit':'50'})
rule_list = rules.get('data', [])

conflict_rules = []
for r in rule_list:
    rname = r.get('name', '')
    if any(k in rname.upper() for k in ['CPC', 'KILL', 'PAUSE', 'STOP', 'OFF']):
        conflict_rules.append(f'{r["id"]} — {rname}')

if conflict_rules:
    print(f'⚠️ Conflict rules found ({len(conflict_rules)}):')
    for cr in conflict_rules:
        print(f'   {cr}')
else:
    print('No conflicting automated rules detected.')

# 4. Analyze campaigns
active_count = 0
off_count = 0
kill_list = []
watch_list = []
winner_list = []
total_spend = 0.0

for c in all_camps:
    cid = c['id']
    name = c['name']
    status = c['status']

    if name.startswith('OFF_'):
        off_count += 1
        continue

    ins = ins_data.get(cid, {})
    spend = float(ins.get('spend', 0))
    clicks = int(ins.get('clicks', 0))
    cpc = float(ins.get('cpc', 0))
    ctr = float(ins.get('ctr', 0))
    impr = int(ins.get('impressions', 0))

    total_spend += spend

    if status == 'ACTIVE':
        active_count += 1

    # Layer 1 CPC
    is_cbo = any(p in name.upper() for p in ['CBO','BC_','LC_','TC_','🌟_','ON_LC_','ON_BC'])
    cpc_danger = 120 if is_cbo else 250
    cpc_kill = 200

    flagged = False

    if cpc > cpc_kill and spend > 2000:
        kill_list.append(f'{name} [CPC={cpc:.0f}, Rp{spend:,.0f}]')
        flagged = True
        # Auto-pause (hard kill)
        print(f'💀 KILL: {name} — pausing...')
        try:
            fb_post(cid, {'status': 'PAUSED'})
            # Rename to OFF_
            fb_post(cid, {'name': f'OFF_{name}'})
            print(f'   ✅ Paused + renamed OFF_')
        except Exception as e:
            print(f'   ❌ Error: {e}')
    
    elif cpc > cpc_danger and spend > 5000:
        watch_list.append(f'{name} [CPC={cpc:.0f}, Rp{spend:,.0f}]')
        flagged = True
        # Pause temporarily (watch, not OFF)
        if status == 'ACTIVE':
            print(f'👀 WATCH (CPC): {name} — pausing for review...')
            try:
                fb_post(cid, {'status': 'PAUSED'})
                print(f'   ✅ Paused')
            except Exception as e:
                print(f'   ❌ Error: {e}')

    # Layer 2 CTR (only if not already killed/watched by CPC)
    if not flagged and ctr < 1.0 and impr > 1000 and status == 'ACTIVE':
        watch_list.append(f'{name} [CTR={ctr:.2f}%, impr={impr}]')
        print(f'👀 WATCH (CTR): {name} — pausing...')
        try:
            fb_post(cid, {'status': 'PAUSED'})
            print(f'   ✅ Paused')
        except Exception as e:
            print(f'   ❌ Error: {e}')

    # Layer 3 ROI / Winners
    if cpc <= 120 and spend > 50000 and clicks > 0:
        if name.startswith('🌟_'):
            winner_list.append(f'{name} [CPC={cpc:.0f}, Rp{spend:,.0f}, clicks={clicks}]')
        elif status == 'ACTIVE' and not name.startswith('🌟_'):
            # Potential winner — rename to 🌟_
            print(f'🌟 WINNER: {name} — renaming...')
            try:
                fb_post(cid, {'name': f'🌟_{name}'})
                winner_list.append(f'🌟_{name} [CPC={cpc:.0f}, Rp{spend:,.0f}, clicks={clicks}]')
                print(f'   ✅ Renamed to 🌟_')
            except Exception as e:
                print(f'   ❌ Error: {e}')

# Recalculate active count after pauses
final_camps = fb_get(f'{ACT}/campaigns', {'fields':'id,name,status', 'limit':'200'})
final_active = sum(1 for c in final_camps.get('data', []) if c['status'] == 'ACTIVE' and not c['name'].startswith('OFF_'))
final_off = sum(1 for c in final_camps.get('data', []) if c['name'].startswith('OFF_'))

# Save report data
report = {
    'timestamp': datetime.now().isoformat(),
    'active': final_active,
    'off': final_off,
    'kill': kill_list,
    'watch': watch_list,
    'winners': winner_list,
    'total_spend': total_spend,
    'rules': conflict_rules
}
with open('/tmp/satpam_0858_report.json', 'w') as f:
    json.dump(report, f, indent=2)

print()
print('='*60)
print(f'🛡️ SATPAM 0858 — {datetime.now().strftime("%Y-%m-%d %H:%M")}')
print(f'ACTIVE: {final_active} | OFF_: {final_off}')
print(f'💰 Total spend 7d: Rp{total_spend:,.0f}')
print()
if kill_list:
    print(f'💀 KILL ({len(kill_list)}):')
    for k in kill_list:
        print(f'   {k}')
else:
    print('💀 KILL: None')

if watch_list:
    print(f'👀 WATCH ({len(watch_list)}):')
    for w in watch_list:
        print(f'   {w}')
else:
    print('👀 WATCH: None')

if winner_list:
    print(f'🌟 WINNERS ({len(winner_list)}):')
    for w in winner_list:
        print(f'   {w}')
else:
    print('🌟 WINNERS: None')

if conflict_rules:
    print(f'⚠️ CONFLICT RULES ({len(conflict_rules)}):')
    for cr in conflict_rules:
        print(f'   {cr}')
else:
    print('⚠️ CONFLICT RULES: None')

print('='*60)
print('Report saved: /tmp/satpam_0858_report.json')
