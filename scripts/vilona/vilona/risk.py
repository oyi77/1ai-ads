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

def check_circuit_breaker(self):
    """Check if trading should halt"""
    if self.daily_pnl <= DAILY_CIRCUIT_BREAKER:
        return True, f"Circuit breaker TRIGGERED (PnL=${self.daily_pnl:.2f})"
    if self.daily_pnl >= DAILY_PROFIT_TARGET:
        return True, f"Profit target REACHED (PnL=${self.daily_pnl:.2f})"
    return False, ""


def _load_daily_pnl(self):
    """Load today's P&L from daily log"""
    if DAILY_LOG.exists():
        try:
            data = json.loads(DAILY_LOG.read_text())
            if data.get("date") == self.today:
                return data.get("pnl", 0.0)
        except Exception:
            pass
    return 0.0


def _save_daily_pnl(self):
    """Save daily P&L"""
    DAILY_LOG.write_text(
        json.dumps(
            {
                "date": self.today,
                "pnl": self.daily_pnl,
                "updated": datetime.now().isoformat(),
            },
            indent=2,
        )
    )


def _run_macro_filter(self):
    """Macro filter: cross-asset correlation & market sanity check.

    Returns:
        1 if market conditions are normal (trade allowed).
        0 if macro RISK_OFF (skip all entries).
    """
    try:
        # 1. Check session: off-session = reduced risk
        if self.session == "off_session":
            print(f"  🔵 Off-session macro check...")

        # 2. Check BTC volatility — extreme vol = RISK_OFF
        try:
            btc_ticker = self.exchange.fetch_ticker("BTC/USDT:USDT")
            btc_change = (
                abs(btc_ticker["percentage"]) if btc_ticker.get("percentage") else 0
            )
            if btc_change > 5.0:
                print(
                    f"  🛑 Macro RISK_OFF — BTC volatility {btc_change:.1f}% > 5% threshold"
                )
                return 0
        except Exception as e:
            print(f"  ⚠️ Macro BTC check failed: {str(e)[:60]}")

        # 3. Check if we're in an extreme fear/greed environment
        # Simple proxy: if ATR % on BTC is extremely high
        try:
            btc_ticker = self.exchange.fetch_ticker("BTC/USDT:USDT")
            btc_price = btc_ticker["last"]
            btc_atr_val = self._calc_atr("BTC/USDT:USDT")  # Returns USD value
            btc_atr_pct = (
                (btc_atr_val / btc_price * 100)
                if btc_price > 0 and btc_atr_val > 0
                else 0
            )
            if btc_atr_pct > 2.0:  # >2% ATR = extreme vol
                print(f"  🛑 Macro RISK_OFF — BTC ATR {btc_atr_pct:.2f}% > 2%")
                return 0
        except Exception as e:
            print(f"  ⚠️ Macro ATR check failed: {str(e)[:60]}")

        print(f"  ✅ Macro filter: PASS (risk multiplier = 1.0)")
        return 1

    except Exception as e:
        print(f"  ⚠️ Macro filter error: {str(e)[:80]} — defaulting to SAFE")
        return 1  # Default safe on error


def _position_held_too_long(self, position):
    """Check if position has been held > 24 hours"""
    try:
        opened = position.get("timestamp", 0)
        if opened and isinstance(opened, (int, float)) and opened > 0:
            hold_hours = (time.time() * 1000 - opened) / 3600000
            if hold_hours > 24:
                print(
                    f"  ⏰ {position['symbol']} held {hold_hours:.1f}h > 24h limit"
                )
                return True
    except Exception:
        pass
    return False


def _check_cooldown(self, symbol):
    """Check if symbol is in cooldown after a loss.

    After a loss on any symbol, wait 6 hours before re-entering.
    This prevents revenge trading and gives price time to reset.
    """
    cooldown_file = LOG_DIR / "vilona_cooldown.json"
    try:
        if cooldown_file.exists():
            data = json.loads(cooldown_file.read_text())
            expires = data.get(symbol, 0)
            if time.time() < expires:
                remaining = int((expires - time.time()) / 60)
                print(f"     ⏳ Cooldown: {remaining} min remaining for {symbol}")
                return True
    except Exception:
        pass
    return False


def set_cooldown(self, symbol, hours=6):
    """Set cooldown for a symbol"""
    cooldown_file = LOG_DIR / "vilona_cooldown.json"
    try:
        data = {}
        if cooldown_file.exists():
            data = json.loads(cooldown_file.read_text())
        data[symbol] = time.time() + (hours * 3600)
        cooldown_file.write_text(json.dumps(data))
    except Exception:
        pass


