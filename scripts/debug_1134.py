#!/usr/bin/env python3
"""Debug 1134 account access."""
import json
import os
import sys
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from urllib.parse import urlencode

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)
import vilona_trakpro_engine as engine

API_BASE = "https://graph.facebook.com/v22.0"
ACT_ID = "2125021885010866"
ACT_PREFIX = f"act_{ACT_ID}"

def load_token():
    try:
        return engine.ACCESS_TOKEN
    except Exception:
        pass
    path = os.path.join(PROJECT_ROOT, ".env")
    for line in open(path, "r", encoding="utf-8", errors="ignore").read().splitlines():
        if not line or line.startswith("#"):
            continue
        if line.split("=", 1)[0] == "META_ACCESS_TOKEN":
            return line.split("=", 1)[1].strip()
    return ""

token = load_token()
print(f"Token length: {len(token)}")

# Test 1: account endpoint
url1 = f"{API_BASE}/{ACT_PREFIX}?fields=account_name&access_token={token}"
req1 = Request(url1)
try:
    with urlopen(req1, timeout=30) as resp:
        body = json.loads(resp.read())
        print(f"Account check OK: {body}")
except HTTPError as e:
    body = e.read().decode("utf-8", errors="ignore")
    print(f"Account check FAILED {e.code}: {body}")

# Test 2: campaigns endpoint
url2 = f"{API_BASE}/{ACT_PREFIX}/campaigns?fields=id,name,status,effective_status&limit=5&access_token={token}"
req2 = Request(url2)
try:
    with urlopen(req2, timeout=30) as resp:
        body = json.loads(resp.read())
        print(f"Campaigns OK: {len(body.get('data', []))} campaigns")
        for c in body.get("data", []):
            print(f"  {c.get('id')} | {c.get('name')} | {c.get('status')} | {c.get('effective_status')}")
except HTTPError as e:
    body = e.read().decode("utf-8", errors="ignore")
    print(f"Campaigns FAILED {e.code}: {body}")

# Test 3: insights endpoint
url3 = f"{API_BASE}/{ACT_PREFIX}/insights?fields=campaign_id,campaign_name,spend,cpc,clicks,ctr,impressions&level=campaign&limit=5&access_token={token}"
try:
    with urlopen(Request(url3), timeout=30) as resp:
        body = json.loads(resp.read())
        print(f"Insights OK: {len(body.get('data', []))} rows")
except HTTPError as e:
    body = e.read().decode("utf-8", errors="ignore")
    print(f"Insights FAILED {e.code}: {body}")
