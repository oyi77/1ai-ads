#!/usr/bin/env python3
"""SATPAM 0858 — Kakriput patrol (3-layer decision engine)"""
import os, json, time, re
from datetime import datetime, timedelta
from urllib.request import Request, urlopen
from urllib.parse import urlencode
from urllib.error import HTTPError, URLError

API = 'https://graph.facebook.com/v22.0'
ACT = 'act_435670549443081'

TOKEN = open('/tmp/_tk_0858.txt').read().strip()

class Meta:
    @staticmethod
    def get(path, params):
        url = f"{API}/{path}?{urlencode(params)}"
        req = Request(url, headers={'User-Agent':'patrol-0858'})
        try:
            with urlopen(req, timeout=25) as r:
                return json.loads(r.read())
        except HTTPError as e:
            body = e.read().decode()
            return {'_http_error': e.code, '_body': body}
        except Exception as e:
            return {'_error': str(e)}

    @staticmethod
    def post(path, data):
        data['access_token'] = TOKEN
        qs = urlencode(data).encode()
        req = Request(f"{API}/{path}", data=qs, method='POST')
        try:
            with urlopen(req, timeout=25) as r:
                return json.loads(r.read())
        except HTTPError as e:
            body = e.read().decode()
            return {'_http_error': e.code, '_body': body}

def chunks(lst, n):
    for i in range(0, len(lst), n):
        yield lst[i:i+n]

def main():
    now = datetime.now()
    end = now.date()
    start = end - timedelta(days=7)
    since, until = start.isoformat(), end.isoformat()
    ts = now.strftime('%Y-%m-%d %H:%M WIB')

    print(f"🛡️ SATPAM 0858 — {ts}")
    print(f"Range: {since} → {until}")

    # Account
    acc = Meta.get(ACT, {'fields':'id,name'})
    if '_error' in acc or '_http_error' in acc:
        print('Account fetch FAILED:', acc.get('_error') or acc.get('_body',''))
        return
    print('Account:', acc.get('name'), acc.get('id'))

    # Fetch campaigns
    camps = Meta.get(f'{ACT}/campaigns', {'fields':'id,name,status,effective_status,daily_budget', 'limit': 200})
    if '_error' in camps or '_http_error' in camps:
        print('Campaign fetch FAILED:', camps.get('_error') or camps.get('_body',''))
        return
    all_camps = camps.get('data', [])
    print(f'Campaigns fetched: {len(all_camps)}')

    # Fetch insights batch
    insight_map = {}
    for batch in chunks(all_camps, 20):
        ids = [c['id'] for c in batch]
        ins = Meta.get(f'{ACT}/insights', {
            'fields': 'campaign_id,campaign_name,spend,clicks,cpc,ctr,impressions',
            'time_range': json.dumps({'since': since, 'until': until}),
            'filtering': json.dumps([{'field':'campaign.id','operator':'IN','value':ids}]),
            'level': 'campaign',
            'limit': 200
        })
        time.sleep(1.5)
        for row in ins.get('data', []):
            insight_map[row['campaign_id']] = row

    # Automated rules
    rules = Meta.get(f'{ACT}/adrules_library', {'fields':'id,name,execution_spec', 'limit': 50})
    time.sleep(1.5)
    rule_list = rules.get('data', [])
    print(f'Ad rules: {len(rule_list)}')

    # Merge
    rows = []
    for c in all_camps:
        row = {
            'id': c['id'],
            'name': c['name'],
            'status': c['status'],
            'effective_status': c.get('effective_status', c['status']),
            'daily_budget': c.get('daily_budget'),
            **{k: 0 for k in ['spend','clicks','cpc','ctr','impressions']}
        }
        ins = insight_map.get(c['id'], {})
        for k in ['spend','clicks','cpc','ctr','impressions']:
            try:
                row[k] = float(ins.get(k, 0))
            except Exception:
                row[k] = 0
        row['is_cbo'] = any(p in c['name'].upper() for p in ['CBO','BC_','LC_','TC_','🌟_','ON_LC_','ON_BC'])
        rows.append(row)

    # --- 3-Layer Decision Engine ---
    kills, watches, stars = [], [], []
    total_spend = 0.0
    active_count, off_count = 0, 0

    for r in rows:
        total_spend += r['spend']
        if r['effective_status'] == 'ACTIVE':
            active_count += 1
        if r['name'].startswith('OFF_'):
            off_count += 1

        cpc = r['cpc']
        spend = r['spend']
        ctr = r['ctr']
        impr = r['impressions']
        clicks = r['clicks']
        cpc_danger = 120 if r['is_cbo'] else 250

        # Layer 1 CPC
        if cpc > 200 and spend > 2000:
            verdict = 'KILL'
        elif (cpc > cpc_danger and spend > 5000) or (cpc < 1 and spend > 10000 and clicks == 0):
            verdict = 'WATCH'
        # Layer 2 CTR
        elif ctr < 1 and impr > 1000:
            verdict = 'WATCH'
        # Layer 3 ROAS-like proxy via CPC+spend
        elif r['is_cbo'] and cpc < 120 and spend > 50000 and clicks > 0:
            verdict = 'STAR'
        elif spend > 10000 and cpc < 120:
            verdict = 'STAR'
        else:
            verdict = 'HOLD'

        if verdict == 'KILL':
            kills.append(r)
        elif verdict == 'WATCH':
            watches.append(r)
        elif verdict == 'STAR':
            stars.append(r)

    print(f"\nACTIVE: {active_count} | OFF_: {off_count}")
    print(f"Total spend 7d: Rp{total_spend:,.0f}".replace(',', '.'))
    print(f"\n⚠️ KILL ({len(kills)}):")
    for r in kills:
        print(f"  {r['name']} | CPC Rp{r['cpc']:.0f} | Spend Rp{r['spend']:,.0f} | Clk {r['clicks']}")
    print(f"\n👀 WATCH ({len(watches)}):")
    for r in watches:
        print(f"  {r['name']} | CPC Rp{r['cpc']:.0f} | CTR {r['ctr']:.1f}% | Spend Rp{r['spend']:,.0f}")
    print(f"\n🌟 WINNERS ({len(stars)}):")
    for r in stars:
        print(f"  {r['name']} | CPC Rp{r['cpc']:.0f} | Spend Rp{r['spend']:,.0f} | Clk {r['clicks']}")

    # Automated rule check: conflicting CPC>130 pause
    conflicting = [rn['name'] for rn in rule_list if 'CPC' in rn.get('name','').upper() or ('130' in rn.get('name',''))]
    if conflicting:
        print(f"\n⚠️ CONFLICTING RULES: {len(conflicting)}")
        for rn in conflicting:
            print(f"  {rn}")

    # Execute PAUSE on kills
    print('\n--- EXECUTING PAUSES ---')
    for r in kills:
        if not r['name'].startswith('OFF_'):
            res = Meta.post(r['id'], {'status': 'PAUSED'})
            succ = '_http_error' not in res and res.get('success')
            print(f"{'✅' if succ else '❌'} Pause {r['name']} → {res.get('success', res.get('_body', '?'))}")

    # Auto-rename WINNERS → 🌟_
    print('\n--- EXECUTING STAR RENAMES ---')
    for r in stars:
        new_name = f"🌟_{r['name']}"
        if not r['name'].startswith('🌟_'):
            res = Meta.post(r['id'], {'name': new_name})
            succ = '_http_error' not in res and res.get('id') and res.get('success') is not False
            print(f"{'✅' if succ else '❌'} Rename {r['name']} → {new_name}")

    # Re-fetch counts
    final = Meta.get(f'{ACT}/campaigns', {'fields':'status', 'limit': 1})
    print('\n--- FINAL COUNTS CHECK requires follow-up scan ---')

    # Save state
    with open('/tmp/patrol_0858_0858.json','w') as f:
        json.dump({
            'timestamp': ts,
            'active': active_count,
            'off': off_count,
            'kills': len(kills),
            'watches': len(watches),
            'stars': len(stars),
            'total_spend': total_spend
        }, f, indent=2)

if __name__ == '__main__':
    main()
