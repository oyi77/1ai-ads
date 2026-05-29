#!/usr/bin/env python3
"""
Shopee Report → FB Ads 1041 Sync Tool
Usage:
  python3 sync_1041_report.py --click report.csv --commission report.csv
  
This processes uploaded reports, updates governor thresholds,
and logs recommendations.
"""
import os
import csv, json, os, sys
from collections import defaultdict

ACCOUNT = "act_380721031313330"
GOVERNOR_SCRIPT = os.path.join(os.path.expanduser("~"), ".openclaw", "workspace", "scripts", "spend_monitor_1041.py")
STATE_FILE = "/tmp/ads_1041_governor_state.json"
LOG_DIR = os.path.join(os.path.expanduser("~"), ".openclaw", "workspace", "logs", "ads_1041_spend_sync.log")

def log(msg):
    ts = __import__('datetime').datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    with open(LOG_DIR, 'a') as f:
        f.write(f"[{ts}] {msg}\n")
    print(f"[{ts}] {msg}")

def parse_click_report(path):
    """Parse click report → tag counts, platform breakdown"""
    tag_clicks = defaultdict(int)
    tag_platform = defaultdict(lambda: defaultdict(int))
    platform_total = defaultdict(int)
    total = 0

    with open(path) as f:
        reader = csv.DictReader(f)
        for row in reader:
            tag = row['Tag_link'].strip('-').strip()
            platform = row['Perujuk']
            tag_clicks[tag] += 1
            tag_platform[tag][platform] += 1
            platform_total[platform] += 1
            total += 1

    return {'total': total, 'by_tag': dict(tag_clicks), 'by_platform': dict(platform_total), 'tag_platform': {t: dict(p) for t,p in tag_platform.items()}}

def parse_commission_report(path):
    """Parse commission report → tag stats, orders, platform breakdown"""
    tag_comm = defaultdict(float)
    tag_orders = defaultdict(int)
    tag_cvr = defaultdict(float)
    total_orders = 0
    total_comm = 0.0

    with open(path) as f:
        reader = csv.DictReader(f)
        for row in reader:
            comm = float(row.get('Komisi Bersih Affiliate (Rp)', '0') or '0')
            tag = (row.get('Tag_link1','') or '').strip('-').strip()
            if not tag: tag = 'unknown'
            tag_comm[tag] += comm
            tag_orders[tag] += 1
            total_orders += 1
            total_comm += comm

    return {'total_orders': total_orders, 'total_comm': total_comm, 'by_tag': {t: {'orders': tag_orders[t], 'comm': tag_comm[t]} for t in tag_orders}}

def generate_recommendations(clicks, commission):
    """Generate sync recommendations"""
    recs = {'scale': [], 'maintain': [], 'observe': [], 'kill': []}
    
    for tag in commission['by_tag']:
        t_data = commission['by_tag'][tag]
        t_clicks = clicks['by_tag'].get(tag, 0)
        orders = t_data['orders']
        comm = t_data['comm']
        cvr = orders / t_clicks * 100 if t_clicks > 0 else 0
        
        if comm > 500000: recs['scale'].append({'tag': tag, 'comm': comm, 'orders': orders, 'cvr': cvr})
        elif comm > 50000: recs['maintain'].append({'tag': tag, 'comm': comm, 'orders': orders, 'cvr': cvr})
        elif orders > 3: recs['observe'].append({'tag': tag, 'comm': comm, 'orders': orders, 'cvr': cvr})
        else: recs['kill'].append({'tag': tag, 'comm': comm, 'orders': orders, 'clicks': t_clicks})
    
    # Also check tags with clicks but no commission
    for tag, click_count in clicks['by_tag'].items():
        if tag not in commission['by_tag'] and click_count > 5:
            recs['kill'].append({'tag': tag, 'comm': 0, 'orders': 0, 'clicks': click_count, 'note': 'clicks only, 0 orders'})
    
    return recs

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='Sync Shopee Report → FB Ads 1041')
    parser.add_argument('--click', help='Click report CSV path')
    parser.add_argument('--commission', help='Commission report CSV path')
    args = parser.parse_args()

    if not args.click or not args.commission:
        print("Usage: python3 sync_1041_report.py --click report.csv --commission report.csv")
        sys.exit(1)

    log(f"📤 SHOPEE REPORT SYNC 1041 — Processing...")

    clicks = parse_click_report(args.click)
    commission = parse_commission_report(args.commission)
    recs = generate_recommendations(clicks, commission)

    log(f"✅ Click report: {clicks['total']} clicks, {len(clicks['by_tag'])} tags")
    log(f"✅ Commission report: {commission['total_orders']} orders, Rp {commission['total_comm']:,.0f}")

    print("\n" + "="*60)
    print("🎯 SYNC RECOMMENDATIONS")
    print("="*60)

    print("\n🚀 SCALE:")
    for r in recs['scale']:
        print(f"  🟢 {r['tag']}: Rp {r['comm']:,.0f} ({r['orders']} orders, CVR {r['cvr']:.1f}%)")

    print("\n✅ MAINTAIN:")
    for r in recs['maintain']:
        print(f"  🔵 {r['tag']}: Rp {r['comm']:,.0f} ({r['orders']} orders)")

    print("\n🟡 OBSERVE:")
    for r in recs['observe']:
        print(f"  🟡 {r['tag']}: Rp {r['comm']:,.0f} ({r['orders']} orders)")

    print("\n🔴 KILL:")
    for r in recs['kill']:
        note = f" ({r.get('note','')})" if r.get('note') else ""
        print(f"  🔴 {r['tag']}: {r['orders']} orders, Rp {r['comm']:,.0f} from {r['clicks']} clicks{note}")

    # Save report
    report = {
        'timestamp': __import__('datetime').datetime.now().isoformat(),
        'clicks': clicks,
        'commission': commission,
        'recommendations': {k: v for k, v in recs.items()}
    }
    report_path = os.path.join(os.path.expanduser("~"), ".openclaw", "workspace", "logs", f"ads_1041_sync_{__import__('datetime').datetime.now().strftime('%Y%m%d_%H%M%S')}.json")
    with open(report_path, 'w') as f:
        json.dump(report, f, indent=2)
    log(f"✅ Report saved to {report_path}")
