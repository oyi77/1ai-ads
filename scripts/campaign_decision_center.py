#!/usr/bin/env python3
"""
🎯 CAMPAIGN DECISION CENTER — Trakpro-style Analytics Engine
Combines Meta Ads insights + Shopee affiliate data for intelligent recommendations.

Commands:
  /winner   — Top profitable campaigns
  /boncos   — Campaigns losing money (worst performers)  
  /scale    — Campaigns ready to scale (strong ROAS + healthy metrics)
  /pending  — Campaigns needing more data before decision
  /fatigue  — Detect creative fatigue (CTR↓ CPC↑ Orders↓)
  /decide   — Full decision center with recommendations + SOP
  /daily    — Daily briefing (all of the above, compact)

Usage:
  python3 scripts/campaign_decision_center.py winner
  python3 scripts/campaign_decision_center.py decide --days 3
  python3 scripts/campaign_decision_center.py daily --account 1041
"""
import sys, os, json, csv, re, argparse
from datetime import datetime, timedelta
from pathlib import Path
from collections import defaultdict
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Tuple
import requests

# === CONFIG ===
SCRIPT_DIR = Path(__file__).parent
PROJECT_DIR = SCRIPT_DIR.parent
DATA_DIR = PROJECT_DIR / 'data' / 'shopee'
ENV_FILE = PROJECT_DIR / '.env'

ACCOUNTS = {
    '1041': {'id': 'act_380721031313330', 'label': 'Nyamiresep', 'shopee_label': 'nyamiresep'},
    '0858': {'id': 'act_435670549443081', 'label': 'Selow 0858', 'shopee_label': 'selow0858'},
    '1208': {'id': 'act_1439536310038458', 'label': 'Herbal', 'shopee_label': 'herbal'},
    '1134': {'id': 'act_1773760133153789', 'label': 'Selow 1134', 'shopee_label': 'selow1134'},
    'glowscent': {'id': 'act_2125021885010866', 'label': 'GlowScent', 'shopee_label': 'glowscent'},
}

# Decision thresholds
WINNER_MIN_PROFIT = 5000
WINNER_MIN_ROAS = 1.2
BONCOS_MAX_ROAS = 0.8
SCALE_MIN_ROAS = 1.3
SCALE_MIN_DAYS = 3
SCALE_CTR_MIN = 3.0
FATIGUE_CTR_DROP = 0.3        # 30% CTR drop = fatigue warning
FATIGUE_CPC_RISE = 0.3        # 30% CPC increase = fatigue warning
PENDING_MAX_SPEND = 5000
PENDING_MIN_CLICKS = 10

# Known Shopee tags for matching
KNOWN_TAGS = [
    'atayasetelankaosanak', 'rakdapur3', 'rakdapur',
    'wallpaperdindingvinyl', 'benihsayuran', 'dressanakperempuan',
    'setanakfernando', 'stikerkeramik', 'fashion',
]

@dataclass
class Campaign:
    id: str
    name: str
    spend: float = 0
    clicks: int = 0
    cpc: float = 0
    ctr: float = 0
    impressions: int = 0
    commission: float = 0
    profit: float = 0
    roas: float = 0
    orders: int = 0
    tag: str = ''
    status: str = 'UNKNOWN'
    ctr_trend: float = 0       # Day-over-day CTR change %
    cpc_trend: float = 0       # Day-over-day CPC change %
    fatigue_score: int = 0     # 0=healthy, 1=warning, 2=critical
    recommendation: str = ''
    action_sop: str = ''


def get_token():
    with open(ENV_FILE) as f:
        for line in f:
            if line.startswith('META_ACCESS_TOKEN='):
                return line.split('=', 1)[1].strip()
    return None

def api_get(path, params=None):
    url = f"https://graph.facebook.com/v19.0/{path}"
    p = {"access_token": TOKEN, "limit": 500}
    if params:
        p.update(params)
    try:
        r = requests.get(url, params=p, timeout=20)
        return r.json()
    except Exception as e:
        return {"error": str(e)}

def load_shopee_data(account_label, days=3):
    """Load Shopee CSV data"""
    today = datetime.now()
    all_orders = []
    
    for i in range(days):
        date = today - timedelta(days=i+1)
        date_str = date.strftime('%Y-%m-%d')
        csv_path = DATA_DIR / f'{account_label}_{date_str}.csv'
        
        if not csv_path.exists():
            csv_path = DATA_DIR / f'nyamiresep_{date_str}.csv'
        
        if csv_path.exists():
            try:
                with open(csv_path, 'r', encoding='utf-8-sig') as f:
                    reader = csv.DictReader(f)
                    for row in reader:
                        tag = row.get('Tag_link1', '').strip()
                        oid = row.get('ID Pemesanan', '').strip()
                        if not tag or not oid:
                            continue
                        all_orders.append({
                            'date': date_str,
                            'tag': tag.lower(),
                            'tag_original': tag,
                            'commission': float(row.get('Komisi Bersih Affiliate (Rp)', '0').replace(',', '') or 0),
                            'order_id': oid,
                            'status': row.get('Status Pesanan', ''),
                            'purchase_value': float(row.get('Nilai Pembelian(Rp)', '0').replace(',', '') or 0),
                        })
            except Exception as e:
                print(f"  ⚠️ Error reading {csv_path}: {e}")
    
    return all_orders

def extract_tag(name):
    """Extract Shopee tag from campaign name, with fuzzy matching to actual Shopee tags"""
    name_lower = name.lower()
    
    # Exact match first
    for tag in KNOWN_TAGS:
        if tag in name_lower:
            return tag
    
    # Fallback extraction
    cleaned = re.sub(r'^(bidcap|bc|tc|off_|lc_|scale_|nyamiresep_|test_|winner_?)+', '', name_lower, flags=re.I)
    cleaned = re.sub(r'\s*\d+$', '', cleaned).strip('_ ')
    
    if not cleaned:
        return name_lower
    
    # Fuzzy match: if cleaned tag is a substring of a known tag, use the known tag
    for known in KNOWN_TAGS:
        if cleaned in known or known in cleaned:
            return known
    
    return cleaned


def resolve_tag(campaign_tag, available_shopee_tags):
    """Resolve campaign tag to actual Shopee tag. Returns (matched_tag, original_tag) or (None, campaign_tag)"""
    # Exact match
    if campaign_tag in available_shopee_tags:
        return campaign_tag
    # Substring match
    for shopee_tag in available_shopee_tags:
        if campaign_tag in shopee_tag or shopee_tag in campaign_tag:
            return shopee_tag
    return None

def get_campaign_daily_insights(account_id, cid, days=7):
    """Get daily insights for trend detection"""
    today = datetime.now()
    date_since = (today - timedelta(days=days)).strftime('%Y-%m-%d')
    date_until = (today - timedelta(days=1)).strftime('%Y-%m-%d')
    
    r = api_get(f'{cid}/insights', {
        'fields': 'spend,clicks,cpc,ctr,impressions,date_start',
        'time_range': json.dumps({'since': date_since, 'until': date_until}),
        'time_increment': 1,  # Daily breakdown
    })
    
    return r.get('data', [])

def detect_fatigue(daily_data):
    """Detect creative fatigue from daily trends
    
    Returns: (fatigue_score, trend_description)
    0 = healthy, 1 = warning, 2 = critical
    """
    if len(daily_data) < 3:
        return 0, "Not enough data"
    
    # Get last 3 days
    recent = sorted(daily_data, key=lambda x: x.get('date_start', ''))
    
    if len(recent) >= 3:
        last3 = recent[-3:]
        ctrs = [float(d.get('ctr', 0)) for d in last3 if float(d.get('ctr', 0)) > 0]
        cpcs = [float(d.get('cpc', 0)) for d in last3 if float(d.get('cpc', 0)) > 0]
        spends = [float(d.get('spend', 0)) for d in last3]
        
        score = 0
        warnings = []
        
        # CTR dropping?
        if len(ctrs) >= 2:
            ctr_change = (ctrs[0] - ctrs[-1]) / ctrs[0] if ctrs[0] > 0 else 0
            if ctr_change > FATIGUE_CTR_DROP:
                score += 1
                warnings.append(f"CTR ↓ {ctr_change:.0%}")
        
        # CPC rising?
        if len(cpcs) >= 2:
            cpc_change = (cpcs[-1] - cpcs[0]) / cpcs[0] if cpcs[0] > 0 else 0
            if cpc_change > FATIGUE_CPC_RISE:
                score += 1
                warnings.append(f"CPC ↑ {cpc_change:.0%}")
        
        # Spend up but no improvement in CTR?
        if len(spends) >= 2 and spends[-1] > spends[0] * 1.2:
            if len(ctrs) >= 2 and ctrs[-1] <= ctrs[0]:
                score += 0.5
                warnings.append("Spend↑ CTR flat")
        
        desc = ', '.join(warnings) if warnings else 'Healthy'
        return min(score, 2), desc
    
    return 0, "Healthy"

def get_campaign_spend(account_id, date_since, date_until):
    """Get per-campaign spend from Meta API"""
    insights = api_get(f'{account_id}/insights', {
        'level': 'campaign',
        'fields': 'campaign_id,campaign_name,spend,impressions,clicks,cpc,ctr',
        'time_range': json.dumps({'since': date_since, 'until': date_until}),
    })
    
    if 'error' in insights:
        print(f"  ❌ API Error: {insights['error'].get('message', 'unknown')[:100]}")
        return []
    
    result = []
    for ins in insights.get('data', []):
        try:
            result.append({
                'id': ins.get('campaign_id', ''),
                'name': ins.get('campaign_name', 'Unknown'),
                'spend': float(ins.get('spend', 0)),
                'clicks': int(ins.get('clicks', 0)),
                'cpc': float(ins.get('cpc', 0)),
                'ctr': float(ins.get('ctr', 0)),
                'impressions': int(ins.get('impressions', 0)),
            })
        except:
            pass
    
    return result

def classify_campaign(camp: Campaign, total_profit: float) -> Tuple[str, str]:
    """Classify campaign and generate SOP recommendation"""
    
    # Check if cost-controlled (BIDCAP, Target Cost) — budget scaling useless
    name_lower = camp.name.lower()
    is_cost_controlled = any(kw in name_lower for kw in ['bidcap', 'target_cost', 'targetcost'])
    is_tc = name_lower.startswith('tc_') and 'scale' not in name_lower and 'winner' not in name_lower
    
    rec = ''
    
    if camp.spend < PENDING_MAX_SPEND and camp.clicks < PENDING_MIN_CLICKS:
        status = 'PENDING'
        rec = '⏳ Tunggu minimal 10 klik / Rp 5K spend sebelum decide'
    elif camp.profit >= WINNER_MIN_PROFIT and camp.roas >= WINNER_MIN_ROAS:
        if is_cost_controlled or is_tc:
            status = 'WINNER 🏆'
            rec = f'🔒 NO-SCALE — Bid cap / Target Cost limits delivery | Maintain budget | Profit: Rp {camp.profit:,.0f}'
        elif camp.roas >= 2.0:
            status = 'WINNER 🏆'
            rec = f'🔥 GAS — Scale +30% (current: Rp {camp.spend:,.0f}) | Target profit: Rp {camp.profit*1.3:,.0f}'
        elif camp.roas >= 1.5:
            status = 'WINNER 🏆'
            rec = f'📈 SCALE — +20% budget | Pantau 2 hari | ROAS {camp.roas:.1f}x solid'
        else:
            status = 'WINNER 🏆'
            rec = f'✅ MAINTAIN — Budget saat ini oke | Monitor CPC stay di bawah Rp 130'
    elif camp.roas < BONCOS_MAX_ROAS and camp.spend > PENDING_MAX_SPEND:
        status = 'BONCOS 💀'
        if camp.fatigue_score >= 2:
            rec = '🔄 GANTI CREATIVE — CTR turun + CPC naik | Pause dulu, upload creative baru'
        elif camp.fatigue_score >= 1:
            rec = '⚠️ WARNING FATIGUE — Turunin budget 30% | Siapin creative backup'
        else:
            rec = '🛑 PAUSE — ROAS terlalu rendah | Cek targeting/creative/audience'
        if camp.spend > 50000:
            rec += f' | Loss: Rp {abs(camp.profit):,.0f}'
    elif camp.roas >= 1.0 and camp.profit > 0:
        status = 'WATCH 👀'
        rec = '📊 MONITOR — Positive tapi masih marginal | Jangan scale dulu'
    elif camp.profit < 0 and camp.spend > PENDING_MAX_SPEND:
        status = 'WATCH ⚠️'
        rec = '🔍 REVIEW — Negative profit | Cek attribution tag mapping'
    else:
        status = 'PENDING'
        rec = '⏳ Butuh data lebih banyak'
    
    # Add fatigue warning to recommendation
    if camp.fatigue_score >= 1 and 'FATIGUE' not in rec:
        rec = f'🎨 CREATIVE FATIGUE DETECTED | {rec}'
    
    return status, rec


def cmd_winner(account, days, min_spend):
    """Show top profitable campaigns"""
    today = datetime.now()
    date_since = (today - timedelta(days=days)).strftime('%Y-%m-%d')
    date_until = (today - timedelta(days=1)).strftime('%Y-%m-%d')
    
    campaigns = get_campaign_spend(account['id'], date_since, date_until)
    shopee_orders = load_shopee_data(account['shopee_label'], days)
    
    # Build tag commission
    tag_comm = defaultdict(float)
    tag_orders = defaultdict(set)
    for order in shopee_orders:
        tag_comm[order['tag']] += order['commission']
        tag_orders[order['tag']].add(order['order_id'])
    
    # Filter active campaigns
    active = [c for c in campaigns if c['spend'] >= min_spend and 'OFF_' not in c['name'][:10]]
    
    # Match and calculate
    results = []
    for c in active:
        tag = extract_tag(c['name'])
        
        # Find campaigns sharing this tag
        shared_camps = [x for x in active if extract_tag(x['name']) == tag]
        shared_spend = sum(x['spend'] for x in shared_camps)
        
        if shared_spend == 0:
            continue
            
        share = c['spend'] / shared_spend
        # Fuzzy resolve tag to Shopee data
        resolved_tag = resolve_tag(tag, set(tag_comm.keys()))
        commission = tag_comm.get(resolved_tag or tag, 0) * share
        profit = commission - c['spend']
        roas = commission / c['spend'] if c['spend'] > 0 else 0
        orders = round(len(tag_orders.get(tag, set())) * share)
        
        if profit >= WINNER_MIN_PROFIT and roas >= WINNER_MIN_ROAS:
            results.append({
                'name': c['name'],
                'spend': c['spend'],
                'commission': commission,
                'profit': profit,
                'roas': roas,
                'orders': orders,
                'ctr': c['ctr'],
                'cpc': c['cpc'],
            })
    
    results.sort(key=lambda x: x['profit'], reverse=True)
    
    total_profit = sum(r['profit'] for r in results)
    
    print(f"🏆 /winner — {account['label']}")
    print(f"📅 Periode: {date_since} – {date_until} ({days} hari)")
    print(f"💰 Total Profit: Rp {total_profit:,.0f}")
    print()
    
    if not results:
        print("Belum ada campaign yang mencapai threshold WINNER.")
        print(f"(Min profit: Rp {WINNER_MIN_PROFIT:,}, Min ROAS: {WINNER_MIN_ROAS}x)")
        return
    
    for i, r in enumerate(results, 1):
        print(f"{i}. {r['name'][:45]:<45} | Profit Rp {r['profit']:>8,.0f} | ROAS {r['roas']:.2f}x | Order {r['orders']:>4}")


def cmd_boncos(account, days, min_spend):
    """Show worst performing campaigns"""
    today = datetime.now()
    date_since = (today - timedelta(days=days)).strftime('%Y-%m-%d')
    date_until = (today - timedelta(days=1)).strftime('%Y-%m-%d')
    
    campaigns = get_campaign_spend(account['id'], date_since, date_until)
    shopee_orders = load_shopee_data(account['shopee_label'], days)
    
    tag_comm = defaultdict(float)
    tag_orders = defaultdict(set)
    for order in shopee_orders:
        tag_comm[order['tag']] += order['commission']
        tag_orders[order['tag']].add(order['order_id'])
    
    active = [c for c in campaigns if c['spend'] >= min_spend and 'OFF_' not in c['name'][:10]]
    
    results = []
    for c in active:
        tag = extract_tag(c['name'])
        shared_camps = [x for x in active if extract_tag(x['name']) == tag]
        shared_spend = sum(x['spend'] for x in shared_camps)
        
        if shared_spend == 0:
            continue
            
        share = c['spend'] / shared_spend
        # Fuzzy resolve tag to Shopee data
        resolved_tag = resolve_tag(tag, set(tag_comm.keys()))
        commission = tag_comm.get(resolved_tag or tag, 0) * share
        profit = commission - c['spend']
        roas = commission / c['spend'] if c['spend'] > 0 else 0
        orders = round(len(tag_orders.get(tag, set())) * share)
        
        if profit < 0 and c['spend'] > PENDING_MAX_SPEND:
            results.append({
                'name': c['name'],
                'spend': c['spend'],
                'commission': commission,
                'profit': profit,
                'roas': roas,
                'orders': orders,
            })
    
    results.sort(key=lambda x: x['profit'])
    
    total_loss = sum(r['profit'] for r in results)
    
    print(f"💀 /boncos — {account['label']}")
    print(f"📅 Periode: {date_since} – {date_until} ({days} hari)")
    print(f"💸 Total Loss: Rp {abs(total_loss):,.0f}")
    print()
    
    if not results:
        print("✅ Ga ada campaign boncos! Semua profitable atau masih pending.")
        return
    
    for i, r in enumerate(results[:10], 1):
        print(f"{i}. {r['name'][:45]:<45} | Loss Rp {abs(r['profit']):>7,.0f} | ROAS {r['roas']:.2f}x | Order {r['orders']:>3}")


def cmd_scale(account, days, min_spend):
    """Show campaigns ready to scale"""
    today = datetime.now()
    date_since = (today - timedelta(days=days)).strftime('%Y-%m-%d')
    date_until = (today - timedelta(days=1)).strftime('%Y-%m-%d')
    
    campaigns = get_campaign_spend(account['id'], date_since, date_until)
    shopee_orders = load_shopee_data(account['shopee_label'], days)
    
    tag_comm = defaultdict(float)
    tag_orders = defaultdict(set)
    for order in shopee_orders:
        tag_comm[order['tag']] += order['commission']
        tag_orders[order['tag']].add(order['order_id'])
    
    active = [c for c in campaigns if c['spend'] >= min_spend and 'OFF_' not in c['name'][:10]]
    
    results = []
    for c in active:
        tag = extract_tag(c['name'])
        shared_camps = [x for x in active if extract_tag(x['name']) == tag]
        shared_spend = sum(x['spend'] for x in shared_camps)
        
        if shared_spend == 0:
            continue
            
        share = c['spend'] / shared_spend
        # Fuzzy resolve tag to Shopee data
        resolved_tag = resolve_tag(tag, set(tag_comm.keys()))
        commission = tag_comm.get(resolved_tag or tag, 0) * share
        profit = commission - c['spend']
        roas = commission / c['spend'] if c['spend'] > 0 else 0
        orders = round(len(tag_orders.get(tag, set())) * share)
        
        # Scale criteria — skip BIDCAP/TC (budget useless due to cost control)
        is_cost_controlled = any(kw in c['name'].lower() for kw in ['bidcap'])
        if roas >= SCALE_MIN_ROAS and c['ctr'] >= SCALE_CTR_MIN and profit > 0:
            # Calculate scale recommendation
            if is_cost_controlled:
                scale_pct = 0
                scale_note = '🔒 BIDCAP — maintain (cost control)'
                new_budget = c['spend']
            elif roas >= 2.5:
                scale_pct = 50
                scale_note = '🔥 AGGRESSIVE SCALE'
            elif roas >= 2.0:
                scale_pct = 30
                scale_note = '📈 STRONG SCALE'
            elif roas >= 1.5:
                scale_pct = 20
                scale_note = '📊 MODERATE SCALE'
            else:
                scale_pct = 10
                scale_note = '🐢 CAUTIOUS SCALE'
            
            new_budget = c['spend'] * (1 + scale_pct / 100)
            
            results.append({
                'name': c['name'],
                'spend': c['spend'],
                'profit': profit,
                'roas': roas,
                'orders': orders,
                'ctr': c['ctr'],
                'cpc': c['cpc'],
                'scale_pct': scale_pct,
                'scale_note': scale_note,
                'new_budget': new_budget,
            })
    
    results.sort(key=lambda x: x['roas'], reverse=True)
    
    print(f"🚀 /scale — {account['label']}")
    print(f"📅 Periode: {date_since} – {date_until} ({days} hari)")
    print()
    
    if not results:
        print("Belum ada campaign yang siap scale.")
        print(f"(Criteria: ROAS ≥ {SCALE_MIN_ROAS}x, CTR ≥ {SCALE_CTR_MIN}%, Profit > 0)")
        return
    
    for i, r in enumerate(results, 1):
        print(f"{i}. {r['name'][:40]:<40} | ROAS {r['roas']:.2f}x | {r['scale_note']}")
        print(f"   Budget: Rp {r['spend']:,.0f} → Rp {r['new_budget']:,.0f} (+{r['scale_pct']}%) | Profit: Rp {r['profit']:,.0f} | CTR: {r['ctr']:.1f}%")


def cmd_pending(account, days, min_spend):
    """Show campaigns still needing data"""
    today = datetime.now()
    date_since = (today - timedelta(days=days)).strftime('%Y-%m-%d')
    date_until = (today - timedelta(days=1)).strftime('%Y-%m-%d')
    
    campaigns = get_campaign_spend(account['id'], date_since, date_until)
    shopee_orders = load_shopee_data(account['shopee_label'], days)
    
    active = [c for c in campaigns if c['spend'] > 0 and 'OFF_' not in c['name'][:10]]
    
    tag_comm = defaultdict(float)
    for order in shopee_orders:
        tag_comm[order['tag']] += order['commission']
    
    results = []
    for c in active:
        if c['spend'] < PENDING_MAX_SPEND and c['clicks'] < PENDING_MIN_CLICKS:
            tag = extract_tag(c['name'])
            has_commission = resolve_tag(tag, set(tag_comm.keys())) is not None
            results.append({
                'name': c['name'],
                'spend': c['spend'],
                'clicks': c['clicks'],
                'ctr': c['ctr'],
                'cpc': c['cpc'],
                'has_commission': has_commission,
                'tag': tag,
            })
        elif c['spend'] < PENDING_MAX_SPEND:
            tag = extract_tag(c['name'])
            has_commission = resolve_tag(tag, set(tag_comm.keys())) is not None
            results.append({
                'name': c['name'],
                'spend': c['spend'],
                'clicks': c['clicks'],
                'ctr': c['ctr'],
                'cpc': c['cpc'],
                'has_commission': has_commission,
                'tag': tag,
            })
    
    results.sort(key=lambda x: x['spend'], reverse=True)
    
    print(f"⏳ /pending — {account['label']}")
    print(f"📅 Periode: {date_since} – {date_until} ({days} hari)")
    print(f"Threshold: < Rp {PENDING_MAX_SPEND:,} spend & < {PENDING_MIN_CLICKS} clicks")
    print()
    
    if not results:
        print("Semua campaign sudah punya cukup data untuk decide.")
        return
    
    for i, r in enumerate(results[:15], 1):
        comm_label = '✅ tag OK' if r['has_commission'] else '⚠️ no tag'
        print(f"{i}. {r['name'][:40]:<40} | Spend Rp {r['spend']:>6,.0f} | {r['clicks']:>3} clk | {comm_label}")


def cmd_fatigue(account, days):
    """Detect creative fatigue"""
    today = datetime.now()
    date_since = (today - timedelta(days=days)).strftime('%Y-%m-%d')
    date_until = (today - timedelta(days=1)).strftime('%Y-%m-%d')
    
    campaigns = get_campaign_spend(account['id'], date_since, date_until)
    
    # Only check campaigns with significant spend
    active = [c for c in campaigns if c['spend'] >= 30000 and 'OFF_' not in c['name'][:10]]
    
    print(f"🎨 /fatigue — {account['label']}")
    print(f"📅 Analyzing daily trends over {days} days...")
    print()
    
    fatigued = []
    healthy = []
    
    for c in active:
        daily = get_campaign_daily_insights(account['id'], c['id'], days=days)
        score, desc = detect_fatigue(daily)
        
        if score >= 1:
            fatigued.append({
                'name': c['name'],
                'score': score,
                'desc': desc,
                'spend': c['spend'],
                'ctr': c['ctr'],
                'cpc': c['cpc'],
            })
        else:
            healthy.append(c['name'])
    
    if fatigued:
        print("🚨 CREATIVE FATIGUE DETECTED:")
        print()
        for i, f in enumerate(sorted(fatigued, key=lambda x: x['score'], reverse=True), 1):
            icon = '🔴' if f['score'] >= 2 else '🟡'
            print(f"{icon} {i}. {f['name'][:45]:<45} | Score: {f['score']:.0f}/2 | {f['desc']}")
            print(f"   Spend: Rp {f['spend']:,.0f} | CTR: {f['ctr']:.2f}% | CPC: Rp {f['cpc']:,.0f}")
            if f['score'] >= 2:
                print(f"   🛑 SOP: PAUSE campaign → Upload 3-5 creative baru → Test 48 jam")
            else:
                print(f"   ⚠️ SOP: Turunin budget 30% → Siapin 2-3 creative backup")
            print()
    else:
        print("✅ No creative fatigue detected pada campaign aktif.")
    
    if healthy:
        print(f"💚 Healthy campaigns ({len(healthy)}):")
        for name in healthy[:5]:
            print(f"   • {name[:60]}")


def cmd_decide(account, days, min_spend):
    """Full decision center with recommendations"""
    today = datetime.now()
    date_since = (today - timedelta(days=days)).strftime('%Y-%m-%d')
    date_until = (today - timedelta(days=1)).strftime('%Y-%m-%d')
    
    print(f"🎯 DECISION CENTER — {account['label']}")
    print(f"📅 Periode: {date_since} – {date_until} ({days} hari)")
    print(f"{'='*70}")
    print()
    
    campaigns = get_campaign_spend(account['id'], date_since, date_until)
    shopee_orders = load_shopee_data(account['shopee_label'], days)
    
    # Build tag commission
    tag_comm = defaultdict(float)
    tag_orders = defaultdict(set)
    for order in shopee_orders:
        tag_comm[order['tag']] += order['commission']
        tag_orders[order['tag']].add(order['order_id'])
    
    active = [c for c in campaigns if c['spend'] >= min_spend and 'OFF_' not in c['name'][:10]]
    
    # Build full campaign objects
    camp_objects = []
    for c in active:
        tag = extract_tag(c['name'])
        shared_camps = [x for x in active if extract_tag(x['name']) == tag]
        shared_spend = sum(x['spend'] for x in shared_camps)
        
        if shared_spend == 0:
            continue
            
        share = c['spend'] / shared_spend
        # Fuzzy resolve tag to Shopee data
        resolved_tag = resolve_tag(tag, set(tag_comm.keys()))
        commission = tag_comm.get(resolved_tag or tag, 0) * share
        profit = commission - c['spend']
        roas = commission / c['spend'] if c['spend'] > 0 else 0
        orders = round(len(tag_orders.get(tag, set())) * share)
        
        daily = get_campaign_daily_insights(account['id'], c['id'], days=7)
        fatigue_score, fatigue_desc = detect_fatigue(daily)
        
        camp = Campaign(
            id=c['id'], name=c['name'], spend=c['spend'],
            clicks=c['clicks'], cpc=c['cpc'], ctr=c['ctr'],
            impressions=c['impressions'], commission=commission,
            profit=profit, roas=roas, orders=orders, tag=tag,
            fatigue_score=fatigue_score,
        )
        status, rec = classify_campaign(camp, profit)
        camp.status = status
        camp.recommendation = rec
        camp_objects.append(camp)
    
    # Group by status
    winners = [c for c in camp_objects if 'WINNER' in c.status]
    boncos = [c for c in camp_objects if 'BONCOS' in c.status]
    watching = [c for c in camp_objects if 'WATCH' in c.status and 'BONCOS' not in c.status]
    pending = [c for c in camp_objects if 'PENDING' in c.status]
    
    total_profit = sum(c.profit for c in camp_objects)
    total_spend = sum(c.spend for c in camp_objects)
    overall_roas = sum(c.commission for c in camp_objects) / total_spend if total_spend > 0 else 0
    
    # OVERVIEW
    print(f"📊 OVERVIEW")
    print(f"   Campaigns analyzed: {len(camp_objects)}")
    print(f"   Total Spend: Rp {total_spend:,.0f}")
    print(f"   Total Profit: Rp {total_profit:,.0f}")
    print(f"   Overall ROAS: {overall_roas:.2f}x")
    print(f"   🏆 Winners: {len(winners)} | 💀 Boncos: {len(boncos)} | 👀 Watch: {len(watching)} | ⏳ Pending: {len(pending)}")
    print()
    
    # WINNERS
    if winners:
        print("🏆 WINNERS — Scale Opportunity")
        print("-" * 70)
        for i, w in enumerate(sorted(winners, key=lambda x: x.profit, reverse=True)[:5], 1):
            print(f"{i}. {w.name[:45]:<45} | Profit Rp {w.profit:>8,.0f} | ROAS {w.roas:.2f}x")
            print(f"   📋 {w.recommendation}")
        print()
    
    # BONCOS
    if boncos:
        print("💀 BONCOS — Action Required")
        print("-" * 70)
        for i, b in enumerate(sorted(boncos, key=lambda x: x.profit)[:5], 1):
            print(f"{i}. {b.name[:45]:<45} | Loss Rp {abs(b.profit):>7,.0f} | ROAS {b.roas:.2f}x")
            print(f"   📋 {b.recommendation}")
        print()
    
    # FATIGUE WARNINGS
    fatigued = [c for c in camp_objects if c.fatigue_score >= 1]
    if fatigued:
        print("🎨 CREATIVE FATIGUE ALERTS")
        print("-" * 70)
        for f in fatigued:
            icon = '🔴' if f.fatigue_score >= 2 else '🟡'
            print(f"{icon} {f.name[:50]:<50} | CTR: {f.ctr:.2f}% | CPC: Rp {f.cpc:,.0f}")
        print()
    
    # WATCH
    if watching:
        print("👀 WATCH LIST — Monitor Closely")
        print("-" * 70)
        for i, w in enumerate(sorted(watching, key=lambda x: x.spend, reverse=True)[:5], 1):
            print(f"{i}. {w.name[:45]:<45} | Spend Rp {w.spend:>7,.0f} | ROAS {w.roas:.2f}x")
            print(f"   📋 {w.recommendation}")
        print()
    
    # PENDING
    if pending:
        print(f"⏳ PENDING — Need More Data ({len(pending)} campaigns)")
        print("-" * 70)
        for i, p in enumerate(sorted(pending, key=lambda x: x.spend, reverse=True)[:5], 1):
            print(f"{i}. {p.name[:50]:<50} | Spend Rp {p.spend:>6,.0f} | {p.clicks:>3} clicks")
        print()
    
    # PRIORITY ACTIONS
    print("📋 PRIORITY ACTIONS TODAY")
    print("-" * 70)
    actions = []
    
    # Add boncos actions first
    for b in sorted(boncos, key=lambda x: x.profit)[:3]:
        if b.fatigue_score >= 2:
            actions.append(f"🔴 PAUSE + GANTI CREATIVE: {b.name[:40]} (Loss Rp {abs(b.profit):,.0f})")
        else:
            actions.append(f"🛑 PAUSE: {b.name[:40]} (ROAS {b.roas:.2f}x)")
    
    # Add scale actions
    for w in sorted(winners, key=lambda x: x.roas, reverse=True)[:3]:
        actions.append(f"🚀 SCALE: {w.name[:40]} (ROAS {w.roas:.2f}x)")
    
    # Add fatigue actions
    for f in fatigued[:2]:
        if f.fatigue_score >= 2:
            actions.append(f"🔄 NEW CREATIVE: {f.name[:40]} (Fatigue score {f.fatigue_score:.0f}/2)")
    
    if not actions:
        actions.append("✅ No urgent actions. Monitor all campaigns.")
    
    for i, action in enumerate(actions, 1):
        print(f"  {i}. {action}")
    
    print()
    print(f"{'='*70}")
    print(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')} | Decision Center v1.0")


def cmd_daily(account, days, min_spend):
    """Daily briefing - compact version of all commands"""
    print(f"📋 DAILY BRIEFING — {account['label']}")
    print(f"📅 {datetime.now().strftime('%d %B %Y')}")
    print()
    
    cmd_winner(account, days, min_spend)
    print()
    print("---")
    print()
    cmd_boncos(account, days, min_spend)
    print()
    print("---")
    print()
    cmd_fatigue(account, days)


# === MAIN ===
def main():
    parser = argparse.ArgumentParser(description='🎯 Campaign Decision Center')
    parser.add_argument('command', nargs='?', default='decide',
                       choices=['winner', 'boncos', 'scale', 'pending', 'fatigue', 'decide', 'daily'],
                       help='Command to run')
    parser.add_argument('--days', type=int, default=3, help='Days to analyze')
    parser.add_argument('--account', default='1041', help='Account key')
    parser.add_argument('--min-spend', type=int, default=0, help='Minimum spend filter')
    args = parser.parse_args()
    
    global TOKEN
    TOKEN = get_token()
    if not TOKEN:
        print("❌ No META_ACCESS_TOKEN")
        sys.exit(1)
    
    account = ACCOUNTS.get(args.account)
    if not account:
        print(f"❌ Unknown account: {args.account}")
        sys.exit(1)
    
    commands = {
        'winner': cmd_winner,
        'boncos': cmd_boncos,
        'scale': cmd_scale,
        'pending': cmd_pending,
        'fatigue': cmd_fatigue,
        'decide': cmd_decide,
        'daily': cmd_daily,
    }
    
    commands[args.command](account, args.days, args.min_spend)


if __name__ == '__main__':
    main()
