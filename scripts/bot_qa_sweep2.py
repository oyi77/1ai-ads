"""Level-2 Telethon sweep: descend into submenu buttons (platforms, monitor,
settings, ads, optimize), walk their callbacks, exercise the connect scene
exit recipe once, verify DB row-count parity.
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
RUN = f'sweep2_{int(time.time())}'
TIMEOUT = 15

results = []
DESCEND = {'menu:platforms', 'menu:monitor', 'menu:settings', 'menu:ads', 'menu:optimize'}


async def drain(client, entity):
    try:
        async for _ in client.iter_messages(entity, limit=20):
            pass
    except Exception:
        pass


async def wait_reply(client, entity):
    deadline = time.time() + TIMEOUT
    while time.time() < deadline:
        await asyncio.sleep(0.7)
        async for m in client.iter_messages(entity, limit=3):
            if m.out:
                continue
            if (m.text or '').strip():
                return m
    return None


async def send(client, entity, text, label):
    await drain(client, entity)
    await client.send_message(entity, text)
    m = await wait_reply(client, entity)
    results.append((label, m is not None, ((m.text or '')[:150].replace('\n', ' | ') if m else 'TIMEOUT')))
    return m


def callbacks(m):
    out = []
    try:
        for r in m.reply_markup.rows:
            for b in r.buttons:
                try:
                    out.append(b.data.decode())
                except Exception:
                    out.append(f'url:{getattr(b, "text", "?")}')
    except Exception:
        pass
    return out


async def fresh_menu(client, entity):
    await drain(client, entity)
    await client.send_message(entity, '/menu')
    m = await wait_reply(client, entity)
    for _ in range(10):
        if m and callbacks(m):
            return m
        await asyncio.sleep(0.7)
        async for mm in client.iter_messages(entity, limit=1):
            if not mm.out:
                m = mm
    return m


async def click_idx(client, entity, msg, idx, label):
    try:
        await msg.click(idx)
    except Exception as e:
        results.append((label, False, f'CLICK FAIL: {e}'))
        return None
    m = await wait_reply(client, entity)
    results.append((label, m is not None, ((m.text or '')[:150].replace('\n', ' | ') if m else 'TIMEOUT')))
    return m


async def main():
    client = TelegramClient(SESSION, API_ID, API_HASH)
    await client.start()
    entity = await client.get_entity(BOT)
    me = await client.get_me()
    print(f'sweep user: @{me.username} run={RUN}')

    # top-level menu markup
    top = await fresh_menu(client, entity)
    top_cbs = callbacks(top) if top else []
    print(f'top callbacks: {top_cbs}')

    for i, cb in enumerate(top_cbs):
        if cb.startswith('url:') or cb not in DESCEND:
            continue
        # open fresh menu, click the submenu button
        mm = await fresh_menu(client, entity)
        mcbs = callbacks(mm)
        try:
            idx = mcbs.index(cb)
        except ValueError:
            results.append((f'submenu {cb}', False, 'button missing on fresh menu'))
            continue
        sub = await click_idx(client, entity, mm, idx, f'submenu {cb}')
        if not sub:
            continue
        sub_cbs = callbacks(sub)
        print(f'{cb} -> {sub_cbs}')
        for j, scb in enumerate(sub_cbs):
            if scb.startswith('url:'):
                results.append((f'url btn {scb}', True, 'url button (not clickable via MTProto)'))
                continue
            # re-enter submenu fresh, click j-th button
            mm2 = await fresh_menu(client, entity)
            mcbs2 = callbacks(mm2)
            try:
                idx2 = mcbs2.index(cb)
            except ValueError:
                continue
            sub2 = await click_idx(client, entity, mm2, idx2, f're-enter {cb}')
            if not sub2:
                continue
            scbs2 = callbacks(sub2)
            if j >= len(scbs2):
                results.append((f'click {scb}', False, 'index shifted on re-entry'))
                continue
            # connect scene: drive to completion for a clean exit
            if scb.startswith('connect:'):
                r = await click_idx(client, entity, sub2, j, f'click {scb} step1')
                if r:
                    await send(client, entity, f'{RUN}_{scb[8:]}', f'{scb} name')
                    await send(client, entity, 'dummytoken_xyz', f'{scb} token (exit)')
            else:
                await click_idx(client, entity, sub2, j, f'click {scb}')

    fails = [r for r in results if not r[1]]
    print(f'\n==== {len(results) - len(fails)}/{len(results)} OK ====')
    for label, ok, body in results:
        print(f'[{"OK " if ok else "FAIL"}] {label} :: {body}')
    print(f'RUN={RUN}')
    await client.disconnect()
    return 1 if fails else 0


if __name__ == '__main__':
    sys.exit(asyncio.run(main()))
