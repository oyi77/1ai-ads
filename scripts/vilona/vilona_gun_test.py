"""
VILONA GUN TEST — Open market, then close immediately.
Proves the weapon fires. Min size, min risk.
"""
import ccxt
import time
from datetime import datetime

API_KEY = 'bg_c1fb96084150a4b4a3caa85191640af2'
API_SECRET = 'eb62757df9d41fdfe5cb829448bd76cb5b7fe980f268dfb952b610d3cb9bf0a3'
PASSPHRASE = 'Sugehberkah'
SYMBOL = 'BTCUSDT'  # Most liquid, tight spread
LEVERAGE = 2
AMOUNT_USDT = 5  # Minimum test size

def log(msg):
    ts = datetime.now().strftime('%H:%M:%S')
    print(f"[{ts}] {msg}")

def main():
    ex = ccxt.bitget({
        'apiKey': API_KEY,
        'secret': API_SECRET,
        'password': PASSPHRASE,
        'options': {'defaultType': 'swap', 'createMarketBuyOrderRequiresPrice': False},
        'enableRateLimit': True,
    })

    log("🔌 Connecting...")
    balance = ex.fetch_balance()
    free = float(balance.get('USDT', {}).get('free', 0))
    log(f"💰 Balance: {free:.2f} USDT")

    # Set leverage
    try:
        ex.set_leverage(LEVERAGE, SYMBOL, params={'marginCoin': 'USDT', 'holdSide': 'long'})
        log(f"⚙️  Leverage set: {LEVERAGE}x")
    except Exception as e:
        log(f"⚠️  Leverage set skipped: {e}")

    # Get price
    ticker = ex.fetch_ticker(SYMBOL)
    price = ticker['last']
    log(f"📊 BTC Price: {price:.2f} USDT")

    # Calculate amount (contracts)
    # For BTCUSDT futures, amount is in BTC
    amount_btc = round(AMOUNT_USDT / price, 4)
    # Minimum contract size check
    market = ex.market(SYMBOL)
    min_amount = market.get('limits', {}).get('amount', {}).get('min', 0.001)
    if amount_btc < min_amount:
        amount_btc = min_amount
    log(f"📦 Order size: {amount_btc} BTC (~{amount_btc * price:.2f} USDT)")

    # OPEN LONG
    log("🚀 FIRING: OPEN LONG...")
    try:
        order = ex.create_order(
            symbol=SYMBOL,
            type='market',
            side='buy',
            amount=amount_btc,
            params={
                'tdMode': 'cross',
                # unilateral mode, no posSide
            }
        )
        log(f"✅ OPEN ORDER ID: {order['id']} | Status: {order['status']}")
    except Exception as e:
        log(f"🚨 OPEN FAILED: {e}")
        return False

    # Brief wait
    log("⏳ Holding 3 seconds...")
    time.sleep(3)

    # Check position
    try:
        positions = ex.fetch_positions([SYMBOL])
        for p in positions:
            if float(p.get('contracts', 0)) > 0:
                log(f"📍 Position confirmed: {p['contracts']} contracts @ {p.get('entryPrice', 'N/A')}")
    except Exception as e:
        log(f"⚠️  Position check: {e}")

    # CLOSE LONG
    log("🎯 CLOSING position...")
    try:
        close_order = ex.create_order(
            symbol=SYMBOL,
            type='market',
            side='sell',
            amount=amount_btc,
            params={
                'tdMode': 'cross',
                # unilateral mode, no posSide
                'reduceOnly': True,
            }
        )
        log(f"✅ CLOSE ORDER ID: {close_order['id']} | Status: {close_order['status']}")
    except Exception as e:
        log(f"🚨 CLOSE FAILED: {e}")
        return False

    log("🏁 GUN TEST COMPLETE — WEAPON IS OPERATIONAL ✅")
    return True

if __name__ == '__main__':
    success = main()
    exit(0 if success else 1)
