#!/usr/bin/env bash
# PILAR 2 — Absolute Resilience Watchdog
# Memantau heartbeat tiap layanan; restart jika mati > MAX_STALE_SEC.
set -euo pipefail

BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OPS_DIR="$BASE_DIR/ops"
LOG_TAG="1ai-ads-watchdog"
MAX_STALE_SEC=180  # 3 menit tanpa heartbeat = dianggap mati

log(){ echo "[$(date -Is)] $*" | tee -a "$OPS_DIR/watchdog.log"; }

check_service(){
    local name="$1"; local hb="$2"
    local svc="$name"
    # Jika file heartbeat tidak ada, anggap baru (skip)
    [[ ! -f "$hb" ]] && { log "ℹ️ $name: heartbeat belum ada, skip"; return 0; }

    # Mtime (detik) file heartbeat
    local mtime; mtime=$(stat -c %Y "$hb" 2>/dev/null || echo 0)
    local now; now=$(date +%s)
    local age=$(( now - mtime ))

    if (( age > MAX_STALE_SEC )); then
        log "🚨 $name mati selama ${age}s (>${MAX_STALE_SEC}s). Restart..."
        systemctl restart "$svc" || {
            log "❌ systemctl restart $svc gagal, coba start ulang paksa...";
            systemctl stop "$svc" || true
            sleep 2
            systemctl start "$svc" || true
        }
        # Tunggu 5 detik lalu cek status
        sleep 5
        if systemctl is-active --quiet "$svc"; then
            log "✅ $name berhasil di-restart"
        else
            log "❌ $name masih mati setelah restart"
        fi
    else
        log "✅ $name hidup (age ${age}s)"
    fi
}

log "=== Watchdog cycle dimulai ==="
check_service nyamiresep-supervisor "$OPS_DIR/supervisor.heartbeat"
check_service vilona-tfx-supervisor "$OPS_DIR/vilona_tfx.heartbeat"
# Tambah service lain di sini (api, etc)
log "=== Watchdog cycle selesai ==="
