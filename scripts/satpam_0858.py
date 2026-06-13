#!/usr/bin/env python3
import sys, os, json, time, urllib.request, urllib.parse, urllib.error
from datetime import datetime, timezone

ACT_ID = '435670549443081'
ACT = f'act_{ACT_ID}'
API = 'https://graph.facebook.com/v22.0'
ENV_PATH = '/home/openclaw/projects/1ai-ads/.env'

def load_token():
    with open(ENV_PATH) as f:
        for line in f:
            if not line or line.startswith('#'):
                continue
            if line.split('=', 1)[0] == 'META_ACCESS_TOKEN':
                return line.split('=', 1)[1].strip()
    raise RuntimeError('token missing')

TOKEN = load_token()

def fb_get(endpoint, fields=None, **kwargs):
    url = f"{API}/{endpoint}"
    params = {'access_token': TOKEN}
    if fields:
        params['fields'] = fields
    params.update(kwargs)
    qs = urllib.parse.urlencode(params)
    req = urllib.request.Request(f"{url}?{qs}")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8', errors='replace')
        return {'error': str(e), 'body': body}

def fb_post(endpoint, data=None):
    url = f"{API}/{endpoint}"
    payload = {'access_token': TOKEN}
    if data:
        payload.update(data)
    qs = urllib.parse.urlencode(payload).encode()
    req = urllib.request.Request(f"{url}", data=qs, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8', errors='replace')
        return {'error': str(e), 'body': body}

def rename_campaign(cid, new_name):
    return fb_post(f"{cid}", {'name': new_name})

def pause_campaign(cid):
    return fb_post(f"{cid}", {'status': 'PAUSED'})

def activate_campaign(cid):
    return fb_post(f"{cid}", {'status': 'ACTIVE'})

def delete_campaign(cid):
    return fb_post(f"{cid}", method_override='DELETE')

# 1. Fetch campaigns
print("Fetching campaigns...", flush=True)
camp_res = fb_get(f"{ACT}/campaigns", fields='id,name,status,effective_status', limit='200')
time.sleep(0.5)
if 'error' in camp_res:
    print(json.dumps({'error': 'campaigns fetch failed', 'detail': camp_res}))
    sys.exit(1)

camps = camp_res.get('data', [])
print(f"Total campaigns fetched: {len(camps)}", flush=True)

# Paging if needed
while camp_res.get('paging', {}).get('next'):
    next_url = camp_res['paging']['next']
    # rebuild with token to avoid stale token
    parsed = urllib.parse.urlparse(next_url)
    qs = urllib.parse.parse_qs(parsed.query)
    if 'access_token' not in qs:
        qs['access_token'] = [TOKEN]
    new_qs = urllib.parse.urlencode(qs, doseq=True)
    next_url = urllib.parse.urlunparse(parsed._replace(query=new_qs))
    try:
        with urllib.request.urlopen(next_url, timeout=30) as resp:
            camp_res = json.loads(resp.read())
        camps.extend(camp_res.get('data', []))
        time.sleep(0.5)
    except Exception as e:
        print(f"Paging error: {e}", flush=True)
        break

# Separate
active_camps = [c for c in camps if c.get('status') == 'ACTIVE' and not c.get('name', '').startswith('OFF_') and not c.get('name', '').startswith('DEAD_')]
paused_camps = [c for c in camps if c.get('status') == 'PAUSED' and not c.get('name', '').startswith('OFF_') and not c.get('name', '').startswith('DEAD_')]
off_camps = [c for c in camps if c.get('name', '').startswith('OFF_')]
star_camps = [c for c in camps if c.get('name', '').startswith('🌟_')]
lc_camps = [c for c in camps if 'LC' in c.get('name', '').upper() and not c.get('name', '').startswith('OFF_') and c.get('status') == 'ACTIVE']

# 2. Fetch insights for active and paused (batch 50)
def fetch_insights_batch(cid_list):
    results = {}
    for i in range(0, len(cid_list), 50):
        batch = cid_list[i:i+50]
        ids_str = json.dumps(batch)
        filter_str = json.dumps([{'field':'campaign.id','operator':'IN','value':batch}])
        res = fb_get(f"{ACT}/insights",
            fields='campaign_id,campaign_name,spend,cpc,clicks,impressions,ctr',
            time_range='{"since":"7daysago","until":"today"}',
            level='campaign',
            filtering=filter_str,
            limit='200')
        time.sleep(0.5)
        if 'data' in res:
            for row in res['data']:
                results[row['campaign_id']] = row
    return results

active_ids = [c['id'] for c in active_camps]
paused_ids = [c['id'] for c in paused_camps]

print("Fetching active insights...", flush=True)
active_ins = fetch_insights_batch(active_ids)
print("Fetching paused insights...", flush=True)
paused_ins = fetch_insights_batch(paused_ids)

# Merge
all_ins = {}
all_ins.update(active_ins)
all_ins.update(paused_ins)

# 3. Calculate global CPC from active campaigns only
total_spend = 0
total_clicks = 0
for cid in active_ids:
    row = all_ins.get(cid, {})
    spend = float(row.get('spend', 0) or 0)
    clicks = int(row.get('clicks', 0) or 0)
    total_spend += spend
    total_clicks += clicks

global_cpc = total_spend / total_clicks if total_clicks > 0 else 0
global_mode = 'AMAN' if global_cpc < 120 else 'WASPADA'
print(f"Global CPC: {global_cpc:.1f} ({global_mode})", flush=True)

# Lists for report
monsters = []
watch_list = []
on_list = []
winner_list = []
lc_scale_list = []
actions_taken = []

# Helper to get insight
def get_ins(camp):
    return all_ins.get(camp['id'], {})

# 4. MONSTER (always)
for camp in active_camps + paused_camps:
    ins = get_ins(camp)
    cpc = float(ins.get('cpc', 0) or 0)
    spend = float(ins.get('spend', 0) or 0)
    if cpc >= 500 and spend > 1000:
        monsters.append(f"{camp['name']} (CPC={cpc:.0f}, spend={spend:.0f})")
        # Rename OFF_ + pause
        r1 = rename_campaign(camp['id'], f"OFF_{camp['name']}")
        time.sleep(0.3)
        r2 = pause_campaign(camp['id'])
        time.sleep(0.3)
        actions_taken.append(f"💀 OFF_+PAUSE {camp['name']}")
        # Verify
        v = fb_get(f"{camp['id']}", fields='name,status')
        time.sleep(0.3)
        vname = v.get('name', '')
        vstatus = v.get('status', '')
        if not vname.startswith('OFF_') or vstatus != 'PAUSED':
            actions_taken.append(f"   ⚠️ VERIFY FAIL: name={vname}, status={vstatus}")
        else:
            actions_taken.append(f"   ✅ Verified OFF_/PAUSED")
    elif cpc > 200 and ins.get('clicks', 0) == 0 and spend > 500:
        watch_list.append(f"{camp['name']} (CPC={cpc:.0f}, spend={spend:.0f}, 0 clicks)")
        # Pause only
        r = pause_campaign(camp['id'])
        time.sleep(0.3)
        actions_taken.append(f"👀 PAUSE {camp['name']} (CPC={cpc:.0f}, 0 clicks)")
        v = fb_get(f"{camp['id']}", fields='name,status')
        time.sleep(0.3)
        if v.get('status') != 'PAUSED':
            actions_taken.append(f"   ⚠️ VERIFY FAIL: status={v.get('status')}")

# 5. AUTO REACTIVATE (always)
for camp in paused_camps:
    if camp['name'].startswith('OFF_'):
        continue
    ins = get_ins(camp)
    cpc = float(ins.get('cpc', 0) or 0)
    clicks = int(ins.get('clicks', 0) or 0)
    if cpc < 120 and clicks > 0:
        r = activate_campaign(camp['id'])
        time.sleep(0.3)
        actions_taken.append(f"✅ ON: {camp['name']} (CPC={cpc:.0f}, clicks={clicks})")
        # Verify
        v = fb_get(f"{camp['id']}", fields='status')
        time.sleep(0.3)
        if v.get('status') != 'ACTIVE':
            actions_taken.append(f"   ⚠️ VERIFY FAIL: status={v.get('status')}")

# 6. WINNER TAGGING (AMAN only)
if global_mode == 'AMAN':
    for camp in active_camps:
        if camp['name'].startswith('🌟_'):
            continue
        ins = get_ins(camp)
        cpc = float(ins.get('cpc', 0) or 0)
        clicks = int(ins.get('clicks', 0) or 0)
        spend = float(ins.get('spend', 0) or 0)
        if cpc < 120 and clicks > 5 and spend > 10000:
            r = rename_campaign(camp['id'], f"🌟_{camp['name']}")
            time.sleep(0.3)
            actions_taken.append(f"🌟 WINNER: {camp['name']}")
            v = fb_get(f"{camp['id']}", fields='name')
            time.sleep(0.3)
            if not v.get('name', '').startswith('🌟_'):
                actions_taken.append(f"   ⚠️ VERIFY FAIL: name={v.get('name')}")

# 7. LC SCALE REPORT
for camp in lc_camps:
    ins = get_ins(camp)
    cpc = float(ins.get('cpc', 0) or 0)
    spend = float(ins.get('spend', 0) or 0)
    if cpc < 120:
        lc_scale_list.append(f"{camp['name']} (CPC={cpc:.0f}, spend={spend:.0f})")
    elif cpc < 200:
        lc_scale_list.append(f"👀 TAHAN: {camp['name']} (CPC={cpc:.0f})")

# 8. CLEANUP - delete ARCHIVED/DELETED if any
for camp in camps:
    est = camp.get('effective_status', '').upper()
    if est in ('ARCHIVED', 'DELETED'):
        r = delete_campaign(camp['id'])
        time.sleep(0.3)
        actions_taken.append(f"🗑️ CLEANUP {camp['name']} ({est})")

# Build report
now_wib = datetime.now(timezone.utc).astimezone().strftime('%Y-%m-%d %H:%M WIB')
lines = []
lines.append(f"🛡️ SATPAM 0858 — {now_wib}")
lines.append(f"ACTIVE:{len(active_camps)} | OFF_:{len(off_camps)} | 🌟:{len(star_camps)} | Global CPC:Rp{global_cpc:.0f} | MODE:{global_mode}")
lines.append(f"Total campaigns: {len(camps)} (active={len(active_camps)}, paused={len(paused_camps)}, off={len(off_camps)})")
if monsters:
    lines.append(f"💀 MONSTER ({len(monsters)}):")
    for m in monsters:
        lines.append(f"   - {m}")
else:
    lines.append("💀 MONSTER: 0")
if watch_list:
    lines.append(f"👀 WATCH ({len(watch_list)}):")
    for w in watch_list:
        lines.append(f"   - {w}")
else:
    lines.append("👀 WATCH: 0")
if on_list:
    lines.append(f"✅ ON: {len(on_list)} reactivated")
else:
    lines.append("✅ ON: 0")
if winner_list:
    lines.append(f"🌟 WINNER: {len(winner_list)} tagged")
else:
    lines.append("🌟 WINNER: 0")
if lc_scale_list:
    lines.append(f"💰 LC SCALE (top {min(5, len(lc_scale_list))}):")
    for lc in lc_scale_list[:5]:
        lines.append(f"   - {lc}")
else:
    lines.append("💰 LC SCALE: 0")
if actions_taken:
    lines.append("📋 ACTIONS:")
    for a in actions_taken[:20]:
        lines.append(f"   {a}")
else:
    lines.append("📋 ACTIONS: 0")

report = '\n'.join(lines)
print(report, flush=True)

# Save report
with open('/home/openclaw/projects/1ai-ads/data/satpam_0858_report.json', 'w') as f:
    json.dump({
        'timestamp': now_wib,
        'global_cpc': global_cpc,
        'mode': global_mode,
        'active': len(active_camps),
        'paused': len(paused_camps),
        'off': len(off_camps),
        'star': len(star_cams),
        'monsters': monsters,
        'watch': watch_list,
        'on': on_list,
        'winners': winner_list,
        'lc_scale': lc_scale_list,
        'actions': actions_taken,
        'report': report
    }, f, indent=2)
