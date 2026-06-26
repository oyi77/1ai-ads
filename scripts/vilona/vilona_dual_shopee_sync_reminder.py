#!/usr/bin/env python3
import datetime

def get_now_wib():
    return datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=7)))

def send_reminder():
    now = get_now_wib()
    date_yesterday = (now - datetime.timedelta(days=1)).strftime('%d/%m/%Y')
    
    msg = f"""📦 SHOPEE SYNC — {now.strftime('%d %B %Y')}
Data Shopee untuk kemarin ({date_yesterday}) sudah seharusnya keluar.

Mohon upload 2 file:
1. AffiliateCommissionReport (kemarin)
2. WebsiteClickReport (kemarin)

Saya tunggu untuk evaluasi dan update strategi besok."""
    
    print(msg)
    # Store to outbox for agent pickup
    with open('/home/openclaw/.openclaw/workspace/logs/vilona_ads_outbox.log', 'a') as f:
        f.write(f"[{now.strftime('%H:%M:%S')}] SYNC_REMINDER_TRIGGERED:\n{msg}\n")

if __name__ == "__main__":
    send_reminder()
