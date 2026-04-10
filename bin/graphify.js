#!/usr/bin/env node

/**
 * Graphify CLI — Codebase knowledge graph generator
 *
 * Usage:
 *   graphify                    Run analysis on current branch
 *   graphify --force            Force re-analysis
 *   graphify --quiet            Suppress output (for hooks)
 *   graphify --branch <name>    Analyze a specific branch
 *   graphify install-hook       Install Claude Code hook
 *   graphify --help             Show help
 */

const path = require('path');
const { graphify } = require('../src/index');

async function main() {
  const args = process.argv.slice(2);

  // ── Help ───────────────────────────────────────────────────
  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  // ── Install hook command ───────────────────────────────────
  if (args.includes('install-hook')) {
    const { installHook } = require('../hooks/install');
    installHook(process.cwd());
    process.exit(0);
  }

  // ── Parse options ──────────────────────────────────────────
  const options = {
    rootDir: process.cwd(),
    force: args.includes('--force') || args.includes('-f'),
    quiet: args.includes('--quiet') || args.includes('-q'),
  };

  // Branch override
  const branchIdx = args.indexOf('--branch');
  if (branchIdx !== -1 && args[branchIdx + 1]) {
    options.branch = args[branchIdx + 1];
  }

  try {
    const result = await graphify(options);

    // In quiet mode, output the GRAPH.md contents to stdout
    // (for Claude Code hook injection)
    if (options.quiet && !result.skipped) {
      const fs = require('fs');
      const graphPath = path.join(options.rootDir, '.graphify', 'GRAPH.md');
      if (fs.existsSync(graphPath)) {
        process.stdout.write(fs.readFileSync(graphPath, 'utf-8'));
      }
    }
  } catch (err) {
    if (!options.quiet) {
      console.error('❌ Graphify error:', err.message);
      if (process.env.DEBUG) {
        console.error(err.stack);
      }
    }
    process.exit(1);
  }
}

function printHelp() {
  console.log(`
  ╔═══════════════════════════════════════════════╗
  ║         🧠 Graphify v1.0.0                   ║
  ║   Codebase Knowledge Graph Generator          ║
  ║   For Claude Code & Obsidian                  ║
  ╚═══════════════════════════════════════════════╝

  USAGE:
    graphify                     Analyze current branch
    graphify --force, -f         Force re-analysis (ignore cache)
    graphify --quiet, -q         Quiet mode (for hooks, outputs GRAPH.md to stdout)
    graphify --branch <name>     Analyze a specific branch
    graphify install-hook        Install Claude Code hook configuration
    graphify --help, -h          Show this help message

  OUTPUT:
    .graphify/GRAPH.md           Claude Code knowledge index
    .graphify/vault/<branch>/    Obsidian-compatible vault with wiki-links

  HOOK INTEGRATION:
    Run 'graphify install-hook' to configure Claude Code to automatically
    read the knowledge graph before processing your requests.

  ENVIRONMENT:
    DEBUG=1                      Show stack traces on error
`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
