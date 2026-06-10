#!/usr/bin/env python3
"""Verify OFF_ rename on 1041 — loads token from os.environ."""
import os, urllib.request, urllib.parse, json

TOKEN=***.environ.get("META_ACCESS_TOKEN", "")
print(f"Token: {len(TOKEN)} chars")
if not TOKEN:
    print("FATAL: no token"); exit(1)

API = "https://graph.facebook.com/v22.0"
ACT = "act_380721031313330"

# Search ALL rakdapur campaigns
params = urllib.parse.urlencode({
    "access_token": TOKEN,
    "filtering": json.dumps([{"field": "name", "operator": "CONTAIN", "value": "rakdapur"}]),
    "fields": "id,name,status",
    "limit": "200"
})
url = f"{API}/{ACT}/campaigns?{params}"
with urllib.request.urlopen(url, timeout=15) as resp:
    data = json.loads(resp.read())

all_camps = data.get("data", [])
print(f"\nTotal rakdapur campaigns: {len(all_camps)}")

# Find Movies
movies = [c for c in all_camps if "Movies" in c["name"]]
print(f"\n=== rakdapur + Movies ({len(movies)}) ===")
for c in movies:
    print(f"  {c['id']} | {c['status']} | {c['name']}")

# Find OFF_ prefix
off_camps = [c for c in all_camps if c["name"].startswith("OFF_")]
print(f"\n=== OFF_ rakdapur ({len(off_camps)}) ===")
for c in off_camps[:8]:
    print(f"  {c['id']} | {c['name'][:80]}")
if len(off_camps) > 8:
    print(f"  ... +{len(off_camps)-8} more")

# Non-OFF counts
non_off = [c for c in all_camps if not c["name"].startswith("OFF_")]
print(f"\nNon-OFF rakdapur: {len(non_off)}")
for c in non_off:
    print(f"  {c['id']} | {c['status']} | {c['name'][:80]}")
