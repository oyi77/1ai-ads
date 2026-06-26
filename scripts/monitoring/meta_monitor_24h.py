import requests
import json
import time
import os
from datetime import datetime

# CONFIGURATION - PERMANENT SYSTEM TOKEN
ACCESS_TOKEN = os.getenv("META_ACCESS_TOKEN", "")
AD_ACCOUNT_ID = "act_380721031313330"


def monitor_and_execute():
    url = f"https://graph.facebook.com/v19.0/{AD_ACCOUNT_ID}/campaigns"
    params = {"access_token": ACCESS_TOKEN, "fields": "id,name,status,daily_budget"}
    try:
        r = requests.get(url, params=params).json()
        camps = r.get("data", [])
        log_entries = []

        for camp in camps:
            cid = camp["id"]
            name = camp["name"]
            status = camp["status"]
            budget = int(camp.get("daily_budget", 0))

            # Fetch insights for LAST 3 DAYS to get stable average
            ins_r = requests.get(
                f"https://graph.facebook.com/v19.0/{cid}/insights",
                params={
                    "access_token": ACCESS_TOKEN,
                    "date_preset": "last_3d",
                    "fields": "spend,inline_link_clicks,inline_link_click_ctr",
                },
            ).json()
            ins_data = ins_r.get("data", [])

            if not ins_data or status != "ACTIVE":
                continue

            insights = ins_data[0]
            spend = float(insights.get("spend", 0))
            clicks = int(insights.get("inline_link_clicks", 0))
            ctr = float(insights.get("inline_link_click_ctr", 0))
            cpr = spend / clicks if clicks > 0 else 0

            # ADJUSTED LOGIC FOR 1-DAY SHOPEE LAG:
            # We trust Click Efficiency (CTR/CPR) as leading indicators.

            # 1. TURBO SCALING (CPR < 120 & CTR > 7%)
            if (
                "rak dapur" in name.lower()
                and ctr > 7.0
                and cpr < 120
                and budget < 1000000
            ):
                new_budget = int(budget * 1.5)
                requests.post(
                    f"https://graph.facebook.com/v19.0/{cid}",
                    params={"daily_budget": new_budget, "access_token": ACCESS_TOKEN},
                )
                log_entries.append(
                    f"SCALED (Trend): {name} ({budget}->{new_budget}) CTR:{ctr:.2f}% CPR:{cpr:.0f}"
                )

            # 2. KILL LOSERS (CPR > 180 - slightly looser threshold because of lag)
            elif cpr > 180 and spend > 50000:
                requests.post(
                    f"https://graph.facebook.com/v19.0/{cid}",
                    params={"status": "PAUSED", "access_token": ACCESS_TOKEN},
                )
                log_entries.append(f"KILLED: {name} CPR:{cpr:.0f}")

        if log_entries:
            with open("logs/automation_history.log", "a") as f:
                ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                f.write(f"[{ts}] " + " | ".join(log_entries) + "\n")
            return log_entries
    except Exception as e:
        pass
    return []


if __name__ == "__main__":
    print(f"Monitoring enabled with permanent token. Interval: 5min.")
    while True:
        monitor_and_execute()
        time.sleep(300)
