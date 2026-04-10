const fs = require('fs');
const path = require('path');

/**
 * Install Graphify hook into Claude Code settings.
 * This configures Claude Code to run graphify at session start.
 *
 * @param {string} rootDir - Project root directory
 */
function installHook(rootDir) {
  console.log('\n🔧 Installing Graphify hook for Claude Code...\n');

  // ── 1. Create .claude directory if needed ──────────────────
  const claudeDir = path.join(rootDir, '.claude');
  if (!fs.existsSync(claudeDir)) {
    fs.mkdirSync(claudeDir, { recursive: true });
    console.log('  ✅ Created .claude/ directory');
  }

  // ── 2. Update .claude/settings.json ────────────────────────
  const settingsPath = path.join(claudeDir, 'settings.json');
  let settings = {};

  if (fs.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      console.log('  📄 Found existing .claude/settings.json');
    } catch {
      console.log('  ⚠️  Could not parse existing settings.json, creating new one');
      settings = {};
    }
  }

  // Determine the graphify command path
  const hookScriptPath = path.join(rootDir, 'hooks', 'claude-hook.sh');
  const useLocalScript = fs.existsSync(hookScriptPath);

  const graphifyCommand = useLocalScript
    ? `bash ${path.relative(rootDir, hookScriptPath)}`
    : 'npx graphify --quiet';

  // Add hooks if not present
  if (!settings.hooks) {
    settings.hooks = {};
  }

  // SessionStart hook — runs graphify when Claude Code session begins
  const sessionHook = {
    matcher: '',
    hooks: [
      {
        type: 'command',
        command: graphifyCommand,
      },
    ],
  };

  // Check if hook already exists
  if (!settings.hooks.PreToolUse) {
    settings.hooks.PreToolUse = [];
  }

  // Remove any existing graphify hooks
  settings.hooks.PreToolUse = settings.hooks.PreToolUse.filter(
    h => !JSON.stringify(h).includes('graphify')
  );

  // Add the throttled PreToolUse hook
  settings.hooks.PreToolUse.push({
    matcher: '',
    hooks: [
      {
        type: 'command',
        command: `bash -c 'cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)" && node ${path.relative(rootDir, path.join(rootDir, 'bin', 'graphify.js'))} --quiet 2>/dev/null || true'`,
      },
    ],
  });

  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
  console.log('  ✅ Updated .claude/settings.json with Graphify hook');

  // ── 3. Make hook script executable ─────────────────────────
  if (useLocalScript) {
    try {
      fs.chmodSync(hookScriptPath, '755');
      console.log('  ✅ Made hook script executable');
    } catch {
      console.log('  ⚠️  Could not set executable permission on hook script');
    }
  }

  // ── 4. Run initial graphify ────────────────────────────────
  console.log('\n🔍 Running initial analysis...\n');

  try {
    const { graphify } = require('../src/index');
    graphify({ rootDir, force: true }).then(() => {
      printSuccess();
    }).catch(err => {
      console.error('  ⚠️  Initial analysis failed:', err.message);
      printSuccess();
    });
  } catch (err) {
    console.error('  ⚠️  Could not run initial analysis:', err.message);
    printSuccess();
  }
}

function printSuccess() {
  console.log(`
  ╔═══════════════════════════════════════════════════════╗
  ║  ✅ Graphify hook installed successfully!             ║
  ╠═══════════════════════════════════════════════════════╣
  ║                                                       ║
  ║  Claude Code will now:                                ║
  ║  1. Auto-update the knowledge graph on each message   ║
  ║  2. Read GRAPH.md for instant codebase awareness      ║
  ║  3. Only read source files when explicitly needed     ║
  ║                                                       ║
  ║  Files created:                                       ║
  ║  • .claude/settings.json  — Hook configuration        ║
  ║  • .graphify/GRAPH.md     — Claude knowledge index    ║
  ║  • .graphify/vault/       — Obsidian-compatible vault ║
  ║  • CLAUDE.md              — Updated with graph rules  ║
  ║                                                       ║
  ║  To view in Obsidian:                                 ║
  ║  Open .graphify/vault/<branch>/ as an Obsidian vault  ║
  ║                                                       ║
  ╚═══════════════════════════════════════════════════════╝
`);
}

module.exports = { installHook };
