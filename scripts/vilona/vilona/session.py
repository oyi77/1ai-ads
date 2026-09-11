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

def _detect_session(self):
    """Detect current trading session based on WIB (UTC+7)

    Mentor's good sessions:
    - 07:00-09:00 WIB  → Asia open
    - 18:30-21:00 WIB  → NY open (high vol)
    - 23:00-01:00 WIB  → Late US session
    """
    now = datetime.now()
    h = now.hour
    m = now.minute
    total_min = h * 60 + m

    if 7 * 60 + 0 <= total_min < 9 * 60 + 0:
        return "asia_open"
    elif 18 * 60 + 30 <= total_min < 21 * 60 + 0:
        return "ny_open"
    elif 23 * 60 + 0 <= total_min < 25 * 60 + 0:
        return "late_us"
    elif 0 * 60 + 0 <= total_min < 1 * 60 + 0:
        return "late_us"
    else:
        return "off_session"


def _check_calendar(self):
    """Load 1-year crypto calendar for context-aware trading.

    Checks:
    - Current month seasonality (e.g., May = Sell in May)
    - Upcoming major events (FOMC/CPI within 7 days)
    - Weekend status
    - Optimal trading mode (aggressive/conservative/paused)

    Returns dict with trading_mode and advice.
    """
    cal_file = LOG_DIR / "vilona_1year_calendar.json"
    if not cal_file.exists():
        return {"mode": "normal", "advice": "", "events_upcoming": []}

    try:
        cal = json.loads(cal_file.read_text())
        now = datetime.now()
        today_str = now.strftime("%Y-%m-%d")

        # Get current month seasonality
        month = now.month
        seasonality = cal.get("seasonality", [])
        month_data = next((m for m in seasonality if m["month_num"] == month), {})

        # Find upcoming events within 7 days
        events = cal.get("major_events", [])
        upcoming = []
        for e in events:
            try:
                e_date = datetime.strptime(e["date"], "%Y-%m-%d")
                days_until = (e_date - now).days
                if 0 <= days_until <= 7:
                    upcoming.append(
                        {
                            "date": e["date"],
                            "event": e["event"],
                            "impact": e["impact"],
                            "days_until": days_until,
                        }
                    )
            except Exception:
                pass

        # Determine trading mode
        has_critical = any(e["impact"] == "critical" for e in upcoming)
        has_high = any(e["impact"] == "high" for e in upcoming)
        is_weekend = now.weekday() >= 5  # Sat=5, Sun=6

        if has_critical:
            mode = "ultra_conservative"
            advice = "⚠️ CRITICAL EVENT upcoming. Reduce positions. Tight SLs."
        elif has_high:
            mode = "conservative"
            advice = "📊 High-impact event within 7 days. Normal risk but avoid holding through event."
        elif month in [5, 6, 8]:
            mode = "conservative"
            advice = f'📉 {month_data.get("bias", "Bearish month")}. Tight SLs, smaller size.'
        elif month in [10, 11, 12]:
            mode = "aggressive"
            advice = f'🚀 {month_data.get("bias", "Bullish month")}. Full screening, normal risk.'
        elif is_weekend:
            mode = "conservative"
            advice = "📅 Weekend. Lower volume. 50% risk reduction."
        else:
            mode = "normal"
            advice = ""

        return {
            "mode": mode,
            "advice": advice,
            "month_bias": month_data.get("bias", ""),
            "upcoming_events": upcoming[:3],  # Top 3
            "is_weekend": is_weekend,
        }
    except Exception as e:
        print(f"  ⚠️ Calendar error: {str(e)[:60]}")
        return {"mode": "normal", "advice": "", "events_upcoming": []}


def _check_major_news(self):
    """Micro-gap: Skip trading near major economic news.
    Prevents flash crash / spike losses from FOMC/CPI/NFP.
    Now also consults 1-year calendar.
    """
    now = datetime.now()
    h, wd = now.hour, now.weekday()

    # Calendar check
    cal = self._check_calendar()
    if cal["mode"] == "ultra_conservative":
        return True

    # Simple heuristic: Wed/Fri 19:30-20:30 WIB = US data
    if wd in [2, 4] and 19 <= h <= 21:
        return True
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


