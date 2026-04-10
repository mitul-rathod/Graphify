const fs = require("fs");
const path = require("path");

/**
 * Install Graphify hook into Claude Code settings.
 * Uses the ultra-fast bash hook for <10ms response times.
 *
 * @param {string} rootDir - Project root directory
 */
function installHook(rootDir) {
  console.log("\n🔧 Installing Graphify hook for Claude Code...\n");

  // ── 1. Create .claude directory if needed ──────────────────
  const claudeDir = path.join(rootDir, ".claude");
  if (!fs.existsSync(claudeDir)) {
    fs.mkdirSync(claudeDir, { recursive: true });
    console.log("  ✅ Created .claude/ directory");
  }

  // ── 2. Determine graphify install location ─────────────────
  const graphifyRoot = path.resolve(__dirname, "..");
  const fastHookPath = path.join(graphifyRoot, "hooks", "fast-hook.sh");

  // Use absolute path so it works regardless of cwd
  const hookCommand = `bash "${fastHookPath}"`;

  // ── 3. Update .claude/settings.json ────────────────────────
  const settingsPath = path.join(claudeDir, "settings.json");
  let settings = {};

  if (fs.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
      console.log("  📄 Found existing .claude/settings.json");
    } catch {
      console.log(
        "  ⚠️  Could not parse existing settings.json, creating new one",
      );
      settings = {};
    }
  }

  // Initialize hooks structure
  if (!settings.hooks) {
    settings.hooks = {};
  }

  // Remove any existing graphify hooks
  if (settings.hooks.PreToolUse) {
    settings.hooks.PreToolUse = settings.hooks.PreToolUse.filter(
      (h) => !JSON.stringify(h).includes("graphify"),
    );
  } else {
    settings.hooks.PreToolUse = [];
  }

  // Add the fast pre-tool hook
  settings.hooks.PreToolUse.push({
    matcher: "",
    hooks: [
      {
        type: "command",
        command: hookCommand,
      },
    ],
  });

  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf-8");
  console.log("  ✅ Updated .claude/settings.json with Graphify hook");
  console.log(`     Hook: ${hookCommand}`);

  // ── 4. Make hook scripts executable ────────────────────────
  const hookScripts = [
    fastHookPath,
    path.join(graphifyRoot, "hooks", "claude-hook.sh"),
  ];
  for (const script of hookScripts) {
    if (fs.existsSync(script)) {
      try {
        fs.chmodSync(script, "755");
      } catch {}
    }
  }
  console.log("  ✅ Made hook scripts executable");

  // ── 5. Run initial graphify ────────────────────────────────
  console.log("\n🔍 Running initial analysis...\n");

  try {
    const { graphify } = require("../src/index");
    graphify({ rootDir, force: true })
      .then(() => {
        // Write the initial hash cache for fast-hook
        writeHashCache(rootDir);
        printSuccess(graphifyRoot);
      })
      .catch((err) => {
        console.error("  ⚠️  Initial analysis failed:", err.message);
        printSuccess(graphifyRoot);
      });
  } catch (err) {
    console.error("  ⚠️  Could not run initial analysis:", err.message);
    printSuccess(graphifyRoot);
  }
}

/**
 * Write the commit hash cache file for the fast hook.
 */
function writeHashCache(rootDir) {
  const { execSync } = require("child_process");
  const graphifyDir = path.join(rootDir, ".graphify");

  try {
    const hash = execSync("git rev-parse --short HEAD", {
      cwd: rootDir,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();

    if (!fs.existsSync(graphifyDir)) {
      fs.mkdirSync(graphifyDir, { recursive: true });
    }
    fs.writeFileSync(path.join(graphifyDir, ".last_hash"), hash, "utf-8");
    fs.writeFileSync(path.join(graphifyDir, ".fast_cache"), "", "utf-8");
  } catch {}
}

function printSuccess(graphifyRoot) {
  console.log(`
  ╔═══════════════════════════════════════════════════════╗
  ║  ✅ Graphify hook installed successfully!             ║
  ╠═══════════════════════════════════════════════════════╣
  ║                                                       ║
  ║  ⚡ Hook response time: <10ms (3-tier cache)          ║
  ║                                                       ║
  ║  How it works:                                        ║
  ║  • Tier 1 (~2ms):  File age check — skip if <60s     ║
  ║  • Tier 2 (~8ms):  Git hash check — skip if same     ║
  ║  • Tier 3 (async): Full analysis runs in background   ║
  ║                                                       ║
  ║  Files:                                               ║
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
