#!/usr/bin/env python3
"""Deep dive into Perlengkapan Rumah - products with highest order volume."""
import csv
import json
from collections import defaultdict

COMMISSION_FILE = "/home/openclaw/projects/1ai-ads/data/shopee/AffiliateCommissionReport_202606090033.csv"

def load_csv(filepath):
    rows = []
    with open(filepath, 'r', encoding='utf-8') as f:
        reader = csv.reader(f)
        header = [h.strip() for h in next(reader)]
        for row in reader:
            r = [c.strip() for c in row]
            if len(r) < len(header):
                r.extend([''] * (len(header) - len(r)))
            else:
                r = r[:len(header)]
            rows.append(dict(zip(header, r)))
    return header, rows

_, rows = load_csv(COMMISSION_FILE)

# Filter Perlengkapan Rumah
pr = [r for r in rows if r.get('L1 Kategori Global', '').strip() == 'Perlengkapan Rumah']
print(f"Total Perlengkapan Rumah records: {len(pr)}")

# Group exactly by product name
products = defaultdict(lambda: {'orders': 0, 'qty': 0, 'commission': 0.0, 'purchase': 0.0, 'taglinks': set(), 'platforms': defaultdict(int), 'stores': set()})

for r in pr:
    name = r.get('Nama Barange', '').strip()
    if not name:
        continue
    qty = int(r.get('Jumlah', '0') or 0)
    comm = float(r.get('Komisi Bersih Affiliate (Rp)', '0').replace(',', '') or 0)
    purchase = float(r.get('Nilai Pembelian(Rp)', '0').replace(',', '') or 0)
    taglink = r.get('Tag_link1', '').strip()
    platform = r.get('Platform', '').strip()
    store = r.get('Nama Toko', '').strip()
    
    products[name]['orders'] += 1
    products[name]['qty'] += qty
    products[name]['commission'] += comm
    products[name]['purchase'] += purchase
    if taglink: products[name]['taglinks'].add(taglink)
    if platform: products[name]['platforms'][platform] += 1
    if store: products[name]['stores'].add(store)

# Sort by orders descending
sorted_by_orders = sorted(products.items(), key=lambda x: x[1]['orders'], reverse=True)
# Sort by commission descending
sorted_by_comm = sorted(products.items(), key=lambda x: x[1]['commission'], reverse=True)

print("\n=== TOP BY ORDER VOLUME ===")
print(f"{'#':>3} | {'Orders':>6} | {'Qty':>4} | {'Comm (Rp)':>14} | {'Purchase (Rp)':>14} | {'Product Name'}")
print("-" * 120)
for i, (name, info) in enumerate(sorted_by_orders[:25], 1):
    print(f"{i:>3} | {info['orders']:>6} | {info['qty']:>4} | {info['commission']:>14,.2f} | {info['purchase']:>14,.0f} | {name[:70]}")

print("\n=== TOP BY COMMISSION VALUE ===")
print(f"{'#':>3} | {'Orders':>6} | {'Comm (Rp)':>14} | {'Purchase (Rp)':>14} | {'Taglinks'} | {'Platforms'} | {'Product Name'}")
print("-" * 140)
for i, (name, info) in enumerate(sorted_by_comm[:25], 1):
    tl = ', '.join(info['taglinks'])[:25]
    pl = ', '.join(f"{k}={v}" for k, v in sorted(info['platforms'].items(), key=lambda x: x[1], reverse=True))[:25]
    print(f"{i:>3} | {info['orders']:>6} | {info['commission']:>14,.2f} | {info['purchase']:>14,.0f} | {tl:<25} | {pl:<25} | {name[:55]}")

# All products with >= 2 orders
print("\n=== PRODUCTS WITH 2+ ORDERS ===")
multi_order = [(n, i) for n, i in products.items() if i['orders'] >= 2]
multi_order.sort(key=lambda x: x[1]['orders'], reverse=True)
print(f"Count: {len(multi_order)} products")
for name, info in multi_order:
    tl = ', '.join(info['taglinks'])
    pl = ', '.join(f"{k}={v}" for k, v in sorted(info['platforms'].items(), key=lambda x: x[1], reverse=True))
    print(f"  Orders={info['orders']} | Qty={info['qty']} | Rp{info['commission']:,.2f} | Taglinks=[{tl}] | Platforms=[{pl}] | {name}")

# Final JSON output - focused on high performers
print("\n\n=== HIGH PERFORMER JSON (orders >= 2 or commission >= Rp 10,000) ===")
high_performers = [(n, i) for n, i in products.items() if i['orders'] >= 2 or i['commission'] >= 10000]
high_performers.sort(key=lambda x: x[1]['commission'], reverse=True)

output = []
for name, info in high_performers:
    plat_dist = dict(sorted(info['platforms'].items(), key=lambda x: x[1], reverse=True))
    entry = {
        "product_name": name,
        "total_orders": info['orders'],
        "total_quantity": info['qty'],
        "total_purchase_rp": round(info['purchase']),
        "total_commission_rp": round(info['commission'], 2),
        "commission_per_order_rp": round(info['commission'] / info['orders'], 2),
        "taglinks": list(info['taglinks']),
        "platform_distribution": plat_dist,
        "stores": list(info['stores'])
    }
    output.append(entry)

print(json.dumps(output, ensure_ascii=False, indent=2))

# Save
outfile = "/home/openclaw/projects/1ai-ads/perlengkapan_rumah_high_performers.json"
with open(outfile, 'w', encoding='utf-8') as f:
    json.dump(output, f, ensure_ascii=False, indent=2)
print(f"\nSaved to {outfile}")
