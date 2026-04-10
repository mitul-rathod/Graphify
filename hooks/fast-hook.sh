#!/bin/bash
# ─────────────────────────────────────────────────────────────
# Graphify Fast Hook — <10ms response time
# 
# Three-tier caching strategy:
#   1. File age check (~2ms)  — skip if checked in last 60s
#   2. Git hash check (~8ms)  — skip if commit unchanged
#   3. Background update      — fork analysis, return instantly
# ─────────────────────────────────────────────────────────────

# Resolve project root
ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
GRAPHIFY_DIR="$ROOT/.graphify"
CACHE_FILE="$GRAPHIFY_DIR/.fast_cache"
HASH_FILE="$GRAPHIFY_DIR/.last_hash"

# ═══════════════════════════════════════════════════════════════
# FAST PATH (~2ms): Skip if checked within last 60 seconds
# ═══════════════════════════════════════════════════════════════
if [ -f "$CACHE_FILE" ]; then
  # macOS: stat -f %m, Linux: stat -c %Y
  CACHE_MOD=$(stat -f %m "$CACHE_FILE" 2>/dev/null || stat -c %Y "$CACHE_FILE" 2>/dev/null || echo 0)
  NOW=$(date +%s)
  AGE=$((NOW - CACHE_MOD))
  if [ "$AGE" -lt 60 ]; then
    exit 0
  fi
fi

# ═══════════════════════════════════════════════════════════════
# MEDIUM PATH (~8ms): Check if git commit hash changed
# ═══════════════════════════════════════════════════════════════
mkdir -p "$GRAPHIFY_DIR" 2>/dev/null
touch "$CACHE_FILE"

CURRENT_HASH=$(git rev-parse --short HEAD 2>/dev/null || echo "none")
CACHED_HASH=""
if [ -f "$HASH_FILE" ]; then
  CACHED_HASH=$(cat "$HASH_FILE" 2>/dev/null)
fi

if [ "$CURRENT_HASH" = "$CACHED_HASH" ]; then
  exit 0
fi

# ═══════════════════════════════════════════════════════════════
# SLOW PATH: Graph needs update — run analysis in BACKGROUND
# Returns immediately (<10ms), analysis happens asynchronously
# ═══════════════════════════════════════════════════════════════

# Write new hash immediately to prevent duplicate background runs
echo "$CURRENT_HASH" > "$HASH_FILE"

# Find graphify — check multiple locations
GRAPHIFY_CMD=""
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ -f "$SCRIPT_DIR/../bin/graphify.js" ]; then
  # Installed locally alongside this hook
  GRAPHIFY_CMD="node $SCRIPT_DIR/../bin/graphify.js"
elif [ -f "$ROOT/node_modules/.bin/graphify" ]; then
  # Installed as a project dependency
  GRAPHIFY_CMD="$ROOT/node_modules/.bin/graphify"
elif [ -f "$ROOT/bin/graphify.js" ]; then
  # Running from graphify repo itself
  GRAPHIFY_CMD="node $ROOT/bin/graphify.js"
elif command -v graphify &>/dev/null; then
  # Installed globally
  GRAPHIFY_CMD="graphify"
fi

if [ -n "$GRAPHIFY_CMD" ]; then
  # Run in background — hook returns immediately
  (cd "$ROOT" && $GRAPHIFY_CMD --quiet --force > /dev/null 2>&1) &
  disown 2>/dev/null
fi

exit 0
