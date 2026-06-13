import requests, json, time, sys
from datetime import datetime, timezone, timedelta

with open('/home/openclaw/projects/1ai-ads/.env','r') as f:
    token_line = [l.strip() for l in f if l.startswith('META_ACCESS_TOKEN=')][0]
token = token_line.split('=',1)[1].strip()
act = '380721031313330'
api = 'https://graph.facebook.com/v22.0'
headers = {'Accept':'application/json'}

def json_or_err(r):
    try:
        body = r.json()
    except Exception:
        body = {'error':{'message':r.text}}
    return body

def req(url, params=None):
    p = dict(params or {})
    p['access_token'] = token
    time.sleep(0.5)
    r = requests.get(url, params=p, headers=headers, timeout=30)
    body = json_or_err(r)
    if 'error' in body:
        err = body['error']
        subcode = err.get('error_subcode')
        if subcode == 2446079:
            time.sleep(3)
            p['access_token'] = token
            r = requests.get(url, params=p, headers=headers, timeout=30)
            body = json_or_err(r)
            if 'error' in body:
                raise SystemExit(f"Rate limited again: {body['error']}")
            return body
        raise SystemExit(f"API error: {body['error']}")
    return body

camp_url = f"{api}/act_{act}/campaigns"
params = {'fields':'id,name,status','limit':200}
camp_body = req(camp_url, params)
campaigns = camp_body.get('data', [])
if not campaigns:
    camp_url = f"{api}/{act}/campaigns"
    camp_body = req(camp_url, params)
    campaigns = camp_body.get('data', [])

now = datetime.now(timezone.utc).date()
seven_ago = now - timedelta(days=6)
time_range = json.dumps({'since': str(seven_ago), 'until': str(now)})
ic_url = f"{api}/act_{act}/insights"
ic_params = {
    'fields':'campaign_id,campaign_name,spend,clicks,cpc,ctr',
    'time_range': time_range,
    'level':'campaign',
    'limit':200
}
insights = []
try:
    ins = req(ic_url, ic_params)
    insights = ins.get('data', [])
except Exception as e:
    print("Insights fetch failed; continuing without insights:", e, file=sys.stderr)

ins_map = {}
for row in insights:
    cid = str(row.get('campaign_id') or row.get('campaign_id'))
    spend = float(row.get('spend') or 0)
    clicks = int(row.get('clicks') or 0)
    cpc = row.get('cpc')
    if cpc is not None:
        cpc = float(cpc)
    else:
        cpc = (spend / clicks) if clicks else None
    ins_map[cid] = {'spend': spend, 'clicks': clicks, 'cpc': cpc, 'ctr': row.get('ctr')}

total_spend = sum(v['spend'] for v in ins_map.values())
total_clicks = sum(v['clicks'] for v in ins_map.values())
global_cpc = (total_spend / total_clicks) if total_clicks else 0.0

now_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
off_list = []
watch_list = []
winner_list = []
lc_list = []

for c in campaigns:
    cid = str(c['id'])
    status = c.get('status')
    name = c.get('name','')
    info = ins_map.get(cid, {'spend':0.0,'clicks':0,'cpc':None,'ctr':0.0})
    spend = info['spend']
    clicks = info['clicks']
    cpc = info['cpc'] if info['cpc'] is not None else ((spend / clicks) if clicks else 0.0)
    if cpc >= 1000 and spend > 500:
        off_list.append(f"{cid}|{name}")
        continue
    if cpc >= 500 and spend > 1000:
        off_list.append(f"{cid}|{name}")
        continue
    if global_cpc >= 120:
        if cpc > 200 and clicks == 0 and spend > 500:
            watch_list.append(f"{cid}|{name}")
            continue
        if cpc > 200 and clicks > 0:
            watch_list.append(f"{cid}|{name}")
            continue
    else:
        if cpc < 120 and clicks > 5 and spend > 10000:
            winner_list.append(f"{cid}|{name}")
    if 'LC' in name and cpc < 120 and clicks > 0:
        lc_list.append(f"{cid}|{name}")

off_join = '; '.join(off_list) if off_list else '-'
watch_join = '; '.join(watch_list) if watch_list else '-'
winner_join = '; '.join(winner_list) if winner_list else '-'
lc_join = '; '.join(lc_list) if lc_list else '-'

report = f"🛡️ SATPAM 1041 {now_str}\nACTIVE:{len(campaigns)} | Global CPC:Rp{global_cpc:.2f}\n💀 MONSTER: {off_join}\n👀 WATCH: {watch_join}\n🌟: {winner_join}\n💰 LC: {lc_join}"
print(report)

payload = {
    'access_token': token
}
results = []
for item in off_list:
    cid, name = item.split('|', 1)
    new_name = f"OFF_{name}"
    p = dict(payload)
    p['name'] = new_name
    time.sleep(0.5)
    rr = requests.post(f"{api}/{cid}", data=p, timeout=30)
    rn_body = rr.json()
    p2 = dict(payload)
    p2['status'] = 'PAUSED'
    time.sleep(0.5)
    rp = requests.post(f"{api}/{cid}", data=p2, timeout=30)
    rp_body = rp.json()
    ok = 'id' in rp_body or rp_body.get('success')
    results.append((cid, new_name, ok, rp_body.get('error') or rp_body))

conf = []
for cid, new_name, ok, err in results:
    conf.append(f"{cid}->OFF_+PAUSED={'OK' if ok else 'FAIL'}")
print("ACTIONS: " + "; ".join(conf) if conf else "ACTIONS: none")
