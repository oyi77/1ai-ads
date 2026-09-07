#!/usr/bin/env python3
"""Full bot path QA sweep via Telethon — drives every command + callback."""
import asyncio
import time
import sys
from telethon import TelegramClient
from telethon.tl.types import KeyboardButtonCallback, KeyboardButtonWebView, KeyboardButtonSimpleWebView

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
    """Collect all incoming messages for `secs` of silence."""
    msgs = []
    quiet = 0
    deadline = time.time() + 40
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
    return [[(b.text, getattr(b, 'data', None)) for b in row] for row in msg.buttons]

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
    ok('/start', f'reply: {m.text[:60]}...')
    btns = buttons_of(m)
    print(f'  Buttons: {btns}')

    # ── /menu ───────────────────────────────────────────────
    print('\n=== /menu ===')
    msgs = await send_and_drain(client, bot, '/menu')
    m = msgs[0] if msgs else None
    if not m:
        fail('/menu', 'no reply')
    else:
        ok('/menu', f'reply: {m.text[:60]}...')
        btns = buttons_of(m)
        print(f'  Buttons: {btns}')

    # ── /help ───────────────────────────────────────────────
    print('\n=== /help ===')
    msgs = await send_and_drain(client, bot, '/help')
    m = msgs[0] if msgs else None
    if not m:
        fail('/help', 'no reply')
    else:
        ok('/help', f'reply: {m.text[:60]}...')

    # ── /pricing ────────────────────────────────────────────
    print('\n=== /pricing ===')
    msgs = await send_and_drain(client, bot, '/pricing')
    m = msgs[0] if msgs else None
    if not m:
        fail('/pricing', 'no reply')
    else:
        ok('/pricing', f'reply: {m.text[:60]}...')

    # ── /status ─────────────────────────────────────────────
    print('\n=== /status ===')
    msgs = await send_and_drain(client, bot, '/status')
    m = msgs[0] if msgs else None
    if not m:
        fail('/status', 'no reply')
    else:
        ok('/status', f'reply: {m.text[:60]}...')

    # ── /settings ───────────────────────────────────────────
    print('\n=== /settings ===')
    msgs = await send_and_drain(client, bot, '/settings')
    m = msgs[0] if msgs else None
    if not m:
        fail('/settings', 'no reply')
    else:
        ok('/settings', f'reply: {m.text[:60]}...')
        btns = buttons_of(m)
        print(f'  Buttons: {btns}')

    # ── /ads ────────────────────────────────────────────────
    print('\n=== /ads ===')
    msgs = await send_and_drain(client, bot, '/ads', secs=10)
    m = msgs[0] if msgs else None
    if not m:
        fail('/ads', 'no reply')
    else:
        ok('/ads', f'reply: {m.text[:60]}...')
        btns = buttons_of(m)
        print(f'  Buttons: {btns}')

    # ── /monitor ────────────────────────────────────────────
    print('\n=== /monitor ===')
    msgs = await send_and_drain(client, bot, '/monitor')
    m = msgs[0] if msgs else None
    if not m:
        fail('/monitor', 'no reply')
    else:
        ok('/monitor', f'reply: {m.text[:60]}...')

    # ── /quick ──────────────────────────────────────────────
    print('\n=== /quick ===')
    msgs = await send_and_drain(client, bot, '/quick')
    m = msgs[0] if msgs else None
    if not m:
        fail('/quick', 'no reply')
    else:
        ok('/quick', f'reply: {m.text[:60]}...')

    # ── /cancel ─────────────────────────────────────────────
    print('\n=== /cancel ===')
    msgs = await send_and_drain(client, bot, '/cancel')
    m = msgs[0] if msgs else None
    if not m:
        fail('/cancel', 'no reply')
    else:
        ok('/cancel', f'reply: {m.text[:60]}...')

    # ── Callback: menu:status ───────────────────────────────
    print('\n=== Callback: menu:status ===')
    msgs = await send_and_drain(client, bot, '/menu')
    m = msgs[0] if msgs else None
    if not m or not m.buttons:
        fail('menu:status', 'no menu buttons')
    else:
        clicked = await click_button(client, bot, m, 'Dashboard')
        if clicked:
            ok('menu:status', f'reply: {clicked[0].text[:60]}...')
        else:
            fail('menu:status', 'button not found')

    # ── Callback: menu:create ───────────────────────────────
    print('\n=== Callback: menu:create ===')
    msgs = await send_and_drain(client, bot, '/menu')
    m = msgs[0] if msgs else None
    if not m or not m.buttons:
        fail('menu:create', 'no menu buttons')
    else:
        clicked = await click_button(client, bot, m, 'Create Campaign')
        if clicked:
            ok('menu:create', f'reply: {clicked[0].text[:60]}...')
        else:
            fail('menu:create', 'button not found')

    # ── Callback: menu:monitor ──────────────────────────────
    print('\n=== Callback: menu:monitor ===')
    msgs = await send_and_drain(client, bot, '/menu')
    m = msgs[0] if msgs else None
    if not m or not m.buttons:
        fail('menu:monitor', 'no menu buttons')
    else:
        clicked = await click_button(client, bot, m, 'Rules')
        if clicked:
            ok('menu:monitor', f'reply: {clicked[0].text[:60]}...')
        else:
            fail('menu:monitor', 'button not found')

    # ── Callback: menu:optimize ─────────────────────────────
    print('\n=== Callback: menu:optimize ===')
    msgs = await send_and_drain(client, bot, '/menu')
    m = msgs[0] if msgs else None
    if not m or not m.buttons:
        fail('menu:optimize', 'no menu buttons')
    else:
        clicked = await click_button(client, bot, m, 'AI Optimize')
        if clicked:
            ok('menu:optimize', f'reply: {clicked[0].text[:60]}...')
        else:
            fail('menu:optimize', 'button not found')

    # ── Callback: menu:ads ──────────────────────────────────
    print('\n=== Callback: menu:ads ===')
    msgs = await send_and_drain(client, bot, '/menu')
    m = msgs[0] if msgs else None
    if not m or not m.buttons:
        fail('menu:ads', 'no menu buttons')
    else:
        clicked = await click_button(client, bot, m, 'Ads Manager')
        if clicked:
            ok('menu:ads', f'reply: {clicked[0].text[:60]}...')
        else:
            fail('menu:ads', 'button not found')

    # ── Callback: menu:platforms ────────────────────────────
    print('\n=== Callback: menu:platforms ===')
    msgs = await send_and_drain(client, bot, '/menu')
    m = msgs[0] if msgs else None
    if not m or not m.buttons:
        fail('menu:platforms', 'no menu buttons')
    else:
        clicked = await click_button(client, bot, m, 'Platforms')
        if clicked:
            ok('menu:platforms', f'reply: {clicked[0].text[:60]}...')
        else:
            fail('menu:platforms', 'button not found')

    # ── Callback: menu:settings ─────────────────────────────
    print('\n=== Callback: menu:settings ===')
    msgs = await send_and_drain(client, bot, '/menu')
    m = msgs[0] if msgs else None
    if not m or not m.buttons:
        fail('menu:settings', 'no menu buttons')
    else:
        clicked = await click_button(client, bot, m, 'Settings')
        if clicked:
            ok('menu:settings', f'reply: {clicked[0].text[:60]}...')
        else:
            fail('menu:settings', 'button not found')

    # ── Callback: menu:pricing ──────────────────────────────
    print('\n=== Callback: menu:pricing ===')
    msgs = await send_and_drain(client, bot, '/menu')
    m = msgs[0] if msgs else None
    if not m or not m.buttons:
        fail('menu:pricing', 'no menu buttons')
    else:
        clicked = await click_button(client, bot, m, 'Pricing')
        if clicked:
            ok('menu:pricing', f'reply: {clicked[0].text[:60]}...')
        else:
            fail('menu:pricing', 'button not found')

    # ── Callback: menu:help ─────────────────────────────────
    print('\n=== Callback: menu:help ===')
    msgs = await send_and_drain(client, bot, '/menu')
    m = msgs[0] if msgs else None
    if not m or not m.buttons:
        fail('menu:help', 'no menu buttons')
    else:
        clicked = await click_button(client, bot, m, 'Help')
        if clicked:
            ok('menu:help', f'reply: {clicked[0].text[:60]}...')
        else:
            fail('menu:help', 'button not found')

    # ── Callback: quick:menu ────────────────────────────────
    print('\n=== Callback: quick:menu ===')
    msgs = await send_and_drain(client, bot, '/menu')
    m = msgs[0] if msgs else None
    if not m or not m.buttons:
        fail('quick:menu', 'no menu buttons')
    else:
        clicked = await click_button(client, bot, m, 'Menu')
        if clicked:
            ok('quick:menu', f'reply: {clicked[0].text[:60]}...')
        else:
            fail('quick:menu', 'button not found')

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
