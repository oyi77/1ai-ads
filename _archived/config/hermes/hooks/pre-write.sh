#!/bin/bash
# Hermes Agent Pre-Write Guardrails Hook for 1ai-ads
# Receives stdin JSON from Hermes: {"hook_event_name":"pre_tool_call","tool_name":"write","tool_input":{"file_path":"...","content":"..."},"cwd":"..."}
# Output JSON to block: {"action":"block","message":"reason here"}
# Output nothing (or empty JSON) to allow

LOG="/tmp/hermes-prewrite-debug.log"
echo "=== $(date -Iseconds) ===" >> "$LOG"

INPUT=$(cat)
echo "STDIN: $INPUT" >> "$LOG"

# Extract tool_name from the JSON
TOOL_NAME=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('tool_name',''))" 2>/dev/null)
echo "TOOL_NAME: $TOOL_NAME" >> "$LOG"

# Only intercept write_file/patch tools — pass through everything else silently
# Hermes uses "write_file" (not "write") and "patch" for file modifications
if [[ "$TOOL_NAME" != "write_file" && "$TOOL_NAME" != "patch" ]]; then
  echo "SKIP: not write_file/patch (got: $TOOL_NAME)" >> "$LOG"
  exit 0
fi

# Extract file_path and content from tool_input
FILE_PATH=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); ti=d.get('tool_input') or {}; print(ti.get('path', ti.get('file_path', ti.get('filename', ''))))" 2>/dev/null)
CONTENT=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); ti=d.get('tool_input') or {}; print(ti.get('content', ti.get('new_string', '')))" 2>/dev/null)
CWD=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('cwd',''))" 2>/dev/null)
echo "FILE_PATH: $FILE_PATH" >> "$LOG"
echo "CWD: $CWD" >> "$LOG"

# If no file_path, allow (might be a non-file write)
if [[ -z "$FILE_PATH" ]]; then
  echo "SKIP: no file_path" >> "$LOG"
  exit 0
fi

# Make file_path absolute relative to CWD if it's relative
if [[ "$FILE_PATH" != /* ]]; then
  FILE_PATH="${CWD}/${FILE_PATH}"
fi

# Strip CWD prefix for cleaner pattern matching
REL_PATH="${FILE_PATH#${CWD}/}"
echo "REL_PATH: $REL_PATH" >> "$LOG"

# ─── RULE 1: Block throwaway test scripts in scripts/ ───
if [[ "$REL_PATH" =~ ^scripts/test_ ]]; then
  echo "BLOCKED: throwaway test script" >> "$LOG"
  echo '{"action":"block","message":"BLOCKED: Throwaway test scripts forbidden in scripts/. Use tests/ directory with Vitest/Playwright instead."}'
  exit 0
fi

# ─── RULE 2: Block direct Meta API calls (not engine) ───
if [[ ! "$REL_PATH" =~ "vilona_trakpro_engine" ]]; then
  if echo "$CONTENT" | grep -q "graph\.facebook\.com" 2>/dev/null; then
    echo "BLOCKED: direct Meta API" >> "$LOG"
    echo '{"action":"block","message":"BLOCKED: Direct Meta API call (graph.facebook.com). Use fb_get/fb_post from vilona_trakpro_engine instead."}'
    exit 0
  fi
  if echo "$CONTENT" | grep -q "os\.getenv.*META_ACCESS_TOKEN\|process\.env\.META_ACCESS_TOKEN" 2>/dev/null; then
    echo "BLOCKED: duplicate token" >> "$LOG"
    echo '{"action":"block","message":"BLOCKED: Duplicate Meta token loading. Import ACCESS_TOKEN from vilona_trakpro_engine."}'
    exit 0
  fi
fi

# ─── RULE 3: Block hardcoded paths (except engine — it defines WORKSPACE) ───
if [[ ! "$REL_PATH" =~ "vilona_trakpro_engine" ]]; then
  if echo "$CONTENT" | grep -q "/home/openclaw/" 2>/dev/null; then
    echo "BLOCKED: hardcoded path" >> "$LOG"
    echo '{"action":"block","message":"BLOCKED: Hardcoded /home/openclaw/ path. Use WORKSPACE/DATA_DIR from vilona_trakpro_engine."}'
    exit 0
  fi
fi

# ─── RULE 4: Block code files in root directory ───
if [[ "$REL_PATH" =~ ^[^/]+\.(js|ts|py|sql)$ ]]; then
  echo "BLOCKED: root code file" >> "$LOG"
  echo '{"action":"block","message":"BLOCKED: Code file in root directory. Place in server/, client/, scripts/, or tests/."}'
  exit 0
fi

# ─── RULE 5: Block SQL schema outside db/ ───
if [[ "$REL_PATH" =~ \.sql$ ]] && [[ ! "$REL_PATH" =~ ^db/ ]]; then
  echo "BLOCKED: SQL outside db/" >> "$LOG"
  echo '{"action":"block","message":"BLOCKED: SQL file outside db/. Place schema files in db/ directory."}'
  exit 0
fi

# ─── RULE 6: Warn on console.log in server code ───
if [[ "$REL_PATH" =~ ^server/.*\.js$ ]]; then
  if echo "$CONTENT" | grep -q "console\.log" 2>/dev/null; then
    echo "BLOCKED: console.log in server" >> "$LOG"
    echo '{"action":"block","message":"WARNING: console.log in server code. Use logger from server/lib/logger.js instead."}'
    exit 0
  fi
fi

# All checks passed — allow
echo "ALLOWED: $REL_PATH" >> "$LOG"
exit 0
