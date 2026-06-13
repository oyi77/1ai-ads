#!/usr/bin/env python3
"""SATPAM 1041 cron run - simplified"""
import json, os, time, urllib.request, urllib.parse, urllib.error, datetime
from pathlib import Path

# Load token safely from .env
env_path = Path('/home/openclaw/projects/1ai-ads/.env')
token = None
for line in env_path.read_text().splitlines():
    if line.startswith('META_ACCESS_TOKEN='):
        token = line.split('=', 1)[1].strip()
        break
if not token:
    raise SystemExit('META_ACCESS_TOKEN missing')

ACT_ID = '380721031313330'
API = 'https://graph.facebook.com/v22.0'
time.sleep(0.5)

def fb_get(endpoint, params=None, retries=3):
    url = f"{API}/{endpoint}"
    if params:
        url = f"{url}?{urllib.parse.urlencode(params)}"
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={'Authorization': f'Bearer {token}'})
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
    body_dict['access_token'] = token
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

def money_val(x):
    try:
        return float(x)
    except Exception:
        return 0.0

def main():
    print("[1] Fetching campaigns...")
    resp = fb_get(f"act_{ACT_ID}/campaigns", {
        'fields': 'id,name,status,effective_status,daily_budget,lifetime_budget',
        'limit': 200,
    })
    camps = resp.get('data', [])
    print(f"    Found {len(camps)} total campaigns")

    campaign_ids = [c['id'] for c in camps]
    insights = {}
    print("[2] Fetching 7-day insights...")
    for i in range(0, len(campaign_ids), 20):
        batch = campaign_ids[i:i+20]
        time.sleep(1.5)
        resp = fb_get(f'act_{ACT_ID}/insights', {
            'fields': 'campaign_id,campaign_name,spend,cpc,clicks,ctr,impressions',
            'time_range': json.dumps({
                'since': (datetime.date.today() - datetime.timedelta(days=7)).isoformat(),
                'until': datetime.date.today().isoformat()
            }),
            'filtering': json.dumps([{'field': 'campaign.id', 'operator': 'IN', 'value': batch}]),
            'level': 'campaign',
            'limit': 50,
        })
        if 'data' in resp:
            for row in resp['data']:
                cid = row.get('campaign_id', '')
                if cid:
                    insights[cid] = row
        elif resp.get('error'):
            print(f"    Insights batch error: {resp['error'][:100]}")
    print(f"    Got insights for {len(insights)} campaigns")

    total_spend = 0.0
    total_clicks = 0
    active = 0
    for c in camps:
        if c.get('effective_status') == 'ACTIVE':
            active += 1
        ins = insights.get(c['id'], {})
        total_spend += money_val(ins.get('spend', 0))
        total_clicks += int(ins.get('clicks', 0) or 0)

    global_cpc = round(total_spend / total_clicks, 2) if total_clicks > 0 else 0.0
    print(f"\nGlobal CPC: Rp{global_cpc} (spend Rp{total_spend:.2f}, clicks {total_clicks})")

    monster = []
    watch = []
    winner = []
    lc_scale = []

    for c in camps:
        cid = c['id']
        name = c['name']
        ins = insights.get(cid, {})
        spend = money_val(ins.get('spend', 0))
        clicks = int(ins.get('clicks', 0) or 0)
        cpc = money_val(ins.get('cpc', 0))

        if name.startswith('OFF_') or name.startswith('DEAD_'):
            continue
        if c.get('effective_status') != 'ACTIVE':
            continue

        # MONSTER rules (override global gate)
        if cpc >= 1000 and spend > 1000:
            monster.append((cid, name, cpc, spend))
            continue
        if cpc >= 500 and spend > 2000:
            monster.append((cid, name, cpc, spend))
            continue

        # CPC watch
        if cpc > 200 and clicks == 0 and spend > 500:
            watch.append((cid, name, cpc, spend, 'pause'))
            continue
        if cpc > 200 and clicks > 0:
            watch.append((cid, name, cpc, spend, 'watch'))
            continue

        # Global gate
        if global_cpc < 120:
            if cpc < 120 and clicks > 5 and spend > 10000:
                winner.append((cid, name, cpc, spend))
            if 'LC' in name.upper() and cpc < 120 and clicks > 0:
                lc_scale.append((cid, name, cpc, spend))

    print("\n[3] Executing actions...")
    for cid, name, cpc, spend, action in watch:
        if action == 'pause':
            print(f"  Pausing {name} (CPC {cpc}, spend {spend})")
            res = fb_post(f"{cid}", {'status': 'PAUSED'})
            print(f"    -> {res}")

    for cid, name, cpc, spend in monster:
        new_name = f"OFF_{name}" if not name.startswith('OFF_') else name
        print(f"  Renaming MONSTER {name} -> {new_name}")
        res = fb_post(f"{cid}", {'name': new_name})
        print(f"    -> {res}")

    for cid, name, cpc, spend in winner:
        new_name = f"STAR_{name}" if not name.startswith('STAR_') else name
        print(f"  Renaming winner {name} -> {new_name}")
        res = fb_post(f"{cid}", {'name': new_name})
        print(f"    -> {res}")

    for cid, name, cpc, spend in lc_scale:
        budget_info = next((c for c in camps if c['id'] == cid), {})
        daily_budget = money_val(budget_info.get('daily_budget', 0))
        lifetime_budget = money_val(budget_info.get('lifetime_budget', 0))
        current = daily_budget or lifetime_budget
        if current and current >= 18000:
            new_budget = int(current * 1.2)
            new_budget = min(new_budget, 100000)
            print(f"  Scaling LC {name}: budget {current} -> {new_budget}")
            res = fb_post(f"{cid}", {'daily_budget': new_budget})
            print(f"    -> {res}")
        else:
            print(f"  Skipped LC scale for {name}: budget undefined or below threshold")

    ts = datetime.datetime.now().strftime('%Y-%m-%d %H:%M')
    monster_names = ', '.join([n for _, n, _, _ in monster]) or 'none'
    watch_pause = ', '.join([n for _, n, _, _, act in watch if act == 'pause']) or 'none'
    watch_names = ', '.join([n for _, n, _, _, act in watch if act == 'watch']) or 'none'
    winner_names = ', '.join([n for _, n, _, _ in winner]) or 'none'
    lc_names = ', '.join([n for _, n, _, _ in lc_scale]) or 'none'

    report = f"""SATPAM 1041 {ts}
ACTIVE:{active} | Global CPC:Rp{global_cpc}
MONSTER: {monster_names}
WATCH_PAUSE: {watch_pause}
WATCH_ONLY: {watch_names}
WINNER: {winner_names}
LC_SCALE: {lc_names}
"""
    print("\n" + report)

if __name__ == '__main__':
    main()
