import os
import asyncio
from telethon import TelegramClient, events

# Configuration
API_ID = 23913448
API_HASH = "78d168f985edf365a5cd9679a917a0b2"
SESSION_PATH = os.path.join(
    os.path.expanduser("~"),
    ".openclaw",
    "workspace",
    ".vilona",
    "sessions",
    "veris_forwarder.session",
)
PHONE_NUMBER = "+6285732740006"

# Forwarding Rules
# Ganti username/ID di bawah sesuai kebutuhan
SOURCE_CHANNELS = [
    "@VIP_CHANNEL_USERNAME",
    -1001234567890,
]  # Masukkan username atau ID channel VIP
DESTINATION = "me"  # "me" untuk Saved Messages, atau "@bot_username"

client = TelegramClient(SESSION_PATH, API_ID, API_HASH)


@client.on(events.NewMessage(chats=SOURCE_CHANNELS))
async def forwarder_handler(event):
    try:
        print(f"Mengirim pesan dari {event.chat_id} ke {DESTINATION}...")
        await client.send_message(DESTINATION, event.message)
    except Exception as e:
        print(f"Error forwarding: {e}")


async def main():
    print(f"Memulai Telegram Forwarder untuk {PHONE_NUMBER}...")
    await client.start(phone=PHONE_NUMBER)
    print("✅ Forwarder Aktif! Menunggu pesan baru...")
    await client.run_until_disconnected()


if __name__ == "__main__":
    loop = asyncio.get_event_loop()
    loop.run_until_complete(main())
