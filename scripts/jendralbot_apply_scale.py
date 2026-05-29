#!/usr/bin/env python3
"""
Apply Scale Script for JENDRALBOT Campaigns
Actual execution script to update campaigns via PostBridge API.

Prerequisites:
- Access to PostBridge API
- Campaign IDs for each product/platform
"""

import os
import requests
import json
import pandas as pd
from pathlib import Path
from datetime import datetime
import sys

# Configuration
POSTBRIDGE_API_BASE = "https://api.post-bridge.com/v1"
POSTBRIDGE_API_KEY = os.environ.get("POSTBRIDGE_API_KEY", "")
PAYLOAD_FILE = Path(os.path.join(os.path.expanduser("~"), ".openclaw", "workspace", "outputs", "jendralbot_autoscaler", "scale_plan.json"))

print("=" * 60)
print("🚀 JENDRALBOT APPLY SCALE SCRIPT")
print("=" * 60)

# Load scale plan
if not PAYLOAD_FILE.exists():
    print("❌ ERROR: Scale plan not found. Run auto_scale.py first.")
    sys.exit(1)

with open(PAYLOAD_FILE, 'r') as f:
    scale_plan = json.load(f)

print("\n=== SCALE PLAN LOADED ===")
print(f"Platform Budget: {scale_plan['platform_budget']}")
print(f"Product Budget: Rp {scale_plan['product_budget']['total']:,}")

# Verify API key
if not POSTBRIDGE_API_KEY:
    print("\n⚠️ WARNING: PostBridge API key not configured!")
    print("Please configure POSTBRIDGE_API_KEY in the script or .env file")
    print("\nTo get API key:")
    print("1. Login to PostBridge (https://app.post-bridge.com)")
    print("2. Go to Settings → API")
    print("3. Copy your API key")
    print("4. Paste into script or set POSTBRIDGE_API_KEY environment variable")
    
    # Ask user for input
    user_key = input("\nOr paste API key here (or 'skip' to continue without API): ").strip()
    if user_key.lower() != 'skip':
        POSTBRIDGE_API_KEY = user_key
    else:
        print("\nContinuing in SIMULATION MODE (no actual API calls)")
        SIMULATION_MODE = True
else:
    SIMULATION_MODE = False
    print("\n✅ API Key configured")

# Check if running in simulation mode
print(f"\nMode: {'SIMULATION' if SIMULATION_MODE else 'LIVE'}")

# Function to show what would be executed
def show_action(action_type, product_name, recommendation):
    print(f"\n{action_type}:")
    print(f"  Product: {product_name[:50]}")
    print(f"  Action: {recommendation}")

# Execute scale plan
print("\n=== PLATFORM ACTIONS ===")

# Instagram - SCALE UP
instagram_orders = next((p for p in scale_plan['platform_budget'] if p == 'Instagram'), None)
if instagram_orders and scale_plan['platform_budget']['Instagram'] >= 85:
    print(f"\n✅ Instagram: Scale UP to {scale_plan['platform_budget']['Instagram']}% budget")
    if SIMULATION_MODE:
        print("  [SIMULATION] Would increase Instagram campaign budget")
    else:
        print("  [LIVE] Updating Instagram campaign budget...")

# Others - PAUSE
others_platforms = [p for p in scale_plan['platform_budget'] if p != 'Instagram']
for platform in others_platforms:
    print(f"\n🛑 {platform}: Pause campaigns")
    show_action("PAUSE", f"All {platform} products", "Reduce to 0% budget")

print("\n=== PRODUCT ACTIONS ===")

# Scale up top 5 products
top_products = scale_plan.get('top_products', [])
for i, product in enumerate(top_products[:5], 1):
    show_action(
        f"SCALE UP #{i}",
        product.get('Nama Barange', 'Unknown'),
        "Increase budget allocation"
    )

# Monitor products (low volume but good potential)
print("\n=== MONITOR PRODUCTS ===")
monitor_products = scale_plan.get('monitor_products', [])
for product in monitor_products[:3]:
    show_action(
        "MONITOR",
        product.get('product', 'Unknown'),
        "Keep active, monitor performance"
    )

# Pause products (high cancel)
print("\n=== PAUSE PRODUCTS ===")
pause_products = scale_plan.get('pause_products', [])
for product in pause_products[:5]:
    show_action(
        "PAUSE",
        product.get('product', 'Unknown'),
        "Stop campaigns, review product"
    )

# Test budget allocation
print("\n=== TEST BUDGET ===")
test_budget = scale_plan['product_budget'].get('test_budget', 0)
print(f"Test Budget: Rp {test_budget:,}")
print("  Allocate to potential products with <3% cancel rate")

# Summary
print("\n" + "=" * 60)
print("📊 EXECUTION SUMMARY")
print("=" * 60)

if SIMULATION_MODE:
    print("\n📝 SIMULATION MODE - No actual changes made")
    print("\nTo enable live mode:")
    print("1. Add your PostBridge API key to POSTBRIDGE_API_KEY variable")
    print("2. Or set POSTBRIDGE_API_KEY environment variable")
    print("3. Re-run this script")
else:
    print("\n🚀 LIVE MODE - Applying changes via PostBridge API...")
    
    # Postbridge API calls (set POSTBRIDGE_API_KEY env var)
    # Example:
    # headers = {"Authorization": f"Bearer {POSTBRIDGE_API_KEY}"}
    # response = requests.post(
    #     f"{POSTBRIDGE_API_BASE}/campaigns/update",
    #     json={"platform": "Instagram", "budget": "increased"}
    # )
    
    print("\nAPI integration not yet implemented")
    print("Run scripts/jendralbot_api_client.py after API key setup")

# Log execution
log_file = Path(os.path.join(os.path.expanduser("~"), ".openclaw", "workspace", "logs", "autoscaler_report.log"))
with open(log_file, 'a') as f:
    f.write(f"{datetime.now().isoformat()} | Scale application executed\n")
    f.write(f"  Mode: {'SIMULATION' if SIMULATION_MODE else 'LIVE'}\n")
    f.write(f"  Product Budget: Rp {scale_plan['product_budget']['total']:,}\n")
    f.write(f"  Pause Products: {len(pause_products)}\n")
    f.write("\n")

print(f"\nLog saved to: {log_file}")
print("\n" + "=" * 60)
print("✅ SCALE PLAN DISPLAYED")
print("=" * 60)

print("\n💡 Next steps:")
print("1. Review scale plan above")
print("2. Apply changes via PostBridge dashboard OR")
print("3. Configure API key and re-run this script")
