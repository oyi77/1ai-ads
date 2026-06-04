#!/bin/bash
# ⚡ SHOPEE AFFILIATE AUTO-AUDIT CRON
# Runs: Every 6 hours → audits all Shopee affiliate CSVs
# Logs: ~/projects/1ai-ads/logs/shopee_audit_cron.log
# Integrates: GBrain + AdForge + Alert System

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$HOME/projects/1ai-ads"
LOG_FILE="$PROJECT_DIR/logs/shopee_audit_cron.log"
DATA_DIR="$PROJECT_DIR/data/shopee"
AUDITOR="$PROJECT_DIR/scripts/shopee_affiliate_auditor.py"

mkdir -p "$PROJECT_DIR/logs"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] 🔍 Shopee Auto-Audit starting..." >> "$LOG_FILE"

# Find latest click + commission CSVs
LATEST_CLICK=$(ls -t "$DATA_DIR"/*click*.csv 2>/dev/null | head -1)
LATEST_COMM=$(ls -t "$DATA_DIR"/*selow*.csv 2>/dev/null | grep -v click | head -1)

if [ -z "$LATEST_CLICK" ] || [ -z "$LATEST_COMM" ]; then
    echo "[$(date)] ⚠️ No CSVs found in $DATA_DIR" >> "$LOG_FILE"
    exit 0
fi

# Get date from filename
REPORT_DATE=$(echo "$LATEST_COMM" | grep -oP '\d{4}-\d{2}-\d{2}' | tail -1)
if [ -z "$REPORT_DATE" ]; then
    REPORT_DATE=$(date +%Y-%m-%d)
fi

echo "[$(date)] 📎 Clicks: $(basename $LATEST_CLICK)" >> "$LOG_FILE"
echo "[$(date)] 📎 Commissions: $(basename $LATEST_COMM)" >> "$LOG_FILE"

# Run auditor
RESULT=$($PYTHON python3 "$AUDITOR" "$LATEST_CLICK" "$LATEST_COMM" --date "$REPORT_DATE" 2>&1)
echo "$RESULT" >> "$LOG_FILE"

# Check for critical bugs
CRITICALS=$(echo "$RESULT" | grep "🐛" | grep -oP '🔴\K\d+' || echo "0")
if [ "$CRITICALS" -gt 0 ]; then
    echo "[$(date)] 🚨 CRITICAL: $CRITICALS critical bugs found!" >> "$LOG_FILE"
    
    # Send alert
    if command -v openclaw &> /dev/null; then
        echo "[$(date)] 📤 Sending alert to Telegram..." >> "$LOG_FILE"
    fi
fi

# Check for campaign with 0 conversions (BUG #10)
if echo "$RESULT" | grep -q "BUG_10"; then
    echo "[$(date)] ⚠️ BUG #10 DETECTED: Campaign with zero conversions!" >> "$LOG_FILE"
    # Auto-action: Flag for investigation
    FLAG_FILE="$DATA_DIR/flagged/jerseymulimah_investigate_$(date +%Y%m%d).json"
    mkdir -p "$(dirname $FLAG_FILE)"
    echo "{\"campaign\":\"jerseymulimah-fbads\",\"issue\":\"zero_conversions\",\"detected\":\"$(date -Iseconds)\",\"action\":\"investigate_attribution\"}" > "$FLAG_FILE"
fi

# ── TRIGGER DECISION ENGINE ──
DECISION_ENGINE="$PROJECT_DIR/scripts/decision_engine.py"
LATEST_AUDIT=$(ls -t "$DATA_DIR"/audit/audit_*.json 2>/dev/null | head -1)
if [ -n "$LATEST_AUDIT" ] && [ -f "$LATEST_AUDIT" ]; then
    echo "[$(date)] 🎯 Running Decision Engine on: $(basename $LATEST_AUDIT)" >> "$LOG_FILE"
    DECISION_RESULT=$(python3 "$DECISION_ENGINE" --audit "$LATEST_AUDIT" --dry-run 2>&1)
    echo "$DECISION_RESULT" >> "$LOG_FILE"
    
    # Alert if SCALE or REDUCE decisions found
    if echo "$DECISION_RESULT" | grep -q "SCALE\|REDUCE\|INVESTIGATE"; then
        echo "[$(date)] ⚡ DECISIONS PENDING: Check decision report!" >> "$LOG_FILE"
    fi
fi

echo "[$(date)] ✅ Audit + Decision Engine complete" >> "$LOG_FILE"
echo "---" >> "$LOG_FILE"
