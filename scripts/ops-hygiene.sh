#!/bin/bash
# 1ai-ads ops hygiene: docker disk pressure + host port-5000 squatting guard.
# Installed via crontab (weekly prune, hourly guard).

LOG=/tmp/1ai-ads-ops.log
ts() { date -u '+%Y-%m-%dT%H:%M:%SZ'; }

# ── 1. Docker build cache under control (only when disk >85%) ──
USED_PCT=$(df / | awk 'NR==2 {gsub("%",""); print $5}')
if [ "$USED_PCT" -ge 85 ]; then
  echo "$(ts) disk ${USED_PCT}% — pruning docker builder cache (keep 8GB)" >> "$LOG"
  docker builder prune -f --keep-storage 8GB >> "$LOG" 2>&1
  docker image prune -f >> "$LOG" 2>&1
fi

# ── 2. Port-5000 must belong to the container's docker-proxy ──
HOLDER=$(sudo ss -tlnp | grep ':5000 ' | grep -oP 'users:\(\("\K[^"]+' | head -1)
if [ -n "$HOLDER" ] && [ "$HOLDER" != "docker-proxy" ]; then
  PID=$(sudo ss -tlnp | grep ':5000 ' | grep -oP 'pid=\K\d+' | head -1)
  CWD=$(sudo readlink /proc/$PID/cwd 2>/dev/null)
  case "$CWD" in
    */projects/1ai-ads*)
      # Known trap: stray dev `node server.js` from the repo dir. Kill it.
      echo "$(ts) port5000 squatted by $HOLDER pid=$PID cwd=$CWD — killing" >> "$LOG"
      sudo kill -9 "$PID"
      ;;
    *)
      echo "$(ts) WARNING port5000 held by $HOLDER pid=$PID cwd=$CWD — manual review needed" >> "$LOG"
      ;;
  esac
fi
