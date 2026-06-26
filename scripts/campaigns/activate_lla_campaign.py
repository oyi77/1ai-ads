#!/usr/bin/env python3
"""Auto-activate LLA campaign at 05:00 WIB"""

import urllib.request, json
from datetime import datetime
import os

TOKEN = os.getenv('META_ACCESS_TOKEN', '')

print(f"🚀 Activating LLA Campaign at {datetime.now().strftime('%H:%M')} WIB")

# Activate ad first, then adset, then campaign
for item in [
    ("Ad", "120245955771490121", "ad"),
    ("Adset", "120245955769630121", "adset"),
    ("Campaign", "120245955769030121", "campaign"),
]:
    eid = item[1]
    url = f"https://graph.facebook.com/v19.0/{eid}?access_token={TOKEN}"
    req = urllib.request.Request(
        url, data=b'{"status":"ACTIVE"}', headers={"Content-Type": "application/json"}
    )
    try:
        resp = urllib.request.urlopen(req, timeout=15)
        print(f"  ✅ {item[0]} ACTIVE")
    except Exception as e:
        print(f"  ❌ {item[0]}: {str(e)[:60]}")

print(f"\n🎯 LLA Scale campaign is now LIVE!")
print(f"   Campaign: 120245955769030121")
print(f"   Adset: 120245955769630121")
print(f"   LLA: 1% Video Rakdapur3 | Budget: Rp300K/hari")
