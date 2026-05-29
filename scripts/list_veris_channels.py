import os
import asyncio
from telethon import TelegramClient

# Configuration
API_ID = 23913448
API_HASH = "78d168f985edf365a5cd9679a917a0b2"
SESSION_PATH = os.path.join(os.path.expanduser("~"), ".openclaw", "workspace", ".vilona", "sessions", "veris_forwarder.session")
PHONE_NUMBER = "+6285732740006"

client = TelegramClient(SESSION_PATH, API_ID, API_HASH)

async def main():
    await client.start(phone=PHONE_NUMBER)
    print("\n--- DAFTAR CHANNEL/GROUP ANDA ---\n")
    async for dialog in client.iter_dialogs():
        print(f"Name: {dialog.name} | ID: {dialog.id}")
    print("\n----------------------------------\n")

if __name__ == "__main__":
    asyncio.run(main())
