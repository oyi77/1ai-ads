# ─── CONSTANTS (from config.py) ─────────────────────────────────────────────
# ============================================
# VILONA AUTONOMOUS TRADER v1.0 — Bitget Crypto
# ============================================
# Protocol: Vilona Hunting Mode ($100 Account)
# Exchange: Bitget (Futures/Swap via ccxt)
# Screening: 07:00 | 15:00 | 20:00 WIB
# Risk: Max $20/trade | Daily circuit breaker -$30
# Leverage: Dynamic (5x-30x based on confidence)
#
# Strategy: Order Book Imbalance (OBI) + Volatility Screening
# ============================================

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
MAX_RISK_PER_TRADE = 20.0
DAILY_CIRCUIT_BREAKER = -30.0
DAILY_PROFIT_TARGET = 30.0

TAKER_FEE = 0.0006
MAKER_FEE = 0.0002
ROUND_TRIP_MAKER = MAKER_FEE * 2
ROUND_TRIP_TAKER = TAKER_FEE * 2
ROUND_TRIP_MIXED = MAKER_FEE + TAKER_FEE

MIN_BALANCE_TO_TRADE = 30.0
MAX_RISK_PCT_OF_BALANCE = 0.25

FUNDING_RATE_PER_CYCLE = 0.0001
FUNDING_HOURS_UTC = [0, 8, 16]

MAX_SAME_DIRECTION_POSITIONS = 1

MAJOR_NEWS_EVENTS = []
NEWS_PAUSE_MINUTES = 30

WEEKEND_SAT = 5
WEEKEND_SUN = 6
WEEKEND_RISK_MULTIPLIER = 0.5

MIN_PROFIT_FEE_RATIO = 5

LEVERAGE_TABLE = {
    "high": 30, "mid": 20, "low": 10, "skip": 5,
}

CONFIDENCE_WEIGHTS = {
    "obi": 0.30, "trend": 0.25, "volume": 0.20,
    "rsi": 0.15, "season": 0.10,
}

WATCHLIST = [
    "BTC/USDT:USDT", "ETH/USDT:USDT", "SOL/USDT:USDT",
    "DOGE/USDT:USDT", "XRP/USDT:USDT", "PEPE/USDT:USDT",
    "BNB/USDT:USDT", "ADA/USDT:USDT", "AVAX/USDT:USDT",
    "LINK/USDT:USDT",
]

OBI_ENTRY_LONG = 0.20
OBI_ENTRY_SHORT = -0.20

SESSION_TP_MULTIPLIER = {"asia_open": 1.5, "london_open": 1.8, "ny_open": 2.0, "late_us": 1.6}
SESSION_SL_MULTIPLIER = {"asia_open": 0.6, "london_open": 0.7, "ny_open": 0.8, "late_us": 0.7}
MIN_TP_PCT = 0.006
MIN_SL_PCT = 0.003
ATR_PERIOD = 14

# ─── IMPORTS FROM SUBMODULES ───────────────────────────────────────────────
from .session import *
from .indicators import *
from .risk import *
from .execution import *
from .screening import *
from .logging import *


class VilonaTrader:
    """Vilona Autonomous Trader — Bitget Futures with OBI + ATR strategy"""

    def __init__(self):
        self.WATCHLIST = WATCHLIST
        self.exchange = ccxt.bitget(
            {
                "apiKey": "bg_c1fb96084150a4b4a3caa85191640af2",
                "secret": "eb62757df9d41fdfe5cb829448bd76cb5b7fe980f268dfb952b610d3cb9bf0a3",
                "password": "Sugehberkah",
                "options": {
                    "defaultType": "swap",
                    "sandboxMode": False,
                },
            }
        )
        self.exchange.load_markets()
        self.daily_pnl = self._load_daily_pnl()
        self.today = datetime.now().strftime("%Y-%m-%d")
        self.session = self._detect_session()

    def run_screening_cycle(self):
        """Full screening + execution cycle"""
        print(f"\n{'='*60}")
        print(
            f"🤖 VILONA AUTONOMOUS TRADER — {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} WIB"
        )
        print(f"   Session: {self.session.upper()} | Daily PnL: ${self.daily_pnl:.2f}")
        print(f"{'='*60}")

        # GUARD 1: Run lock
        lock_file = LOG_DIR / "vilona_run.lock"
        if lock_file.exists():
            try:
                lock_age = time.time() - lock_file.stat().st_mtime
                pid_in_file = lock_file.read_text().strip()
                pid_still_running = False
                try:
                    pid_still_running = os.path.exists(f"/proc/{pid_in_file}")
                except Exception:
                    pass

                if lock_age < 120 and pid_still_running:
                    print(
                        f"  ⏭️ Another instance PID={pid_in_file} running ({lock_age:.0f}s ago)"
                    )
                    return
                elif lock_age < 120 and not pid_still_running:
                    print(f"  🗑️ Stale lock (PID {pid_in_file} dead). Removing...")
                    lock_file.unlink()
                else:
                    print(f"  ⚠️ Old lock ({lock_age:.0f}s). Removing...")
                    lock_file.unlink()
            except Exception:
                pass
        lock_file.write_text(str(os.getpid()))

        try:
            self._auto_rotate_logs()

            # MACRO FILTER
            macro_risk_mult = self._run_macro_filter()
            if macro_risk_mult == 0:
                print(f"  🛑 Macro RISK_OFF — skipping all entries")
                halted_early = True
            else:
                halted_early = False

            self._cancel_stale_orders()

            weekday = datetime.now().weekday()
            is_weekend = weekday >= WEEKEND_SAT
            if is_weekend:
                print(f"\n  📅 Weekend mode: 50% risk reduction (lower volume)")

            now_utc = datetime.now(timezone.utc)
            for fh in FUNDING_HOURS_UTC:
                if abs(now_utc.hour - fh) <= 1:
                    print(f"  ⏰ Near funding time ({fh}:00 UTC). Holding costs apply.")
                    break

            cal = self._check_calendar()
            if cal["advice"]:
                print(f"  📅 {cal['advice']}")
            if cal["mode"] == "ultra_conservative":
                print(f"  🛑 Ultra-conservative mode — skipping entries")
                halted_early = True
            elif cal["mode"] == "aggressive":
                print(f"  🚀 Aggressive mode — full screening + normal risk")
                halted_early = False
            else:
                halted_early = False

            if cal.get("upcoming_events"):
                for ev in cal["upcoming_events"]:
                    print(f"     📌 {ev['event']} ({ev['date']}, +{ev['days_until']}d)")

            near_news = self._check_major_news()
            if near_news and not halted_early:
                print(f"  📰 Near major US data release. Screening paused.")
                halted_early = True

            if not halted_early:
                try:
                    bal = self.exchange.fetch_balance()
                    free_usdt = bal.get("USDT", {}).get("free", 0)
                    if free_usdt < MIN_BALANCE_TO_TRADE:
                        print(
                            f"\n  🛑 Balance ${free_usdt:.2f} < min ${MIN_BALANCE_TO_TRADE}. Trading halted."
                        )
                        Path(CIRCUIT_LOGFILE).write_text(
                            f"Low balance: ${free_usdt:.2f} at {datetime.now().isoformat()}"
                        )
                        halted_early = True
                    else:
                        global BALANCE_USDT
                        BALANCE_USDT = free_usdt
                        print(f"  💰 Balance: ${free_usdt:.2f} USDT")
                        halted_early = False
                except Exception as e:
                    print(f"  ⚠️ Balance check error: {str(e)[:60]}")
                    halted_early = False

            if not halted_early:
                halted, reason = self.check_circuit_breaker()
                if halted:
                    print(f"\n  🛑 {reason}")
                    Path(CIRCUIT_LOGFILE).write_text(
                        f"Circuit breaker: {reason} at {datetime.now().isoformat()}"
                    )
                    halted_early = True

            if not halted_early:
                active_pos = self.check_open_positions()
                active_symbols = {p["symbol"] for p in active_pos}

                for pos in active_pos:
                    if self._position_held_too_long(pos):
                        print(
                            f"  ⏰ {pos['symbol']} held > 24h limit"
                        )
                        self.close_position(pos)

                active_pos = self.check_open_positions()
                active_symbols = {p["symbol"] for p in active_pos}

                if self.session != "off_session" and len(active_pos) < 3:
                    candidates = self.screen_market()
                    if candidates:
                        print(f"\n🔍 ANALYZING TOP CANDIDATES...")
                    entries = 0
                    for c in candidates:
                        if entries >= 1:
                            break

                        sym = c["symbol"]
                        if sym in active_symbols:
                            print(f"\n  {sym:20s} — ⏭️ Already in position")
                            continue

                        if self._check_cooldown(sym):
                            print(f"\n  {sym:20s} — ⏭️ Cooldown active")
                            continue

                        dir_signals = [p.get("side", "") for p in active_pos]
                        long_count = sum(1 for d in dir_signals if d == "long")
                        short_count = sum(1 for d in dir_signals if d == "short")
                        if long_count >= MAX_SAME_DIRECTION_POSITIONS and c.get("change_24h", 0) < -1:
                            print(
                                f"\n  {sym:20s} — ⏭️ Too many longs in downtrend ({long_count})"
                            )
                            continue
                        if short_count >= MAX_SAME_DIRECTION_POSITIONS and c.get("change_24h", 0) > 1:
                            print(
                                f"\n  {sym:20s} — ⏭️ Too many shorts in uptrend ({short_count})"
                            )
                            continue

                        analysis = self.analyze_candidate(c)
                        direction = analysis.get("direction")
                        conf = analysis.get("confidence", 0)

                        print(f"\n  {analysis['symbol']:20s}")
                        print(
                            f"     OBI: {analysis.get('obi', 0):+.3f} | RSI: {analysis.get('rsi', 0):.1f}"
                        )
                        if analysis.get("atr"):
                            atr_pct = (
                                analysis["atr"] / max(analysis["entry_price"], 1)
                            ) * 100
                            print(
                                f"     ATR: {atr_pct:.2f}% | TP: {analysis.get('gross_tp_pct', '?')}% | SL: {analysis.get('gross_sl_pct', '?')}%"
                            )
                        print(
                            f"     Score: {conf}/100 | Direction: {direction or 'NO SIGNAL'}"
                        )

                        if direction and conf >= 55:
                            self.execute_trade(analysis)
                            entries += 1
                        else:
                            reject = analysis.get(
                                "reject_reason",
                                f"OBI: {analysis.get('obi', 0):+.3f}, Conf: {conf}",
                            )
                            print(f"     ⏭️  Rejected: {reject}")
                else:
                    print(f"\n  ⏭️ Off-session or positions busy — monitoring only")

                print(f"\n{'='*60}")
                print(f"📋 SESSION SUMMARY")
                print(
                    f"   Session: {self.session.upper()} | Daily PnL: ${self.daily_pnl:.2f}"
                )
                print(f"   Positions: {len(active_pos)} active")
                print(
                    f"   Guards: run-lock, cooldown, stale-cancel, max-hold, calendar-1y"
                )
                print(f"{'='*60}\n")
        finally:
            try:
                if lock_file.exists():
                    lock_file.unlink()
            except Exception:
                pass


def main():
    trader = VilonaTrader()
    trader.run_screening_cycle()


if __name__ == "__main__":
    main()