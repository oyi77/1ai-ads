#!/usr/bin/env python3
"""SATPAM 0858 — Kakriput patrol (engine-backed)"""
import os, sys, json, time
from pathlib import Path
from datetime import datetime
from urllib.parse import quote
from urllib.error import HTTPError, URLError

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from vilona_trakpro_engine import fb_get, fb_post, ACCESS_TOKEN, API

ACT = 'act_435670549443081'

def chunks(lst, n=20):
    for i in range(0, len(lst), n):
        yield lst[i:i + n]

def safe_float(x, default=0.0):
    try:
        v = float(x)
        return v if v == v else default
    except Exception:
        return default

def main():
    now = datetime.now()
    end = now.date()
    start = end - __import__('datetime').timedelta(days=7)
    since, until = start.isoformat(), end.isoformat()
    ts = now.strftime('%Y-%m-%d %H:%M WIB')

    print(f"🛡️ SATPAM 0858 — {ts}")
    print(f"Range: {since} → {until}")

    acc = fb_get(ACT, fields='id,name', access_token=ACCESS_TOKEN)
    if isinstance(acc, dict) and acc.get('error'):
        raise SystemExit(f"Account fetch FAILED: {acc['error'].get('message') or acc}")
    print('Account:', acc.get('name'), acc.get('id'))
    account_name = acc.get('name', '0858')

    camps = fb_get(f'{ACT}/campaigns', fields='id,name,status,effective_status', limit=200,
                   access_token=ACCESS_TOKEN)
    if isinstance(camps, dict) and camps.get('error'):
        raise SystemExit(f"Campaign fetch FAILED: {camps['error'].get('message') or camps}")
    all_camps = camps.get('data', [])
    print(f'Campaigns fetched: {len(all_camps)}')

    if not all_camps:
        print('⚠️ EMPTY ACCOUNT INVENTORY')
        return

    # Insights
    insight_map = {}
    for batch in chunks(all_camps, 20):
        ids = [c['id'] for c in batch]
        raw = fb_get(f"{ACT}/insights",
                     fields='campaign_id,campaign_name,spend,clicks,cpc,ctr,impressions',
                     time_range=json.dumps({'since': since, 'until': until}),
                     filtering=json.dumps([{'field': 'campaign.id', 'operator': 'IN', 'value': ids}]),
                     level='campaign',
                     limit=200,
                     access_token=ACCESS_TOKEN)
        if isinstance(raw, dict) and raw.get('data'):
            for row in raw['data']:
                insight_map[row['campaign_id']] = row
        time.sleep(1.5)

    # Rules
    rules_raw = fb_get(f"{ACT}/adrules_library", fields='id,name', limit=50,
                       access_token=ACCESS_TOKEN)
    if isinstance(rules_raw, dict) and rules_raw.get('data'):
        rule_list = rules_raw['data']
    else:
        rule_list = []
    print(f'Ad rules: {len(rule_list)}')

    rows = []
    total_spend = 0.0
    total_clicks = 0.0
    active_count = off_count = lc_count = 0
    for c in all_camps:
        ins = insight_map.get(c['id'], {})
        name = c.get('name', '')
        spend = safe_float(ins.get('spend', 0))
        clicks = safe_float(ins.get('clicks', 0))
        cpc = safe_float(ins.get('cpc', 0))
        ctr = safe_float(ins.get('ctr', 0))
        impr = safe_float(ins.get('impressions', 0))
        effective = c.get('effective_status', c.get('status'))
        rows.append({
            'id': c['id'], 'name': name, 'status': c.get('status'),
            'effective_status': effective,
            'spend': spend, 'clicks': clicks, 'cpc': cpc, 'ctr': ctr, 'impressions': impr,
        })
        total_spend += spend
        total_clicks += clicks
        if effective == 'ACTIVE':
            active_count += 1
        if name.startswith('OFF_') or name.startswith('OFF '):
            off_count += 1
        if 'ON_LC_' in name.upper() or '_LC_' in name.upper():
            lc_count += 1

    global_cpc = (total_spend / total_clicks) if total_clicks > 0 else 0.0
    print(f"ACTIVE:{active_count} | OFF_:{off_count} | ON_LC_:{lc_count}")
    print(f"Total spend 7d: Rp{total_spend:,.0f}".replace(',', '.'))
    print(f"Global CPC: Rp{global_cpc:,.0f}".replace(',', '.'))
    mode = 'AMAN' if global_cpc < 120 else 'NORMAL'
    print(f"MODE: {mode}")

    monsters, watches, winners, auto_ons = [], [], [], []
    for r in rows:
        spend = r['spend']
        cpc = r['cpc']
        clicks = r['clicks']
        ctr = r['ctr']
        impr = r['impressions']
        name = r['name']
        status = r['effective_status']
        if spend > 1000 and cpc >= 500:
            monsters.append(r)
            continue
        if spend > 500 and cpc > 200 and int(clicks) == 0:
            watches.append(r)
            continue
        if mode != 'AMAN':
            if (status == 'PAUSED' and not name.startswith('OFF_') and not name.startswith('DEAD_')
                    and cpc < 120 and clicks > 3 and spend > 2000):
                auto_ons.append(r)
            if status == 'ACTIVE' and not name.startswith('OFF_') and spend > 2000 and cpc > 200 and clicks > 0:
                watches.append(r)
                continue
        # winners (report)
        if status == 'ACTIVE' and not name.startswith('OFF_'):
            if cpc < 120 and clicks > 5 and spend > 10000:
                winners.append(r)
            elif cpc < 120 and lc_count < 1 and 'LC' in name and 0 < spend < 20000:
                winners.append(r)

    if monsters:
        print(f"\n💀 MONSTER ({len(monsters)}):")
        for x in monsters:
            print(f"  {x['name']} | CPC Rp{x['cpc']:.0f} | Spend Rp{x['spend']:,.0f} | Clk {int(x['clicks'])}")
    if watches:
        print(f"\n👀 WATCH ({len(watches)}):")
        for x in watches:
            print(f"  {x['name']} | CPC Rp{x['cpc']:.0f} | CTR {x['ctr']:.1f}% | Spend Rp{x['spend']:,.0f}")
    if winners:
        print(f"\n🌟 WINNER ({len(winners)}):")
        for x in winners:
            print(f"  {x['name']} | CPC Rp{x['cpc']:.0f} | Spend Rp{x['spend']:,.0f} | Clk {int(x['clicks'])}")
    if auto_ons:
        print(f"\n🔓 AUTO-ON ({len(auto_ons)}):")
        for x in auto_ons:
            print(f"  {x['name']} | CPC Rp{x['cpc']:.0f} | Clk {int(x['clicks'])} | Spend Rp{x['spend']:,.0f}")

    # Execute
    if monsters:
        print('\n--- EXECUTING MONSTER KILLS ---')
        for r in monsters:
            if not (r['name'].startswith('OFF_') or r['name'].startswith('OFF ')):
                res = fb_post(r['id'], status='PAUSED', access_token=ACCESS_TOKEN)
                ok = not (isinstance(res, dict) and res.get('error'))
                print(f"KILL {'✅' if ok else '❌'} {r['name']} → {(res if not ok else {'success': True})}")
                if ok:
                    time.sleep(1.5)
                    rn = fb_post(r['id'], name=f"OFF_{r['name']}", access_token=ACCESS_TOKEN)
                    print(f"  OFF rename {'✅' if not (isinstance(rn, dict) and rn.get('error')) else '❌'}")

    if mode != 'AMAN':
        if auto_ons:
            print('\n--- AUTO-ON ---')
            for r in auto_ons:
                res = fb_post(r['id'], status='ACTIVE', access_token=ACCESS_TOKEN)
                ok = not (isinstance(res, dict) and res.get('error'))
                print(f"UNPAUSE {'✅' if ok else '❌'} {r['name']}")
        if watches:
            print('\n--- PAUSE WATCH ---')
            for r in watches:
                if not (r['name'].startswith('OFF_') or r['name'].startswith('OFF ')):
                    time.sleep(1.5)
                    res = fb_post(r['id'], status='PAUSED', access_token=ACCESS_TOKEN)
                    ok = not (isinstance(res, dict) and res.get('error'))
                    print(f"PAUSE {'✅' if ok else '❌'} {r['name']}")
        if winners:
            print('\n--- RENAME WINNERS ---')
            for r in winners:
                new_name = f"🌟_{r['name']}"
                if not (r['name'].startswith('🌟_') or r['name'].startswith('🌟 ')):
                    time.sleep(1.5)
                    res = fb_post(r['id'], name=new_name, access_token=ACCESS_TOKEN)
                    ok = not (isinstance(res, dict) and res.get('error'))
                    print(f"RENAME {'✅' if ok else '❌'} {r['name']} → {new_name}")
    else:
        print('\nAMAN mode: no kills/renames; reporting only.')

    print('\n--- RULE CHECK ---')
    for rn in rule_list:
        name = rn.get('name', '')
        if 'CPC' in name.upper() or '130' in name:
            print(f'  conflict: {name}')

    with open('/tmp/patrol_0858_latest.json', 'w') as f:
        json.dump({
            'timestamp': ts,
            'mode': mode,
            'account': account_name,
            'global_cpc': global_cpc,
            'active': active_count,
            'off': off_count,
            'lc': lc_count,
            'monsters': len(monsters),
            'watches': len(watches),
            'winners': len(winners),
            'auto_ons': len(auto_ons),
            'total_spend': total_spend,
        }, f, indent=2)
    print('\nSaved state to /tmp/patrol_0858_latest.json')


if __name__ == '__main__':
    main()
