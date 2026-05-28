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
LOG_DIR = Path(os.path.expanduser('~/.openclaw/workspace/logs/trading'))
LOG_DIR.mkdir(parents=True, exist_ok=True)
TRADES_LOG = LOG_DIR / 'vilona_trades.jsonl'
DAILY_LOG = LOG_DIR / 'vilona_daily.json'
CIRCUIT_LOGFILE = str(LOG_DIR / 'vilona_circuit_triggered.txt')

# Auto-rotate logs when they exceed 10MB
MAX_LOG_BYTES = 10 * 1024 * 1024

# ─── CONFIG (FEE-AWARE) ────────────────────────────────────────────────────
BALANCE_USDT = 102.74
MAX_RISK_PER_TRADE = 20.0        # $20 max risk per trade
DAILY_CIRCUIT_BREAKER = -30.0    # Stop all if daily P&L <= -$30
DAILY_PROFIT_TARGET = 30.0       # Take a break if daily P&L >= $30

# Bitget Futures Fees (per side)
TAKER_FEE = 0.0006   # 0.06% - market orders
MAKER_FEE = 0.0002   # 0.02% - limit orders
ROUND_TRIP_MAKER = MAKER_FEE * 2     # 0.04%
ROUND_TRIP_TAKER = TAKER_FEE * 2     # 0.12%
ROUND_TRIP_MIXED = MAKER_FEE + TAKER_FEE  # 0.08%

# Minimum account balance to trade (prevents dust trading after losses)
MIN_BALANCE_TO_TRADE = 30.0  # Stop if balance < $30

# Micro-gap: Max risk as % of remaining balance (not fixed $20)
# Prevents 57% account loss in one trade when balance drops
MAX_RISK_PCT_OF_BALANCE = 0.25  # Max 25% of balance per trade

# Micro-gap: Funding rate cost (0.01% per 8h cycle on Bitget futures)
FUNDING_RATE_PER_CYCLE = 0.0001  # 0.01% every 8 hours
FUNDING_HOURS_UTC = [0, 8, 16]    # Funding times in UTC (07/15/23 WIB)

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
WEEKEND_SAT = 5   # Saturday (Python: 0=Mon, 5=Sat, 6=Sun)
WEEKEND_SUN = 6
WEEKEND_RISK_MULTIPLIER = 0.5  # 50% of normal risk on weekends

# Fee buffer: minimum profit must exceed round trip fees by 5x to be worth it
MIN_PROFIT_FEE_RATIO = 5

LEVERAGE_TABLE = {
    'high': 30,   # confidence > 85
    'mid':  20,   # confidence 70-85
    'low':  10,   # confidence 55-70
    'skip': 5,    # confidence < 55
}

CONFIDENCE_WEIGHTS = {
    'obi': 0.30,        # Order Book Imbalance
    'trend': 0.25,      # Short-term trend (5m/15m)
    'volume': 0.20,     # Volume surge
    'rsi': 0.15,        # RSI positioning
    'season': 0.10,     # Session seasonality
}

# Target universe
WATCHLIST = [
    'BTC/USDT:USDT', 'ETH/USDT:USDT', 'SOL/USDT:USDT',
    'DOGE/USDT:USDT', 'XRP/USDT:USDT', 'PEPE/USDT:USDT',
    'BNB/USDT:USDT', 'ADA/USDT:USDT', 'AVAX/USDT:USDT',
    'LINK/USDT:USDT',
]

OBI_ENTRY_LONG = 0.20    # OBI > 0.20 = bullish entry
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
    'asia_open': 1.5,    # TP = ATR × 1.5
    'london_open': 1.8,  # TP = ATR × 1.8
    'ny_open': 2.0,      # TP = ATR × 2.0
    'late_us': 1.6,      # TP = ATR × 1.6
}

SESSION_SL_MULTIPLIER = {
    'asia_open': 0.6,    # SL = ATR × 0.6
    'london_open': 0.7,  # SL = ATR × 0.7
    'ny_open': 0.8,      # SL = ATR × 0.8
    'late_us': 0.7,      # SL = ATR × 0.7
}

# Hard minimums to prevent fee erosion
MIN_TP_PCT = 0.006  # Never go below 0.6% TP
MIN_SL_PCT = 0.003  # Never go below 0.3% SL

# ATR calculation period (in 15m candles)
ATR_PERIOD = 14

# ─── STATE (LOG_DIR defined above) ─────────────────────────────────────────
class VilonaTrader:
    def __init__(self):
        self.WATCHLIST = WATCHLIST
        self.exchange = ccxt.bitget({
            'apiKey': 'bg_c1fb96084150a4b4a3caa85191640af2',
            'secret': 'eb62757df9d41fdfe5cb829448bd76cb5b7fe980f268dfb952b610d3cb9bf0a3',
            'password': 'Sugehberkah',
            'options': {
                'defaultType': 'swap',
                'sandboxMode': False,
            }
        })
        self.exchange.load_markets()
        self.daily_pnl = self._load_daily_pnl()
        self.today = datetime.now().strftime('%Y-%m-%d')
        self.session = self._detect_session()
        
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
        
        if 7*60 + 0 <= total_min < 9*60 + 0:
            return 'asia_open'
        elif 18*60 + 30 <= total_min < 21*60 + 0:
            return 'ny_open'
        elif 23*60 + 0 <= total_min < 25*60 + 0:
            return 'late_us'
        elif 0*60 + 0 <= total_min < 1*60 + 0:
            return 'late_us'
        else:
            return 'off_session'
    
    def _load_daily_pnl(self):
        """Load today's P&L from daily log"""
        if DAILY_LOG.exists():
            try:
                data = json.loads(DAILY_LOG.read_text())
                if data.get('date') == self.today:
                    return data.get('pnl', 0.0)
            except:
                pass
        return 0.0
    
    def _save_daily_pnl(self):
        """Save daily P&L"""
        DAILY_LOG.write_text(json.dumps({
            'date': self.today,
            'pnl': self.daily_pnl,
            'updated': datetime.now().isoformat()
        }, indent=2))
    
    def _calc_atr(self, symbol, period=ATR_PERIOD):
        """Calculate Average True Range from 15m candles.
        
        ATR measures market volatility. Higher ATR = more price movement.
        Used to set dynamic TP/SL that match current market conditions.
        """
        import statistics
        try:
            ohlcv = self.exchange.fetch_ohlcv(symbol, '15m', limit=period+1)
            tr_values = []
            for i in range(1, len(ohlcv)):
                high, low, prev_close = ohlcv[i][2], ohlcv[i][3], ohlcv[i-1][4]
                tr = max(high - low, abs(high - prev_close), abs(low - prev_close))
                tr_values.append(tr)
            atr = statistics.mean(tr_values) if tr_values else 0
            return atr
        except Exception as e:
            print(f"  ⚠️ ATR calc error: {str(e)[:60]}")
            return 0
    
    def _calc_dynamic_tp_sl(self, entry_price, atr, session):
        """Calculate TP/SL based on ATR (market mover) instead of fixed %.
        
        Rationale (Mas Veris's insight):
        - Fixed 1.0% TP is too loose for low-volatility markets (never triggers)
        - Fixed 1.0% is too tight for high-volatility (leaves money on table)
        - ATR-based adapts to ACTUAL market conditions per symbol
        
        Session adjustment:
        - Asia: lower vol → wider TP, tighter SL to avoid noise
        - NY: higher vol → use full ATR range for momentum
        """
        tp_mult = SESSION_TP_MULTIPLIER.get(session, 1.5)
        sl_mult = SESSION_SL_MULTIPLIER.get(session, 0.6)
        
        # Dynamic TP/SL based on ATR
        tp_dist = atr * tp_mult
        sl_dist = atr * sl_mult
        
        # Convert to percentages for fee checking
        tp_pct = tp_dist / entry_price if entry_price > 0 else MIN_TP_PCT
        sl_pct = sl_dist / entry_price if entry_price > 0 else MIN_SL_PCT
        
        # Apply hard minimums (fee coverage)
        tp_pct = max(tp_pct, MIN_TP_PCT)
        sl_pct = max(sl_pct, MIN_SL_PCT)
        
        return tp_pct, sl_pct, tp_dist, sl_dist
    
    def _log_trade(self, entry):
        """Log trade to JSONL"""
        entry['timestamp'] = datetime.now().isoformat()
        with open(TRADES_LOG, 'a') as f:
            f.write(json.dumps(entry) + '\n')
    
    def check_circuit_breaker(self):
        """Check if trading should halt"""
        if self.daily_pnl <= DAILY_CIRCUIT_BREAKER:
            return True, f"Circuit breaker TRIGGERED (PnL=${self.daily_pnl:.2f})"
        if self.daily_pnl >= DAILY_PROFIT_TARGET:
            return True, f"Profit target REACHED (PnL=${self.daily_pnl:.2f})"
        return False, ""
    
    def screen_market(self):
        """Screen watchlist for high-volatility candidates"""
        print(f"\n📡 SCREENING — {self.session.upper()} | {datetime.now().strftime('%H:%M:%S')} WIB")
        print(f"{'='*60}")
        
        candidates = []
        try:
            tickers = self.exchange.fetch_tickers(self.WATCHLIST)
        except Exception as e:
            print(f"  ❌ Ticker fetch failed: {str(e)[:80]}")
            return []
        
        for symbol, t in tickers.items():
            if not t.get('last'):
                continue
            change_24h = t.get('percentage', 0)
            volume = t.get('quoteVolume', 0) or 0
            high = t.get('high', t['last'])
            low = t.get('low', t['last'])
            volatility = ((high - low) / low) * 100 if low else 0
            
            candidates.append({
                'symbol': symbol,
                'price': t['last'],
                'change_24h': change_24h,
                'volume': volume,
                'volatility': volatility,
                'high_24h': high,
                'low_24h': low,
                'bid': t.get('bid', t['last']),
                'ask': t.get('ask', t['last']),
            })
            
            print(f"  {symbol:20s} | ${t['last']:<10.2f} | {change_24h:>+6.2f}% | Vol: ${volume/1e6:>7.2f}M")
        
        # Sort by abs(change_24h) * volatility for momentum
        candidates.sort(key=lambda c: abs(c['change_24h']) * c['volatility'], reverse=True)
        
        # Filter: volume > $1M, exclude low-volume
        candidates = [c for c in candidates if c['volume'] > 1_000_000]
        
        top3 = candidates[:3]
        print(f"\n  🏆 TOP 3 MOMENTUM PICKS:")
        for c in top3:
            print(f"     {c['symbol']:20s} | Δ{c['change_24h']:>+6.2f}% | Vol: ${c['volume']/1e6:,.2f}M")
        
        return top3
    
    def get_obi_signal(self, symbol):
        """Calculate Order Book Imbalance"""
        try:
            ob = self.exchange.fetch_order_book(symbol, limit=20)
            bid_vol = sum(b[1] for b in ob['bids'])
            ask_vol = sum(a[1] for a in ob['asks'])
            total = bid_vol + ask_vol
            if total == 0:
                return 0
            obi = (bid_vol - ask_vol) / total
            return obi, ob['bids'][0][0], ob['asks'][0][0]
        except Exception as e:
            print(f"  ⚠️ OBI error {symbol}: {str(e)[:60]}")
            return 0, 0, 0
    
    def get_rsi(self, symbol, period=14):
        """Calculate RSI from recent candles"""
        try:
            ohlcv = self.exchange.fetch_ohlcv(symbol, '5m', limit=period+1)
            closes = [c[4] for c in ohlcv]
            gains, losses = 0, 0
            for i in range(1, len(closes)):
                diff = closes[i] - closes[i-1]
                if diff > 0: gains += diff
                else: losses += abs(diff)
            avg_gain = gains / period
            avg_loss = losses / period
            if avg_loss == 0: return 100
            rs = avg_gain / avg_loss
            return 100 - (100 / (1 + rs))
        except Exception as e:
            return 50  # Neutral fallback
    
    def analyze_candidate(self, candidate):
        """Deep analysis of a trade candidate → entry decision
        
        THREE-LAYER VALIDATION:
        1. ATR-based TP/SL (matches market mover — Mas Veris's requirement)
        2. Fee check (profit > fees by 5x minimum)
        3. Position sizing (max $20 risk inclusive of fees)
        
        If any layer fails → SKIP. No exceptions.
        """
        symbol = candidate['symbol']
        
        # Get OBI (for signal, bid/ask prices)
        obi, bid, ask = self.get_obi_signal(symbol)
        candidate['obi'] = obi
        candidate['bid'] = bid
        candidate['ask'] = ask
        
        # Get RSI
        rsi = self.get_rsi(symbol)
        candidate['rsi'] = rsi
        
        # Calculate ATR — this is the key: TP/SL matches ACTUAL market mover
        atr = self._calc_atr(symbol)
        candidate['atr'] = round(atr, 4)
        
        # Calculate confidence score
        score = self._calc_confidence(candidate, rsi)
        candidate['confidence'] = score
        
        # Determine direction & entry
        direction = None
        entry_price = 0
        if obi > OBI_ENTRY_LONG and rsi < 70 and rsi > 30:
            direction = 'long'
            entry_price = bid  # Limit buy at bid = maker
        elif obi < OBI_ENTRY_SHORT and rsi > 30 and rsi < 70:
            direction = 'short'
            entry_price = ask  # Limit sell at ask = maker
        
        candidate['direction'] = direction
        candidate['entry_price'] = entry_price
        
        if direction and entry_price > 0 and atr > 0:
            # LAYER 1: DYNAMIC TP/SL BASED ON ATR (market mover)
            tp_pct, sl_pct, tp_dist, sl_dist = self._calc_dynamic_tp_sl(entry_price, atr, self.session)
            
            # Calculate fee per position (maker entry 0.02%, worst-case exit 0.06%)
            fee_rate = MAKER_FEE + TAKER_FEE  # 0.08%
            
            if direction == 'long':
                tp = entry_price + tp_dist
                sl = entry_price - sl_dist
            else:
                tp = entry_price - tp_dist
                sl = entry_price + sl_dist
            
            candidate['tp'] = tp
            candidate['sl'] = sl
            
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
            
            candidate['fee_ratio'] = round(fee_ratio * 100, 1)
            candidate['gross_tp_pct'] = round(gross_tp / entry_price * 100, 2)
            candidate['net_tp_pct'] = round(net_tp_pct * 100, 2)
            candidate['gross_sl_pct'] = round(gross_sl / entry_price * 100, 2)
            candidate['net_sl_pct'] = round(net_sl_pct * 100, 2)
            
            # Effective RR after fees
            if net_sl_pct > 0:
                effective_rr = net_tp_pct / net_sl_pct
            else:
                effective_rr = 0
            candidate['effective_rr'] = round(effective_rr, 2)
            
            leverage = self._get_leverage(score)
            candidate['leverage'] = leverage
            
            # LAYER 3: POSITION SIZING (risk $20 INCLUDING fees + funding)
            risk_pct = sl_pct + fee_rate
            
            # Micro-gap: Max risk is LOWER of fixed $20 OR 25% of remaining balance
            # This prevents 57% account loss in one trade when balance drops
            risk_amount = min(MAX_RISK_PER_TRADE, BALANCE_USDT * MAX_RISK_PCT_OF_BALANCE)
            
            # Micro-gap: Add funding cost to risk if position might cross funding time
            now_utc = datetime.now(timezone.utc)
            for fh in FUNDING_HOURS_UTC:
                if now_utc.hour < fh <= now_utc.hour + 6:  # Position will cross funding
                    risk_pct += FUNDING_RATE_PER_CYCLE
                    print(f"     ⏰ +{FUNDING_RATE_PER_CYCLE*100:.2f}% funding cost (crosses {fh}:00 UTC)")
                    break
            
            # Weekend: 50% risk reduction (lower volume = wider spreads)
            if datetime.now().weekday() >= WEEKEND_SAT:
                risk_amount = risk_amount * WEEKEND_RISK_MULTIPLIER
                print(f"     📅 Weekend mode: risk ${risk_amount:.0f} (50% of normal)")
            
            position_size = risk_amount / (entry_price * risk_pct) if entry_price > 0 else 0
            candidate['size'] = round(position_size, 6)
            candidate['size_usdt'] = round(position_size * entry_price, 2)
            candidate['entry_fee'] = round(position_size * entry_price * MAKER_FEE, 2)
            candidate['exit_fee_est'] = round(position_size * entry_price * TAKER_FEE, 2)
            
            # VALIDATION GATES
            reasons = []
            if fee_ratio > 0.15:
                reasons.append(f"Fees eat {fee_ratio*100:.1f}% of TP")
            if effective_rr < 1.5:
                reasons.append(f"Net RR {effective_rr:.2f}:1 < 1.5")
            if net_tp_pct < 0.3:
                reasons.append(f"Net TP only {net_tp_pct:.2f}%")
            if atr / entry_price < 0.001:
                reasons.append(f"ATR too small (${atr:.2f} / {atr/entry_price*100:.3f}%)")
            
            if reasons:
                candidate['direction'] = None
                candidate['reject_reason'] = ' | '.join(reasons)
        elif direction and (atr == 0 or entry_price == 0):
            candidate['direction'] = None
            candidate['reject_reason'] = "ATR or price data unavailable"
        
        return candidate
    
    def _calc_confidence(self, c, rsi):
        """Calculate confidence score 0-100"""
        scores = {}
        
        # OBI score (0-100)
        obi_abs = abs(c.get('obi', 0))
        scores['obi'] = min(100, obi_abs * 200) * CONFIDENCE_WEIGHTS['obi']
        
        # Trend score based on 24h change
        chg = c.get('change_24h', 0)
        scores['trend'] = min(100, abs(chg) * 10) * CONFIDENCE_WEIGHTS['trend']
        
        # Volume score
        vol = c.get('volume', 0)
        scores['volume'] = min(100, vol / 10_000_000) * CONFIDENCE_WEIGHTS['volume']
        
        # RSI score
        rsi_score = 100 - abs(50 - rsi) * 2  # Higher if RSI far from neutral
        scores['rsi'] = max(0, rsi_score) * CONFIDENCE_WEIGHTS['rsi']
        
        # Session score
        session_scores = {'asia_open': 70, 'london_open': 85, 'ny_open': 90, 'off_session': 30}
        scores['season'] = session_scores.get(self.session, 30) * CONFIDENCE_WEIGHTS['season']
        
        total = sum(scores.values())
        return round(total, 1)
    
    def _get_leverage(self, confidence):
        """Map confidence to leverage"""
        if confidence > 85: return 30
        elif confidence >= 70: return 20
        elif confidence >= 55: return 10
        else: return 5
    
    def execute_trade(self, candidate):
        """Place the trade on Bitget — MAKER (LIMIT) order only.
        
        Fee Strategy:
        - Entry: LIMIT order → 0.02% maker fee
        - Exit: Track position, auto-place SL/TP as limit orders when possible
        - Never use market order unless emergency (circuit breaker / system stop)
        """
        symbol = candidate['symbol']
        direction = candidate['direction']
        entry = candidate['entry_price']
        tp = candidate['tp']
        sl = candidate['sl']
        size = candidate['size']
        leverage = candidate.get('leverage', 10)
        
        # Print fee analysis
        fee_ratio = candidate.get('fee_ratio', 0)
        effective_rr = candidate.get('effective_rr', 0)
        net_tp = candidate.get('net_tp_pct', 0)
        net_sl = candidate.get('net_sl_pct', 0)
        entry_fee = candidate.get('entry_fee', 0)
        exit_fee = candidate.get('exit_fee_est', 0)
        
        # Set leverage
        try:
            self.exchange.set_leverage(leverage, symbol)
            self.exchange.set_margin_mode('cross', symbol)
        except Exception as e:
            print(f"  ⚠️ Leverage set error: {str(e)[:60]}")
        
        side = 'buy' if direction == 'long' else 'sell'
        
        atr_val = candidate.get('atr', 0)
        atr_pct = (atr_val / entry * 100) if entry > 0 and atr_val > 0 else 0
        
        print(f"\n  🔥 EXECUTING {direction.upper()} on {symbol}")
        print(f"     {'='*40}")
        print(f"     Session: {self.session.upper()}")
        print(f"     ATR(14): ${atr_val:.4f} ({atr_pct:.2f}% volatility)")
        print(f"     Market mover: {candidate['gross_tp_pct']}% TP / {candidate['gross_sl_pct']}% SL")
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
        print(f"     Net RR: {effective_rr}:1 | Confidence: {candidate['confidence']}/100")
        print(f"     {'='*40}")
        
        try:
            # Place entry order (LIMIT = MAKER = 0.02% fee)
            order = self.exchange.create_order(
                symbol, 'limit', side, size, entry,
                {
                    'posSide': 'net',
                    'marginCoin': 'USDT',
                    'timeInForce': 'GTC',  # Good 'til cancelled
                }
            )
            
            order_id = order.get('id', 'unknown')
            print(f"  ✅ MAKER order placed: {order_id}")
            
            # Log trade with fee data
            self._log_trade({
                'action': 'ENTRY',
                'symbol': symbol,
                'direction': direction,
                'entry': entry,
                'tp': tp,
                'sl': sl,
                'size': size,
                'size_usdt': candidate['size_usdt'],
                'leverage': leverage,
                'confidence': candidate['confidence'],
                'order_id': order_id,
                'session': self.session,
                'rsi': candidate.get('rsi'),
                'obi': candidate.get('obi'),
                'entry_fee': entry_fee,
                'exit_fee_est': exit_fee,
                'effective_rr': effective_rr,
                'fee_pct': fee_ratio,
            })
            
            return order
        except Exception as e:
            print(f"  ❌ MAKER order failed: {str(e)[:200]}")
            self._log_trade({
                'action': 'FAILED',
                'symbol': symbol,
                'direction': direction,
                'error': str(e)[:200],
                'session': self.session,
            })
            return None
    
    def check_open_positions(self):
        """Monitor and manage open positions"""
        try:
            positions = self.exchange.fetch_positions()
            active = [p for p in positions if float(p.get('contracts', 0)) > 0]
            
            if not active:
                return []
            
            print(f"\n📊 POSITIONS ({len(active)} active):")
            for p in active:
                sym = p['symbol']
                side = p['side']
                entry = float(p['entryPrice'])
                size = float(p['contracts'])
                upnl = float(p['unrealizedPnl'])
                pnl_pct = (upnl / (entry * size)) * 100 if entry * size > 0 else 0
                print(f"  {sym:20s} | {side:5s} | Entry: ${entry:<8.2f} | Size: {size:<6.4f} | uPnL: ${upnl:<8.2f} ({pnl_pct:+.2f}%)")
            
            return active
        except Exception as e:
            print(f"  ⚠️ Position check error: {str(e)[:80]}")
            return []
    
    def close_position(self, position):
        """Close a position"""
        symbol = position['symbol']
        side = position['side']
        size = float(position['contracts'])
        close_side = 'sell' if side == 'long' else 'buy'
        
        try:
            order = self.exchange.create_order(
                symbol, 'market', close_side, size,
                {'posSide': 'net', 'marginCoin': 'USDT'}
            )
            realized_pnl = float(position.get('unrealizedPnl', 0))
            self.daily_pnl += realized_pnl
            self._save_daily_pnl()
            
            self._log_trade({
                'action': 'CLOSE',
                'symbol': symbol,
                'direction': side,
                'size': size,
                'pnl': realized_pnl,
                'pnl_cumulative': self.daily_pnl,
                'session': self.session,
            })
            
            print(f"  ✅ Closed {side.upper()} {symbol} | PnL: ${realized_pnl:.2f}")
            return order
        except Exception as e:
            print(f"  ❌ Close failed: {str(e)[:100]}")
            return None
    
    def _auto_rotate_logs(self):
        """Micro-gap: Auto-rotate log files when they exceed MAX_LOG_BYTES.
        Prevents disk overflow from months of 24/7 logging.
        """
        try:
            for f in [TRADES_LOG, DAILY_LOG]:
                if f.exists() and f.stat().st_size > MAX_LOG_BYTES:
                    rotated = str(f) + f'.{datetime.now().strftime("%Y%m%d")}'
                    f.rename(rotated)
                    print(f"  📦 Log rotated: {f.name} ({MAX_LOG_BYTES/1024/1024:.0f}MB)")
        except Exception as e:
            print(f"  ⚠️ Log rotate error: {str(e)[:60]}")
    
    def _check_calendar(self):
        """Load 1-year crypto calendar for context-aware trading.
        
        Checks:
        - Current month seasonality (e.g., May = Sell in May)
        - Upcoming major events (FOMC/CPI within 7 days)
        - Weekend status
        - Optimal trading mode (aggressive/conservative/paused)
        
        Returns dict with trading_mode and advice.
        """
        cal_file = LOG_DIR / 'vilona_1year_calendar.json'
        if not cal_file.exists():
            return {'mode': 'normal', 'advice': '', 'events_upcoming': []}
        
        try:
            cal = json.loads(cal_file.read_text())
            now = datetime.now()
            today_str = now.strftime('%Y-%m-%d')
            
            # Get current month seasonality
            month = now.month
            seasonality = cal.get('seasonality', [])
            month_data = next((m for m in seasonality if m['month_num'] == month), {})
            
            # Find upcoming events within 7 days
            events = cal.get('major_events', [])
            upcoming = []
            for e in events:
                try:
                    e_date = datetime.strptime(e['date'], '%Y-%m-%d')
                    days_until = (e_date - now).days
                    if 0 <= days_until <= 7:
                        upcoming.append({
                            'date': e['date'],
                            'event': e['event'],
                            'impact': e['impact'],
                            'days_until': days_until,
                        })
                except:
                    pass
            
            # Determine trading mode
            has_critical = any(e['impact'] == 'critical' for e in upcoming)
            has_high = any(e['impact'] == 'high' for e in upcoming)
            is_weekend = now.weekday() >= 5  # Sat=5, Sun=6
            
            if has_critical:
                mode = 'ultra_conservative'
                advice = '⚠️ CRITICAL EVENT upcoming. Reduce positions. Tight SLs.'
            elif has_high:
                mode = 'conservative'
                advice = '📊 High-impact event within 7 days. Normal risk but avoid holding through event.'
            elif month in [5, 6, 8]:
                mode = 'conservative'
                advice = f'📉 {month_data.get("bias", "Bearish month")}. Tight SLs, smaller size.'
            elif month in [10, 11, 12]:
                mode = 'aggressive'
                advice = f'🚀 {month_data.get("bias", "Bullish month")}. Full screening, normal risk.'
            elif is_weekend:
                mode = 'conservative'
                advice = '📅 Weekend. Lower volume. 50% risk reduction.'
            else:
                mode = 'normal'
                advice = ''
            
            return {
                'mode': mode,
                'advice': advice,
                'month_bias': month_data.get('bias', ''),
                'upcoming_events': upcoming[:3],  # Top 3
                'is_weekend': is_weekend,
            }
        except Exception as e:
            print(f"  ⚠️ Calendar error: {str(e)[:60]}")
            return {'mode': 'normal', 'advice': '', 'events_upcoming': []}
    
    def _check_major_news(self):
        """Micro-gap: Skip trading near major economic news.
        Prevents flash crash / spike losses from FOMC/CPI/NFP.
        Now also consults 1-year calendar.
        """
        now = datetime.now()
        h, wd = now.hour, now.weekday()
        
        # Calendar check
        cal = self._check_calendar()
        if cal['mode'] == 'ultra_conservative':
            return True
        
        # Simple heuristic: Wed/Fri 19:30-20:30 WIB = US data
        if wd in [2, 4] and 19 <= h <= 21:
            return True
        return False
    
    def _funding_cost_check(self, entry_price, direction, current_price):
        """Micro-gap: Include funding rate cost in RR calculation.
        
        Bitget futures charge funding every 8h (00/08/16 UTC).
        Positions held through funding time incur ~0.01% per cycle.
        For 3 cycles in 24h, that's 0.03% — small but real.
        """
        now_utc = datetime.now(timezone.utc)
        total_cost = 0.0
        for fh in FUNDING_HOURS_UTC:
            if now_utc.hour < fh:
                # Position will cross this funding time if held
                total_cost += FUNDING_RATE_PER_CYCLE
        return total_cost
    
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
                        if order['status'] == 'open':
                            self.exchange.cancel_order(order['id'], symbol)
                            print(f"  🗑️ Canceled stale order {order['id'][:12]}... for {symbol}")
                except Exception as e:
                    if 'Order does not exist' not in str(e):
                        print(f"  ⚠️ Cancel orders {symbol}: {str(e)[:60]}")
        except Exception as e:
            print(f"  ⚠️ Cancel stale orders error: {str(e)[:80]}")
    
    def _position_held_too_long(self, position):
        """Check if position has been held > 24 hours"""
        try:
            opened = position.get('timestamp', 0)
            if opened and isinstance(opened, (int, float)) and opened > 0:
                hold_hours = (time.time() * 1000 - opened) / 3600000
                if hold_hours > 24:
                    print(f"  ⏰ {position['symbol']} held {hold_hours:.1f}h > 24h limit")
                    return True
        except:
            pass
        return False

    def _run_macro_filter(self):
        """Macro filter: cross-asset correlation & market sanity check.

        Returns:
            1 if market conditions are normal (trade allowed).
            0 if macro RISK_OFF (skip all entries).
        """
        try:
            # 1. Check session: off-session = reduced risk
            if self.session == 'off_session':
                print(f"  🔵 Off-session macro check...")

            # 2. Check BTC volatility — extreme vol = RISK_OFF
            try:
                btc_ticker = self.exchange.fetch_ticker('BTC/USDT:USDT')
                btc_change = abs(btc_ticker['percentage']) if btc_ticker.get('percentage') else 0
                if btc_change > 5.0:
                    print(f"  🛑 Macro RISK_OFF — BTC volatility {btc_change:.1f}% > 5% threshold")
                    return 0
            except Exception as e:
                print(f"  ⚠️ Macro BTC check failed: {str(e)[:60]}")

            # 3. Check if we're in an extreme fear/greed environment
            # Simple proxy: if ATR % on BTC is extremely high
            try:
                btc_ticker = self.exchange.fetch_ticker('BTC/USDT:USDT')
                btc_price = btc_ticker['last']
                btc_atr_val = self._calc_atr('BTC/USDT:USDT')  # Returns USD value
                btc_atr_pct = (btc_atr_val / btc_price * 100) if btc_price > 0 and btc_atr_val > 0 else 0
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

    def _check_cooldown(self, symbol):
        """Check if symbol is in cooldown after a loss.
        
        After a loss on any symbol, wait 6 hours before re-entering.
        This prevents revenge trading and gives price time to reset.
        """
        cooldown_file = LOG_DIR / 'vilona_cooldown.json'
        try:
            if cooldown_file.exists():
                data = json.loads(cooldown_file.read_text())
                expires = data.get(symbol, 0)
                if time.time() < expires:
                    remaining = int((expires - time.time()) / 60)
                    print(f"     ⏳ Cooldown: {remaining} min remaining for {symbol}")
                    return True
        except:
            pass
        return False
    
    def set_cooldown(self, symbol, hours=6):
        """Set cooldown for a symbol"""
        cooldown_file = LOG_DIR / 'vilona_cooldown.json'
        try:
            data = {}
            if cooldown_file.exists():
                data = json.loads(cooldown_file.read_text())
            data[symbol] = time.time() + (hours * 3600)
            cooldown_file.write_text(json.dumps(data))
        except:
            pass
    
    def run_screening_cycle(self):
        """Full screening + execution cycle"""
        print(f"\n{'='*60}")
        print(f"🤖 VILONA AUTONOMOUS TRADER — {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} WIB")
        print(f"   Session: {self.session.upper()} | Daily PnL: ${self.daily_pnl:.2f}")
        print(f"{'='*60}")
        
        # GUARD 1: Run lock (prevent concurrent cron + daemon execution)
        lock_file = LOG_DIR / 'vilona_run.lock'
        if lock_file.exists():
            try:
                lock_age = time.time() - lock_file.stat().st_mtime
                pid_in_file = lock_file.read_text().strip()
                # Micro-gap: Check if PID still alive, not just file age
                pid_still_running = False
                try:
                    pid_still_running = os.path.exists(f'/proc/{pid_in_file}')
                except:
                    pass
                
                if lock_age < 120 and pid_still_running:
                    print(f"  ⏭️ Another instance PID={pid_in_file} running ({lock_age:.0f}s ago)")
                    return
                elif lock_age < 120 and not pid_still_running:
                    print(f"  🗑️ Stale lock (PID {pid_in_file} dead). Removing...")
                    lock_file.unlink()
                else:
                    print(f"  ⚠️ Old lock ({lock_age:.0f}s). Removing...")
                    lock_file.unlink()
            except:
                pass
        lock_file.write_text(str(os.getpid()))
        
        try:
            # Micro-gap: Auto-rotate logs if > 10MB
            self._auto_rotate_logs()
            
            # MACRO FILTER: Cross-asset correlation check (Skill 1)
            macro_risk_mult = self._run_macro_filter()
            if macro_risk_mult == 0:
                print(f"  🛑 Macro RISK_OFF — skipping all entries")
                halted_early = True
            else:
                halted_early = False
            
            # GUARD 2: Cancel ALL stale limit orders before new entries
            self._cancel_stale_orders()
            
            # GUARD 3a: Weekend safety check
            weekday = datetime.now().weekday()
            is_weekend = weekday >= WEEKEND_SAT
            if is_weekend:
                print(f"\n  📅 Weekend mode: 50% risk reduction (lower volume)")
            
            # Micro-gap: Funding rate time check
            now_utc = datetime.now(timezone.utc)
            for fh in FUNDING_HOURS_UTC:
                if abs(now_utc.hour - fh) <= 1:
                    print(f"  ⏰ Near funding time ({fh}:00 UTC). Holding costs apply.")
                    break
            
            # Micro-gap: 1-Year Calendar check (seasonal + events)
            cal = self._check_calendar()
            if cal['advice']:
                print(f"  📅 {cal['advice']}")
            if cal['mode'] == 'ultra_conservative':
                print(f"  🛑 Ultra-conservative mode — skipping entries")
                halted_early = True
            elif cal['mode'] == 'aggressive':
                print(f"  🚀 Aggressive mode — full screening + normal risk")
                halted_early = False
            else:
                halted_early = False
            
            if cal.get('upcoming_events'):
                for ev in cal['upcoming_events']:
                    print(f"     📌 {ev['event']} ({ev['date']}, +{ev['days_until']}d)")
            
            # Micro-gap: Major news check (skip if near US data)
            near_news = self._check_major_news()
            if near_news and not halted_early:
                print(f"  📰 Near major US data release. Screening paused.")
                halted_early = True
                halted_early = False
            
            # GUARD 3b: Minimum balance check
            if not halted_early:
                try:
                    bal = self.exchange.fetch_balance()
                    free_usdt = bal.get('USDT', {}).get('free', 0)
                    if free_usdt < MIN_BALANCE_TO_TRADE:
                        print(f"\n  🛑 Balance ${free_usdt:.2f} < min ${MIN_BALANCE_TO_TRADE}. Trading halted.")
                        Path(CIRCUIT_LOGFILE).write_text(f"Low balance: ${free_usdt:.2f} at {datetime.now().isoformat()}")
                        halted_early = True
                    else:
                        # Refresh BALANCE_USDT globally for risk calculation
                        global BALANCE_USDT
                        BALANCE_USDT = free_usdt
                        print(f"  💰 Balance: ${free_usdt:.2f} USDT")
                        halted_early = False
                except Exception as e:
                    print(f"  ⚠️ Balance check error: {str(e)[:60]}")
                    halted_early = False
            
            # GUARD 3c: Check circuit breaker (daily loss limit)
            if not halted_early:
                halted, reason = self.check_circuit_breaker()
                if halted:
                    print(f"\n  🛑 {reason}")
                    Path(CIRCUIT_LOGFILE).write_text(f"Circuit breaker: {reason} at {datetime.now().isoformat()}")
                    halted_early = True
            
            if not halted_early:
                # 4. Check open positions with max hold time
                active_pos = self.check_open_positions()
                active_symbols = {p['symbol'] for p in active_pos}
                
                # GUARD 4: Auto-close positions held too long (>24 hours)
                for pos in active_pos:
                    if self._position_held_too_long(pos):
                        print(f"  ⏰ Max hold time exceeded. Closing {pos['symbol']}...")
                        self.close_position(pos)
                
                # Refresh active positions after closings
                active_pos = [p for p in active_pos 
                              if float(p.get('contracts', 0)) > 0 and p.get('symbol') not in active_symbols]
                active_pos = active_pos or [p for p in self.check_open_positions() 
                                            if float(p.get('contracts', 0)) > 0]
                active_symbols = {p['symbol'] for p in active_pos}
                
                # 5. Screen market for new entries (only if session is active)
                if self.session != 'off_session' and len(active_pos) < 3:
                    candidates = self.screen_market()
                    if candidates:
                        print(f"\n🔍 ANALYZING TOP CANDIDATES...")
                    entries = 0
                    for c in candidates:
                        if entries >= 1:  # Max 1 trade per cycle
                            break
                        
                        sym = c['symbol']
                        
                        # Skip if we already have a position in this symbol
                        if sym in active_symbols:
                            print(f"\n  {sym:20s} — ⏭️ Already in position")
                            continue
                        
                        # Skip if symbol in cooldown (recent loss)
                        if self._check_cooldown(sym):
                            print(f"\n  {sym:20s} — ⏭️ Cooldown active")
                            continue
                        
                        # Micro-gap: Directional bias check
                        # Prevent stacking multiple longs in a downtrend
                        # Count current direction bias across all active positions
                        dir_signals = [p.get('side','') for p in active_pos]
                        long_count = sum(1 for d in dir_signals if d == 'long')
                        short_count = sum(1 for d in dir_signals if d == 'short')
                        if long_count >= MAX_SAME_DIRECTION_POSITIONS and c.get('change_24h', 0) < -1:
                            print(f"\n  {sym:20s} — ⏭️ Too many longs in downtrend ({long_count})")
                            continue
                        if short_count >= MAX_SAME_DIRECTION_POSITIONS and c.get('change_24h', 0) > 1:
                            print(f"\n  {sym:20s} — ⏭️ Too many shorts in uptrend ({short_count})")
                            continue
                        
                        analysis = self.analyze_candidate(c)
                        direction = analysis.get('direction')
                        conf = analysis.get('confidence', 0)
                        
                        print(f"\n  {analysis['symbol']:20s}")
                        print(f"     OBI: {analysis.get('obi', 0):+.3f} | RSI: {analysis.get('rsi', 0):.1f}")
                        if analysis.get('atr'):
                            atr_pct = (analysis['atr'] / max(analysis['entry_price'], 1)) * 100
                            print(f"     ATR: {atr_pct:.2f}% | TP: {analysis.get('gross_tp_pct', '?')}% | SL: {analysis.get('gross_sl_pct', '?')}%")
                        print(f"     Score: {conf}/100 | Direction: {direction or 'NO SIGNAL'}")
                        
                        if direction and conf >= 55:
                            self.execute_trade(analysis)
                            entries += 1
                        else:
                            reject = analysis.get('reject_reason', f"OBI: {analysis.get('obi', 0):+.3f}, Conf: {conf}")
                            print(f"     ⏭️  Rejected: {reject}")
                else:
                    print(f"\n  ⏭️ Off-session or positions busy — monitoring only")
                
                # 6. Summary
                print(f"\n{'='*60}")
                print(f"📋 SESSION SUMMARY")
                print(f"   Session: {self.session.upper()} | Daily PnL: ${self.daily_pnl:.2f}")
                print(f"   Positions: {len(active_pos)} active")
                print(f"   Guards: run-lock, cooldown, stale-cancel, max-hold, calendar-1y")
                print(f"{'='*60}\n")
        finally:
            # Cleanup: remove run lock
            try:
                if lock_file.exists():
                    lock_file.unlink()
            except:
                pass

def main():
    trader = VilonaTrader()
    trader.run_screening_cycle()

if __name__ == '__main__':
    main()
