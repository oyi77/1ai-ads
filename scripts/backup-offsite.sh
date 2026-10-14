#!/usr/bin/env bash
#
# Offsite backup for 1ai-ads.
#
# The in-app scheduler already writes WAL-safe local snapshots to ./backups
# (7 kept). Those die with the host. This script mirrors the newest complete
# snapshot to an offsite target so a disk loss is survivable.
#
# Configure ONE of the following (checked in order):
#   1. restic    — set RESTIC_REPOSITORY + creds in ./backup.env
#   2. rclone    — set BACKUP_RCLONE_REMOTE (e.g. b2:bucket/1ai-ads or s3:...)
#   3. plain dir — set BACKUP_OFFSITE_DIR (e.g. a mounted NAS path)
#
# Usage:
#   ./scripts/backup-offsite.sh            # run once
#   ./scripts/backup-offsite.sh --install  # also install a nightly systemd timer
#
# Secrets live in ./backup.env (gitignored) — never inline in this file.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="$ROOT/backups"
LOG_TAG="1ai-ads-backup-offsite"

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }

# Load offsite config if present (keep it out of the repo).
if [[ -f "$ROOT/backup.env" ]]; then
  # shellcheck disable=SC1091
  set -a; source "$ROOT/backup.env"; set +a
fi

# ── Pick the newest COMPLETE snapshot (main + -wal + -shm) ────────────────
newest_snapshot() {
  local newest=""
  for f in "$BACKUP_DIR"/adforge.db.*.backup; do
    [[ -e "$f" ]] || continue
    # Require the full triple — a lone .backup can be a near-empty snapshot.
    [[ -f "${f}-wal" && -f "${f}-shm" ]] || continue
    newest="$f"
  done
  [[ -n "$newest" ]] && printf '%s\n' "$newest"
}

SNAPSHOT="$(newest_snapshot || true)"
if [[ -z "$SNAPSHOT" ]]; then
  log "ERROR: no complete snapshot (adforge.db.*.backup + -wal + -shm) in $BACKUP_DIR"
  exit 1
fi
log "newest complete snapshot: $(basename "$SNAPSHOT")"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

if [[ -n "${RESTIC_REPOSITORY:-}" ]]; then
  command -v restic >/dev/null || { log "ERROR: restic not installed"; exit 1; }
  log "→ restic backup to $RESTIC_REPOSITORY"
  restic backup "$SNAPSHOT" "$SNAPSHOT-wal" "$SNAPSHOT-shm" \
    --tag 1ai-ads --host "$(hostname)"
  restic forget --tag 1ai-ads --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune
elif [[ -n "${BACKUP_RCLONE_REMOTE:-}" ]]; then
  command -v rclone >/dev/null || { log "ERROR: rclone not installed"; exit 1; }
  DEST="$BACKUP_RCLONE_REMOTE/$STAMP"
  log "→ rclone copy to $DEST"
  rclone copy "$SNAPSHOT"    "$DEST/"
  rclone copy "$SNAPSHOT-wal" "$DEST/"
  rclone copy "$SNAPSHOT-shm" "$DEST/"
  # Retention: keep the 14 newest timestamped dirs offsite.
  rclone lsf --dirs-only "$BACKUP_RCLONE_REMOTE" | sort -r | tail -n +15 | while read -r d; do
    log "  prune offsite $d"
    rclone purge "$BACKUP_RCLONE_REMOTE/$d" || true
  done
elif [[ -n "${BACKUP_OFFSITE_DIR:-}" ]]; then
  DEST="$BACKUP_OFFSITE_DIR/$STAMP"
  log "→ copy to $DEST"
  mkdir -p "$DEST"
  cp -f "$SNAPSHOT" "$SNAPSHOT-wal" "$SNAPSHOT-shm" "$DEST/"
  # Retention: keep 14 newest.
  ls -1dt "$BACKUP_OFFSITE_DIR"/*/ 2>/dev/null | tail -n +15 | while read -r d; do
    log "  prune offsite $d"
    rm -rf "$d"
  done
else
  log "ERROR: no offsite target configured."
  log "  Create $ROOT/backup.env with ONE of:"
  log "    RESTIC_REPOSITORY=<repo>  RESTIC_PASSWORD=<pw>  # + provider creds"
  log "    BACKUP_RCLONE_REMOTE=b2:bucket/1ai-ads"
  log "    BACKUP_OFFSITE_DIR=/mnt/nas/1ai-ads"
  exit 2
fi

log "offsite backup complete"

# ── Optional: install a nightly systemd timer ────────────────────────────
if [[ "${1:-}" == "--install" ]]; then
  UNIT_DIR="$HOME/.config/systemd/user"
  mkdir -p "$UNIT_DIR"
  cat > "$UNIT_DIR/1ai-ads-backup-offsite.service" <<EOF
[Unit]
Description=1ai-ads offsite backup
After=network-online.target

[Service]
Type=oneshot
WorkingDirectory=$ROOT
ExecStart=$ROOT/scripts/backup-offsite.sh
EOF
  cat > "$UNIT_DIR/1ai-ads-backup-offsite.timer" <<'EOF'
[Unit]
Description=Nightly 1ai-ads offsite backup

[Timer]
OnCalendar=*-*-* 03:30:00
Persistent=true
RandomizedDelaySec=900

[Install]
WantedBy=timers.target
EOF
  systemctl --user daemon-reload
  systemctl --user enable --now 1ai-ads-backup-offsite.timer
  log "installed + started user timer 1ai-ads-backup-offsite.timer (nightly 03:30)"
fi
