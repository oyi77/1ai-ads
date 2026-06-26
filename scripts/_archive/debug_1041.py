import urllib.request, json
from pathlib import Path

# Read token at runtime from file
for line in Path('/home/openclaw/projects/1ai-ads/.env').read_text().splitlines():
    if line.startswith('META_ACCESS_TOKEN=***            line.split('=',1)[1]

API = 'https://graph.facebook.com/v22.0'
ACT = '380721031313330'

# Test 1: account list (verify token)
url1 = f'{API}/{ACT}?fields=account_name,account_status&access_token=***         req1 = urllib.request.Request(url1)
try:
    with urllib.request.urlopen(req1, timeout=15) as r:
        print('[TEST1] Account info:', r.read().decode()[:300])
except urllib.error.HTTPError as e:
    print(f'[TEST1] HTTP {e.code}:', e.read().decode()[:200])

# Test 2: campaigns with safe fields only
time.sleep(2)
url2 = f'{API}/{ACT}/campaigns?fields=id,name,status,effective_status,daily_budget,lifetime_budget,spend,cpc&limit=5&access_token=***       try:
    req2 = urllib.request.Request(url2)
    with urllib.request.urlopen(req2, timeout=15) as r:
        print('[TEST2] Campaigns:', r.read().decode()[:300])
except urllib.error.HTTPError as e:
    print(f'[TEST2] HTTP {e.code}:', e.read().decode()[:300])
