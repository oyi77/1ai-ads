#!/usr/bin/env python3
"""Analyze Perlengkapan Rumah products from Shopee affiliate reports."""

import csv
import json
from collections import defaultdict

COMMISSION_FILE = "/home/openclaw/projects/1ai-ads/data/shopee/AffiliateCommissionReport_202606090033.csv"
CLICK_FILE = "/home/openclaw/projects/1ai-ads/data/shopee/WebsiteClickReport202606090033.csv"

def load_csv(filepath):
    """Load CSV, handling the pipe-delimited format."""
    rows = []
    with open(filepath, 'r', encoding='utf-8') as f:
        reader = csv.reader(f)
        header = next(reader)
        # Strip any BOM or whitespace from header
        header = [h.strip() for h in header]
        for row in reader:
            if len(row) == len(header):
                rows.append(dict(zip(header, [c.strip() for c in row])))
            else:
                # Handle malformed rows - pad or truncate
                r = [c.strip() for c in row]
                if len(r) < len(header):
                    r.extend([''] * (len(header) - len(r)))
                else:
                    r = r[:len(header)]
                rows.append(dict(zip(header, r)))
    return header, rows

print("=" * 80)
print("ANALISIS PRODUK PERLENGKAPAN RUMAH - SHOPEE AFFILIATE")
print("=" * 80)

# Load commission report
print("\n[1] Loading AffiliateCommissionReport...")
comm_header, comm_rows = load_csv(COMMISSION_FILE)
print(f"    Columns: {len(comm_header)}")
print(f"    Total rows: {len(comm_rows)}")

# Load click report
print("\n[2] Loading WebsiteClickReport...")
click_header, click_rows = load_csv(CLICK_FILE)
print(f"    Columns: {len(click_header)}")
print(f"    Total rows: {len(click_rows)}")

# Filter for Perlengkapan Rumah
print("\n[3] Filtering for Perlengkapan Rumah...")
pr_rows = [r for r in comm_rows if r.get('L1 Kategori Global', '').strip() == 'Perlengkapan Rumah']
print(f"    Perlengkapan Rumah rows: {len(pr_rows)}")

# Group by product name
print("\n[4] Grouping by product name...")
products = defaultdict(lambda: {
    'total_orders': 0,
    'total_commission': 0.0,
    'total_purchase': 0.0,
    'total_quantity': 0,
    'taglinks': set(),
    'platforms': defaultdict(int),
    'stores': set(),
    'samples': []
})

for r in pr_rows:
    name = r.get('Nama Barange', '').strip()
    try:
        qty = int(r.get('Jumlah', '0'))
    except:
        qty = 0
    try:
        comm = float(r.get('Komisi Bersih Affiliate (Rp)', '0').replace(',', ''))
    except:
        comm = 0.0
    try:
        purchase = float(r.get('Nilai Pembelian(Rp)', '0').replace(',', ''))
    except:
        purchase = 0.0
    
    taglink = r.get('Tag_link1', '').strip()
    platform = r.get('Platform', '').strip()
    store = r.get('Nama Toko', '').strip()
    
    products[name]['total_orders'] += 1
    products[name]['total_commission'] += comm
    products[name]['total_purchase'] += purchase
    products[name]['total_quantity'] += qty
    if taglink:
        products[name]['taglinks'].add(taglink)
    if platform:
        products[name]['platforms'][platform] += 1
    if store:
        products[name]['stores'].add(store)
    
    if len(products[name]['samples']) < 3:
        products[name]['samples'].append({
            'order_id': r.get('ID Pemesanan', ''),
            'store': store,
            'taglink': taglink,
            'platform': platform,
            'qty': qty,
            'commission': comm,
            'purchase': purchase,
            'l2': r.get('L2 Kategori Global', ''),
            'l3': r.get('L3 Kategori Global', ''),
        })

# Also aggregate platform distribution from click report by taglink
print("\n[5] Aggregating platform distribution from click report...")
taglink_platforms = defaultdict(lambda: defaultdict(int))
for r in click_rows:
    taglink = r.get('Tag_link', '').strip()
    perujuk = r.get('Perujuk', '').strip()
    if taglink and perujuk:
        taglink_platforms[taglink][perujuk] += 1

# Map click platform data to products
for name, info in products.items():
    for tl in info['taglinks']:
        if tl in taglink_platforms:
            for plat, cnt in taglink_platforms[tl].items():
                info['platforms'][plat] += cnt

# Sort by total commission descending
sorted_products = sorted(products.items(), key=lambda x: x[1]['total_commission'], reverse=True)

print(f"\n[6] Found {len(sorted_products)} unique Perlengkapan Rumah products\n")

# Build output JSON
output = []
for name, info in sorted_products[:50]:  # Top 50
    plat_dist = dict(sorted(info['platforms'].items(), key=lambda x: x[1], reverse=True))
    entry = {
        'product_name': name,
        'total_orders': info['total_orders'],
        'total_quantity': info['total_quantity'],
        'total_purchase_rp': round(info['total_purchase']),
        'total_commission_rp': round(info['total_commission'], 2),
        'commission_per_order_rp': round(info['total_commission'] / info['total_orders'], 2) if info['total_orders'] > 0 else 0,
        'taglinks': list(info['taglinks']),
        'platform_distribution': plat_dist,
        'stores': list(info['stores']),
        'sample_order': info['samples'][0] if info['samples'] else None
    }
    output.append(entry)

# Print formatted table
print(f"{'#':>3} | {'Product Name':<65} | {'Orders':>6} | {'Commission (Rp)':>16} | {'Top Platform':>14} | {'Taglink':<20}")
print("-" * 150)
for i, entry in enumerate(output[:30], 1):
    top_plat = list(entry['platform_distribution'].keys())[0] if entry['platform_distribution'] else '-'
    taglinks_str = entry['taglinks'][0] if entry['taglinks'] else '-'
    name_trunc = entry['product_name'][:62] + '...' if len(entry['product_name']) > 65 else entry['product_name']
    print(f"{i:>3} | {name_trunc:<65} | {entry['total_orders']:>6} | {entry['total_commission_rp']:>16,.2f} | {top_plat:>14} | {taglinks_str:<20}")

# Summary stats
total_orders_all = sum(e['total_orders'] for e in output)
total_comm_all = sum(e['total_commission_rp'] for e in output)
total_purchase_all = sum(e['total_purchase_rp'] for e in output)
print(f"\n{'─' * 80}")
print(f"TOTAL ({len(output)} products): {total_orders_all} orders, Rp {total_comm_all:,.2f} commission, Rp {total_purchase_all:,.0f} purchase value")

# Save to JSON
output_file = "/home/openclaw/projects/1ai-ads/perlengkapan_rumah_top_products.json"
with open(output_file, 'w', encoding='utf-8') as f:
    json.dump(output[:30], f, ensure_ascii=False, indent=2)
print(f"\n[JSON saved to {output_file}]")

# Also print full JSON to stdout
print("\n\n=== FULL JSON OUTPUT ===")
print(json.dumps(output[:20], ensure_ascii=False, indent=2))
