#!/usr/bin/env python3
"""
Telethon E2E QA: /create wizard — full flow through creative source picker
Tests: BM → Account → Objective → Name → Budget → Audience → Creative Source → Cancel
"""
import asyncio
import sys
sys.path.insert(0, '/home/openclaw/projects/1ai-ads')

from telethon import TelegramClient

API_ID = 23913448
API_HASH = '74a125d88683394acb7c5e1a3f6e404f'
SESSION = '/home/openclaw/.telethon_session/alwayscuanbos.session'
BOT = '@vilonaaiadsbot'

async def get_last_bot(client):
    msgs = await client.get_messages(BOT, limit=10)
    for m in msgs:
        if not m.out:
            return m
    return None

async def click_button(msg, text_substring):
    """Click an inline button whose text contains the substring."""
    if not msg or not msg.buttons:
        return False
    for row in msg.buttons:
        for btn in row:
            if text_substring.lower() in btn.text.lower():
                print(f"  Clicking: {btn.text}")
                await btn.click()
                return True
    return False

async def main():
    client = TelegramClient(SESSION, API_ID, API_HASH)
    await client.start()
    me = await client.get_me()
    print(f"Connected as: {me.first_name} (@{me.username})")

    # ── Clear wizard state ──
    print("\n--- Clearing wizard state ---")
    await client.send_message(BOT, '/cancel')
    await asyncio.sleep(2)
    await client.send_message(BOT, '/cancel')
    await asyncio.sleep(1)

    # ── /create ──
    print("\n=== /create ===")
    await client.send_message(BOT, '/create')
    await asyncio.sleep(4)
    msg = await get_last_bot(client)
    if not msg:
        print("❌ No response"); return
    print(f"Bot: {msg.text[:300]}")
    if msg.buttons:
        for row in msg.buttons:
            print(f"  [{', '.join(b.text for b in row)}]")

    # ── Select BM (first button that's not Cancel) ──
    print("\n--- Selecting BM ---")
    clicked = False
    if msg.buttons:
        for row in msg.buttons:
            for btn in row:
                if 'batal' not in btn.text.lower() and 'cancel' not in btn.text.lower():
                    print(f"  Clicking BM: {btn.text}")
                    await btn.click()
                    clicked = True
                    break
            if clicked:
                break
    if not clicked:
        print("❌ No BM button found"); return
    await asyncio.sleep(4)
    msg = await get_last_bot(client)
    print(f"Bot: {msg.text[:300]}")
    if msg.buttons:
        for row in msg.buttons:
            print(f"  [{', '.join(b.text for b in row)}]")

    # ── Select Account ──
    print("\n--- Selecting Account ---")
    clicked = False
    if msg.buttons:
        for row in msg.buttons:
            for btn in row:
                if 'batal' not in btn.text.lower() and 'cancel' not in btn.text.lower():
                    print(f"  Clicking Account: {btn.text}")
                    await btn.click()
                    clicked = True
                    break
            if clicked:
                break
    if not clicked:
        print("❌ No Account button found"); return
    await asyncio.sleep(4)
    msg = await get_last_bot(client)
    print(f"Bot: {msg.text[:300]}")
    if msg.buttons:
        for row in msg.buttons:
            print(f"  [{', '.join(b.text for b in row)}]")

    # ── Select Objective ──
    print("\n--- Selecting Objective ---")
    clicked = False
    if msg.buttons:
        for row in msg.buttons:
            for btn in row:
                if 'traffic' in btn.text.lower() or 'sales' in btn.text.lower():
                    print(f"  Clicking Objective: {btn.text}")
                    await btn.click()
                    clicked = True
                    break
            if clicked:
                break
    if not clicked:
        print("❌ No Objective button found"); return
    await asyncio.sleep(4)
    msg = await get_last_bot(client)
    print(f"Bot: {msg.text[:300]}")
    if msg.buttons:
        for row in msg.buttons:
            print(f"  [{', '.join(b.text for b in row)}]")

    # ── Send Campaign Name ──
    print("\n--- Sending Campaign Name ---")
    await client.send_message(BOT, 'QA Test Campaign')
    await asyncio.sleep(3)
    msg = await get_last_bot(client)
    print(f"Bot: {msg.text[:300]}")
    if msg.buttons:
        for row in msg.buttons:
            print(f"  [{', '.join(b.text for b in row)}]")

    # ── Send Budget ──
    print("\n--- Sending Budget ---")
    await client.send_message(BOT, '50000')
    await asyncio.sleep(3)
    msg = await get_last_bot(client)
    print(f"Bot: {msg.text[:300]}")
    if msg.buttons:
        for row in msg.buttons:
            print(f"  [{', '.join(b.text for b in row)}]")

    # ── Send /skip for audience ──
    print("\n--- Sending /skip for audience ---")
    await client.send_message(BOT, '/skip')
    await asyncio.sleep(3)
    msg = await get_last_bot(client)
    print(f"\n=== CREATIVE SOURCE PICKER ===")
    print(f"Bot: {msg.text[:300]}")
    if msg.buttons:
        print("Buttons found:")
        for row in msg.buttons:
            btn_texts = [b.text for b in row]
            print(f"  [{', '.join(btn_texts)}]")

        # Verify all expected options
        all_btns = [b.text.lower() for row in msg.buttons for b in row]
        checks = {
            'Pick Post': any('pick post' in b or 'post' in b for b in all_btns),
            'Custom Image': any('image' in b for b in all_btns),
            'Custom Video': any('video' in b for b in all_btns),
            'Text-only': any('text' in b for b in all_btns),
            'Manual Post ID': any('manual' in b or 'post id' in b for b in all_btns),
            'Skip/AI': any('skip' in b or 'ai' in b for b in all_btns),
            'Cancel': any('batal' in b or 'cancel' in b for b in all_btns),
        }
        for name, ok in checks.items():
            print(f"  {'✅' if ok else '❌'} {name}")

    # ── Test Text-only option ──
    print("\n--- Testing Text-only option ---")
    clicked = await click_button(msg, 'text')
    if clicked:
        await asyncio.sleep(3)
        msg = await get_last_bot(client)
        print(f"Bot: {msg.text[:200]}")
        # Should ask for headline
        if msg and ('headline' in (msg.text or '').lower() or 'max 40' in (msg.text or '').lower()):
            print("✅ Text-only flow started — asking for headline")
        else:
            print(f"Response: {msg.text[:200] if msg else 'None'}")
    else:
        print("❌ No text-only button found")

    # ── Send headline ──
    print("\n--- Sending Headline ---")
    await client.send_message(BOT, 'QA Test Headline')
    await asyncio.sleep(3)
    msg = await get_last_bot(client)
    print(f"Bot: {msg.text[:200]}")

    # ── Send description ──
    print("\n--- Sending Description ---")
    await client.send_message(BOT, 'This is a QA test description for the creative flow.')
    await asyncio.sleep(3)
    msg = await get_last_bot(client)
    print(f"Bot: {msg.text[:200]}")

    # ── Send link ──
    print("\n--- Sending Link ---")
    await client.send_message(BOT, 'https://example.com/qa-test')
    await asyncio.sleep(3)
    msg = await get_last_bot(client)
    print(f"Bot: {msg.text[:300]}")
    if msg.buttons:
        for row in msg.buttons:
            print(f"  [{', '.join(b.text for b in row)}]")

    # ── Should show preview now ──
    print("\n--- Preview shown? ---")
    if msg and ('preview' in (msg.text or '').lower() or 'konfirmasi' in (msg.text or '').lower() or 'headline' in (msg.text or '').lower()):
        print("✅ Preview/confirmation screen shown")
    else:
        print(f"Response: {msg.text[:200] if msg else 'None'}")

    # ── Cancel before creating ──
    print("\n--- Cancelling (not creating) ---")
    clicked = await click_button(msg, 'batal')
    if not clicked:
        clicked = await click_button(msg, 'cancel')
    await asyncio.sleep(2)
    msg = await get_last_bot(client)
    if msg and 'cancel' in (msg.text or '').lower():
        print("✅ Cancelled successfully")
    else:
        print(f"Bot: {msg.text[:200] if msg else 'None'}")

    print("\n=== TELETHON QA COMPLETE ===")
    await client.disconnect()

if __name__ == '__main__':
    asyncio.run(main())
