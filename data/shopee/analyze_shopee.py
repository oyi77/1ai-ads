#!/usr/bin/env python3
"""Comprehensive Shopee Affiliate Profitability Analysis for Nyamiresep 1041"""
import csv
import sys
from collections import defaultdict
from datetime import datetime

BASE = '/home/openclaw/projects/1ai-ads/data/shopee'

FILES = {
    'comm_jun7': f'{BASE}/2026-06-07_kakriput_commission.csv',
    'clicks_jun7': f'{BASE}/2026-06-07_kakriput_clicks.csv',
    'comm_jun9': f'{BASE}/AffiliateCommissionReport_202606090033.csv',
    'clicks_jun9': f'{BASE}/WebsiteClickReport202606090033.csv',
}

def clean_tag(tag):
    """Normalize taglink: strip ---- suffix and whitespace"""
    if tag is None:
        return None
    tag = tag.strip()
    while tag.endswith('-'):
        tag = tag[:-1]
    return tag.strip()

def load_commission(path):
    """Load commission CSV, return list of dicts with normalized taglinks"""
    rows = []
    with open(path, encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for row in reader:
            # Parse commission value
            try:
                comm = float(row.get('Total Komisi per Produk(Rp)', 0) or 0)
            except ValueError:
                comm = 0.0
            try:
                purchase = float(row.get('Nilai Pembelian(Rp)', 0) or 0)
            except ValueError:
                purchase = 0.0
            
            # Collect all taglinks 1-5
            taglinks = []
            for i in range(1, 6):
                tl = row.get(f'Tag_link{i}', '').strip()
                if tl:
                    taglinks.append(clean_tag(tl))
            
            rows.append({
                'order_id': row.get('ID Pemesanan', ''),
                'status': row.get('Status Pesanan', ''),
                'store': row.get('Nama Toko', ''),
                'product': row.get('Nama Barange', ''),
                'commission': comm,
                'purchase_value': purchase,
                'taglinks': taglinks,
                'platform': row.get('Platform', 'Others').strip(),
                'date': row.get('Waktu Pemesanan', ''),
            })
    return rows

def load_clicks(path):
    """Load click CSV, return list of dicts with normalized taglinks"""
    rows = []
    with open(path, encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for row in reader:
            tl = clean_tag(row.get('Tag_link', ''))
            if tl:
                rows.append({
                    'click_id': row.get('Klik ID', ''),
                    'taglink': tl,
                    'platform': row.get('Perujuk', 'Others').strip(),
                    'time': row.get('Waktu Klik', ''),
                })
    return rows

def main():
    print("=" * 100)
    print("  SHOPEE AFFILIATE PROFITABILITY ANALYSIS — Nyamiresep 1041")
    print("  Data Period: June 7–9, 2026")
    print("=" * 100)
    print()
    
    # =============================================
    # LOAD ALL DATA
    # =============================================
    print("[*] Loading commission data...")
    comm_jun7 = load_commission(FILES['comm_jun7'])
    comm_jun9 = load_commission(FILES['comm_jun9'])
    all_comm = comm_jun7 + comm_jun9
    print(f"    June 7 commission:  {len(comm_jun7)} rows")
    print(f"    June 9 commission:  {len(comm_jun9)} rows")
    print(f"    TOTAL commission:   {len(all_comm)} rows")
    print()
    
    print("[*] Loading click data...")
    clicks_jun7 = load_clicks(FILES['clicks_jun7'])
    clicks_jun9 = load_clicks(FILES['clicks_jun9'])
    all_clicks = clicks_jun7 + clicks_jun9
    print(f"    June 7 clicks:  {len(clicks_jun7)} rows")
    print(f"    June 9 clicks:  {len(clicks_jun9)} rows")
    print(f"    TOTAL clicks:   {len(all_clicks)} rows")
    print()
    
    # =============================================
    # BUILD AGGREGATIONS
    # =============================================
    
    # --- Status breakdown ---
    status_counts = defaultdict(lambda: {'orders': 0, 'commission': 0.0})
    for row in all_comm:
        s = row['status']
        status_counts[s]['orders'] += 1
        status_counts[s]['commission'] += row['commission']
    
    # --- Taglink-level aggregation ---
    # For commission: each order can have multiple taglinks (1-5).
    # We attribute the full commission to EACH taglink for the taglink report.
    # For taglink commission totals, we sum commissions across orders that use that tag.
    taglink_comm = defaultdict(lambda: {
        'total_commission': 0.0,
        'confirmed_commission': 0.0,
        'orders': 0,
        'confirmed_orders': 0,
        'total_purchase': 0.0,
        'platforms': defaultdict(int),
        'products': defaultdict(lambda: {'commission': 0.0, 'store': '', 'platform': ''}),
    })
    
    for row in all_comm:
        # Skip cancelled orders for commission calculations
        if row['status'] == 'Dibatalkan':
            continue
        for tl in row['taglinks']:
            if not tl:
                continue
            taglink_comm[tl]['total_commission'] += row['commission']
            taglink_comm[tl]['orders'] += 1
            taglink_comm[tl]['total_purchase'] += row['purchase_value']
            taglink_comm[tl]['platforms'][row['platform']] += 1
            
            if row['status'] == 'Selesai':
                taglink_comm[tl]['confirmed_commission'] += row['commission']
                taglink_comm[tl]['confirmed_orders'] += 1
            
            # Track top products per taglink
            pname = row['product'][:80]  # truncate for readability
            taglink_comm[tl]['products'][pname]['commission'] += row['commission']
            taglink_comm[tl]['products'][pname]['store'] = row['store']
            taglink_comm[tl]['products'][pname]['platform'] = row['platform']
    
    # --- Click aggregation by taglink ---
    taglink_clicks = defaultdict(lambda: {
        'clicks': 0,
        'platforms': defaultdict(int),
    })
    for click in all_clicks:
        tl = click['taglink']
        taglink_clicks[tl]['clicks'] += 1
        taglink_clicks[tl]['platforms'][click['platform']] += 1
    
    # --- Product-level aggregation ---
    product_data = defaultdict(lambda: {
        'total_commission': 0.0,
        'confirmed_commission': 0.0,
        'orders': 0,
        'confirmed_orders': 0,
        'stores': set(),
        'platform': '',
    })
    for row in all_comm:
        if row['status'] == 'Dibatalkan':
            continue
        key = (row['product'][:100], row['store'])
        product_data[key]['total_commission'] += row['commission']
        product_data[key]['orders'] += 1
        product_data[key]['stores'].add(row['store'])
        if row['status'] == 'Selesai':
            product_data[key]['confirmed_commission'] += row['commission']
            product_data[key]['confirmed_orders'] += 1
        product_data[key]['platform'] = row['platform']
    
    # --- Store-level aggregation ---
    store_data = defaultdict(lambda: {
        'commission': 0.0,
        'orders': 0,
        'products': set(),
    })
    for row in all_comm:
        if row['status'] == 'Dibatalkan':
            continue
        store_data[row['store']]['commission'] += row['commission']
        store_data[row['store']]['orders'] += 1
        store_data[row['store']]['products'].add(row['product'][:80])
    
    # --- Platform aggregation ---
    platform_comm = defaultdict(lambda: {'commission': 0.0, 'orders': 0, 'confirmed': 0})
    for row in all_comm:
        if row['status'] == 'Dibatalkan':
            continue
        p = row['platform']
        platform_comm[p]['commission'] += row['commission']
        platform_comm[p]['orders'] += 1
        if row['status'] == 'Selesai':
            platform_comm[p]['confirmed'] += 1
    
    platform_clicks = defaultdict(int)
    for click in all_clicks:
        p = click['platform']
        platform_clicks[p] += 1
    
    # =============================================
    # SECTION 1: TOP 20 TAGLINKS
    # =============================================
    print("-" * 100)
    print("1. TOP 20 TAGLINKS by Total Commission")
    print("-" * 100)
    
    # Sort taglinks by total commission
    sorted_taglinks = sorted(taglink_comm.items(), key=lambda x: x[1]['total_commission'], reverse=True)
    
    print(f"{'Rank':<6} {'Taglink':<28} {'Total Comm':<14} {'Conf Comm':<14} {'Orders':<8} {'Clicks':<8} {'CVR%':<8} {'Avg Order':<14} {'Top Platform'}")
    print("-" * 100)
    
    taglink_rankings = []
    for rank, (tl, data) in enumerate(sorted_taglinks[:20], 1):
        clicks = taglink_clicks.get(tl, {}).get('clicks', 0)
        cvr = (data['orders'] / clicks * 100) if clicks > 0 else 0
        avg_order = (data['total_purchase'] / data['orders']) if data['orders'] > 0 else 0
        
        # Find top platform
        top_plat = max(data['platforms'], key=data['platforms'].get) if data['platforms'] else 'N/A'
        
        print(f"{rank:<6} {tl:<28} {data['total_commission']:<14,.0f} {data['confirmed_commission']:<14,.0f} "
              f"{data['orders']:<8} {clicks:<8} {cvr:<8.2f} {avg_order:<14,.0f} {top_plat}")
        
        taglink_rankings.append((tl, data))
    
    print()
    
    # =============================================
    # SECTION 2: TOP 20 PRODUCTS
    # =============================================
    print("-" * 100)
    print("2. TOP 20 PRODUCTS by Total Commission")
    print("-" * 100)
    
    sorted_products = sorted(product_data.items(), key=lambda x: x[1]['total_commission'], reverse=True)
    
    print(f"{'Rank':<6} {'Product':<55} {'Store':<25} {'Total Comm':<14} {'Orders':<8} {'Conf Amt':<14} {'Platform'}")
    print("-" * 100)
    
    for rank, ((pname, store), data) in enumerate(sorted_products[:20], 1):
        pshort = pname if len(pname) <= 52 else pname[:49] + '...'
        store_short = store if len(store) <= 22 else store[:19] + '...'
        print(f"{rank:<6} {pshort:<55} {store_short:<25} {data['total_commission']:<14,.0f} "
              f"{data['orders']:<8} {data['confirmed_commission']:<14,.0f} {data['platform']}")
    
    print()
    
    # =============================================
    # SECTION 3: TOP 10 STORES
    # =============================================
    print("-" * 100)
    print("3. TOP 10 STORES by Commission")
    print("-" * 100)
    
    sorted_stores = sorted(store_data.items(), key=lambda x: x[1]['commission'], reverse=True)
    
    print(f"{'Store':<35} {'Commission':<16} {'Orders':<10} {'Products'}")
    print("-" * 100)
    
    for rank, (store, data) in enumerate(sorted_stores[:10], 1):
        store_short = store if len(store) <= 32 else store[:29] + '...'
        print(f"{store_short:<35} Rp{data['commission']:<12,.0f} {data['orders']:<10} {len(data['products'])}")
    
    print()
    
    # =============================================
    # SECTION 4: PLATFORM BREAKDOWN
    # =============================================
    print("-" * 100)
    print("4. PLATFORM PERFORMANCE BREAKDOWN")
    print("-" * 100)
    
    # Group: Facebook, Instagram, Others (everything else)
    platform_groups = {'Facebook': 'Facebook', 'Instagram': 'Instagram'}
    group_data = defaultdict(lambda: {'clicks': 0, 'orders': 0, 'commission': 0.0, 'confirmed': 0})
    
    for p, count in platform_clicks.items():
        group = platform_groups.get(p, 'Others')
        group_data[group]['clicks'] += count
    
    for p, data in platform_comm.items():
        group = platform_groups.get(p, 'Others')
        group_data[group]['orders'] += data['orders']
        group_data[group]['commission'] += data['commission']
        group_data[group]['confirmed'] += data['confirmed']
    
    print(f"{'Platform':<20} {'Clicks':<12} {'Orders':<10} {'Commission':<16} {'CVR%':<10}")
    print("-" * 70)
    
    for group in ['Facebook', 'Instagram', 'Others']:
        d = group_data[group]
        cvr = (d['orders'] / d['clicks'] * 100) if d['clicks'] > 0 else 0
        print(f"{group:<20} {d['clicks']:<12,} {d['orders']:<10} Rp{d['commission']:<12,.0f} {cvr:<10.2f}")
    
    print()
    
    # Also show detailed per-platform
    print("  Detailed Platform Breakdown:")
    print(f"  {'Platform':<20} {'Clicks':<12} {'Orders':<10} {'Commission':<16} {'CVR%':<10}")
    print("  " + "-" * 68)
    
    all_platforms_merged = set(list(platform_clicks.keys()) + list(platform_comm.keys()))
    for p in sorted(all_platforms_merged):
        clicks = platform_clicks.get(p, 0)
        d = platform_comm.get(p, {'orders': 0, 'commission': 0.0})
        cvr = (d['orders'] / clicks * 100) if clicks > 0 else 0
        print(f"  {p:<20} {clicks:<12,} {d['orders']:<10} Rp{d['commission']:<12,.0f} {cvr:<10.2f}")
    
    print()
    
    # =============================================
    # SECTION 5: TOP 3 PRODUCTS PER TAGLINK
    # =============================================
    print("-" * 100)
    print("5. TOP 3 PRODUCTS per Taglink (for Top 20 Taglinks)")
    print("-" * 100)
    
    for rank, (tl, data) in enumerate(taglink_rankings, 1):
        print(f"\n  {rank}. {tl} (Total Comm: Rp{data['total_commission']:,.0f})")
        sorted_prods = sorted(data['products'].items(), key=lambda x: x[1]['commission'], reverse=True)
        for prank, (pname, pdata) in enumerate(sorted_prods[:3], 1):
            store_s = pdata['store'][:30]
            print(f"     {prank}. {pname[:55]} | Store: {store_s} | "
                  f"Comm: Rp{pdata['commission']:,.0f}")
    
    print()
    
    # =============================================
    # SECTION 6: CVR ANALYSIS
    # =============================================
    print("-" * 100)
    print("6. CVR ANALYSIS — Taglinks with Best Click-to-Order Conversion")
    print("-" * 100)
    
    # Build CVR for all taglinks with at least 10 clicks
    cvr_data = []
    for tl in taglink_comm:
        orders = taglink_comm[tl]['orders']
        clicks = taglink_clicks.get(tl, {}).get('clicks', 0)
        if clicks >= 5:  # minimum threshold
            cvr = orders / clicks * 100
            cvr_data.append((tl, orders, clicks, cvr, taglink_comm[tl]['total_commission']))
    
    cvr_data.sort(key=lambda x: x[3], reverse=True)
    
    print(f"{'Rank':<6} {'Taglink':<28} {'Orders':<10} {'Clicks':<10} {'CVR%':<10} {'Commission':<14}")
    print("-" * 78)
    
    for rank, (tl, orders, clicks, cvr, comm) in enumerate(cvr_data[:15], 1):
        print(f"{rank:<6} {tl:<28} {orders:<10} {clicks:<10} {cvr:<10.2f} Rp{comm:<10,.0f}")
    
    print()
    
    # Also show taglinks with most orders (volume leaders)
    print("  Volume Leaders (Most Orders):")
    vol_data = [(tl, taglink_comm[tl]['orders'], taglink_clicks.get(tl, {}).get('clicks', 0),
                 taglink_comm[tl]['total_commission']) for tl in taglink_comm
                if taglink_clicks.get(tl, {}).get('clicks', 0) > 0]
    vol_data.sort(key=lambda x: x[1], reverse=True)
    
    print(f"{'Rank':<6} {'Taglink':<28} {'Orders':<10} {'Clicks':<10} {'CVR%':<12} {'Commission':<14}")
    print("-" * 80)
    for rank, (tl, orders, clicks, comm) in enumerate(vol_data[:15], 1):
        cvr = orders / clicks * 100 if clicks > 0 else 0
        print(f"{rank:<6} {tl:<28} {orders:<10} {clicks:<10} {cvr:<12.2f} Rp{comm:<10,.0f}")
    
    print()
    
    # =============================================
    # SECTION 7: STATUS SUMMARY
    # =============================================
    print("-" * 100)
    print("7. STATUS SUMMARY — Overall Performance")
    print("-" * 100)
    
    total_commission = sum(row['commission'] for row in all_comm if row['status'] != 'Dibatalkan')
    total_orders = sum(1 for row in all_comm if row['status'] != 'Dibatalkan')
    total_clicks = len(all_clicks)
    
    confirmed_commission = sum(row['commission'] for row in all_comm if row['status'] == 'Selesai')
    pending_commission = sum(row['commission'] for row in all_comm if row['status'] == 'Tertunda')
    unpaid_commission = sum(row['commission'] for row in all_comm if row['status'] == 'Belum Dibayar')
    cancelled_count = sum(1 for row in all_comm if row['status'] == 'Dibatalkan')
    cancelled_commission = sum(row['commission'] for row in all_comm if row['status'] == 'Dibatalkan')
    
    confirmed_orders = sum(1 for row in all_comm if row['status'] == 'Selesai')
    pending_orders = sum(1 for row in all_comm if row['status'] == 'Tertunda')
    unpaid_orders = sum(1 for row in all_comm if row['status'] == 'Belum Dibayar')
    
    print(f"  {'Metric':<35} {'Value':<20} {'Notes'}")
    print(f"  {'-'*80}")
    print(f"  {'Total Clicks (all taglinks)':<35} {total_clicks:<20,}")
    print(f"  {'Total Orders (excl. cancelled)':<35} {total_orders:<20,}")
    print(f"  {'Overall CVR (orders/clicks)':<35} {(total_orders/total_clicks*100):<20.2f}%")
    print(f"  {'Total Commission (active orders)':<35} Rp{total_commission:<16,.0f}")
    print(f"  {'Avg Commission per Order':<35} Rp{(total_commission/total_orders):<16,.0f}" if total_orders > 0 else "N/A")
    print()
    
    # Status breakdown table
    print(f"  {'Status':<20} {'Orders':<12} {'Commission':<20} {'% of Total'}")
    print(f"  {'-'*62}")
    
    status_map = {
        'Selesai': ('Confirmed/Settled', confirmed_orders, confirmed_commission),
        'Tertunda': ('Pending', pending_orders, pending_commission),
        'Belum Dibayar': ('Unpaid', unpaid_orders, unpaid_commission),
    }
    
    for status, (label, cnt, comm) in status_map.items():
        pct = (comm / total_commission * 100) if total_commission > 0 else 0
        print(f"  {label:<20} {cnt:<12} Rp{comm:<16,.0f} {pct:<6.1f}%")
    
    print(f"  {'Cancelled (excluded)':<20} {cancelled_count:<12} Rp{cancelled_commission:<16,.0f} "
          f"{(cancelled_commission/(total_commission+cancelled_commission)*100):<6.1f}%")
    
    print()
    print(f"  {'Net Effective Commission (Confirmed)':<35} Rp{confirmed_commission:<16,.0f}")
    print(f"  {'Pending Commission (at risk)':<35} Rp{pending_commission:<16,.0f}")
    print(f"  {'Total Potential (confirmed + pending)':<35} Rp{(confirmed_commission+pending_commission):<16,.0f}")
    print()
    
    # =============================================
    # Date range check
    # =============================================
    print("-" * 100)
    print("DATA FOOTER")
    print("-" * 100)
    
    dates = sorted([row['date'][:10] for row in all_comm if row['date'] and row['status'] != 'Dibatalkan'])
    if dates:
        print(f"  Order date range: {dates[0]} to {dates[-1]}")
    print(f"  Total files analyzed: 4")
    print(f"  Analysis generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print()
    print("=" * 100)
    print("  END OF REPORT")
    print("=" * 100)

if __name__ == '__main__':
    main()
