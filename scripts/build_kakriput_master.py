import pandas as pd
import requests
import json
from datetime import datetime, timedelta

# CONFIG KAKRIPUT ONLY
ACCESS_TOKEN = os.getenv("META_ACCESS_TOKEN", "")
AD_ACCOUNT_ID = "act_435670549443081"


def fetch_kakriput_ads_history():
    start = "2026-04-28"
    end = datetime.now().strftime("%Y-%m-%d")
    print(f"Fetching Kakriput FB Ads data...")
    url = f"https://graph.facebook.com/v19.0/{AD_ACCOUNT_ID}/insights"
    params = {
        "access_token": ACCESS_TOKEN,
        "level": "account",
        "fields": "spend,inline_link_clicks,date_start",
        "time_range": json.dumps({"since": start, "until": end}),
        "time_increment": 1,
    }
    r = requests.get(url, params=params).json()
    fb_data = {item["date_start"]: item for item in r.get("data", [])}

    report = []
    current = datetime.strptime(start, "%Y-%m-%d")
    while current <= datetime.now():
        ds = current.strftime("%Y-%m-%d")
        f = fb_data.get(ds, {"spend": 0, "inline_link_clicks": 0})

        spend_net = float(f["spend"])
        spend_tax = spend_net * 1.11  # 11% PPN

        report.append(
            {
                "Tanggal": ds,
                "Spend FB (Murni)": f"{spend_net:,.0f}",
                "Spend FB + 11% PPN": f"{spend_tax:,.0f}",
                "FB Link Clicks": int(f["inline_link_clicks"]),
                "Shopee Real Clicks": 0,
                "Probability (%)": "0%",
                "Total Orders": 0,
                "Comm Net (-3%)": 0,
                "ROI (%)": "-100%",
                "DATA CAIR (MANUAL)": "",
            }
        )
        current += timedelta(days=1)

    df = pd.DataFrame(report)
    df.to_csv("reports/kakriput_master_report.csv", index=False)
    print("SUCCESS: Kakriput Master CSV Generated.")
    print(df.tail(10).to_markdown(index=False))


if __name__ == "__main__":
    import os

    os.makedirs("reports", exist_ok=True)
    fetch_kakriput_ads_history()
