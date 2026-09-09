#!/usr/bin/env python3
"""Telethon E2E QA: create-campaign wizard — Manual Post ID + Skip + age/budget receipt."""
import asyncio, sys
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

    await client.send_message(BOT, '/cancel'); await asyncio.sleep(2)
    await client.send_message(BOT, '/cancel'); await asyncio.sleep(1)

    # /create
    print("\n=== /create ===")
    await client.send_message(BOT, '/create'); await asyncio.sleep(4)
    msg = await get_last_bot(client)
    if not msg: print("NO RESPONSE"); return

    # BM -> objective (click lands objective) -> name
    print("\n--- BM/Objective click ---")
    clicked = False
    if msg.buttons:
        for row in msg.buttons:
            for btn in row:
                if 'batal' not in btn.text.lower() and 'cancel' not in btn.text.lower():
                    print(f"  Clicking: {btn.text}")
                    await btn.click(); clicked = True; break
            if clicked: break
    await asyncio.sleep(4)
    msg = await get_last_bot(client)
    print(f"Bot: {(msg.text or '')[:200]}")

    # Click Traffic objective
    print("\n--- Objective ---")
    clicked = await click_button(msg, 'traffic')
    if not clicked: print("NO OBJECTIVE BUTTON"); return
    await asyncio.sleep(4)
    msg = await get_last_bot(client)
    print(f"Bot: {(msg.text or '')[:200]}")

    # Name
    print("\n--- Name ---")
    await client.send_message(BOT, 'QA ManualPost Campaign'); await asyncio.sleep(3)
    msg = await get_last_bot(client)
    print(f"Bot: {(msg.text or '')[:200]}")

    # Budget 50000
    print("\n--- Budget 50000 ---")
    await client.send_message(BOT, '50000'); await asyncio.sleep(3)
    msg = await get_last_bot(client)
    print(f"Bot: {(msg.text or '')[:200]}")

    # Audience /skip with custom ages -> check receipt
    print("\n--- Audience: Country: ID / Age: 21-55 ---")
    await client.send_message(BOT, 'Country: ID\nAge: 21-55\nGender: all'); await asyncio.sleep(3)
    msg = await get_last_bot(client)
    print(f"Bot: {(msg.text or '')[:400]}")

    # Manual Post ID
    print("\n--- Manual Post ID ---")
    clicked = await click_button(msg, 'manual')
    if not clicked: print("NO MANUAL BUTTON"); return
    await asyncio.sleep(3)
    msg = await get_last_bot(client)
    print(f"Bot: {(msg.text or '')[:200]}")

    await client.send_message(BOT, '123456789012345'); await asyncio.sleep(3)
    msg = await get_last_bot(client)
    print(f"Bot: {(msg.text or '')[:400]}")

    print("\n=== MANUAL POST ID QA COMPLETE ===")
    await client.disconnect()

if __name__ == '__main__':
    asyncio.run(main())
