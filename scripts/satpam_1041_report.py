import requests, json, datetime
from pathlib import Path

def read_token():
    env = Path('/home/openclaw/projects/1ai-ads/.env').read_text(encoding='utf-8', errors='ignore')
    for line in env.splitlines():
        if line.startswith('META_ACCESS_TOKEN=***          return line.split('=', 1)[1]
    raise RuntimeError('META_ACCESS_TOKEN missing')

token = read_token()
act = 'act_380721031313330'
base = 'https://graph.facebook.com/v22.0'
headers = {'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0'}

camp_resp = requests.get(f'{base}/{act}/campaigns', params={'fields':'id,name,status','limit':200,'access_token':token}, headers=headers)
camp_resp.raise_for_status()
campaigns = {c['id']: c for c in camp_resp.json().get('data', [])}

ins_resp = requests.get(f'{base}/{act}/insights', params={
    'fields': 'campaign_id,campaign_name,spend,clicks,cpc,ctr',
    'time_range': json.dumps({'since': '2026-06-06', 'until': '2026-06-13'}),
    'level': 'campaign',
    'access_token': token,
}, headers=headers)
ins_resp.raise_for_status()
insights = {r['campaign_id']: r for r in ins_resp.json().get('data', [])}

spend = sum(float(r.get('spend', '0') or '0') for r in insights.values())
clicks = sum(int(float(r.get('clicks', '0') or '0')) for r in insights.values())
global_cpc = spend / clicks if clicks else 0.0

def fmt(x):
    try:
        return round(float(x), 2)
    except Exception:
        return x

rows = []
status_counts = {'MONSTER': 0, 'PAUSE_NO_OFF': 0, 'WATCH': 0, 'WINNER': 0, 'ACTIVE': 0}
for cid, i in insights.items():
    c = campaigns.get(cid, {})
    name = i.get('campaign_name') or c.get('name', '')
    status = c.get('status', '')
    cpc = float(i.get('cpc', '0') or '0')
    cspend = float(i.get('spend', '0') or '0')
    cclicks = int(float(i.get('clicks', '0') or '0'))
    if ((cpc >= 1000 and cspend > 1000) or (cpc >= 500 and cspend > 2000)):
        bucket = 'MONSTER'
    elif cpc > 200:
        bucket = 'PAUSE_NO_OFF' if cclicks == 0 and cspend > 500 else 'WATCH'
    else:
        bucket = 'WINNER' if (global_cpc < 120 and cclicks > 5 and cspend > 10000) else 'ACTIVE'
    status_counts[bucket] = status_counts.get(bucket, 0) + 1
    rows.append({'id': cid, 'name': name, 'status': status, 'bucket': bucket, 'cpc': cpc,
                 'spend': cspend, 'clicks': cclicks})

payload = {
    'generated_at': datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=7))).isoformat(),
    'act': act,
    'global_cpc': round(global_cpc, 2),
    'global_cpc_condition': 'PASSIVE_no_kill' if global_cpc >= 120 else 'ACTIVE',
    'campaigns': rows,
    'counts': {**status_counts, 'total': len(rows)},
}
Path('/home/openclaw/today_SATPAM_preview.json').write_text(
    json.dumps(payload, indent=2, ensure_ascii=False), encoding='utf-8'
)
print(json.dumps(payload, ensure_ascii=False))
