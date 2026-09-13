"""Live Telethon sweep of @vilonaaiadsbot button + command surface.
Session: alwayscuanbos (freshest). Run token isolates dummy rows for cleanup.
Usage: API_ID/API_HASH env, python3 scripts/bot_qa_sweep.py
"""
import asyncio
import os
import sys
import time

from telethon import TelegramClient

API_ID = int(os.environ.get('TG_API_ID', '23647272'))
API_HASH = os.environ.get('TG_API_HASH', '1f69a4e0f03e5f51dfa5b67ac7b5c49')
SESSION = os.path.expanduser('~/.telethon_session/alwayscuanbos')
BOT = '@vilonaaiadsbot'
RUN = f'sweep_{int(time.time())}'
TIMEOUT = 15

results = []


async def drain(client, entity, quiet=True):
    """Consume pending unread so the next reply is fresh."""
    try:
        async for _ in client.iter_messages(entity, limit=20):
            pass
    except Exception:
        pass


async def send_and_wait(client, entity, text, label):
    await drain(client, entity)
    await client.send_message(entity, text)
    deadline = time.time() + TIMEOUT
    while time.time() < deadline:
        await asyncio.sleep(0.7)
        async for m in client.iter_messages(entity, limit=3):
            if m.out:
                continue
            body = (m.text or '')[:300]
            if body:
                results.append((label, True, body.replace('\n', ' | ')[:160]))
                return m
    results.append((label, False, 'TIMEOUT — no reply'))
    return None


def dump_markup(m):
    rows = []
    try:
        kb = m.reply_markup
        for r in kb.rows:
            for b in r.buttons:
                try:
                    rows.append(b.data.decode())
                except Exception:
                    rows.append(str(getattr(b, 'text', '?')))
    except Exception:
        pass
    return rows


async def click_and_wait(client, entity, msg, index, label):
    try:
        await msg.click(index)
    except Exception as e:
        results.append((label, False, f'CLICK FAIL: {e}'))
        return None
    deadline = time.time() + TIMEOUT
    while time.time() < deadline:
        await asyncio.sleep(0.7)
        async for m in client.iter_messages(entity, limit=3):
            if m.out:
                continue
            body = (m.text or '')[:300]
            if body:
                results.append((label, True, body.replace('\n', ' | ')[:160]))
                return m
    results.append((label, False, 'TIMEOUT after click'))
    return None


async def get_markup_msg(client, entity, seed='/menu'):
    m = await send_and_wait(client, entity, seed, f'{seed} (markup seed)')
    for _ in range(10):
        if m and dump_markup(m):
            return m
        await asyncio.sleep(0.7)
        async for mm in client.iter_messages(entity, limit=1):
            if not mm.out:
                m = mm
    return m


async def main():
    client = TelegramClient(SESSION, API_ID, API_HASH)
    await client.start()
    entity = await client.get_entity(BOT)
    me = await client.get_me()
    print(f'sweep user: @{me.username} run={RUN}')

    # --- slash commands ---
    for cmd in ['/start', '/menu', '/help', '/status']:
        await send_and_wait(client, entity, cmd, f'slash {cmd}')

    # --- /menu markup walk ---
    m = await get_markup_msg(client, entity)
    callbacks = dump_markup(m) if m else []
    print(f'menu callbacks ({len(callbacks)}): {callbacks}')
    for i, cb in enumerate(callbacks):
        # fresh menu each time to avoid scene contamination
        mm = await get_markup_msg(client, entity)
        if not mm:
            results.append((f'click {cb}', False, 'no markup msg'))
            continue
        await click_and_wait(client, entity, mm, i, f'click {cb}')

    # --- connect scene exit recipe (one platform, cleanup after) ---
    mm = await get_markup_msg(client, entity)
    cbs = dump_markup(mm) if mm else []
    if any(c.startswith('connect:') for c in cbs):
        idx = next(i for i, c in enumerate(cbs) if c.startswith('connect:'))
        r1 = await click_and_wait(client, entity, mm, idx, 'connect:meta step1')
        if r1:
            await send_and_wait(client, entity, f'{RUN}_meta', 'connect name')
            await send_and_wait(client, entity, 'dummytoken_xyz', 'connect token (exit)')

    # --- summary ---
    fails = [r for r in results if not r[1]]
    print(f'\n==== {len(results) - len(fails)}/{len(results)} OK ====')
    for label, ok, body in results:
        print(f'[{"OK " if ok else "FAIL"}] {label} :: {body}')
    print(f'RUN={RUN}')
    await client.disconnect()
    return 1 if fails else 0


if __name__ == '__main__':
    sys.exit(asyncio.run(main()))
