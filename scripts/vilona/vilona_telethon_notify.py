#!/usr/bin/env python3
"""
Vilona Telethon Notifier — Bangunin pas ada action penting 🔔
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Posts as @codergaboets via Telethon user account.
Used by: spend_monitor_1041.py, CPC patrol, GAS-REM governor

Usage:
  from vilona_telethon_notify import send_alert
  
  send_alert("🛡️ CPC Patrol: 3 campaign dipause")
  send_alert("🚫 HARD STOP: Budget Rp 300rb habis!")
"""
import os, sys, asyncio, time
from pathlib import Path

SESSION_PATH = os.path.expanduser("~/.openclaw/workspace/.vilona/sessions/paijo.session")
API_ID = 23913448
API_HASH = "78d168f985edf365a5cd9679a917a0b2"

# Target chats (can be username, phone, or chat ID)
VERIS_USERNAME = "alwayscuanbos"     # Veris
VILONA_SELF = "codergaboets"         # diri sendiri (log channel)

# Fallback session path if main is locked
FALLBACK_SESSION = "/tmp/paijo_tmp.session"

_last_notify_time = 0
_MIN_INTERVAL = 60  # Minimum seconds between notifications (anti-spam)

def _get_client():
    """Get Telethon client with session lock fallback"""
    from telethon import TelegramClient
    
    session = SESSION_PATH
    if not os.path.exists(session):
        return None
    
    # Check if session is locked
    try:
        client = TelegramClient(session, API_ID, API_HASH)
        return client
    except Exception:
        # Try fallback copy
        try:
            if not os.path.exists(FALLBACK_SESSION):
                import shutil
                shutil.copy(session, FALLBACK_SESSION)
            return TelegramClient(FALLBACK_SESSION, API_ID, API_HASH)
        except:
            return None

def send_alert(message: str, target: str = "veris", silent: bool = False):
    """
    Send Telegram alert via Telethon.
    
    Args:
        message: Alert message text
        target: "veris" (alwayscuanbos), "self" (codergaboets), or both
        silent: If True, skip notification sound
    """
    global _last_notify_time
    
    # Anti-spam: don't send more than once per MIN_INTERVAL seconds
    now = time.time()
    if now - _last_notify_time < _MIN_INTERVAL and target == "veris":
        print(f"[NOTIFY] ⏭️ Skipped (anti-spam {_MIN_INTERVAL}s)")
        return False
    
    # Run async send in sync context
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            # We're in async context, schedule it
            asyncio.ensure_future(_async_send(message, target, silent))
            return True
    except RuntimeError:
        pass
    
    # Sync context: run in new loop
    try:
        asyncio.run(_async_send(message, target, silent))
        _last_notify_time = now
        return True
    except Exception as e:
        print(f"[NOTIFY] ❌ Failed: {e}")
        return False

async def _async_send(message: str, target: str, silent: bool):
    """Async send implementation"""
    from telethon import TelegramClient
    
    client = _get_client()
    if not client:
        print("[NOTIFY] ❌ No Telethon session")
        return
    
    try:
        await client.start()
        
        # Format message with timestamp
        from datetime import datetime
        ts = datetime.now().strftime('%H:%M')
        formatted = f"🤖 *Vilona Governor* [{ts} WIB]\n\n{message}"
        
        if target in ("veris", "both"):
            try:
                await client.send_message(VERIS_USERNAME, formatted, silent=silent)
                print(f"[NOTIFY] ✅ Sent to Veris (@{VERIS_USERNAME})")
            except Exception as e:
                print(f"[NOTIFY] ⚠️ Veris: {e}")
        
        if target in ("self", "both"):
            try:
                await client.send_message("me", formatted, silent=True)
                print(f"[NOTIFY] ✅ Sent to self")
            except Exception as e:
                print(f"[NOTIFY] ⚠️ Self: {e}")
        
        await client.disconnect()
    except Exception as e:
        print(f"[NOTIFY] ❌ Send error: {e}")
        try:
            await client.disconnect()
        except:
            pass

def send_batch_alerts(alerts: list, target: str = "veris"):
    """
    Send multiple alerts as one message (batched).
    Use for CPC patrol results to avoid spam.
    """
    if not alerts:
        return False
    
    combined = '\n'.join(alerts)
    return send_alert(combined, target=target)

# ===== TEST =====
if __name__ == '__main__':
    import sys
    
    if '--test' in sys.argv:
        print("Testing Telethon notification...")
        send_alert("✅ Test alert from Vilona Governor v6\n\nCPC: 0 campaigns > 150\nSpend: Rp 55,157 / Rp 300,000\nStatus: RUNNING", target="self")
        print("Done!")
    elif len(sys.argv) > 1:
        msg = ' '.join(sys.argv[1:])
        send_alert(msg, target="veris")
    else:
        print("Usage: python3 vilona_telethon_notify.py [--test] [message]")
