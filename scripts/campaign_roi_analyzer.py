#!/usr/bin/env python3
"""
VILONA CAMPAIGN ROI ANALYZER v1
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Menganalisa performa campaign Facebook Ads vs data Shopee:
- Match campaign spend & CPC (FB) dengan order & komisi (Shopee)
- Hitung ROI per campaign
- Tandai PROFITABLE / BUSUK / BREAKEVEN
- Generate laporan detail seperti yang diminta Veris
"""

import urllib.request, json, csv, os, sys, time
from datetime import datetime, timedelta
from collections import defaultdict, Counter

ACCOUNT = "act_380721031313330"
BASE = "https://graph.facebook.com/v19.0"

# Read token from working daemon config
TOKEN = None
_token_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'spend_monitor_1041.py')
try:
    with open(_token_path) as f:
        for line in f:
            if line.startswith('TOKEN = '):
                TOKEN = line.split('"')[1]
                break
except Exception:
    pass

if not TOKEN:
    print("❌ Cannot read token from spend_monitor_1041.py")
    sys.exit(1)
WORKSPACE = os.path.expanduser("~/.openclaw/workspace")
MEDIA_DIR = os.path.expanduser("~/.openclaw/media/inbound")
REPORT_DIR = os.path.join(WORKSPACE, "reports")

# === TAG MAPPING: campaign name keywords → shopee tags ===
TAG_PATTERNS = {
    'rakdapur3': ['rakdapur3', 'rakdapur', 'rak dapur', 'rak_dapur', 'RakDapur', 'Rak_Dapur'],
    'wooristoragebox': ['wooristoragebox', 'woori'],
    'rakslidingkomen': ['raksliding', 'slidingkomen'],
    'katalog-rak': ['katalog-rak', 'katalog rak'],
    'postbridge-rakpiringslider': ['postbridge', 'rakpiring'],
    'website': ['website'],
    'sofaarabian': ['sofaarabian', 'sofa arabian'],
}

def api(url):
    req = urllib.request.Request(url)
    resp = urllib.request.urlopen(req, timeout=20)
    return json.loads(resp.read())

def detect_tag(campaign_name):
    """Detect Shopee tag from campaign name"""
    for tag, patterns in TAG_PATTERNS.items():
        for pat in patterns:
            if pat.lower() in campaign_name.lower():
                return tag
    return 'rakdapur3'  # default fallback

def get_campaign_data(days=1):
    """Get campaign spend + CPC data from FB API"""
    campaigns = {}
    
    # Get active + paused campaigns
    for status_filter in ['ACTIVE', 'PAUSED']:
        url = f"{BASE}/{ACCOUNT}/campaigns?fields=name,id,status&effective_status=[\"{status_filter}\"]&limit=100&access_token={TOKEN}"
        try:
            data = api(url)
            for c in data.get('data', []):
                cid = c['id']
                name = c['name']
                campaigns[cid] = {
                    'name': name,
                    'status': c.get('status', '?'),
                    'tag': detect_tag(name),
                    'spend': 0, 'cpc': 0, 'ctr': 0, 'impressions': 0, 'clicks': 0
                }
        except Exception as e:
            print(f"  ⚠️ FB API error: {e}")
            continue
    
    # Get insights for each campaign
    date_presets = ['today'] if days == 1 else ['today', 'yesterday']
    
    for cid in list(campaigns.keys()):
        for preset in date_presets:
            try:
                iurl = f"{BASE}/{cid}/insights?date_preset={preset}&fields=spend,cpc,ctr,impressions,clicks&access_token={TOKEN}"
                data = api(iurl)
                ins = data.get('data', [{}])[0] if data.get('data') else {}
                campaigns[cid]['spend'] += float(ins.get('spend', 0) or 0)
                campaigns[cid]['impressions'] += int(ins.get('impressions', 0) or 0)
                campaigns[cid]['clicks'] += int(ins.get('clicks', 0) or 0)
                if ins.get('cpc'):
                    campaigns[cid]['cpc'] = float(ins.get('cpc', 0))
                if ins.get('ctr'):
                    campaigns[cid]['ctr'] = float(ins.get('ctr', 0))
            except Exception:
                pass
            time.sleep(0.15)
    
    return campaigns

def load_shopee_data(date_str=None):
    """Load Shopee CSV files from media/inbound for specific date"""
    if not date_str:
        date_str = datetime.now().strftime('%Y%m%d')
    
    # Find files, pick largest (most data)
    click_files = sorted(
        [f for f in os.listdir(MEDIA_DIR) if 'WebsiteClick' in f],
        key=lambda f: os.path.getsize(os.path.join(MEDIA_DIR, f)), reverse=True
    )
    order_files = sorted(
        [f for f in os.listdir(MEDIA_DIR) if 'AffiliateCommission' in f],
        key=lambda f: os.path.getsize(os.path.join(MEDIA_DIR, f)), reverse=True
    )
    
    clicks = []
    orders = []
    
    if click_files:
        fpath = os.path.join(MEDIA_DIR, click_files[0])
        print(f"   📂 Clicks: {click_files[0][:50]}... ({os.path.getsize(fpath):,} bytes)")
        with open(fpath, encoding='utf-8-sig') as f:
            clicks = list(csv.DictReader(f))
    
    if order_files:
        fpath = os.path.join(MEDIA_DIR, order_files[0])
        print(f"   📂 Orders: {order_files[0][:50]}... ({os.path.getsize(fpath):,} bytes)")
        with open(fpath, encoding='utf-8-sig') as f:
            orders = list(csv.DictReader(f))
    
    return clicks, orders

def match_campaigns_to_shopee(campaigns, orders):
    """Match Shopee orders to campaigns by tag"""
    # Group orders by tag
    tag_orders = defaultdict(list)
    tag_commission = defaultdict(float)
    
    for o in orders:
        status = o.get('Status Pesanan', '')
        if status in ['Dibatalkan']:
            continue
        tag = o.get('Tag_link1', '').strip()
        comm = float(o.get('Komisi Bersih Affiliate (Rp)', '0') or 0)
        tag_orders[tag].append(o)
        tag_commission[tag] += comm
    
    # Calculate total rakdapur3 spend for proportional distribution
    rd3_total_spend = sum(c['spend'] for c in campaigns.values() if c['tag'] == 'rakdapur3' and c['spend'] > 0)
    rd3_total_comm = tag_commission.get('rakdapur3', 0)
    rd3_total_orders = len(tag_orders.get('rakdapur3', []))
    
    # Assign to campaigns
    for cid, camp in campaigns.items():
        tag = camp['tag']
        if tag == 'rakdapur3' and camp['spend'] > 0 and rd3_total_spend > 0:
            # Proportional distribution based on spend share
            share = camp['spend'] / rd3_total_spend
            camp['shopee_orders'] = int(rd3_total_orders * share)
            camp['shopee_commission'] = rd3_total_comm * share
        elif tag == 'rakdapur3':
            camp['shopee_orders'] = 0
            camp['shopee_commission'] = 0
        else:
            camp['shopee_orders'] = len(tag_orders.get(tag, []))
            camp['shopee_commission'] = tag_commission.get(tag, 0)
        
        # Calculate ROI
        if camp['spend'] > 0 and camp['shopee_commission'] > 0:
            camp['roi'] = camp['shopee_commission'] / camp['spend']
        elif camp['spend'] > 0:
            camp['roi'] = 0
        else:
            camp['roi'] = 0
        
        # Label based on CPC + CTR (campaign efficiency)
        if camp['spend'] == 0:
            camp['label'] = '⏳ NO SPEND'
        elif camp['cpc'] > 130:
            camp['label'] = '💀 BUSUK (CPC)'
        elif camp['cpc'] < 100 and camp['ctr'] >= 5:
            camp['label'] = '🔥 EFISIEN'
        elif camp['cpc'] < 130 and camp['ctr'] >= 3:
            camp['label'] = '✅ JALAN'
        elif camp['ctr'] < 2:
            camp['label'] = '💀 BUSUK (CTR)'
        else:
            camp['label'] = '⚠️ PANTAU'
        
        camp['profit'] = camp['shopee_commission'] - camp['spend']

def generate_report(campaigns, days=1):
    """Generate detailed per-campaign ROI report"""
    now = datetime.now()
    date_str = (now - timedelta(days=1)).strftime('%d %b %Y') if days == 1 else f"{(now-timedelta(days=days)).strftime('%d %b')} - {now.strftime('%d %b %Y')}"
    
    # Sort: profitable first, then by spend
    sorted_camps = sorted(campaigns.items(), 
                         key=lambda x: (x[1]['label'] != '🔥 PROFITABLE', -x[1]['roi'], -x[1]['spend']))
    
    lines = []
    lines.append("=" * 100)
    lines.append(f"  📊 LAPORAN ROI CAMPAIGN — AKUN 1041 (Nyamiresep)")
    lines.append(f"  📅 Periode: {date_str}")
    lines.append(f"  🕐 Generated: {now.strftime('%d %b %Y %H:%M WIB')}")
    lines.append("=" * 100)
    
    # Summary
    total_spend = sum(c['spend'] for _, c in sorted_camps)
    total_comm = sum(c['shopee_commission'] for _, c in sorted_camps)
    total_profit = total_comm - total_spend
    total_roi = total_comm / total_spend if total_spend > 0 else 0
    
    efisien = sum(1 for _, c in sorted_camps if 'EFISIEN' in c['label'])
    jalan = sum(1 for _, c in sorted_camps if c['label'] == '✅ JALAN')
    busuk = sum(1 for _, c in sorted_camps if 'BUSUK' in c['label'])
    pantau = sum(1 for _, c in sorted_camps if 'PANTAU' in c['label'])
    nospend = sum(1 for _, c in sorted_camps if 'NO SPEND' in c['label'])
    
    lines.append("")
    lines.append(f"  💰 TOTAL SPEND:    Rp {total_spend:>12,.0f}")
    lines.append(f"  💵 TOTAL KOMISI:   Rp {total_comm:>12,.0f}")
    lines.append(f"  📈 TOTAL PROFIT:   Rp {total_profit:>12,.0f}  ({'✅ UNTUNG' if total_profit > 0 else '❌ RUGI'})")
    lines.append(f"  🎯 ROI KESELURUHAN: {total_roi:.2f}x")
    lines.append("")
    lines.append(f"  🔥 EFISIEN: {efisien}  |  ✅ JALAN: {jalan}  |  ⚠️ PANTAU: {pantau}  |  💀 BUSUK: {busuk}  |  ⏳ NO SPEND: {nospend}")
    lines.append("")
    
    # Table header
    lines.append("-" * 100)
    lines.append(f"  {'CAMPAIGN':<38s} {'CPC':>6s} {'CTR':>6s} {'SPEND':>10s} {'ORDER':>6s} {'KOMISI':>10s} {'ROI':>6s} {'LABEL':>12s}")
    lines.append("-" * 100)
    
    # Campaign rows
    for cid, c in sorted_camps:
        name = c['name'][:36]
        spend_s = f"Rp {c['spend']:,.0f}" if c['spend'] > 0 else "Rp 0"
        comm_s = f"Rp {c['shopee_commission']:,.0f}" if c['shopee_commission'] > 0 else "Rp 0"
        orders = c['shopee_orders']
        
        cpc_str = f"Rp {c['cpc']:.0f}" if c['cpc'] > 0 else "-"
        ctr_str = f"{c['ctr']:.1f}%" if c['ctr'] > 0 else "-"
        spend_str = spend_s if c['spend'] > 0 else "-"
        order_str = str(orders) if orders > 0 else "-"
        comm_str = f"Rp {c['shopee_commission']:,.0f}" if c['shopee_commission'] > 0 else "-"
        roi_str = f"{c['roi']:.1f}x" if c['roi'] > 0 else "-"
        
        lines.append(f"  {name:<38s} {cpc_str:>6s} {ctr_str:>6s} {spend_str:>10s} {order_str:>6s} {comm_str:>10s} {roi_str:>6s} {c['label']:>12s}")
    
    lines.append("-" * 100)
    lines.append(f"  TOTAL: {len(sorted_camps)} campaigns | Spend: Rp {total_spend:,.0f} | Komisi: Rp {total_comm:,.0f} | ROI: {total_roi:.2f}x")
    lines.append("=" * 100)
    
    # Recommendations
    lines.append("")
    lines.append("  📋 REKOMENDASI:")
    
    # Find campaigns to kill
    busuk_camps = [(cid, c) for cid, c in sorted_camps if 'BUSUK' in c['label']]
    if busuk_camps:
        lines.append("")
        lines.append(f"  💀 BUANG / PAUSE ({len(busuk_camps)} campaign boros):")
        for cid, c in busuk_camps[:10]:
            reason = c['label'].replace('💀 ','').replace('BUSUK ','')  
            lines.append(f"     ❌ {c['name'][:55]} | CPC: Rp{c['cpc']:.0f} | CTR: {c['ctr']:.1f}% | Spend: Rp {c['spend']:,.0f}")
    
    efisien_camps = [(cid, c) for cid, c in sorted_camps if 'EFISIEN' in c['label']]
    if efisien_camps:
        lines.append("")
        lines.append(f"  🔥 SCALE UP ({len(efisien_camps)} campaign efisien):")
        for cid, c in efisien_camps[:10]:
            lines.append(f"     ✅ {c['name'][:55]} | CPC: Rp{c['cpc']:.0f} | CTR: {c['ctr']:.1f}% | Spend: Rp {c['spend']:,.0f}")
    
    lines.append("")
    lines.append("=" * 100)
    
    return "\n".join(lines)

def main():
    days = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    print("🔍 Fetching Facebook campaign data...")
    campaigns = get_campaign_data(days)
    print(f"   Found {len(campaigns)} campaigns")
    
    print("📦 Loading Shopee data...")
    clicks, orders = load_shopee_data()
    print(f"   {len(clicks)} clicks, {len(orders)} order items")
    
    print("🔗 Matching campaigns to Shopee orders...")
    match_campaigns_to_shopee(campaigns, orders)
    
    print("📊 Generating report...")
    report = generate_report(campaigns, days)
    
    os.makedirs(REPORT_DIR, exist_ok=True)
    filename = os.path.join(REPORT_DIR, f"campaign_roi_report_{datetime.now().strftime('%Y%m%d_%H%M')}.txt")
    with open(filename, 'w') as f:
        f.write(report)
    
    print(report)
    print(f"\n📁 Saved: {filename}")

if __name__ == '__main__':
    main()
