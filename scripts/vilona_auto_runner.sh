#!/bin/bash
"""
VILONA AUTONOMOUS TRADER — 24/7 CRON LAUNCHER
Bitget Crypto | Protocol: Vilona Hunting Mode
Screening: 07:00 | 15:00 | 20:00 WIB
"""

# ─── ENV ─────────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_DIR="$WORKSPACE_DIR/logs/trading"
PID_FILE="$LOG_DIR/vilona_trader.pid"
CRON_LOG="$LOG_DIR/cron_launcher.log"

mkdir -p "$LOG_DIR"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$CRON_LOG"
    echo "$1"
}

# ─── DETECT SESSION ─────────────────────────────────────────────────────────
HOUR=$(date +%H)
SESSION=""

if [ "$HOUR" -ge 6 ] && [ "$HOUR" -lt 9 ]; then
    SESSION="asia_open"
elif [ "$HOUR" -ge 14 ] && [ "$HOUR" -lt 17 ]; then
    SESSION="london_open"
elif [ "$HOUR" -ge 19 ] && [ "$HOUR" -lt 22 ]; then
    SESSION="ny_open"
fi

# ─── RUN ─────────────────────────────────────────────────────────────────────
cd "$WORKSPACE_DIR"

log "=========================================="
log "🤖 VILONA TRADER — $SESSION — $(date)"
log "=========================================="

python3 "$SCRIPT_DIR/vilona_autonomous_trader.py" 2>&1 | tee -a "$LOG_DIR/session_$(date +%Y%m%d).log"

EXIT_CODE=${PIPESTATUS[0]}
log "Exit code: $EXIT_CODE"
log "==========================================\n"

exit $EXIT_CODE
