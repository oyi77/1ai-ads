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

def _log_trade(self, entry):
    """Log trade to JSONL"""
    entry["timestamp"] = datetime.now().isoformat()
    with open(TRADES_LOG, "a") as f:
        f.write(json.dumps(entry) + "\n")


def _auto_rotate_logs(self):
    """Micro-gap: Auto-rotate log files when they exceed MAX_LOG_BYTES.
    Prevents disk overflow from months of 24/7 logging.
    """
    try:
        for f in [TRADES_LOG, DAILY_LOG]:
            if f.exists() and f.stat().st_size > MAX_LOG_BYTES:
                rotated = str(f) + f'.{datetime.now().strftime("%Y%m%d")}'
                f.rename(rotated)
                print(
                    f"  📦 Log rotated: {f.name} ({MAX_LOG_BYTES/1024/1024:.0f}MB)"
                )
    except Exception as e:
        print(f"  ⚠️ Log rotate error: {str(e)[:60]}")


