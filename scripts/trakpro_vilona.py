#!/usr/bin/env python3
"""TRAKPRO VILONA v2.0 — Meta Ads Decision Engine + Telegram Alerts"""
import sys, os, json, csv, re, argparse, time, requests
from datetime import datetime, timedelta
from pathlib import Path
from collections import defaultdict

SCRIPT_DIR = Path(__file__).parent.resolve()
PROJECT_DIR = SCRIPT_DIR.parent
DATA_DIR = PROJECT_DIR / 'data' / 'shopee'
ENV_FILE = PROJECT_DIR / '.env'

ENV = {}
if ENV_FILE.exists():
    with open(ENV_FILE) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                k, v = line.split('=', 1)
                ENV[k.strip()] = v.strip()

TOKEN = ENV.get('META_ACCESS_TOKEN', os.environ.get('META_ACCESS_TOKEN', ''))
TG_TOKEN = ENV.get('TELEGRAM_BOT_TOKEN', os.environ.get('TELEGRAM_BOT_TOKEN', ''))
TG_CHAT = ENV.get('TELEGRAM_CHAT_ID', os.environ.get('TELEGRAM_CHAT_ID', ''))

ACCOUNTS = {
    '1041': {'id': 'act_380721031313330', 'nm': 'Nyamiresep', 'csv': 'nyamiresep'},
    '0858': {'id': 'act_435670549443081', 'nm': 'Selow 0858', 'csv': 'selow0858'},
    '1208': {'id': 'act_1439536310038458', 'nm': 'Herbal', 'csv': 'herbal'},
    '1134': {'id': 'act_1773760133153789', 'nm': 'Selow 1134', 'csv': 'selow1134'},
    '1340': {'id': 'act_1181078009580337', 'nm': 'BajuAnak', 'csv': 'bajuanak'},
}

WIN_MIN_PROFIT = 5000; WIN_MIN_ROAS = 1.2
BONCOS_MAX_ROAS = 0.8; SCALE_MIN_ROAS = 1.3; SCALE_MIN_CTR = 3.0
PENDING_SPEND = 5000; PENDING_CLICK = 10
FATIGUE_CTR_DROP = 0.3; FATIGUE_CPC_RISE = 0.3; FATIGUE_SPEND_RISE = 0.2
EARLY_MAX_AGE = 3; EARLY_MIN_SPEND = 3000

TAGS = ['rakdapur','rakdapur3','atayasetelankaosanak','wallpaperdindingvinyl',
    'benihsayuran','dressanakperempuan','setanakfernando','stikerkeramik',
    'fashion','bajuanak','purwoceng','herbal','dapur','masak','perabotan',
    # Malaysia 1134 tags
    'longslave','studiolands','leggingwanitacotton','longsleeve','jerseymulimah',
    'atasan','celana','social media']

def api(p, params=None):
    u = f"https://graph.facebook.com/v19.0/{p}"
    pp = {"access_token": TOKEN, "limit": 500}
    if params: pp.update(params)
    try: return requests.get(u, params=pp, timeout=20).json()
    except: return {"error": "timeout"}

def load_shopee(csv_label, days=3):
    """Load Shopee orders — auto-detects ID format (Tag_link) vs MY format (Sub_id)."""
    today = datetime.now(); orders = []
    for i in range(days+1):  # +1 includes today (export date)
        dt = (today - timedelta(days=i)).strftime('%Y-%m-%d')
        for prefix in [f'{csv_label}_{dt}']:
            p = DATA_DIR / f'{prefix}.csv'
            if p.exists():
                try:
                    with open(p, 'r', encoding='utf-8-sig') as f:
                        reader = csv.DictReader(f)
                        headers = reader.fieldnames or []
                        # Detect format
                        is_my = any('Sub_id' in h for h in headers)
                        tag_key = 'Sub_id1' if is_my else 'Tag_link1'
                        comm_key = 'Komisen Bersih Affiliate(RM)' if is_my else 'Komisi Bersih Affiliate (Rp)'
                        oid_key = 'Id Pembelian' if is_my else 'ID Pemesanan'
                        tag_prefix = 'Sub_id' if is_my else 'Tag_link'
                        
                        for row in reader:
                            t = row.get(tag_key,'').strip()
                            oid = row.get(oid_key,'').strip()
                            if not t or not oid: continue
                            all_tags = []
                            for k in range(1,6):
                                tv = row.get(f'{tag_prefix}{k}','').strip().lower()
                                if tv: all_tags.append(tv)
                            orders.append({
                                'tag': t.lower(),
                                'all_tags': all_tags,
                                'comm': float(row.get(comm_key,'0').replace(',','') or 0),
                                'oid': oid,
                                'currency': 'RM' if is_my else 'Rp',
                            })
                except Exception as e:
                    pass
    return orders

def extract_tag(name):
    nl = name.lower()
    for t in TAGS:
        if t in nl: return t
    c = re.sub(r'^(bidcap|bc|tc|off_|lc_|scale_|nyamiresep_|test_|winner_?|selow_?|0858_?|1208_?|1134_?|1340_?)+','',nl,flags=re.I)
    return re.sub(r'\s*\d+$','',c).strip('_ -') or nl

def match_tag_to_shopeetags(camp_tag, all_shopee_tags, acc_key=None):
    """Fuzzy match: campaign tag -> Shopee tag (e.g. rakdapur -> rakdapur3)"""
    camp_tag_lower = camp_tag.lower()
    # Exact match first
    if camp_tag_lower in all_shopee_tags:
        return [camp_tag_lower]
    # Account-specific mappings (campaign naming vs Shopee sub_id)
    ACC_MAP = {
        '1134': {'longslave': ['studiolands', 'leggingwanitacotton', 'longsleeve', 'jerseymulimah']},
    }
    if acc_key and acc_key in ACC_MAP:
        for k, v in ACC_MAP[acc_key].items():
            if k in camp_tag_lower:
                matches = [t for t in v if t in all_shopee_tags]
                if matches:
                    return matches
    # Substring match: campaign tag is prefix of shopee tag
    matches = [t for t in all_shopee_tags if t.startswith(camp_tag_lower)]
    if matches:
        return matches
    # Reverse: shopee tag contains campaign tag
    matches = [t for t in all_shopee_tags if camp_tag_lower in t]
    if matches:
        return matches
    return [camp_tag_lower]

def detect_fatigue(daily):
    if len(daily) < 3: return 0, "No data", 0, 0
    dd = sorted(daily, key=lambda x: x.get('date_start',''))
    d3 = dd[-3:]
    ctrs = [float(d.get('ctr',0)) for d in d3 if float(d.get('ctr',0))>0]
    cpcs = [float(d.get('cpc',0)) for d in d3 if float(d.get('cpc',0))>0]
    spnd = [float(d.get('spend',0)) for d in d3]
    sc=0; w=[]; ct=0; cp=0
    if len(ctrs)>=2 and ctrs[0]>0:
        ct = (ctrs[0]-ctrs[-1])/ctrs[0]
        if ct > FATIGUE_CTR_DROP: sc+=1; w.append(f"CTR-{ct:.0%}")
    if len(cpcs)>=2 and cpcs[0]>0:
        cp = (cpcs[-1]-cpcs[0])/cpcs[0]
        if cp > FATIGUE_CPC_RISE: sc+=1; w.append(f"CPC+{cp:.0%}")
    if len(spnd)>=2 and spnd[-1]>spnd[0]*1.2 and len(ctrs)>=2 and ctrs[-1]<=ctrs[0]:
        sc+=0.5; w.append("SpendUp")
    return min(sc,2), (', '.join(w) if w else 'Healthy'), ct, cp

def scale_pct(roas):
    if roas>=3.0: return 50
    if roas>=2.5: return 40
    if roas>=2.0: return 30
    if roas>=1.5: return 20
    return 10

def classify(c):
    if c['spend'] < PENDING_SPEND and c['clicks'] < PENDING_CLICK:
        return 'PENDING', 'Butuh data'
    if c['profit'] >= WIN_MIN_PROFIT and c['roas'] >= WIN_MIN_ROAS:
        pct = scale_pct(c['roas'])
        return 'WINNER', f"GAS +{pct}%"
    if c['roas'] < BONCOS_MAX_ROAS and c['spend'] > PENDING_SPEND:
        if c.get('fatigue',0)>=2: return 'BONCOS', 'GANTI CREATIVE'
        return 'BONCOS', 'PAUSE'
    if c['roas'] >= 1.0 and c['profit'] > 0:
        return 'WATCH', 'Monitor'
    if c['profit'] < 0 and c['spend'] > PENDING_SPEND:
        return 'WATCH', 'Cek attribution'
    return 'PENDING', 'Butuh data'

def gen_sop(camps):
    sops = []
    order = sorted(camps, key=lambda x: (
        0 if 'BONCOS' in x['status'] else
        1 if x.get('fatigue',0)>=2 else
        2 if 'WINNER' in x['status'] else 5
    ))
    for c in order[:8]:
        steps = []
        if 'BONCOS' in c['status']:
            if c.get('fatigue',0)>=2:
                steps = [f"PAUSE {c['name'][:35]}",
                    "Upload 3-5 creative baru dalam 24 jam",
                    f"Test 48 jam budget Rp30K-50K",
                    f"Loss: Rp {abs(c['profit']):,.0f} — stop the bleeding"]
            else:
                steps = [f"PAUSE {c['name'][:35]}",
                    "Analisis targeting/creative/audience",
                    "Jangan hidupkan tanpa perubahan signifikan"]
        elif c.get('fatigue',0)>=2:
            steps = [f"TURUNKAN budget 50%: {c['name'][:35]}",
                "Upload creative baru dalam 24 jam",
                f"CTR {c.get('ctr_trend',0):.0%} / CPC {c.get('cpc_trend',0):.0%}"]
        elif c.get('fatigue',0)>=1:
            steps = [f"Siapkan 2-3 creative backup: {c['name'][:35]}",
                "Turunin budget 20% sebagai precaution",
                "Monitor 24 jam ke depan"]
        elif 'WINNER' in c['status']:
            pct = scale_pct(c['roas'])
            steps = [f"NAIKKAN budget +{pct}%: {c['name'][:35]}",
                f"Rp {c['spend']:,.0f} -> Rp {c['spend']*(1+pct/100):,.0f}",
                "Scale tiap 48 jam selama ROAS >1.5x",
                "Jangan scale lebih dari +50% per step"]
        else:
            steps = [f"Pantau ketat: {c['name'][:35]}",
                "Jangan scale dulu, tunggu data 48 jam",
                f"Butuh minimal {PENDING_CLICK} klik / Rp {PENDING_SPEND:,} spend"]
        sops.append({
            'campaign': c['name'], 
            'action': steps[0].split(':')[0].split(' ')[0] if ':' in steps[0] else steps[0].split(' ')[0],
            'steps': steps,
            'metrics': f"Rp {c['spend']:,.0f} | ROAS {c['roas']:.2f}x | CTR {c['ctr']:.1f}%"
        })
    return sops

def rekomendasi(results, acc_key, days=3):
    """TAGLINK → CAMPAIGN MATCHING — Rekomendasi Aksi Harian"""
    a = ACCOUNTS.get(acc_key)
    if not a or not results:
        return None
    
    orders = load_shopee(a['csv'], days)
    
    # Tag performance from Shopee
    tag_comm = defaultdict(float)  # tag -> total commission
    tag_orders = defaultdict(int)  # tag -> order count
    tag_all = defaultdict(float)   # tag -> commission from all tag_link columns
    all_shopee_tags = set()
    for o in orders:
        tag_comm[o['tag']] += o['comm']
        tag_orders[o['tag']] += 1
        for t in o['all_tags']:
            tag_all[t] += o['comm']
            all_shopee_tags.add(t)
    
    # Campaign performance by tag (from Meta + Shopee)
    camp_by_tag = defaultdict(list)
    tag_by_camp = {}
    for c in results:
        t = c['tag']
        camp_by_tag[t].append(c)
        tag_by_camp[c['name']] = t
    
    # Build recommendation per tag
    reco = []
    all_tags_in_results = set(camp_by_tag.keys())
    
    for tag in sorted(all_tags_in_results):
        camps = camp_by_tag[tag]
        total_spend = sum(c['spend'] for c in camps)
        # Fuzzy match: aggregate commission from all matching Shopee tags
        matched = match_tag_to_shopeetags(tag, all_shopee_tags, acc_key)
        total_comm = sum(tag_comm.get(mt, 0) for mt in matched)
        total_comm_all = sum(tag_all.get(mt, 0) for mt in matched)
        total_comm = max(total_comm, total_comm_all)  # use best attribution
        total_profit = total_comm - total_spend
        roas = total_comm / total_spend if total_spend > 0 else 0
        n_orders = sum(tag_orders.get(mt, 0) for mt in matched)
        
        # Determine recommendation
        if roas >= 2.0 and total_profit > 0:
            aksi = 'GAS'
            detail = f'ROAS {roas:.1f}x — scale semua campaign +{scale_pct(roas)}%'
            prio = 1
        elif roas >= 1.2 and total_profit > 0:
            aksi = 'STABIL'
            detail = f'ROAS {roas:.1f}x — pertahankan, monitor ketat'
            prio = 2
        elif roas >= 1.0:
            aksi = 'OPTIMIZE'
            detail = 'Break-even / marginal — cek CPC, optimasi targeting/creative'
            prio = 3
        elif total_spend > 10000 and roas < 0.5:
            aksi = 'PAUSE'
            detail = f'ROAS {roas:.1f}x — tag ga converting, re-evaluate atau ganti tag'
            prio = 4
        elif total_spend > 5000:
            aksi = 'OPTIMIZE'
            detail = 'Spend sudah jalan tapi belum ada order — cek attribution delay'
            prio = 3
        else:
            aksi = 'TUNGGU'
            detail = 'Data belum cukup — lanjutkan test'
            prio = 5
        
        # Check for creative fatigue in this tag group
        fatigued = [c for c in camps if c['fatigue'] >= 2]
        if fatigued and aksi == 'GAS':
            aksi = 'GAS+CREATIVE'
            detail = f'GAS tapi {len(fatigued)} creative fatigue — ganti creative dulu lalu scale'
        
        # Camp details
        camp_details = []
        for c in sorted(camps, key=lambda x: -x['spend']):
            camp_details.append({
                'name': c['name'],
                'spend': c['spend'],
                'profit': c['profit'],
                'roas': c['roas'],
                'cpc': c['cpc'],
                'ctr': c['ctr'],
                'fatigue': c['fatigue'],
                'fatigue_desc': c['fatigue_desc'],
                'status': c['status'],
                'rec': c['rec']
            })
        
        reco.append({
            'tag': tag,
            'n_camps': len(camps),
            'n_orders': n_orders,
            'total_spend': total_spend,
            'total_comm': total_comm,
            'total_comm_all': total_comm_all,
            'total_profit': total_profit,
            'roas': roas,
            'aksi': aksi,
            'detail': detail,
            'prio': prio,
            'camps': camp_details
        })
    
    # Detect orphan tags (Shopee orders with no active campaign)
    orphan_tags = []
    all_matched_shopee = set()
    for tag in all_tags_in_results:
        matched = match_tag_to_shopeetags(tag, all_shopee_tags, acc_key)
        all_matched_shopee.update(matched)
    for tag in tag_comm:
        if tag not in all_matched_shopee and tag_comm[tag] > 0:
            orphan_tags.append({
                'tag': tag,
                'comm': tag_comm[tag],
                'orders': tag_orders[tag]
            })
    orphan_tags.sort(key=lambda x: -x['comm'])
    
    # Detect wasted campaigns (spending on tags with ZERO Shopee orders)
    wasted = []
    for tag in all_tags_in_results:
        if tag_comm.get(tag, 0) == 0:
            for c in camp_by_tag[tag]:
                if c['spend'] > 5000:
                    wasted.append(c)
    wasted.sort(key=lambda x: -x['spend'])
    
    return {
        'reco': sorted(reco, key=lambda x: x['prio']),
        'orphan_tags': orphan_tags,
        'wasted': wasted[:10]
    }

def fmt_rekomendasi(r, reko):
    """Format rekomendasi output for CLI"""
    W = 70
    out = [
        f"{'='*W}",
        f"REKOMENDASI AKSI HARIAN — {r['label']}",
        f"{r['date']} | Taglink → Campaign Matching",
        f"{'='*W}", ""
    ]
    
    # Summary
    total_spend_all = sum(rc['total_spend'] for rc in reko['reco'])
    total_comm_all = sum(rc['total_comm'] for rc in reko['reco'])
    total_profit_all = sum(rc['total_profit'] for rc in reko['reco'])
    roas_all = total_comm_all / total_spend_all if total_spend_all > 0 else 0
    
    out += [
        f"TOTAL: Spend Rp {total_spend_all:,.0f} | Comm Rp {total_comm_all:,.0f}",
        f"       Profit Rp {total_profit_all:,.0f} | ROAS {roas_all:.2f}x | {len(reko['reco'])} tags",
        ""
    ]
    
    # Aksi count
    aksi_count = defaultdict(int)
    for rc in reko['reco']:
        aksi_count[rc['aksi']] += 1
    out.append(f"Aksi: " + " | ".join(f"{k}: {v}" for k,v in sorted(aksi_count.items())))
    out.append("")
    
    # Per tag recommendation
    for rc in reko['reco']:
        icon = {'GAS':'🚀','GAS+CREATIVE':'🚀🎨','STABIL':'✅','OPTIMIZE':'⚙️','PAUSE':'⏸️','TUNGGU':'⏳'}.get(rc['aksi'],'📌')
        out.append(f"{icon} [{rc['aksi']}] {rc['tag']}")
        out.append(f"   {rc['n_camps']} campaign | {rc['n_orders']} orders | Spend Rp {rc['total_spend']:,.0f}")
        out.append(f"   Comm Rp {rc['total_comm']:,.0f} | Profit Rp {rc['total_profit']:,.0f} | ROAS {rc['roas']:.2f}x")
        out.append(f"   → {rc['detail']}")
        
        # Show top campaigns for this tag
        for cd in rc['camps'][:3]:
            fstr = f"   F{cd['fatigue']:.0f}" if cd['fatigue'] >= 1 else ""
            out.append(f"   ├ {cd['name'][:38]:<38} Rp {cd['spend']:>7,.0f} | ROAS {cd['roas']:.2f}x | {cd['status']}{fstr}")
        if len(rc['camps']) > 3:
            out.append(f"   └ ... +{len(rc['camps'])-3} more campaigns")
        out.append("")
    
    # Orphan tags
    if reko['orphan_tags']:
        out.append(f"{'─'*W}")
        out.append("OPPORTUNITIES — Taglink cuan tanpa campaign aktif:")
        out.append("─"*W)
        for ot in reko['orphan_tags'][:5]:
            out.append(f"  {ot['tag']:<30} Comm Rp {ot['comm']:>10,.0f} | {ot['orders']} orders")
            out.append(f"    → BUAT CAMPAIGN BARU untuk tag ini!")
        out.append("")
    
    # Wasted spend
    if reko['wasted']:
        out.append(f"{'─'*W}")
        out.append("WASTED SPEND — Campaign spend tanpa order:")
        out.append("─"*W)
        total_waste = 0
        for w in reko['wasted'][:5]:
            out.append(f"  {w['name'][:40]:<40} Rp {w['spend']:>8,.0f} | CPC Rp {w['cpc']:>6,.0f}")
            total_waste += w['spend']
        out.append(f"  TOTAL WASTE: Rp {total_waste:,.0f}")
        out.append(f"    → PAUSE atau ganti tag/targeting!")
        out.append("")
    
    out.append(f"{'='*W}")
    out.append(f"{datetime.now().strftime('%Y-%m-%d %H:%M WIB')} | Trakpro Vilona v2.0")
    return '\n'.join(out)


def analyze(acc_key, days=3):
    a = ACCOUNTS.get(acc_key)
    if not a: return None
    today = datetime.now()
    ds = (today-timedelta(days=days)).strftime('%Y-%m-%d')
    du = (today-timedelta(days=1)).strftime('%Y-%m-%d')
    
    camps = api(f"{a['id']}/insights", {
        'level':'campaign',
        'fields':'campaign_id,campaign_name,spend,impressions,clicks,cpc,ctr',
        'time_range': json.dumps({'since':ds,'until':du})
    })
    if 'error' in camps:
        print(f"API Error: {camps['error'].get('message','')[:150]}")
        return None
    
    orders = load_shopee(a['csv'], days)
    tc = defaultdict(float); to = defaultdict(set)
    for o in orders:
        tc[o['tag']] += o['comm']
        to[o['tag']].add(o['oid'])
    
    data = [d for d in camps.get('data',[]) 
            if float(d.get('spend',0))>0 and 'OFF_' not in (d.get('campaign_name','') or '')[:10]]
    
    def _f(v): 
        try: return float(v)
        except: return 0
    def _i(v):
        try: return int(float(v))
        except: return 0
    
    results = []
    for d in data:
        spend = _f(d['spend']); clicks = _i(d.get('clicks',0))
        cpc = _f(d.get('cpc',0)); ctr = _f(d.get('ctr',0))
        imp = _i(d.get('impressions',0))
        t = extract_tag(d['campaign_name'])
        shared = [x for x in data if extract_tag(x['campaign_name'])==t]
        ss = sum(_f(x['spend']) for x in shared)
        if ss==0: continue
        share = spend/ss
        comm = tc.get(t,0)*share
        profit = comm - spend
        roas = comm/spend if spend>0 else 0
        orders_n = round(len(to.get(t,set()))*share)
        
        daily = api(f"{d['campaign_id']}/insights", {
            'fields':'spend,clicks,cpc,ctr,impressions,date_start',
            'time_range': json.dumps({'since':(today-timedelta(days=7)).strftime('%Y-%m-%d'),'until':du}),
            'time_increment': 1
        })
        fs, fd, ct, cp = detect_fatigue(daily.get('data',[]))
        
        info = api(f"{d['campaign_id']}", {'fields':'created_time,daily_budget'})
        created = info.get('created_time',''); age=0
        if created:
            try: age = (today - datetime.strptime(created[:10],'%Y-%m-%d')).days
            except: pass
        

        
        # Early detection
        is_early = (age <= EARLY_MAX_AGE and spend >= EARLY_MIN_SPEND 
                    and profit > 0 and roas >= 1.0)
        
        status, rec = classify({
            'spend': spend, 'clicks': clicks,
            'profit': profit, 'roas': roas, 'fatigue': fs
        })
        
        results.append({
            'id': d['campaign_id'], 'name': d['campaign_name'],
            'spend': spend, 'clicks': clicks,
            'cpc': cpc, 'ctr': ctr,
            'imp': imp,
            'comm': comm, 'profit': profit, 'roas': roas,
            'orders': orders_n, 'tag': t,
            'fatigue': fs, 'fatigue_desc': fd,
            'ctr_trend': ct, 'cpc_trend': cp,
            'status': status, 'rec': rec,
            'age': age, 'is_early': is_early,
            'budget': int(info.get('daily_budget',0))
        })
    
    wins = [r for r in results if 'WINNER' in r['status']]
    bons = [r for r in results if 'BONCOS' in r['status']]
    scales = [r for r in results if r['roas']>=SCALE_MIN_ROAS and r['ctr']>=SCALE_MIN_CTR and r['profit']>0]
    watch = [r for r in results if 'WATCH' in r['status'] and 'BONCOS' not in r['status']]
    pend = [r for r in results if 'PENDING' in r['status']]
    fat = [r for r in results if r['fatigue']>=1]
    early = [r for r in results if r.get('is_early')]
    
    acts = []
    for b in sorted(bons, key=lambda x: x['profit'])[:3]:
        acts.append(f"PAUSE: {b['name'][:35]} (Loss Rp {abs(b['profit']):,.0f})")
    for f in sorted(fat, key=lambda x: -x['fatigue'])[:2]:
        if f['fatigue']>=2 and f not in bons:
            acts.append(f"GANTI CREATIVE: {f['name'][:35]} (Fatigue Lv{f['fatigue']:.0f})")
    for w in sorted(wins, key=lambda x: -x['roas'])[:2]:
        acts.append(f"SCALE +{scale_pct(w['roas'])}%: {w['name'][:35]} (ROAS {w['roas']:.2f}x)")
    if not acts: 
        acts.append("No urgent actions. Monitor all campaigns.")
    
    total_spend = sum(r['spend'] for r in results)
    total_comm = sum(r['comm'] for r in results)
    total_profit = sum(r['profit'] for r in results)
    total_orders = sum(r['orders'] for r in results)
    overall_roas = total_comm/total_spend if total_spend>0 else 0
    
    sops = gen_sop(results)
    
    return {
        'acc': acc_key, 'label': a['nm'],
        'date': f"{ds} - {du} ({days}d)",
        'total_spend': total_spend, 'total_profit': total_profit,
        'total_roas': overall_roas, 'total_orders': total_orders,
        'n': len(results),
        'wins': wins, 'bons': bons, 'scales': scales,
        'watch': watch, 'pend': pend, 'fat': fat, 'early': early,
        'acts': acts, 'sops': sops
    }

def fmt_telegram(r, mode='daily'):
    header = {
        'daily': 'DAILY BRIEFING', 'decide': 'DECISION CENTER',
        'winner': 'WINNERS', 'boncos': 'BONCOS',
        'scale': 'SCALE LADDER', 'fatigue': 'CREATIVE FATIGUE',
        'early': 'EARLY WINNER DETECTOR', 'sop': 'SOP GENERATOR',
        'rekomendasi': 'REKOMENDASI AKSI'
    }
    lines = [
        f"<b>TRAKPRO VILONA — {header.get(mode, mode.upper())}</b>",
        f"{r['date']} | {r['label']}",
        "",
        f"Spend: <b>Rp {r['total_spend']:,.0f}</b> | Profit: <b>Rp {r['total_profit']:,.0f}</b>",
        f"ROAS: <b>{r['total_roas']:.2f}x</b> | Orders: <b>{r['total_orders']}</b>",
        f"{len(r['wins'])}W / {len(r['bons'])}L / {len(r['scales'])}S / {len(r['pend'])}P",
        ""
    ]
    if r['wins'] and mode in ('winner','daily','decide'):
        lines.append("<b>WINNERS</b>")
        for i,w in enumerate(sorted(r['wins'],key=lambda x:-x['profit'])[:5],1):
            lines.append(f"{i}. {w['name'][:35]} | +Rp {w['profit']:,.0f} | ROAS {w['roas']:.2f}x")
        lines.append("")
    if r['bons'] and mode in ('boncos','daily','decide'):
        lines.append("<b>BONCOS</b>")
        for i,b in enumerate(sorted(r['bons'],key=lambda x:x['profit'])[:5],1):
            lines.append(f"{i}. {b['name'][:35]} | -Rp {abs(b['profit']):,.0f} | ROAS {b['roas']:.2f}x")
        lines.append("")
    if r['scales'] and mode in ('scale','daily','decide'):
        lines.append("<b>SCALE READY</b>")
        for i,s in enumerate(sorted(r['scales'],key=lambda x:-x['roas'])[:5],1):
            lines.append(f"{i}. {s['name'][:35]} | ROAS {s['roas']:.2f}x | +{scale_pct(s['roas'])}%")
        lines.append("")
    if r['fat'] and mode in ('fatigue','daily','decide'):
        lines.append("<b>CREATIVE FATIGUE</b>")
        for f in r['fat'][:5]:
            icon = 'CRITICAL' if f['fatigue']>=2 else 'WARNING'
            lines.append(f"{icon} {f['name'][:40]} | {f['fatigue_desc']}")
        lines.append("")
    if r['early'] and mode in ('early','daily','decide'):
        lines.append("<b>EARLY WINNERS (3d)</b>")
        for e in r['early'][:3]:
            lines.append(f"{e['name'][:35]} | Age:{e['age']}d | ROAS {e['roas']:.1f}x")
        lines.append("")
    if r['acts']:
        lines.append("<b>PRIORITY ACTIONS</b>")
        for a in r['acts'][:5]: lines.append(f"  {a}")
        lines.append("")
    lines.append(f"{datetime.now().strftime('%H:%M WIB')} | Trakpro Vilona v2.0")
    return '\n'.join(lines)

def fmt_cli(r, mode='decide'):
    W=65
    titles = {
        'daily':'DAILY BRIEFING','decide':'DECISION CENTER',
        'winner':'WINNERS','boncos':'BONCOS','scale':'SCALE LADDER',
        'pending':'PENDING','fatigue':'CREATIVE FATIGUE',
        'early':'EARLY WINNER DETECTOR','sop':'SOP GENERATOR'
    }
    out = [
        f"{'='*W}",
        f"{titles.get(mode, 'REPORT')} — {r['label']}",
        f"{r['date']}",
        f"{'='*W}", ""
    ]
    
    if mode in ('daily','decide'):
        out += [
            f"Campaigns: {r['n']} | Spend: Rp {r['total_spend']:,.0f} | Profit: Rp {r['total_profit']:,.0f}",
            f"ROAS: {r['total_roas']:.2f}x | Orders: {r['total_orders']}",
            f"{len(r['wins'])}W / {len(r['bons'])}L / {len(r['scales'])}S / {len(r['watch'])}WATCH / {len(r['pend'])}PEND", ""
        ]
    
    if r['wins'] and mode in ('winner','daily','decide'):
        out.append("WINNERS")
        out.append("-"*W)
        for i,w in enumerate(sorted(r['wins'],key=lambda x:-x['profit'])[:10],1):
            out.append(f"{i}. {w['name'][:45]:<45} | +Rp {w['profit']:>8,.0f} | ROAS {w['roas']:.2f}x")
            out.append(f"   {w['rec']}")
        out.append("")
    
    if r['bons'] and mode in ('boncos','daily','decide'):
        out.append("BONCOS — Action Required")
        out.append("-"*W)
        for i,b in enumerate(sorted(r['bons'],key=lambda x:x['profit'])[:10],1):
            out.append(f"{i}. {b['name'][:45]:<45} | -Rp {abs(b['profit']):>7,.0f} | ROAS {b['roas']:.2f}x")
            out.append(f"   {b['rec']}")
        out.append("")
    
    if r['scales'] and mode in ('scale','daily','decide'):
        out.append("SCALE LADDER")
        out.append("-"*W)
        for i,s in enumerate(sorted(r['scales'],key=lambda x:-x['roas'])[:10],1):
            p=scale_pct(s['roas']); nb=s['spend']*(1+p/100)
            out.append(f"{i}. {s['name'][:40]:<40} | ROAS {s['roas']:.2f}x | +{p}% -> Rp {nb:,.0f}")
        out.append("")
    
    if r['fat'] and mode in ('fatigue','daily','decide'):
        out.append("CREATIVE FATIGUE")
        out.append("-"*W)
        for f in r['fat']:
            icon = 'CRITICAL' if f['fatigue']>=2 else 'WARNING'
            out.append(f"{icon} | {f['name'][:48]:<48} | {f['fatigue_desc']}")
            if f['fatigue']>=2:
                out.append("   SOP: PAUSE -> Creative baru -> Test 48 jam")
            else:
                out.append("   SOP: Turunin 30% -> Siapin creative backup")
        out.append("")
    
    if r['early'] and mode in ('early','daily','decide'):
        out.append("EARLY WINNERS (<=3 days)")
        out.append("-"*W)
        for e in r['early']:
            out.append(f"{e['name'][:40]:<40} | Age:{e['age']}d | ROAS {e['roas']:.1f}x | +Rp {e['profit']:,.0f}")
        out.append("")
    
    if r['watch'] and mode in ('decide','daily'):
        out.append("WATCH LIST")
        out.append("-"*W)
        for i,w in enumerate(sorted(r['watch'],key=lambda x:-x['spend'])[:5],1):
            out.append(f"{i}. {w['name'][:45]:<45} | Rp {w['spend']:>7,.0f} | ROAS {w['roas']:.2f}x")
        out.append("")
    
    if r['pend'] and mode in ('pending','daily','decide'):
        out.append(f"PENDING ({len(r['pend'])} campaigns)")
        out.append("-"*W)
        for i,p in enumerate(sorted(r['pend'],key=lambda x:-x['spend'])[:8],1):
            out.append(f"{i}. {p['name'][:48]:<48} | Rp {p['spend']:>6,.0f} | {p['clicks']:>3} clicks")
        out.append("")
    
    if r['acts']:
        out.append("PRIORITY ACTIONS")
        out.append("-"*W)
        for a in r['acts']: out.append(f"  {a}")
        out.append("")
    
    if mode=='sop' and r['sops']:
        out.append("SOP AUTO GENERATOR")
        out.append("-"*W)
        for i,s in enumerate(r['sops'],1):
            out.append(f"\n{i}. [{s['action']}] {s['campaign'][:50]}")
            out.append(f"   {s['metrics']}")
            for st in s['steps']: out.append(f"   {st}")
        out.append("")
    
    out.append(f"{'='*W}")
    out.append(f"{datetime.now().strftime('%Y-%m-%d %H:%M WIB')} | Trakpro Vilona v2.0")
    return '\n'.join(out)

def send_tg(msg):
    if not TG_TOKEN or not TG_CHAT: return False
    url = f"https://api.telegram.org/bot{TG_TOKEN}/sendMessage"
    try:
        for chunk in [msg[i:i+4000] for i in range(0, len(msg), 4000)]:
            requests.post(url, json={
                'chat_id': TG_CHAT, 'text': chunk,
                'parse_mode': 'HTML', 'disable_web_page_preview': True
            }, timeout=15)
        return True
    except: return False

def main():
    p = argparse.ArgumentParser(description='TRAKPRO VILONA v2.0')
    p.add_argument('cmd', nargs='?', default='decide',
        choices=['winner','boncos','scale','pending','fatigue','early','sop','decide','daily','rekomendasi','alert','daemon'])
    p.add_argument('--account', default='1041')
    p.add_argument('--days', type=int, default=3)
    p.add_argument('--telegram', action='store_true')
    p.add_argument('--interval', type=int, default=3600)
    p.add_argument('--json', action='store_true')
    args = p.parse_args()
    
    if not TOKEN:
        print("No META_ACCESS_TOKEN")
        return
    
    if args.cmd == 'daemon':
        a = ACCOUNTS[args.account]
        print(f"Daemon: {a['nm']} | Interval: {args.interval}s")
        last_am = last_pm = None
        while True:
            try:
                r = analyze(args.account, args.days)
                if not r: time.sleep(args.interval); continue
                now = datetime.now(); h = now.hour
                msg = fmt_telegram(r, 'daily')
                if 7 <= h < 9 and (not last_am or last_am.date() < now.date()):
                    send_tg(f"<b>MORNING BRIEFING</b>\n\n{msg}")
                    last_am = now; print(f"[{now:%H:%M}] Morning sent")
                elif 20 <= h < 22 and (not last_pm or last_pm.date() < now.date()):
                    send_tg(f"<b>EVENING BRIEFING</b>\n\n{msg}")
                    last_pm = now; print(f"[{now:%H:%M}] Evening sent")
                crit = [c for c in r['bons']+r['fat'] if c.get('fatigue',0)>=2]
                if crit:
                    send_tg(f"<b>CRITICAL — {len(crit)} campaigns need action!</b>\n\n{fmt_telegram(r,'boncos')}")
                    print(f"[{now:%H:%M}] Critical alert ({len(crit)})")
                print(f"[{now:%H:%M}] Spend: Rp {r['total_spend']:,.0f} | Profit: Rp {r['total_profit']:,.0f}")
                time.sleep(args.interval)
            except KeyboardInterrupt:
                print("Stopped"); break
            except Exception as e:
                print(f"Error: {e}"); time.sleep(args.interval)
        return
    
    r = analyze(args.account, args.days)
    if not r:
        print("Failed to fetch data")
        return
    
    if args.cmd == 'rekomendasi':
        reko = rekomendasi(r['wins']+r['bons']+r['scales']+r['watch']+r['pend'], args.account, args.days)
        if args.json:
            print(json.dumps(reko, default=str, indent=2))
        else:
            print(fmt_rekomendasi(r, reko))
        if args.telegram:
            ok = send_tg(fmt_telegram(r, 'decide'))
            print(f"\nTelegram: {'OK' if ok else 'FAIL (not configured)'}")
        return
    
    if args.json:
        print(json.dumps(r, default=str, indent=2))
    else:
        print(fmt_cli(r, args.cmd))
    
    if args.telegram:
        ok = send_tg(fmt_telegram(r, args.cmd))
        print(f"\nTelegram: {'OK' if ok else 'FAIL (not configured)'}")

if __name__ == '__main__':
    main()
