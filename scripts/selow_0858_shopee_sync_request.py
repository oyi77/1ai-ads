#!/usr/bin/env python3
import sys
import datetime

# We use the 'message' tool via a simple shell wrapper or direct print for the agent
# Since this runs in cron, we want it to trigger a message in the channel.
# In OpenClaw, we can use the 'openclaw message' CLI if available, or just log it 
# for the agent dispatcher.

def get_now_wib():
    return datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=7)))

def trigger_request():
    now = get_now_wib()
    # This message is intended for the user in Telegram
    msg = "📦 [0858] Data Shopee kemarin sudah keluar. Upload CSV Commission + Click Report kemarin. Saya akan analisis dan update budget besok."
    
    # In this environment, we write to a 'pending_tasks' or similar for the main agent
    # to pick up or we use the 'message' tool logic if we have an API key/endpoint.
    # For now, let's log it so it can be seen in the next turn or via monitoring.
    print(msg)
    
    # For the actual Telegram notification, we'll append to an 'outbox' file
    with open('/home/openclaw/.openclaw/workspace/logs/selow_0858_outbox.log', 'a') as f:
        f.write(f"[{now.strftime('%Y-%m-%d %H:%M:%S')}] TELEGRAM_SEND: {msg}\n")

if __name__ == "__main__":
    trigger_request()
