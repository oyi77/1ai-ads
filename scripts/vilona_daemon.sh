#!/bin/bash
# VILONA AUTONOMOUS DAEMON — Continuous 24/7 Runner
# Launches the autonomous trader as a background daemon.
# Runs every 15 minutes in continuous loop.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_DIR="$WORKSPACE_DIR/logs/trading"
PID_FILE="$LOG_DIR/vilona_daemon.pid"
HEARTBEAT_FILE="$LOG_DIR/vilona_heartbeat.txt"
DAEMON_LOG="$LOG_DIR/vilona_daemon.log"

mkdir -p "$LOG_DIR"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$DAEMON_LOG"
}

start_daemon() {
    if [ -f "$PID_FILE" ] && kill -0 $(cat "$PID_FILE") 2>/dev/null; then
        log "Daemon already running (PID: $(cat "$PID_FILE"))"
        echo "Daemon already running (PID: $(cat "$PID_FILE"))"
        return 0
    fi

    log "Starting Vilona Trading Daemon..."
    
    # Start continuous loop in background
    nohup python3 "$SCRIPT_DIR/vilona_daemon_loop.py" \
        >> "$LOG_DIR/vilona_daemon_loop.log" 2>&1 &
    
    PID=$!
    echo $PID > "$PID_FILE"
    log "Daemon started with PID: $PID"
    echo "Daemon started with PID: $PID"
}

stop_daemon() {
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if kill -0 $PID 2>/dev/null; then
            kill $PID
            log "Daemon (PID: $PID) stopped"
            echo "Daemon stopped"
        else
            log "PID file exists but process not running"
        fi
        rm -f "$PID_FILE"
    else
        echo "No daemon running"
    fi
}

status_daemon() {
    if [ -f "$PID_FILE" ] && kill -0 $(cat "$PID_FILE") 2>/dev/null; then
        PID=$(cat "$PID_FILE")
        UPTIME=$(ps -o etime= -p $PID 2>/dev/null | xargs)
        echo "✅ Daemon RUNNING (PID: $PID, Uptime: $UPTIME)"
        
        if [ -f "$HEARTBEAT_FILE" ]; then
            LAST_HEARTBEAT=$(cat "$HEARTBEAT_FILE")
            echo "   Last heartbeat: $LAST_HEARTBEAT"
        fi
        return 0
    else
        echo "❌ Daemon NOT running"
        return 1
    fi
}

case "${1:-status}" in
    start)
        start_daemon
        ;;
    stop)
        stop_daemon
        ;;
    restart)
        stop_daemon
        sleep 1
        start_daemon
        ;;
    status)
        status_daemon
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status}"
        exit 1
        ;;
esac
