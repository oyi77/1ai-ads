#!/usr/bin/env python3
import json, os, urllib.request, urllib.parse, urllib.error, time
from urllib.parse import quote as _q
from datetime import datetime, timedelta, timezone
from pathlib import Path

WIB = timezone(timedelta(hours=7))
API = "https://graph.facebook.com/v22.0"
ACT = "act_380721031313330"

TOKEN_FILE = Path("/tmp/fb_token.txt")
token = None
if TOKEN_FILE.exists():
    token = TOKEN_FILE.read_text().strip()
if not token:
    token = os.getenv("META_ACCESS_TOKEN") or os.getenv("ACCESS_TOKEN")

def fb_get(endpoint, **params):
    params["access_token"] = token
    qs = "&".join(f"{k}={urllib.request.quote(str(v))}" for k, v in params.items())
    url = f"{API}/{endpoint}?{qs}"
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.loads(resp.read())

# Fetch campaigns
camp_data = fb_get(f"{ACT}/campaigns", fields="id,name,status", limit=200)
campaigns = camp_data.get("data", [])
while camp_data.get("paging", {}).get("next"):
    import time; time.sleep(0.5)
    with urllib.request.urlopen(urllib.request.Request(camp_data["paging"]["next"]), timeout=20) as resp:
        camp_data = json.loads(resp.read())
    campaigns.extend(camp_data.get("data", []))

# Fetch insights
ins_url = (
    f"{API}/{ACT}/insights?"
    f"fields=campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,clicks,cpc,ctr"
    f"&time_range={{'since':'{(datetime.now(WIB)-timedelta(days=7)).strftime('%Y-%m-%d')}','until':'{datetime.now(WIB).strftime('%Y-%m-%d')}'}}"
    f"&level=campaign&access_token={token}"
)
with urllib.request.urlopen(urllib.request.Request(ins_url), timeout=20) as resp:
    ins_data = json.loads(resp.read())
insights = ins_data.get("data", [])
while ins_data.get("paging", {}).get("next"):
    import time; time.sleep(0.5)
    with urllib.request.urlopen(urllib.request.Request(ins_data["paging"]["next"]), timeout=20) as resp:
        ins_data = json.loads(resp.read())
    insights.extend(ins_data.get("data", []))

# Check for duplicate campaign_ids in insights
from collections import Counter
camp_ids = [r.get("campaign_id") for r in insights]
counts = Counter(camp_ids)
dups = {cid: cnt for cid, cnt in counts.items() if cnt > 1}
print(f"Campaigns from API: {len(campaigns)}")
print(f"Insight rows: {len(insights)}")
print(f"Unique campaign_ids in insights: {len(counts)}")
print(f"Duplicate campaign_ids in insights: {len(dups)}")
if dups:
    print("Duplicate rows (first 5 campaigns):")
    for cid, cnt in list(dups.items())[:5]:
        print(f"  {cid}: {cnt} rows")

# Show first few campaign names
print("\nFirst 10 campaigns:")
for c in campaigns[:10]:
    print(f"  {c['id']} | {c.get('name','')[:50]} | {c.get('status','')}")

# Show first few insights
print("\nFirst 10 insights:")
for r in insights[:10]:
    print(f"  {r.get('campaign_id')} | {r.get('campaign_name','')[:35]} | spend={r.get('spend','0')} | clicks={r.get('clicks','0')}")
