#!/usr/bin/env python3
"""
Unified spend checker for all ad accounts.
Usage: python check_spend.py [account_id] [--all] [--cap=300000] [--warn=0.8]
"""

import requests
import sys
import os
import argparse
from datetime import datetime

ACCOUNTS = {
    "act_380721031313330": {"name": "1041", "cap": 300000},
    "act_435670549443081": {"name": "0858", "cap": 300000},
    "act_1181078009580337": {"name": "1340", "cap": 20000},
}

def get_token():
    token = os.getenv("META_ACCESS_TOKEN")
    if not token:
        print("ERROR: META_ACCESS_TOKEN not set")
        sys.exit(1)
    return token

def check_spend(token, account_id, cap, warn_pct=0.8):
    """Check spend for a single account."""
    try:
        r = requests.get(
            f"https://graph.facebook.com/v22.0/{account_id}/insights",
            params={
                "access_token": token,
                "fields": "spend,impressions,clicks,ctr,cpc",
                "date_preset": "today",
            },
            timeout=15,
        )
        data = r.json()
        
        if "error" in data:
            return {"error": data["error"]["message"]}
        
        spend = float(data["data"][0].get("spend", 0))
        impressions = int(data["data"][0].get("impressions", 0))
        clicks = int(data["data"][0].get("clicks", 0))
        ctr = float(data["data"][0].get("ctr", 0))
        
        status = "ok"
        if spend >= cap:
            status = "OVER_CAP"
        elif spend >= cap * warn_pct:
            status = "WARNING"
        
        return {
            "spend": spend,
            "impressions": impressions,
            "clicks": clicks,
            "ctr": ctr,
            "cap": cap,
            "status": status,
        }
    except Exception as e:
        return {"error": str(e)}

def main():
    parser = argparse.ArgumentParser(description="Check ad spend")
    parser.add_argument("account", nargs="?", help="Account ID to check")
    parser.add_argument("--all", action="store_true", help="Check all accounts")
    parser.add_argument("--cap", type=int, help="Override daily cap")
    parser.add_argument("--warn", type=float, default=0.8, help="Warning threshold (0-1)")
    args = parser.parse_args()
    
    token = get_token()
    
    if args.all:
        accounts = ACCOUNTS
    elif args.account:
        if args.account in ACCOUNTS:
            accounts = {args.account: ACCOUNTS[args.account]}
        else:
            accounts = {args.account: {"name": args.account, "cap": args.cap or 300000}}
    else:
        print("Usage: check_spend.py [account_id] [--all]")
        sys.exit(1)
    
    total_spend = 0
    for acct_id, info in accounts.items():
        cap = args.cap or info["cap"]
        result = check_spend(token, acct_id, cap, args.warn)
        
        if "error" in result:
            print(f"❌ {info['name']}: {result['error']}")
        else:
            status_icon = {"ok": "✅", "WARNING": "⚠️", "OVER_CAP": "🚨"}
            print(f"{status_icon.get(result['status'], '?')} {info['name']}: Rp {result['spend']:,.0f} / {cap:,} ({result['status']})")
            print(f"   Impressions: {result['impressions']:,} | Clicks: {result['clicks']:,} | CTR: {result['ctr']:.2f}%")
            total_spend += result["spend"]
    
    if len(accounts) > 1:
        print(f"\n📊 Total spend: Rp {total_spend:,.0f}")

if __name__ == "__main__":
    main()
