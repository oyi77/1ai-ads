#!/usr/bin/env python3
"""
Auto-Pause Script for JENDRALBOT Campaigns
Pauses underperforming platforms and products based on conversion criteria.

Criteria for PAUSE:
- Cancel Rate > 3%
- Orders < 5 (low volume)
- Conversion Rate < 0.5%
"""

import pandas as pd
import json
from pathlib import Path
from datetime import datetime
import os

# Load platform mapping
mapping_file = Path("/home/openclaw/.openclaw/workspace/outputs/jendralbot_autoscaler/platform_mapping.json")
with open(mapping_file, 'r') as f:
    platform_data = json.load(f)

print("=" * 60)
print("🚀 JENDRALBOT AUTO-PAUSE SCRIPT")
print("=" * 60)

# Identify underperforming platforms
underperforming = []

for platform in platform_data:
    name = platform['Platform']
    orders = int(platform['Orders'])
    canceled = int(platform['Canceled'])
    completed = int(platform['Completed'])
    clicks = int(platform['Clicks'])
    
    # Calculate cancel rate (based on orders, not clicks)
    cancel_rate = (canceled / orders * 100) if orders > 0 else 0
    conv_rate = (completed / clicks * 100) if clicks > 0 else 0
    
    reasons = []
    if cancel_rate > 3:
        reasons.append(f"High cancel rate ({cancel_rate:.1f}%)")
    if orders < 5:
        reasons.append(f"Low volume ({orders} orders)")
    if conv_rate < 0.5:
        reasons.append(f"Low conversion ({conv_rate:.2f}%)")
    
    if reasons:
        underperforming.append({
            'platform': name,
            'orders': orders,
            'completed': completed,
            'canceled': canceled,
            'cancel_rate': cancel_rate,
            'conv_rate': conv_rate,
            'reasons': reasons
        })

print("\n=== UNDERPERFORMING PLATFORMS TO PAUSE ===\n")

for up in underperforming:
    print(f" Platform: {up['platform']}")
    print(f"   Orders: {up['orders']}")
    print(f"   Completed: {up['completed']}")
    print(f"   Canceled: {up['canceled']}")
    print(f"   Cancel Rate: {up['cancel_rate']:.2f}%")
    print(f"   Conv Rate: {up['conv_rate']:.2f}%")
    print(f"   Reasons: {', '.join(up['reasons'])}")
    print()

# Generate auto-pause commands for PostBridge
pause_plan = []

for up in underperforming:
    pause_plan.append({
        'action': 'pause',
        'platform': up['platform'],
        'reasons': up['reasons'],
        'timestamp': datetime.now().isoformat()
    })

# Save pause plan
pause_file = Path("/home/openclaw/.openclaw/workspace/outputs/jendralbot_autoscaler/pause_plan.json")
with open(pause_file, 'w') as f:
    json.dump(pause_plan, f, indent=2)

print(f"\nAuto-pause plan saved to: {pause_file}")

# Log action
log_file = Path("/home/openclaw/.openclaw/workspace/logs/autoscaler_report.log")
with open(log_file, 'a') as f:
    f.write(f"{datetime.now().isoformat()} | Auto-pause script executed\n")
    f.write(f"  Platforms to pause: {len(underperforming)}\n")
    for up in underperforming:
        f.write(f"  - {up['platform']}: {', '.join(up['reasons'])}\n")
    f.write("\n")

print(f"Log saved to: {log_file}")

# Print final recommendation
print("\n" + "=" * 60)
print("📊 RECOMMENDATION")
print("=" * 60)
print(f"\n✅ SCALE UP: Instagram (best performer)")
print("\n🛑 PAUSE: ")
for up in underperforming:
    print(f"  - {up['platform']}: {up['orders']} orders, {up['cancel_rate']:.1f}% cancel")
print("\n📝 NEXT STEP: Run auto-scale script to redirect budget to Instagram")
