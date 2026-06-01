"""Quick check: yesterday's total spend for 1041"""

import json, requests, os, sys

with open(os.path.join(os.path.dirname(__file__), "list_ad_accounts.py")) as f:
    TOKEN = os.getenv("META_ACCESS_TOKEN", "")

# Total spend yesterday
r = requests.get(
    "https://graph.facebook.com/v19.0/act_380721031313330/insights",
    params={
        "access_token": TOKEN,
        "fields": "spend,cpc,ctr,impressions,clicks",
        "date_preset": "yesterday",
        "level": "account",
        "limit": 1,
    },
)
data = r.json()
if "data" in data and len(data["data"]) > 0:
    d = data["data"][0]
    spend = int(float(d.get("spend", 0)))
    cpc = float(d.get("cpc", 0))
    ctr = float(d.get("ctr", 0))
    impr = int(d.get("impressions", 0))
    clks = int(d.get("clicks", 0))
    print(f"Yesterday's 1041:")
    print(f"  Spend: Rp {spend:,}")
    print(f"  CPC: Rp {cpc:.0f}")
    print(f"  CTR: {ctr:.2f}%")
    print(f"  Impressions: {impr:,}")
    print(f"  Clicks: {clks:,}")
else:
    print(f"No data: {data}")

# Per campaign breakdown
r2 = requests.get(
    "https://graph.facebook.com/v19.0/act_380721031313330/insights",
    params={
        "access_token": TOKEN,
        "fields": "campaign_id,campaign_name,spend,cpc,ctr,impressions,clicks",
        "date_preset": "yesterday",
        "level": "campaign",
        "limit": 50,
    },
)
data2 = r2.json()
if "data" in data2:
    print(f"\nPer campaign:")
    print(
        f"{'Campaign':50s} {'Spend':>10s} {'CPC':>8s} {'CTR':>8s} {'Impr':>8s} {'Clicks':>8s}"
    )
    print("-" * 92)
    for d in data2["data"]:
        spend = int(float(d.get("spend", 0)))
        cpc = float(d.get("cpc", 0))
        ctr = float(d.get("ctr", 0))
        name = d["campaign_name"]
        imp = int(float(d.get("impressions", 0)))
        clk = int(float(d.get("clicks", 0)))
        print(f"{name:50s} {spend:>10,} {cpc:>8.0f} {ctr:>7.2f}% {imp:>8,} {clk:>8,}")
