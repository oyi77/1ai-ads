#!/bin/bash
# Hermes Agent Pre-Write Hook for 1ai-ads
# Enforces guardrails BEFORE writing any file
# Exit 1 = block, Exit 0 = allow

FILE="$1"

# Rule 1: Block throwaway test scripts in scripts/
if [[ "$FILE" =~ ^scripts/test_ ]]; then
  echo "❌ BLOCKED: Throwaway test scripts forbidden in scripts/"
  echo "   Use tests/ directory with Vitest/Playwright instead"
  exit 1
fi

# Rule 2: Block hardcoded paths
if grep -q "/home/openclaw/" "$FILE" 2>/dev/null; then
  echo "❌ BLOCKED: Hardcoded /home/openclaw/ path found in $FILE"
  echo "   Use WORKSPACE/DATA_DIR from vilona_trakpro_engine"
  exit 1
fi

# Rule 3: Block direct Meta API in scripts/ (not engine)
if [[ "$FILE" =~ ^scripts/.*\.py$ ]] && [[ ! "$FILE" =~ "vilona_trakpro_engine" ]]; then
  if grep -q "graph\.facebook\.com" "$FILE" 2>/dev/null; then
    echo "❌ BLOCKED: Direct Meta API call in $FILE"
    echo "   Use fb_get/fb_post from vilona_trakpro_engine"
    exit 1
  fi
  if grep -q "os\.getenv.*META_ACCESS_TOKEN" "$FILE" 2>/dev/null; then
    echo "❌ BLOCKED: Duplicate token loading in $FILE"
    echo "   Import ACCESS_TOKEN from vilona_trakpro_engine"
    exit 1
  fi
fi

# Rule 4: Block code in root directory
if [[ "$FILE" =~ ^[^/]+\.(js|ts|py|sql)$ ]]; then
  echo "❌ BLOCKED: Code file in root directory: $FILE"
  echo "   Place in server/, client/, scripts/, or tests/"
  exit 1
fi

# Rule 5: Warn on console.log in server code
if [[ "$FILE" =~ ^server/.*\.js$ ]]; then
  if grep -q "console\.log" "$FILE" 2>/dev/null; then
    echo "⚠️  WARNING: console.log found in $FILE"
    echo "   Use logger from server/lib/logger.js"
  fi
fi

echo "✅ Pre-write checks passed for $FILE"
exit 0