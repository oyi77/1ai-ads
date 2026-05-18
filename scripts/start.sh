#!/bin/bash
# AdForge Startup Script — Starts all services reliably
# Usage: bash scripts/start.sh

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ADFORGE_DIR="$(dirname "$SCRIPT_DIR")"
LOG_DIR="$ADFORGE_DIR/logs"
mkdir -p "$LOG_DIR"

echo "🚀 AdForge — Starting all services..."
echo ""

# 1. Load environment variables
echo "📦 Loading environment..."
export $(grep -v '^#' "$ADFORGE_DIR/.env" | xargs)
echo "   ✅ Env loaded ($(wc -l < "$ADFORGE_DIR/.env") vars)"

# 2. Start Node.js API server
echo "🖥️  Starting API server (port 3001)..."
cd "$ADFORGE_DIR"
nohup node server.js > "$LOG_DIR/api.log" 2>&1 &
API_PID=$!
sleep 2
echo "   ✅ API server running (PID: $API_PID)"

# 3. Start Flask Draft Dashboard
echo "📊 Starting Dashboard (port 5002)..."
cd "$ADFORGE_DIR/adforge-dashboard"
nohup python3 app.py > "$LOG_DIR/dashboard.log" 2>&1 &
DASH_PID=$!
sleep 1
echo "   ✅ Dashboard running (PID: $DASH_PID)"

# 4. Verify all services
echo ""
echo "🔍 Verifying services..."
sleep 2

# Check API
if curl -s http://127.0.0.1:3001/health > /dev/null 2>&1; then
    echo "   ✅ API: http://127.0.0.1:3001"
else
    echo "   ❌ API: NOT running"
fi

# Check Dashboard
if curl -s http://127.0.0.1:5002/ > /dev/null 2>&1; then
    echo "   ✅ Dashboard: http://127.0.0.1:5002"
else
    echo "   ❌ Dashboard: NOT running"
fi

# Check Nginx (port 6969)
if curl -s http://127.0.0.1:6969/ -H "Host: adforge.aitradepulse.com" > /dev/null 2>&1; then
    echo "   ✅ Nginx (live): https://adforge.aitradepulse.com"
else
    echo "   ⚠️  Nginx: check config"
fi

echo ""
echo "📋 Service Summary:"
echo "   - API:          http://127.0.0.1:3001"
echo "   - Dashboard:    http://127.0.0.1:5002"
echo "   - Live URL:     https://adforge.aitradepulse.com"
echo "   - GitHub:       https://github.com/oyi77/1ai-ads"
echo ""
echo "✅ AdForge started successfully!"
