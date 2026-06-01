import requests
from datetime import datetime
import os

ACCESS_TOKEN = os.getenv("META_ACCESS_TOKEN", "")
AD_ACCOUNT_ID = "act_1439536310038458"


def audit_herbal():
    print(f"--- INITIAL AUDIT FOR {AD_ACCOUNT_ID} (Ads herbal) ---")

    # Get Campaigns
    c_url = f"https://graph.facebook.com/v19.0/{AD_ACCOUNT_ID}/campaigns"
    c_params = {
        "access_token": ACCESS_TOKEN,
        "fields": "id,name,status,effective_status",
        "limit": 50,
    }
    camp_res = requests.get(c_url, params=c_params).json()

    if "error" in camp_res:
        print(f"ERROR: {camp_res['error']['message']}")
        return

    campaigns = camp_res.get("data", [])
    c_status = {c["id"]: c["effective_status"] for c in campaigns}

    # Get Insights (Today)
    i_url = f"https://graph.facebook.com/v19.0/{AD_ACCOUNT_ID}/insights"
    i_params = {
        "access_token": ACCESS_TOKEN,
        "level": "campaign",
        "fields": "campaign_id,campaign_name,cost_per_inline_link_click,inline_link_click_ctr,spend",
        "date_preset": "today",
    }
    insights = requests.get(i_url, params=i_params).json().get("data", [])

    print(
        f"\n{'CAMPAIGN NAME':<40} | {'STATUS':<12} | {'SPEND':<7} | {'CPC':<5} | {'CTR':<6}"
    )
    print("-" * 85)

    total_spend = 0
    for ins in insights:
        cid = ins.get("campaign_id")
        name = ins.get("campaign_name", "Unknown")
        status = c_status.get(cid, "Unknown")
        spend = float(ins.get("spend", 0))
        cpc = float(ins.get("cost_per_inline_link_click", 0))
        ctr = float(ins.get("inline_link_click_ctr", 0))
        total_spend += spend

        print(
            f"{name[:40]:<40} | {status:<12} | {spend:<7.0f} | {cpc:<5.2f} | {ctr:<5.2f}%"
        )

    print("-" * 85)
    print(f"TOTAL SPEND TODAY: IDR {total_spend:,.0f}")


if __name__ == "__main__":
    audit_herbal()
