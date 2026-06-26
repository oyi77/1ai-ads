#!/usr/bin/env python3
import sys, json, time
from pathlib import Path

# Engine-backed patrol. Script location: <engine_dir>/scripts/satpam_0858.py
# Resolve engine dir relative to this file so no home path is hardcoded here.
ENGINE_DIR = Path('/home/openclaw/1ai-ads/scripts')
sys.path.insert(0, str(ENGINE_DIR))
from vilona_trakpro_engine import fb_get, fb_post, ACCESS_TOKEN, API, WORKSPACE

ACT_ID = '435670549443081'
SINCE = '2026-06-06'
UNTIL = '2026-06-13'


def parse_num(v):
    try:
        return float(v)
    except Exception:
        return 0.0


def main():
    camps = []
    nxt = f'act_{ACT_ID}/campaigns'
    while nxt:
        data = fb_get(nxt, fields='id,name,status,effective_status', limit=500)
        camps.extend(data.get('data', []))
        nxt = data.get('paging', {}).get('next')

    time_range = {'since': SINCE, 'until': UNTIL}
    ins = {}
    nxt = f'act_{ACT_ID}/insights'
    while nxt:
        data = fb_get(nxt, fields='campaign_id,campaign_name,spend,cpc,clicks,ctr,impressions', params={'time_range': time_range, 'level': 'campaign', 'limit': 500})
        for row in data.get('data', []):
            cid = row.get('campaign_id')
            if cid:
                ins[cid] = row
        nxt = data.get('paging', {}).get('next')

    total_spend = 0.0
    total_clicks = 0.0
    for cid, row in ins.items():
        s = parse_num(row.get('spend', 0))
        cl = parse_num(row.get('clicks', 0))
        if s or cl:
            total_spend += s
            total_clicks += cl
    global_cpc = total_spend / total_clicks if total_clicks > 0 else 0.0
    aman = global_cpc < 120

    active_count = sum(1 for c in camps if c.get('status') == 'ACTIVE')
    off_count = sum(1 for c in camps if c.get('name', '').startswith('OFF_'))
    star_count = sum(1 for c in camps if c.get('name', '').startswith('🌟_'))

    monsters, watch, winners, lc_scale = [], [], [], []
    for c in camps:
        name = c.get('name', '')
        if name.startswith('OFF_') or c.get('status') != 'ACTIVE':
            continue
        cid = c.get('id')
        if cid not in ins:
            continue
        row = ins[cid]
        spend = parse_num(row.get('spend', 0))
        clicks = parse_num(row.get('clicks', 0))
        cpc = parse_num(row.get('cpc', 0)) if row.get('cpc') is not None else (spend / clicks if clicks > 0 else 0)

        if cpc >= 500 and spend > 1000:
            monsters.append((cid, name, cpc, spend))
            continue
        if cpc > 200 and clicks == 0 and spend > 500:
            watch.append((cid, name, cpc, spend))
            continue
        if cpc < 120 and clicks > 5 and spend > 10000:
            winners.append((cid, name, cpc, spend, clicks))
        if 'LC' in name.upper() and cpc < 120:
            lc_scale.append((cid, name, cpc, spend))

    rename_batch, pause_batch, budget_batch = [], [], []
    for cid, name, cpc, spend in monsters:
        rename_batch.append((cid, 'OFF_' + name))
        pause_batch.append(cid)
    for cid, name, cpc, spend in watch:
        pause_batch.append(cid)
    for cid, name, cpc, spend, clicks in winners:
        if not name.startswith('🌟_'):
            rename_batch.append((cid, '🌟_' + name))
    for cid, name, cpc, spend in lc_scale:
        if not aman:
            try:
                camp = fb_get(cid, fields='daily_budget,lifetime_budget')
                camp_data = camp if isinstance(camp, dict) else {}
                old_budget = parse_num(camp_data.get('daily_budget') or camp_data.get('lifetime_budget') or 20000)
                new_budget = int(old_budget * 1.2)
                if new_budget > 500000:
                    new_budget = 500000
                budget_batch.append((cid, old_budget, new_budget))
            except Exception:
                pass

    if not aman:
        for cid, new_name in rename_batch:
            try:
                fb_post(cid, name=new_name)
                time.sleep(0.5)
            except Exception:
                pass
        for cid in pause_batch:
            try:
                fb_post(cid, status='PAUSED')
                time.sleep(0.5)
            except Exception:
                pass
        for cid, old_b, new_b in budget_batch:
            try:
                fb_post(cid, daily_budget=new_b)
                time.sleep(0.5)
            except Exception:
                pass

    mon_list = ', '.join([f'{n} (Rp{cpc:.0f})' for _, n, cpc, _ in monsters]) or 'none'
    watch_list = ', '.join([f'{n} (Rp{cpc:.0f})' for _, n, cpc, _ in watch]) or 'none'
    winner_names = [n for _, n, _, _, _ in winners]
    lc_names = [n for _, n, _, _ in lc_scale]
    mode = 'AMAN' if aman else 'NORMAL'
    report = (
        '🛡️ SATPAM 0858\n'
        f'ACTIVE:{active_count} | OFF_:{off_count} | 🌟:{star_count} | Global CPC:Rp{global_cpc:,.0f} | Mode:{mode}\n'
        f'💀 MONSTER: {len(monsters)} — {mon_list}\n'
        f'👀 WATCH: {len(watch)} — {watch_list}\n'
        f'🌟 WINNER: {len(winners)} — {", ".join(winner_names) or "none"}\n'
        f'💰 LC SCALE: {len(lc_scale)} — {", ".join(lc_names) or "none"}\n'
    )
    print(report)
    (WORKSPACE / 'data' / 'patrol_satpam_0858_latest.txt').write_text(report)


if __name__ == '__main__':
    main()
