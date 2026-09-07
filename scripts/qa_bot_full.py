#!/usr/bin/env python3
"""Full bot QA with real Meta token — tests all paths that need a live connection."""
import asyncio
import time
import json
from telethon import TelegramClient

API_ID = 23913448
API_HASH = '74a125d88683394acb7c5e1a3f6e404f'
SESSION = '/home/openclaw/.telethon_session/alwayscuanbos'
BOT = '@vilonaaiadsbot'

results = []

def ok(name, detail=''):
    results.append(('PASS', name, detail))
    print(f'  ✅ {name} {detail}')

def fail(name, detail=''):
    results.append(('FAIL', name, detail))
    print(f'  ❌ {name} {detail}')

async def drain(client, bot, secs=8):
    msgs = []
    quiet = 0
    deadline = time.time() + 60
    while time.time() < deadline and quiet < secs:
        await asyncio.sleep(2)
        new = await client.get_messages(bot, limit=5)
        incoming = [m for m in new if not m.out and m.id not in {x.id for x in msgs}]
        if incoming:
            msgs.extend(incoming)
            quiet = 0
        else:
            quiet += 2
    return msgs

async def send_and_drain(client, bot, text, secs=8):
    await client.send_message(bot, text)
    return await drain(client, bot, secs)

def buttons_of(msg):
    if not msg or not msg.buttons:
        return []
    return [[b.text for b in row] for row in msg.buttons]

def find_button(msg, text_contains):
    if not msg or not msg.buttons:
        return None
    for row in msg.buttons:
        for i, b in enumerate(row):
            if text_contains.lower() in b.text.lower():
                return (row, i)
    return None

async def click_button(client, bot, msg, text_contains):
    target = find_button(msg, text_contains)
    if not target:
        return None
    row, idx = target
    await msg.click(idx)
    return await drain(client, bot)

async def main():
    client = TelegramClient(SESSION, API_ID, API_HASH)
    await client.start()
    bot = await client.get_input_entity(BOT)
    print(f'Connected to {BOT}')

    # ── /start ──────────────────────────────────────────────
    print('\n=== /start ===')
    msgs = await send_and_drain(client, bot, '/start')
    m = msgs[0] if msgs else None
    if not m:
        fail('/start', 'no reply')
        return
    ok('/start', f'reply: {m.text[:80]}...')
    btns = buttons_of(m)
    print(f'  Buttons: {btns}')

    # ── /menu ───────────────────────────────────────────────
    print('\n=== /menu ===')
    msgs = await send_and_drain(client, bot, '/menu')
    m = msgs[0] if msgs else None
    if not m:
        fail('/menu', 'no reply')
    else:
        ok('/menu', f'reply: {m.text[:80]}...')
        btns = buttons_of(m)
        print(f'  Buttons: {btns}')

    # ── /ads (should show connected Meta account) ───────────
    print('\n=== /ads (with real Meta token) ===')
    msgs = await send_and_drain(client, bot, '/ads', secs=15)
    m = msgs[0] if msgs else None
    if not m:
        fail('/ads', 'no reply')
    else:
        ok('/ads', f'reply: {m.text[:120]}...')
        btns = buttons_of(m)
        print(f'  Buttons: {btns}')
        # Check if Meta shows as connected
        if any('Meta' in str(row) and '✅' in str(row) for row in btns):
            ok('/ads', 'Meta account shows as CONNECTED ✅')
        elif any('Meta' in str(row) and '🔗' in str(row) for row in btns):
            fail('/ads', 'Meta account shows as NOT connected 🔗')
        else:
            fail('/ads', 'Meta account not found in list')

    # ── Click Meta (connected) → account management ─────────
    print('\n=== Click Meta in /ads ===')
    msgs = await send_and_drain(client, bot, '/menu')
    m = msgs[0] if msgs else None
    if m and m.buttons:
        clicked = await click_button(client, bot, m, 'Ads Manager')
        if clicked:
            m2 = clicked[0] if clicked else None
            if m2:
                ok('menu:ads', f'reply: {m2.text[:120]}...')
                btns2 = buttons_of(m2)
                print(f'  Buttons: {btns2}')
                # Find Meta button (should be ✅ connected)
                meta_btn = None
                for row in btns2:
                    for b in row:
                        if 'Meta' in b and '✅' in b:
                            meta_btn = b
                if meta_btn:
                    ok('menu:ads', f'Meta connected: {meta_btn}')
                else:
                    fail('menu:ads', 'Meta not showing as connected')
            else:
                fail('menu:ads', 'no reply after click')
        else:
            fail('menu:ads', 'button not found')
    else:
        fail('menu:ads', 'no menu buttons')

    # ── Click Meta → drill into accounts ────────────────────
    print('\n=== Click Meta account → campaigns ===')
    msgs = await send_and_drain(client, bot, '/menu')
    m = msgs[0] if msgs else None
    if m and m.buttons:
        clicked = await click_button(client, bot, m, 'Ads Manager')
        if clicked:
            m2 = clicked[0] if clicked else None
            if m2 and m2.buttons:
                # Find Meta button (✅ connected)
                meta_row = None
                meta_idx = None
                for row in m2.buttons:
                    for i, b in enumerate(row):
                        if 'Meta' in b.text and '✅' in b.text:
                            meta_row = row
                            meta_idx = i
                if meta_row:
                    await m2.click(meta_idx)
                    msgs3 = await drain(client, bot, secs=15)
                    m3 = msgs3[0] if msgs3 else None
                    if m3:
                        ok('Meta account', f'reply: {m3.text[:120]}...')
                        btns3 = buttons_of(m3)
                        print(f'  Buttons: {btns3}')
                    else:
                        fail('Meta account', 'no reply after click')
                else:
                    fail('Meta account', 'Meta button not found')
            else:
                fail('Meta account', 'no buttons in ads menu')
        else:
            fail('Meta account', 'Ads Manager button not found')
    else:
        fail('Meta account', 'no menu buttons')

    # ── /status ─────────────────────────────────────────────
    print('\n=== /status ===')
    msgs = await send_and_drain(client, bot, '/status')
    m = msgs[0] if msgs else None
    if not m:
        fail('/status', 'no reply')
    else:
        ok('/status', f'reply: {m.text[:120]}...')

    # ── /settings ───────────────────────────────────────────
    print('\n=== /settings ===')
    msgs = await send_and_drain(client, bot, '/settings')
    m = msgs[0] if msgs else None
    if not m:
        fail('/settings', 'no reply')
    else:
        ok('/settings', f'reply: {m.text[:120]}...')
        btns = buttons_of(m)
        print(f'  Buttons: {btns}')

    # ── /monitor ────────────────────────────────────────────
    print('\n=== /monitor ===')
    msgs = await send_and_drain(client, bot, '/monitor')
    m = msgs[0] if msgs else None
    if not m:
        fail('/monitor', 'no reply')
    else:
        ok('/monitor', f'reply: {m.text[:120]}...')

    # ── /help ───────────────────────────────────────────────
    print('\n=== /help ===')
    msgs = await send_and_drain(client, bot, '/help')
    m = msgs[0] if msgs else None
    if not m:
        fail('/help', 'no reply')
    else:
        ok('/help', f'reply: {m.text[:120]}...')

    # ── /pricing ────────────────────────────────────────────
    print('\n=== /pricing ===')
    msgs = await send_and_drain(client, bot, '/pricing')
    m = msgs[0] if msgs else None
    if not m:
        fail('/pricing', 'no reply')
    else:
        ok('/pricing', f'reply: {m.text[:120]}...')

    # ── /quick ──────────────────────────────────────────────
    print('\n=== /quick ===')
    msgs = await send_and_drain(client, bot, '/quick')
    m = msgs[0] if msgs else None
    if not m:
        fail('/quick', 'no reply')
    else:
        ok('/quick', f'reply: {m.text[:120]}...')

    # ── /cancel ─────────────────────────────────────────────
    print('\n=== /cancel ===')
    msgs = await send_and_drain(client, bot, '/cancel')
    m = msgs[0] if msgs else None
    if not m:
        fail('/cancel', 'no reply')
    else:
        ok('/cancel', f'reply: {m.text[:120]}...')

    # ── Summary ─────────────────────────────────────────────
    print('\n' + '='*60)
    passed = sum(1 for r in results if r[0] == 'PASS')
    failed = sum(1 for r in results if r[0] == 'FAIL')
    print(f'TOTAL: {passed} PASS, {failed} FAIL out of {len(results)}')
    if failed:
        print('\nFAILURES:')
        for r in results:
            if r[0] == 'FAIL':
                print(f'  ❌ {r[1]}: {r[2]}')
    print('='*60)

    await client.disconnect()

asyncio.run(main())
