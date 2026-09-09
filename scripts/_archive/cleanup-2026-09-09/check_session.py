#!/usr/bin/env python3
"""Check what user the QA session maps to."""
import asyncio
from telethon import TelegramClient

API_ID = 23913448
API_HASH = '74a125d88683394acb7c5e1a3f6e404f'
SESSION = '/home/openclaw/.telethon_session/alwayscuanbos'

async def main():
    client = TelegramClient(SESSION, API_ID, API_HASH)
    await client.start()
    me = await client.get_me()
    print(f'Telegram ID: {me.id}')
    print(f'Username: {me.username}')
    print(f'First name: {me.first_name}')
    print(f'Last name: {me.last_name}')
    await client.disconnect()

asyncio.run(main())
