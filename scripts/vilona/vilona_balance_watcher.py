import ccxt
import time
from datetime import datetime

exchange = ccxt.binance({
    'apiKey': 'qngkyvmWQvvNSFAW7ARNgLsJgyEJmi6eEqlgrKAhfB1ZLz4GD7YrjQTuvDgBazXV',
    'secret': 'BTAGw0Fq2jT5qaiQrBbRRVZeUBWylgqYpzpk2D7nWynN4xvswW04uzIdeun4dywU',
    'options': {'defaultType': 'future'},
})

def watch():
    print(f"[{datetime.now()}] 🛰️ VILONA BALANCE WATCHER ACTIVE...")
    while True:
        try:
            balance = exchange.fetch_balance()
            free_usdt = balance.get('USDT', {}).get('free', 0)
            if free_usdt >= 10:
                print(f"💰 DEPOSIT DETECTED: {free_usdt} USDT. INITIALIZING ENGINE...")
                break
            else:
                print(f"Waiting for deposit... (Current: {free_usdt} USDT)")
        except Exception as e:
            print(f"Error: {e}")
        time.sleep(60)

if __name__ == "__main__":
    watch()
