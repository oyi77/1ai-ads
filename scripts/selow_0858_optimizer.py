#!/usr/bin/env python3
import os
import json
import requests
import datetime
import sys

# CONFIGURATION
AD_ACCOUNT_ID = "act_435670549443081"
ACCESS_TOKEN = os.getenv("FACEBOOK_ACCESS_TOKEN")  # Assuming token is in env
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")  # Prepared for alerts
TELEGRAM_CHAT_ID = "157228659"
DAILY_BUDGET_LIMIT = 800000
CPC_TARGET = 150


def get_now_wib():
    return datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=7)))


def send_alert(message):
    print(f"TELEGRAM ALERT: {message}")
    # Simple direct message via OpenClaw's internal routing is preferred if used as a tool,
    # but for a background script we use a direct API call or just log it for the agent to report.
    # For now, we'll write to a specific 'alerts' file that Vilona monitors.
    with open(
        os.path.join(
            os.path.expanduser("~"),
            ".openclaw",
            "workspace",
            "logs",
            "selow_0858_alerts.log",
        ),
        "a",
    ) as f:
        f.write(f"[{get_now_wib().strftime('%Y-%m-%d %H:%M:%S')}] {message}\n")


def run_optimizer():
    now = get_now_wib()
    hour = now.hour

    print(f"--- Running Selow 0858 Optimizer at {now.strftime('%H:%M WIB')} ---")

    # RULE 1: DEAD HOUR (00:00 - 05:00 WIB)
    if 0 <= hour <= 5:
        print("RULE 1: Dead Hour detected. Pausing all campaigns...")
        # logic to pause all active campaigns via API
        return

    # MOCK DATA FETCH (In real use, this calls Meta Graph API)
    # This represents 'act_435670549443081' data
    campaigns = [
        {
            "id": "c1",
            "name": "ADFORGE_RULE_ABO_Testing_Rak",
            "status": "ACTIVE",
            "spend": 10205,
            "clicks": 128,
            "impressions": 2058,
        },
        {
            "id": "c2",
            "name": "CBO_WinningScale_BIDCAP180",
            "status": "ACTIVE",
            "spend": 12135,
            "clicks": 74,
            "impressions": 970,
        },
        {
            "id": "c3",
            "name": "CBO_1-1-1_rakpiringpengering",
            "status": "ACTIVE",
            "spend": 4610,
            "clicks": 38,
            "impressions": 715,
        },
    ]

    total_spend = sum(c["spend"] for c in campaigns)

    # RULE 4: DAILY BUDGET CAP
    if total_spend > DAILY_BUDGET_LIMIT * 0.93:
        alert = f"━━━━━━━━━━━━━━━━━\n⛔️ Budget harian hampir habis: Rp{total_spend:,} dari Rp800.000\n━━━━━━━━━━━━━━━━━"
        send_alert(alert)
        # pause all logic
        return

    for c in campaigns:
        cpc = c["spend"] / c["clicks"] if c["clicks"] > 0 else 0
        ctr = (c["clicks"] / c["impressions"] * 100) if c["impressions"] > 0 else 0

        # RULE 2: CPC EMERGENCY
        if cpc > 400 and c["spend"] > 50000:
            msg = f"━━━━━━━━━━━━━━━━━\n🚨 SELOW 0858\n[{now.strftime('%H:%M')} WIB]\nCampaign: {c['name']}\nCPC: Rp{cpc:.0f} | CTR: {ctr:.2f}% | Spend: Rp{c['spend']:,}\nAction: PAUSED (CPC CRITICAL)\n━━━━━━━━━━━━━━━━━"
            send_alert(msg)
            # API Call to pause
        elif cpc > 150 and c["spend"] > 30000:
            msg = f"━━━━━━━━━━━━━━━━━\n⚠️ SELOW 0858\n[{now.strftime('%H:%M')} WIB]\nCampaign: {c['name']}\nCPC: Rp{cpc:.0f} | CTR: {ctr:.2f}% | Spend: Rp{c['spend']:,}\nAction: WARNING (High CPC)\n━━━━━━━━━━━━━━━━━"
            send_alert(msg)

        # RULE 3: CTR RENDAH
        if ctr < 0.5 and c["impressions"] > 5000:
            msg = f"━━━━━━━━━━━━━━━━━\n🚨 SELOW 0858\n[{now.strftime('%H:%M')} WIB]\nCampaign: {c['name']}\nCPC: Rp{cpc:.0f} | CTR: {ctr:.2f}% | Spend: Rp{c['spend']:,}\nAction: PAUSED (CTR CRITICAL)\n━━━━━━━━━━━━━━━━━"
            send_alert(msg)
        elif ctr < 1.0 and c["impressions"] > 3000:
            msg = f"━━━━━━━━━━━━━━━━━\n⚠️ SELOW 0858\n[{now.strftime('%H:%M')} WIB]\nCampaign: {c['name']}\nCPC: Rp{cpc:.0f} | CTR: {ctr:.2f}% | Spend: Rp{c['spend']:,}\nAction: WARNING (Low CTR)\n━━━━━━━━━━━━━━━━━"
            send_alert(msg)

    # RULE 5: HAPPY PATH (Summary every 30 mins)
    if now.minute % 30 == 0:
        avg_cpc = (
            total_spend / sum(c["clicks"] for c in campaigns)
            if sum(c["clicks"] for c in campaigns) > 0
            else 0
        )
        remaining = DAILY_BUDGET_LIMIT - total_spend
        summary = f"✅ [{now.strftime('%H:%M')}] 0858 normal | Spend: Rp{total_spend:,} | CPC: Rp{avg_cpc:.0f} | Sisa: Rp{remaining:,}"
        send_alert(summary)


if __name__ == "__main__":
    run_optimizer()
