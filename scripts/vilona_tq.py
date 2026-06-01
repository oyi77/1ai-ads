#!/usr/bin/env python3
"""
Vilona Telegram Queue — Simple message queue helper
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Usage:
  vilona_tg "Pesan penting!"              # Send to Veris
  vilona_tg --self "Test message"         # Send to self
  vilona_tg --urgent "EMERGENCY!"         # Send urgent
  
Messages are queued and picked up by vilona-telegram daemon.
"""

import json, sys, os, argparse

QUEUE_FILE = "/tmp/vilona_telegram_queue.json"

def queue_message(text, target="veris", silent=False):
    """Add message to queue file"""
    messages = []
    if os.path.exists(QUEUE_FILE):
        try:
            with open(QUEUE_FILE) as f:
                messages = json.load(f)
        except:
            messages = []
    
    messages.append({
        "text": text,
        "target": target,
        "silent": silent,
        "timestamp": __import__('time').time()
    })
    
    with open(QUEUE_FILE, 'w') as f:
        json.dump(messages, f)
    
    return True

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Vilona Telegram Queue')
    parser.add_argument('message', nargs='?', help='Message text')
    parser.add_argument('--self', dest='target_self', action='store_true', help='Send to self')
    parser.add_argument('--urgent', action='store_true', help='Mark as urgent')
    parser.add_argument('--silent', action='store_true', help='No notification sound')
    
    args = parser.parse_args()
    
    if not args.message:
        # Read from stdin
        if not sys.stdin.isatty():
            args.message = sys.stdin.read().strip()
        else:
            print("Usage: vilona_tq <message>")
            print("   or: echo 'message' | vilona_tq")
            sys.exit(1)
    
    target = "self" if args.target_self else "veris"
    queue_message(args.message, target=target, silent=args.silent)
    print(f"📨 Queued → {target}")
