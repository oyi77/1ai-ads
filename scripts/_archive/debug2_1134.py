#!/usr/bin/env python3
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

def _token():
    for line in open(os.path.join(PROJECT_ROOT, ".env"), encoding="utf-8", errors="ignore").read().splitlines():
        if not line or line.startswith("#"):
            continue
        if line.split("=", 1)[0] == "META_ACCESS_TOKEN":
            return line.split("=", 1)[1].strip()
    return ""

token = _token()

def get(path, params=None):
    url = f"{API_BASE}/{path}"
    if params:
        url = f"{url}?{urlencode(params)}"
    req = Request(url, headers={"Authorization": f"Bearer {token}"})
    with urlopen(req, timeout=30) as r:
        return json.loads(r.read())

# Campaigns limit 200
res = get(f"act_{ACT_ID}/campaigns", {"fields": "id,name,status,effective_status,daily_budget,lifetime_budget,spend", "limit": "200"})
camps = res.get("data", [])
print(f"Campaigns fetched: {len(camps)}")
paging = res.get("paging", {})
print(f"Paging next present: {'next' in paging}")

# Insights rows details
ins = get(f"act_{ACT_ID}/insights", {
    "fields": "campaign_id,campaign_name,spend,cpc,clicks,ctr,impressions",
    "time_range": json.dumps({"since": "2026-06-06", "until": "2026-06-13"}),
    "level": "campaign",
    "limit": "200",
})
rows = ins.get("data", [])
print(f"Insights rows: {len(rows)}")
for row in rows[:10]:
    print(json.dumps(row, ensure_ascii=False))
