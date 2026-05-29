#!/usr/bin/env python3
"""
Auto-Scale Script for JENDRALBOT Campaigns
Scales budget toward top performers and shifts from underperforming platforms.

Strategy:
- 85% budget to top 5 products (low cancel, high revenue)
- 10% budget to testing new products
- 5% budget to monitoring high-potential products
- Shift ALL budget to Instagram (best platform performer)
"""

import pandas as pd
import json
from pathlib import Path
from datetime import datetime
import os

# Load data files
mapping_file = Path(os.path.join(os.path.expanduser("~"), ".openclaw", "workspace", "outputs", "jendralbot_autoscaler", "platform_mapping.json"))
with open(mapping_file, 'r') as f:
    platform_data = json.load(f)

# Load top products from autoscaler output
top_products_file = Path(os.path.join(os.path.expanduser("~"), ".openclaw", "workspace", "outputs", "jendralbot_autoscaler", "top_products.csv"))
top_products = pd.read_csv(top_products_file)

print("=" * 60)
print("🚀 JENDRALBOT AUTO-SCALE SCRIPT")
print("=" * 60)

# Calculate total commission from completed orders
completed_orders = pd.read_csv(os.path.join(os.path.expanduser('~'), 'media', 'inbound', 'AffiliateCommissionReport202605061348---58f678eb-edec-40f5-b45c-f74476a21e49.csv'))
completed_orders = completed_orders[completed_orders['Status Pesanan'] == 'Selesai']
total_revenue = completed_orders['Total Komisi per Pesanan(Rp)'].sum()

print(f"\nTotal Completed Revenue: Rp {int(total_revenue):,}")

# Budget allocation strategy
print("\n=== BUDGET ALLOCATION STRATEGY ===\n")

# Platform budget (Shift to Instagram only)
instagram_orders = next((p for p in platform_data if p['Platform'] == 'Instagram'), None)
others_orders = [p for p in platform_data if p['Platform'] != 'Instagram']

print("Platform Budget (85% to top platform):")
print(f"  Instagram: 85%")

others_total = sum(p['Orders'] for p in others_orders)
if others_total > 0:
    print(f"  Others: 15% (split among: {', '.join([p['Platform'] for p in others_orders])})")
else:
    print(f"  Others: 0% (all paused - no orders)")

# Product budget (Top 5)
print("\nProduct Budget (85% to top performers):")
top_5 = top_products.head(5).to_dict('records')

for i, product in enumerate(top_5, 1):
    product_revenue = int(product['Total Commission'])
    pct = product_revenue / total_revenue * 100 if total_revenue > 0 else 0
    print(f"  {i}. {product['Nama Barange'][:45]:45s} - Rp {product_revenue:,} ({pct:.2f}%)")

# Allocation summary
print("\n=== BUDGET REALLOCATION ===\n")

# Get current performance
instagram_perf = next((p for p in platform_data if p['Platform'] == 'Instagram'), None)
if instagram_perf:
    instagram_orders_count = int(instagram_perf['Orders'])
    instagram_completed = int(instagram_perf['Completed'])
    print(f"Instagram Performance:")
    print(f"  Orders: {instagram_orders_count:,}")
    print(f"  Completed: {instagram_completed:,}")

# Calculate recommended budget
recommended_top5 = int(total_revenue * 0.6)
recommended_test = int(total_revenue * 0.15)
recommended_monitor = int(total_revenue * 0.25)

print(f"\nRecommended Budget Allocation:")
print(f"  Top 5 Products: Rp {recommended_top5:,} ({recommended_top5/total_revenue*100:.1f}%)")
print(f"  Test Budget: Rp {recommended_test:,} ({recommended_test/total_revenue*100:.1f}%)")
print(f"  Monitor Budget: Rp {recommended_monitor:,} ({recommended_monitor/total_revenue*100:.1f}%)")

# Save scale plan
scale_plan = {
    'platform_budget': {
        'Instagram': 85,
        'Others': sum(p['Orders'] for p in others_orders) / sum(p['Orders'] for p in platform_data) * 100 if sum(p['Orders'] for p in platform_data) > 0 else 0
    },
    'product_budget': {
        'top_5_products': recommended_top5,
        'test_budget': recommended_test,
        'monitor_budget': recommended_monitor,
        'total': recommended_top5 + recommended_test + recommended_monitor
    },
    'top_products': top_5,
    'timestamp': datetime.now().isoformat()
}

save_file = Path(os.path.join(os.path.expanduser("~"), ".openclaw", "workspace", "outputs", "jendralbot_autoscaler", "scale_plan.json"))
with open(save_file, 'w') as f:
    json.dump(scale_plan, f, indent=2)

print(f"\nAuto-scale plan saved to: {save_file}")

# Log action
log_file = Path(os.path.join(os.path.expanduser("~"), ".openclaw", "workspace", "logs", "autoscaler_report.log"))
with open(log_file, 'a') as f:
    f.write(f"{datetime.now().isoformat()} | Auto-scale script executed\n")
    f.write(f"  Top 5 Products: Rp {recommended_top5:,}\n")
    f.write(f"  Test Budget: Rp {recommended_test:,}\n")
    f.write(f"  Total Allocation: Rp {scale_plan['product_budget']['total']:,}\n")
    f.write("\n")

print(f"Log saved to: {log_file}")

print("\n" + "=" * 60)
print("✅ SCALE PLAN READY")
print("=" * 60)
print("\nNext step: Apply scale plan via PostBridge API")
print("Run: python3 scripts/jendralbot_apply_scale.py")
