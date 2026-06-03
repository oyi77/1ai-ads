#!/usr/bin/env python3
"""Decision Center Auto-Notifier — sends daily briefing via Telegram Bot"""
import sys, os, subprocess, requests, json
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv

SCRIPT_DIR = Path(__file__).parent
PROJECT_DIR = SCRIPT_DIR.parent
DECIDE_OUTPUT = Path('/tmp/decide_latest.txt')

load_dotenv(PROJECT_DIR / '.env')
TELEGRAM_TOKEN = os.getenv('TELEGRAM_BOT_TOKEN', '')
TELEGRAM_CHAT_ID = os.getenv('TELEGRAM_CHAT_ID', '157228659')

def send_telegram(text):
    if not TELEGRAM_TOKEN:
        print("❌ No Telegram token")
        return False
    try:
        r = requests.post(
            f'https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage',
            json={'chat_id': TELEGRAM_CHAT_ID, 'text': text},
            timeout=10
        )
        return r.json().get('ok', False)
    except Exception as e:
        print(f"❌ Failed: {e}")
        return False

def run_decision():
    result = subprocess.run(
        ['python3', str(SCRIPT_DIR/'campaign_decision_center.py'), 'decide', '--days', '3', '--min-spend', '5000'],
        capture_output=True, text=True, timeout=120, cwd=str(PROJECT_DIR)
    )
    return result.stdout

def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else 'decide'
    output = run_decision()
    DECIDE_OUTPUT.write_text(output)
    
    lines = output.split('\n')
    sections = {'OVERVIEW': [], 'WINNERS': [], 'BONCOS': [], 'PRIORITY': []}
    current = None
    
    for line in lines:
        if '📊 OVERVIEW' in line: current = 'OVERVIEW'
        elif '🏆 WINNERS' in line: current = 'WINNERS'
        elif '💀 BONCOS' in line: current = 'BONCOS'
        elif '📋 PRIORITY' in line: current = 'PRIORITY'
        elif current and line.strip():
            sections[current].append(line)
    
    ts = datetime.now()
    if mode == 'daily':
        msg = [f"📋 DAILY BRIEFING — {ts.strftime('%d %B %Y')}"]
    else:
        msg = [f"📊 DECISION CENTER — {ts.strftime('%H:%M')}"]
    
    msg.append("")
    
    for line in sections['OVERVIEW'][:8]:
        if line.strip(): msg.append(line)
    
    if sections['PRIORITY']:
        msg.append("")
        msg.append("📋 PRIORITY ACTIONS:")
        msg.extend(sections['PRIORITY'][:10])
    
    if sections['WINNERS']:
        msg.append("")
        msg.append("🏆 TOP WINNERS:")
        for line in sections['WINNERS']:
            if 'Profit' in line and len(msg) < 25:
                msg.append(line)
    
    if sections['BONCOS']:
        msg.append("")
        msg.append("💀 BONCOS:")
        for line in sections['BONCOS']:
            if 'Loss' in line and len(msg) < 30:
                msg.append(line)
    
    msg.append("")
    msg.append("⚡ Auto Decision Center")
    
    full_msg = '\n'.join(msg)
    ok = send_telegram(full_msg[:4000])
    print(f"[{ts}] {'✅ Sent' if ok else '❌ Failed'}")

if __name__ == '__main__':
    main()
