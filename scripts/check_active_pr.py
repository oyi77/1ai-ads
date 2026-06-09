#!/usr/bin/env python3
"""Quick check of active Perlengkapan Rumah campaigns"""
import os, json, urllib.request

TOKEN = os.environ.get("META_ACCESS_TOKEN", "")
API = "https://graph.facebook.com/v22.0"
ACT = "act_435670549443081"

def api_get(path):
    url = f"{API}/{path}&access_token={TOKEN}&limit=200"
    return json.loads(urllib.request.urlopen(url, timeout=15).read())

data = api_get(f"{ACT}/campaigns?fields=name,status,effective_status,daily_budget")
camps = data.get("data", [])
rak_camps = [c for c in camps if any(k in c.get("name","").lower() for k in ["rakpiring","rakdapur","organizer","dapur","lemari"])]
active = [c for c in rak_camps if c.get("effective_status") == "ACTIVE"]
total_budget = sum(float(c.get("daily_budget",0))/100 for c in active if c.get("daily_budget"))

print(f"Total Perlengkapan Rumah campaigns: {len(rak_camps)}")
print(f"ACTIVE now: {len(active)}")
print(f"PAUSED: {len(rak_camps)-len(active)}")
print(f"Total daily budget aktif: Rp{total_budget:,.0f}")
