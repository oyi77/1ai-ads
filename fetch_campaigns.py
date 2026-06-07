#!/usr/bin/env python3
"""Fetch all Meta campaigns for 1041 account + today's insights."""
import os, sys, json, subprocess
from datetime import datetime
from pathlib import Path
from collections import Counter
import requests # Import the requests library
import urllib.parse # For robust URL encoding

REPO = Path(__file__).resolve().parent
ENV_FILE = REPO / ".env"

def load_env():
    token = os.environ.get("META_ACCESS_TOKEN")
    acct = os.environ.get("META_TARGET_ACCOUNT", "act_380721031313330")
    if not token and ENV_FILE.exists():
        for line in ENV_FILE.read_text().splitlines():
            if line.startswith("META_ACCESS_TOKEN=") and len(line.split("=", 1)) > 1:
                token = line.split("=", 1)[1].strip()
            elif line.startswith("META_TARGET_ACCOUNT=") and len(line.split("=", 1)) > 1:
                acct = line.split("=", 1)[1].strip()
    return token, acct

def api_get_curl(url):
    """Fallback to curl for campaign fetching (seems to work fine)."""
    r = subprocess.run(["curl", "-s", url], capture_output=True, text=True, timeout=30)
    try:
        return json.loads(r.stdout)
    except json.JSONDecodeError:
        print(f"Failed to decode JSON from curl output for URL: {url[:100]}...")
        print(f"Curl Output: {r.stdout[:500]}...")
        return {"error": {"message": "Invalid JSON response from API (via curl)"}}


def api_get_requests(url, params=None):
    """Use requests for more robust API calls, especially for insights."""
    try:
        response = requests.get(url, params=params, timeout=30)
        response.raise_for_status() # Raise HTTPError for bad responses (4xx or 5xx)
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"Request error: {e}")
        return {"error": {"message": str(e)}}

def main():
    token, acct = load_env()
    if not token:
        print("❌ META_ACCESS_TOKEN tidak ditemukan"); sys.exit(1)
    print(f"Account: {acct} | Token: {token[:20]}...")

    # 1. Fetch all campaigns (paginated) using curl
    fields = "id,name,status,effective_status,daily_budget,lifetime_budget,objective,buying_type"
    campaigns_base_url = f"https://graph.facebook.com/v22.0/{acct}/campaigns"
    url = f"{campaigns_base_url}?fields={fields}&limit=200&access_token={token}"
    all_camps = []
    for _ in range(10):
        data = api_get_curl(url) # Using curl for campaigns
        if "error" in data and isinstance(data["error"], dict):
            print(f"API Error fetching campaigns: {data['error'].get('message','?')}"); break
        all_camps.extend(data.get("data", []))
        nxt = data.get("paging", {}).get("next")
        if not nxt: break
        url = nxt

    print(f"\n📊 Total campaigns: {len(all_camps)}")
    counts = Counter(c.get("effective_status", "?") for c in all_camps)
    for s, n in sorted(counts.items(), key=lambda x: -x[1]):
        print(f"  {s}: {n}")

    # 2. Active campaigns detail
    active = [c for c in all_camps if c.get("effective_status") == "ACTIVE"]
    print(f"\n🟢 ACTIVE: {len(active)}")
    for c in active:
        db = c.get("daily_budget")
        lb = c.get("lifetime_budget") # Added this to match fields in the original `fields` variable
        budget = f"IDR {int(db)/100:,.0f}/day" if db else (f"IDR {int(lb)/100:,.0f}" if lb else "N/A")
        print(f"  📢 {c['name']} | {budget} | {c.get('objective','?')}")

    # 3. Fetch today's insights using requests
    if active:
        active_ids = [c["id"] for c in active[:50]]
        insights_base_url = f"https://graph.facebook.com/v22.0/{acct}/insights"
        
        # Construct filtering parameter as a Python object first
        filtering_obj = [{"field":"campaign.id","operator":"IN","value":active_ids}]
        filtering_json = json.dumps(filtering_obj)
        
        # Requests will handle URL encoding if we pass params as a dict
        insights_params = {
            "fields": "campaign_id,campaign_name,spend,impressions,clicks,cpc,ctr,actions",
            "level": "campaign",
            "filtering": filtering_json, # Pass JSON string directly, requests will encode
            "date_preset": "today",
            "limit": 200,
            "access_token": token
        }

        try:
            ins = api_get_requests(insights_base_url, params=insights_params)
            rows = ins.get("data", [])
            if rows:
                print(f"\n💰 TODAY's PERFORMANCE ({len(rows)} reporting):")
                ts, tc = 0, 0
                for i in rows:
                    sp = float(i.get("spend", 0)); cl = int(i.get("clicks", 0))
                    ts += sp; tc += cl
                    print(f"  {i.get('campaign_name','?')}")
                    print(f"    Spend: IDR {sp:,.0f} | Clicks: {cl} | CPC: {i.get('cpc','?')} | CTR: {i.get('ctr','?')}%")
                print(f"\n  📊 TOTAL: IDR {ts:,.0f} | {tc} clicks")
                out = {"fetched_at": datetime.utcnow().isoformat()+"Z", "account": acct,
                        "today_insights": ins["data"]} # Save only insights data to `out` here
                outdir = REPO / "outputs" / "jendralbot_autoscaler"
                outdir.mkdir(parents=True, exist_ok=True)
                (outdir / "campaign_metrics_insights.json").write_text(json.dumps(out, indent=2)) # Separate file for insights
                print(f"\n✅ Today's insights saved to {outdir / 'campaign_metrics_insights.json'}")
            else:
                print("\n  ℹ️ Belum ada data insights hari ini")
        except Exception as e:
            print(f"Insights fetch/parse error: {e}")

    # 4. Paused summary
    paused = [c for c in all_camps if c.get("effective_status") == "PAUSED"]
    print(f"\n⏸️ PAUSED: {len(paused)}")
    for c in paused[:30]:
        print(f"  {c['name']}")
    if len(paused) > 30:
        print(f"  ... +{len(paused)-30} lainnya")

    # 5. Save all campaign state (not insights)
    out_campaigns = {"fetched_at": datetime.utcnow().isoformat()+"Z", "account": acct,
           "total": len(all_camps), "active": len(active), "paused": len(paused),
           "campaigns": all_camps}
    outdir_campaigns = REPO / "outputs" / "jendralbot_autoscaler"
    outdir_campaigns.mkdir(parents=True, exist_ok=True)
    (outdir_campaigns / "campaign_metrics.json").write_text(json.dumps(out_campaigns, indent=2))
    print(f"\n✅ All campaign metadata saved to {outdir_campaigns / 'campaign_metrics.json'}")

if __name__ == "__main__":
    main()
