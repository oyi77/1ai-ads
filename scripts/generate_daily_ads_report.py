import pandas as pd
import requests
import json
import os
from datetime import datetime, timedelta

ACCESS_TOKEN = 'os.getenv('META_ACCESS_TOKEN', '')'
AD_ACCOUNT_ID = 'act_380721031313330'

def send_telegram(message):
    # This is a placeholder since OpenClaw handles messaging, 
    # but for a standalone script we'd use a bot API or a specific file trigger.
    # For now, we log it to a specific report file.
    with open('reports/daily_ads_report_queue.txt', 'a') as f:
        f.write(f"--- REPORT {datetime.now()} ---\n{message}\n\n")

def generate_report():
    yesterday = (datetime.now() - timedelta(days=1)).strftime('%Y-%m-%d')
    url = f'https://graph.facebook.com/v19.0/{AD_ACCOUNT_ID}/insights'
    params = {
        'access_token': ACCESS_TOKEN,
        'time_range': json.dumps({'since': yesterday, 'until': yesterday}),
        'fields': 'spend,inline_link_clicks,inline_link_click_ctr,reach,impressions'
    }
    try:
        r = requests.get(url, params=params).json()
        data = r.get('data', [])
        if data:
            ins = data[0]
            report = f"📊 *ADS REPORT YESTERDAY ({yesterday})*\n\n"
            report += f"💰 Spend: Rp {float(ins['spend']):,.0f}\n"
            report += f"🖱️ Clicks: {ins['inline_link_clicks']}\n"
            report += f"📈 CTR: {float(ins['inline_link_click_ctr']):.2f}%\n"
            report += f"👥 Reach: {ins['reach']}\n"
            report += "\nRules executed every 5 mins. Winner campaign scaled, Loser paused."
            send_telegram(report)
    except Exception as e:
        send_telegram(f"Error generating report: {e}")

if __name__ == "__main__":
    generate_report()
