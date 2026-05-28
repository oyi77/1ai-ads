from telethon import TelegramClient
import sys
import os
import asyncio

API_ID = 23913448
API_HASH = "78d168f985edf365a5cd9679a917a0b2"
SESSION_DIR = ".vilona/sessions"
SESSION_PATH = os.path.join(SESSION_DIR, "veris.session")
PHONE = "+6285732740006"

if not os.path.exists(SESSION_DIR):
    os.makedirs(SESSION_DIR)

import logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def main():
    logger.info(f"Starting login for {PHONE}...")
    client = TelegramClient(SESSION_PATH, API_ID, API_HASH)
    try:
        await client.start(phone=PHONE)
        print("SUCCESS_LOGIN")
    except Exception as e:
        logger.error(f"Error during login: {e}")
    finally:
        await client.disconnect()

if __name__ == "__main__":
    asyncio.run(main())
