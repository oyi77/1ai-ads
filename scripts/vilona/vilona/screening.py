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

def screen_market(self):
    """Screen watchlist for high-volatility candidates"""
    print(
        f"\n📡 SCREENING — {self.session.upper()} | {datetime.now().strftime('%H:%M:%S')} WIB"
    )
    print(f"{'='*60}")

    candidates = []
    try:
        tickers = self.exchange.fetch_tickers(self.WATCHLIST)
    except Exception as e:
        print(f"  ❌ Ticker fetch failed: {str(e)[:80]}")
        return []

    for symbol, t in tickers.items():
        if not t.get("last"):
            continue
        change_24h = t.get("percentage", 0)
        volume = t.get("quoteVolume", 0) or 0
        high = t.get("high", t["last"])
        low = t.get("low", t["last"])
        volatility = ((high - low) / low) * 100 if low else 0

        candidates.append(
            {
                "symbol": symbol,
                "price": t["last"],
                "change_24h": change_24h,
                "volume": volume,
                "volatility": volatility,
                "high_24h": high,
                "low_24h": low,
                "bid": t.get("bid", t["last"]),
                "ask": t.get("ask", t["last"]),
            }
        )

        print(
            f"  {symbol:20s} | ${t['last']:<10.2f} | {change_24h:>+6.2f}% | Vol: ${volume/1e6:>7.2f}M"
        )

    # Sort by abs(change_24h) * volatility for momentum
    candidates.sort(
        key=lambda c: abs(c["change_24h"]) * c["volatility"], reverse=True
    )

    # Filter: volume > $1M, exclude low-volume
    candidates = [c for c in candidates if c["volume"] > 1_000_000]

    top3 = candidates[:3]
    print(f"\n  🏆 TOP 3 MOMENTUM PICKS:")
    for c in top3:
        print(
            f"     {c['symbol']:20s} | Δ{c['change_24h']:>+6.2f}% | Vol: ${c['volume']/1e6:,.2f}M"
        )

    return top3


def analyze_candidate(self, candidate):
    """Deep analysis of a trade candidate → entry decision

    THREE-LAYER VALIDATION:
    1. ATR-based TP/SL (matches market mover — Mas Veris's requirement)
    2. Fee check (profit > fees by 5x minimum)
    3. Position sizing (max $20 risk inclusive of fees)

    If any layer fails → SKIP. No exceptions.
    """
    symbol = candidate["symbol"]

    # Get OBI (for signal, bid/ask prices)
    obi, bid, ask = self.get_obi_signal(symbol)
    candidate["obi"] = obi
    candidate["bid"] = bid
    candidate["ask"] = ask

    # Get RSI
    rsi = self.get_rsi(symbol)
    candidate["rsi"] = rsi

    # Calculate ATR — this is the key: TP/SL matches ACTUAL market mover
    atr = self._calc_atr(symbol)
    candidate["atr"] = round(atr, 4)

    # Calculate confidence score
    score = self._calc_confidence(candidate, rsi)
    candidate["confidence"] = score

    # Determine direction & entry
    direction = None
    entry_price = 0
    if obi > OBI_ENTRY_LONG and rsi < 70 and rsi > 30:
        direction = "long"
        entry_price = bid  # Limit buy at bid = maker
    elif obi < OBI_ENTRY_SHORT and rsi > 30 and rsi < 70:
        direction = "short"
        entry_price = ask  # Limit sell at ask = maker

    candidate["direction"] = direction
    candidate["entry_price"] = entry_price

    if direction and entry_price > 0 and atr > 0:
        # LAYER 1: DYNAMIC TP/SL BASED ON ATR (market mover)
        tp_pct, sl_pct, tp_dist, sl_dist = self._calc_dynamic_tp_sl(
            entry_price, atr, self.session
        )

        # Calculate fee per position (maker entry 0.02%, worst-case exit 0.06%)
        fee_rate = MAKER_FEE + TAKER_FEE  # 0.08%

        if direction == "long":
            tp = entry_price + tp_dist
            sl = entry_price - sl_dist
        else:
            tp = entry_price - tp_dist
            sl = entry_price + sl_dist

        candidate["tp"] = tp
        candidate["sl"] = sl

        # Variables for TP/SL display
        gross_tp = tp_dist
        gross_sl = sl_dist

        # LAYER 2: FEE CHECK
        tp_fee_cost = entry_price * fee_rate
        sl_fee_cost = entry_price * fee_rate

        net_tp_pct = (gross_tp - tp_fee_cost) / entry_price
        net_sl_pct = (gross_sl + sl_fee_cost) / entry_price

        if gross_tp > 0:
            fee_ratio = tp_fee_cost / gross_tp
        else:
            fee_ratio = 99

        candidate["fee_ratio"] = round(fee_ratio * 100, 1)
        candidate["gross_tp_pct"] = round(gross_tp / entry_price * 100, 2)
        candidate["net_tp_pct"] = round(net_tp_pct * 100, 2)
        candidate["gross_sl_pct"] = round(gross_sl / entry_price * 100, 2)
        candidate["net_sl_pct"] = round(net_sl_pct * 100, 2)

        # Effective RR after fees
        if net_sl_pct > 0:
            effective_rr = net_tp_pct / net_sl_pct
        else:
            effective_rr = 0
        candidate["effective_rr"] = round(effective_rr, 2)

        leverage = self._get_leverage(score)
        candidate["leverage"] = leverage

        # LAYER 3: POSITION SIZING (risk $20 INCLUDING fees + funding)
        risk_pct = sl_pct + fee_rate

        # Micro-gap: Max risk is LOWER of fixed $20 OR 25% of remaining balance
        # This prevents 57% account loss in one trade when balance drops
        risk_amount = min(
            MAX_RISK_PER_TRADE, BALANCE_USDT * MAX_RISK_PCT_OF_BALANCE
        )

        # Micro-gap: Add funding cost to risk if position might cross funding time
        now_utc = datetime.now(timezone.utc)
        for fh in FUNDING_HOURS_UTC:
            if now_utc.hour < fh <= now_utc.hour + 6:  # Position will cross funding
                risk_pct += FUNDING_RATE_PER_CYCLE
                print(
                    f"     ⏰ +{FUNDING_RATE_PER_CYCLE*100:.2f}% funding cost (crosses {fh}:00 UTC)"
                )
                break

        # Weekend: 50% risk reduction (lower volume = wider spreads)
        if datetime.now().weekday() >= WEEKEND_SAT:
            risk_amount = risk_amount * WEEKEND_RISK_MULTIPLIER
            print(f"     📅 Weekend mode: risk ${risk_amount:.0f} (50% of normal)")

        position_size = (
            risk_amount / (entry_price * risk_pct) if entry_price > 0 else 0
        )
        candidate["size"] = round(position_size, 6)
        candidate["size_usdt"] = round(position_size * entry_price, 2)
        candidate["entry_fee"] = round(position_size * entry_price * MAKER_FEE, 2)
        candidate["exit_fee_est"] = round(
            position_size * entry_price * TAKER_FEE, 2
        )

        # VALIDATION GATES
        reasons = []
        if fee_ratio > 0.15:
            reasons.append(f"Fees eat {fee_ratio*100:.1f}% of TP")
        if effective_rr < 1.5:
            reasons.append(f"Net RR {effective_rr:.2f}:1 < 1.5")
        if net_tp_pct < 0.3:
            reasons.append(f"Net TP only {net_tp_pct:.2f}%")
        if atr / entry_price < 0.001:
            reasons.append(
                f"ATR too small (${atr:.2f} / {atr/entry_price*100:.3f}%)"
            )

        if reasons:
            candidate["direction"] = None
            candidate["reject_reason"] = " | ".join(reasons)
    elif direction and (atr == 0 or entry_price == 0):
        candidate["direction"] = None
        candidate["reject_reason"] = "ATR or price data unavailable"

    return candidate


def get_obi_signal(self, symbol):
    """Calculate Order Book Imbalance"""
    try:
        ob = self.exchange.fetch_order_book(symbol, limit=20)
        bid_vol = sum(b[1] for b in ob["bids"])
        ask_vol = sum(a[1] for a in ob["asks"])
        total = bid_vol + ask_vol
        if total == 0:
            return 0
        obi = (bid_vol - ask_vol) / total
        return obi, ob["bids"][0][0], ob["asks"][0][0]
    except Exception as e:
        print(f"  ⚠️ OBI error {symbol}: {str(e)[:60]}")
        return 0, 0, 0


def get_rsi(self, symbol, period=14):
    """Calculate RSI from recent candles"""
    try:
        ohlcv = self.exchange.fetch_ohlcv(symbol, "5m", limit=period + 1)
        closes = [c[4] for c in ohlcv]
        gains, losses = 0, 0
        for i in range(1, len(closes)):
            diff = closes[i] - closes[i - 1]
            if diff > 0:
                gains += diff
            else:
                losses += abs(diff)
        avg_gain = gains / period
        avg_loss = losses / period
        if avg_loss == 0:
            return 100
        rs = avg_gain / avg_loss
        return 100 - (100 / (1 + rs))
    except Exception as e:
        return 50  # Neutral fallback


