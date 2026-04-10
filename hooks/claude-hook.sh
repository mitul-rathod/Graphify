#!/bin/bash
# ─────────────────────────────────────────────────────────────
# Graphify Hook for Claude Code
# Runs graphify to update the knowledge graph before Claude processes.
# This script is designed to be called by Claude Code's hook system.
# ─────────────────────────────────────────────────────────────

# Navigate to git root (or stay in cwd if not a git repo)
ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
cd "$ROOT"

# Run graphify in quiet mode — output goes to stdout which Claude reads
# The --quiet flag suppresses progress messages and outputs GRAPH.md content
node "$(dirname "$0")/../bin/graphify.js" --quiet 2>/dev/null || true
