"""Prove the pacc: rename end-to-end via the connected meta account.
Waits for the manage SCREEN (not a stale echo), asserts it renders and
every emitted callback fits 64 bytes with no old long scheme.
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


async def drain(client, entity):
    try:
        async for _ in client.iter_messages(entity, limit=20):
            pass
    except Exception:
        pass


async def wait_screen(client, entity, *needles, timeout=12):
    deadline = time.time() + timeout
    while time.time() < deadline:
        await asyncio.sleep(0.7)
        async for m in client.iter_messages(entity, limit=5):
            if m.out:
                continue
            if any(n in (m.text or '') for n in needles):
                return m
    return None


def cbs(m):
    out = []
    try:
        for r in m.reply_markup.rows:
            for b in r.buttons:
                try:
                    out.append(b.data.decode())
                except Exception:
                    out.append('url:...')
    except Exception:
        pass
    return out


async def main():
    client = TelegramClient(SESSION, API_ID, API_HASH)
    await client.start()
    entity = await client.get_entity(BOT)
    ok = True

    await drain(client, entity)
    await client.send_message(entity, '/menu')
    m = await wait_screen(client, entity, 'AdForge Menu')
    await m.click(cbs(m).index('menu:platforms'))
    sub = await wait_screen(client, entity, 'Connect or manage')
    sc = cbs(sub)
    if 'platform:meta:manage' not in sc:
        print(f'NOTE meta state: {[c for c in sc if "meta" in c]}')
        return 1
    await sub.click(sc.index('platform:meta:manage'))
    r = await wait_screen(client, entity, 'Accounts', 'action failed', timeout=15)
    body = (r.text or '')[:200] if r else 'TIMEOUT'
    print(f'meta manage reply: {body}')
    if not r or 'Platform action failed' in body:
        print('FAIL: manage broken')
        ok = False
    else:
        for c in cbs(r):
            n = len(c.encode())
            print(f'  [{"OK " if n <= 64 else "OVER"} {n}B] {c[:80]}')
            if n > 64:
                ok = False
            if 'platform:account:' in c:
                print('FAIL: old long scheme still emitted')
                ok = False
    await client.disconnect()
    print('RESULT:', 'PASS' if ok else 'FAIL')
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(asyncio.run(main()))
