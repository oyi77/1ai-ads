#!/usr/bin/env python3
"""
VILONA AUTONOMOUS TRADER v1.0 — Bitget Crypto
==============================================
Protocol: Vilona Hunting Mode ($100 Account)
Exchange: Bitget (Futures/Swap via ccxt)
Screening: 07:00 | 15:00 | 20:00 WIB
Risk: Max $20/trade | Daily circuit breaker -$30
Leverage: Dynamic (5x-30x based on confidence)

Strategy: Order Book Imbalance (OBI) + Volatility Screening
"""

import os, sys, time, json, hmac, hashlib, requests
import ccxt
from datetime import datetime, timedelta, timezone
from pathlib import Path

# ─── LOGGING ─────────────────────────────────────────────────────────────────
LOG_DIR = Path(os.path.expanduser("~/.openclaw/workspace/logs/trading"))
LOG_DIR.mkdir(parents=True, exist_ok=True)
TRADES_LOG = LOG_DIR / "vilona_trades.jsonl"
DAILY_LOG = LOG_DIR / "vilona_daily.json"
CIRCUIT_LOGFILE = str(LOG_DIR / "vilona_circuit_triggered.txt")

# Auto-rotate logs when they exceed 10MB
MAX_LOG_BYTES = 10 * 1024 * 1024

# ─── CONFIG (FEE-AWARE) ────────────────────────────────────────────────────
BALANCE_USDT = 102.74
MAX_RISK_PER_TRADE = 20.0  # $20 max risk per trade
DAILY_CIRCUIT_BREAKER = -30.0  # Stop all if daily P&L <= -$30
DAILY_PROFIT_TARGET = 30.0  # Take a break if daily P&L >= $30

# Bitget Futures Fees (per side)
TAKER_FEE = 0.0006  # 0.06% - market orders
MAKER_FEE = 0.0002  # 0.02% - limit orders
ROUND_TRIP_MAKER = MAKER_FEE * 2  # 0.04%
ROUND_TRIP_TAKER = TAKER_FEE * 2  # 0.12%
ROUND_TRIP_MIXED = MAKER_FEE + TAKER_FEE  # 0.08%

# Minimum account balance to trade (prevents dust trading after losses)
MIN_BALANCE_TO_TRADE = 30.0  # Stop if balance < $30

# Micro-gap: Max risk as % of remaining balance (not fixed $20)
# Prevents 57% account loss in one trade when balance drops
MAX_RISK_PCT_OF_BALANCE = 0.25  # Max 25% of balance per trade

# Micro-gap: Funding rate cost (0.01% per 8h cycle on Bitget futures)
FUNDING_RATE_PER_CYCLE = 0.0001  # 0.01% every 8 hours
FUNDING_HOURS_UTC = [0, 8, 16]  # Funding times in UTC (07/15/23 WIB)

# Micro-gap: Max directional bias (prevent stacking same direction)
MAX_SAME_DIRECTION_POSITIONS = 1  # Max 1 position per direction

# Micro-gap: Major news events to pause around
# Format: (month, day, hour_utc, name) — auto-updates year
MAJOR_NEWS_EVENTS = [
    # Typically Wednesday/Friday, need to check calendar
    # These are approximate — can't predict exact dates months ahead
    # But for now, pause on these weekdays+times
]
NEWS_PAUSE_MINUTES = 30  # Pause 30 min before major news

# Weekend safety: reduce position size on Sat/Sun (lower volume = wider spreads)
WEEKEND_SAT = 5  # Saturday (Python: 0=Mon, 5=Sat, 6=Sun)
WEEKEND_SUN = 6
WEEKEND_RISK_MULTIPLIER = 0.5  # 50% of normal risk on weekends

# Fee buffer: minimum profit must exceed round trip fees by 5x to be worth it
MIN_PROFIT_FEE_RATIO = 5

LEVERAGE_TABLE = {
    "high": 30,  # confidence > 85
    "mid": 20,  # confidence 70-85
    "low": 10,  # confidence 55-70
    "skip": 5,  # confidence < 55
}

CONFIDENCE_WEIGHTS = {
    "obi": 0.30,  # Order Book Imbalance
    "trend": 0.25,  # Short-term trend (5m/15m)
    "volume": 0.20,  # Volume surge
    "rsi": 0.15,  # RSI positioning
    "season": 0.10,  # Session seasonality
}

# Target universe
WATCHLIST = [
    "BTC/USDT:USDT",
    "ETH/USDT:USDT",
    "SOL/USDT:USDT",
    "DOGE/USDT:USDT",
    "XRP/USDT:USDT",
    "PEPE/USDT:USDT",
    "BNB/USDT:USDT",
    "ADA/USDT:USDT",
    "AVAX/USDT:USDT",
    "LINK/USDT:USDT",
]

OBI_ENTRY_LONG = 0.20  # OBI > 0.20 = bullish entry
OBI_ENTRY_SHORT = -0.20  # OBI < -0.20 = bearish entry

# ─── ATR-BASED DYNAMIC TP/SL ────────────────────────────────────────────────
# Instead of fixed 1%/0.4%, TP/SL adapts to actual market volatility.
# TP = entry ± (ATR × multiplier)
# SL = entry ∓ (ATR × divisor)
#
# Session multipliers (adjusted for volatility differences):
# - Asia (07-09 WIB): Lower vol → wider TP multiplier, tighter SL
# - London (15-17 WIB): Medium vol → balanced
# - NY (20-22 WIB): Highest vol → tighter TP, wider SL for momentum

SESSION_TP_MULTIPLIER = {
    "asia_open": 1.5,  # TP = ATR × 1.5
    "london_open": 1.8,  # TP = ATR × 1.8
    "ny_open": 2.0,  # TP = ATR × 2.0
    "late_us": 1.6,  # TP = ATR × 1.6
}

SESSION_SL_MULTIPLIER = {
    "asia_open": 0.6,  # SL = ATR × 0.6
    "london_open": 0.7,  # SL = ATR × 0.7
    "ny_open": 0.8,  # SL = ATR × 0.8
    "late_us": 0.7,  # SL = ATR × 0.7
}

# Hard minimums to prevent fee erosion
MIN_TP_PCT = 0.006  # Never go below 0.6% TP
MIN_SL_PCT = 0.003  # Never go below 0.3% SL

# ATR calculation period (in 15m candles)
ATR_PERIOD = 14


# ─── STATE (LOG_DIR defined above) ─────────────────────────────────────────

from .config import *

def execute_trade(self, candidate):
    """Place the trade on Bitget — MAKER (LIMIT) order only.

    Fee Strategy:
    - Entry: LIMIT order → 0.02% maker fee
    - Exit: Track position, auto-place SL/TP as limit orders when possible
    - Never use market order unless emergency (circuit breaker / system stop)
    """
    symbol = candidate["symbol"]
    direction = candidate["direction"]
    entry = candidate["entry_price"]
    tp = candidate["tp"]
    sl = candidate["sl"]
    size = candidate["size"]
    leverage = candidate.get("leverage", 10)

    # Print fee analysis
    fee_ratio = candidate.get("fee_ratio", 0)
    effective_rr = candidate.get("effective_rr", 0)
    net_tp = candidate.get("net_tp_pct", 0)
    net_sl = candidate.get("net_sl_pct", 0)
    entry_fee = candidate.get("entry_fee", 0)
    exit_fee = candidate.get("exit_fee_est", 0)

    # Set leverage
    try:
        self.exchange.set_leverage(leverage, symbol)
        self.exchange.set_margin_mode("cross", symbol)
    except Exception as e:
        print(f"  ⚠️ Leverage set error: {str(e)[:60]}")

    side = "buy" if direction == "long" else "sell"

    atr_val = candidate.get("atr", 0)
    atr_pct = (atr_val / entry * 100) if entry > 0 and atr_val > 0 else 0

    print(f"\n  🔥 EXECUTING {direction.upper()} on {symbol}")
    print(f"     {'='*40}")
    print(f"     Session: {self.session.upper()}")
    print(f"     ATR(14): ${atr_val:.4f} ({atr_pct:.2f}% volatility)")
    print(
        f"     Market mover: {candidate['gross_tp_pct']}% TP / {candidate['gross_sl_pct']}% SL"
    )
    print(f"     {'─'*40}")
    print(f"     Entry Limit (MAKER): ${entry:.4f}")
    print(f"     Size: {size:.6f} ({candidate['size_usdt']} USDT)")
    print(f"     Leverage: {leverage}x")
    print(f"     {'─'*40}")
    print(f"     🎯 TP: ${tp:.4f} (+{candidate['gross_tp_pct']}% → net +{net_tp}%)")
    print(f"     🛑 SL: ${sl:.4f} ({candidate['gross_sl_pct']}% → net -{net_sl}%)")
    print(f"     {'─'*40}")
    print(f"     Fee Analysis (per trade):")
    print(f"        Entry (maker): ${entry_fee}")
    print(f"        Exit (est):   ${exit_fee}")
    print(f"        Fees eat:     {fee_ratio}% of gross TP")
    print(
        f"     Net RR: {effective_rr}:1 | Confidence: {candidate['confidence']}/100"
    )
    print(f"     {'='*40}")

    try:
        # Place entry order (LIMIT = MAKER = 0.02% fee)
        order = self.exchange.create_order(
            symbol,
            "limit",
            side,
            size,
            entry,
            {
                "posSide": "net",
                "marginCoin": "USDT",
                "timeInForce": "GTC",  # Good 'til cancelled
            },
        )

        order_id = order.get("id", "unknown")
        print(f"  ✅ MAKER order placed: {order_id}")

        # Log trade with fee data
        self._log_trade(
            {
                "action": "ENTRY",
                "symbol": symbol,
                "direction": direction,
                "entry": entry,
                "tp": tp,
                "sl": sl,
                "size": size,
                "size_usdt": candidate["size_usdt"],
                "leverage": leverage,
                "confidence": candidate["confidence"],
                "order_id": order_id,
                "session": self.session,
                "rsi": candidate.get("rsi"),
                "obi": candidate.get("obi"),
                "entry_fee": entry_fee,
                "exit_fee_est": exit_fee,
                "effective_rr": effective_rr,
                "fee_pct": fee_ratio,
            }
        )

        return order
    except Exception as e:
        print(f"  ❌ MAKER order failed: {str(e)[:200]}")
        self._log_trade(
            {
                "action": "FAILED",
                "symbol": symbol,
                "direction": direction,
                "error": str(e)[:200],
                "session": self.session,
            }
        )
        return None


def check_open_positions(self):
    """Monitor and manage open positions"""
    try:
        positions = self.exchange.fetch_positions()
        active = [p for p in positions if float(p.get("contracts", 0)) > 0]

        if not active:
            return []

        print(f"\n📊 POSITIONS ({len(active)} active):")
        for p in active:
            sym = p["symbol"]
            side = p["side"]
            entry = float(p["entryPrice"])
            size = float(p["contracts"])
            upnl = float(p["unrealizedPnl"])
            pnl_pct = (upnl / (entry * size)) * 100 if entry * size > 0 else 0
            print(
                f"  {sym:20s} | {side:5s} | Entry: ${entry:<8.2f} | Size: {size:<6.4f} | uPnL: ${upnl:<8.2f} ({pnl_pct:+.2f}%)"
            )

        return active
    except Exception as e:
        print(f"  ⚠️ Position check error: {str(e)[:80]}")
        return []


def close_position(self, position):
    """Close a position"""
    symbol = position["symbol"]
    side = position["side"]
    size = float(position["contracts"])
    close_side = "sell" if side == "long" else "buy"

    try:
        order = self.exchange.create_order(
            symbol,
            "market",
            close_side,
            size,
            {"posSide": "net", "marginCoin": "USDT"},
        )
        realized_pnl = float(position.get("unrealizedPnl", 0))
        self.daily_pnl += realized_pnl
        self._save_daily_pnl()

        self._log_trade(
            {
                "action": "CLOSE",
                "symbol": symbol,
                "direction": side,
                "size": size,
                "pnl": realized_pnl,
                "pnl_cumulative": self.daily_pnl,
                "session": self.session,
            }
        )

        print(f"  ✅ Closed {side.upper()} {symbol} | PnL: ${realized_pnl:.2f}")
        return order
    except Exception as e:
        print(f"  ❌ Close failed: {str(e)[:100]}")
        return None


def _cancel_stale_orders(self):
    """Cancel ALL unfilled orders on tracked symbols.

    Prevents stale limit orders from accumulating when:
    - Price moves away from entry and never comes back
    - Multiple cron cycles try to enter the same symbol
    - Daemon restarts with old orders still active
    """
    try:
        for symbol in WATCHLIST:
            try:
                open_orders = self.exchange.fetch_open_orders(symbol)
                for order in open_orders:
                    if order["status"] == "open":
                        self.exchange.cancel_order(order["id"], symbol)
                        print(
                            f"  🗑️ Canceled stale order {order['id'][:12]}... for {symbol}"
                        )
            except Exception as e:
                if "Order does not exist" not in str(e):
                    print(f"  ⚠️ Cancel orders {symbol}: {str(e)[:60]}")
    except Exception as e:
        print(f"  ⚠️ Cancel stale orders error: {str(e)[:80]}")


