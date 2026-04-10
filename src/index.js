const path = require('path');
const fs = require('fs');
const { getCurrentBranch, getRepoRoot, getLatestCommitHash, needsUpdate, recordAnalysis } = require('./branch');
const { scanProject } = require('./scanner');
const { buildGraph } = require('./graph/builder');
const { writeObsidianVault } = require('./writers/obsidian');
const { writeClaudeIndex } = require('./writers/claude');
const { ensureDir } = require('./utils');

/**
 * Main Graphify orchestrator.
 * Scans the project, builds the knowledge graph, and writes output.
 *
 * @param {Object} options
 * @param {string} [options.rootDir] - Project root directory (defaults to cwd)
 * @param {string} [options.branch] - Override branch name
 * @param {boolean} [options.force] - Force re-analysis even if nothing changed
 * @param {boolean} [options.quiet] - Suppress console output
 * @returns {Object} - { graph, stats, skipped }
 */
async function graphify(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const branch = options.branch || getCurrentBranch(rootDir);
  const force = options.force || false;
  const quiet = options.quiet || false;

  const log = quiet ? () => {} : console.log;

  const graphifyDir = path.join(rootDir, '.graphify');
  const currentCommit = getLatestCommitHash(rootDir);

  // ── Check if update is needed ──────────────────────────────
  if (!force && !needsUpdate(graphifyDir, branch, currentCommit)) {
    log('✨ Graph is up-to-date. Use --force to regenerate.');
    return { graph: null, stats: null, skipped: true };
  }

  log(`\n🔍 Graphify — Analyzing codebase...`);
  log(`   Branch: ${branch}`);
  log(`   Commit: ${currentCommit}`);
  log(`   Root:   ${rootDir}\n`);

  // ── Phase 1: Scan files ────────────────────────────────────
  const startTime = Date.now();
  const files = scanProject(rootDir);
  log(`📂 Found ${files.length} source files`);

  if (files.length === 0) {
    log('⚠️  No supported source files found.');
    return { graph: null, stats: { totalFiles: 0 }, skipped: false };
  }

  // ── Phase 2: Build graph ───────────────────────────────────
  log('🔨 Building knowledge graph...');
  const graph = buildGraph(files, rootDir, branch);
  log(`   ${graph.stats.totalFunctions} functions, ${graph.stats.totalClasses} classes, ${graph.stats.totalImports} imports`);

  // ── Phase 3: Write Obsidian vault ──────────────────────────
  const vaultDir = path.join(graphifyDir, 'vault', sanitizeBranchName(branch));
  log(`📝 Writing Obsidian vault → ${path.relative(rootDir, vaultDir)}/`);
  writeObsidianVault(graph, vaultDir);

  // ── Phase 4: Write Claude Code index ───────────────────────
  const graphMdPath = path.join(graphifyDir, 'GRAPH.md');
  log(`📝 Writing Claude index → ${path.relative(rootDir, graphMdPath)}`);
  writeClaudeIndex(graph, graphMdPath);

  // ── Phase 5: Update CLAUDE.md ──────────────────────────────
  updateClaudeMd(rootDir);

  // ── Phase 6: Ensure .gitignore includes .graphify ──────────
  ensureGitignore(rootDir);

  // ── Phase 7: Record analysis ───────────────────────────────
  recordAnalysis(graphifyDir, branch, currentCommit, graph.stats);

  // ── Phase 8: Update fast-hook cache ────────────────────────
  // Write hash + timestamp for the bash fast-hook's 3-tier cache
  try {
    fs.writeFileSync(path.join(graphifyDir, '.last_hash'), currentCommit, 'utf-8');
    fs.writeFileSync(path.join(graphifyDir, '.fast_cache'), '', 'utf-8');
  } catch {}

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  log(`\n✅ Graphify complete in ${elapsed}s`);
  log(`   Vault:  .graphify/vault/${sanitizeBranchName(branch)}/`);
  log(`   Index:  .graphify/GRAPH.md`);
  log(`   Stats:  ${graph.stats.totalFiles} files, ${graph.stats.totalFunctions} functions, ${graph.stats.totalClasses} classes\n`);

  return { graph, stats: graph.stats, skipped: false };
}

/**
 * Sanitize a branch name for use as a directory name.
 * e.g., "feature/auth-flow" → "feature_auth-flow"
 */
function sanitizeBranchName(branch) {
  return branch.replace(/[/\\:*?"<>|]/g, '_');
}

/**
 * Update or create CLAUDE.md with Graphify instructions.
 */
function updateClaudeMd(rootDir) {
  const claudeMdPath = path.join(rootDir, 'CLAUDE.md');
  const graphifySection = `
# 🧠 Project Knowledge Graph (Graphify)

A knowledge graph of this codebase exists at \`.graphify/GRAPH.md\`.
This graph is auto-generated and branch-aware.

## IMPORTANT: Graph-First Workflow

1. **ALWAYS read \`.graphify/GRAPH.md\` FIRST** before making any changes to the codebase.
2. Use the graph to understand file structure, dependencies, function relationships, and where changes need to be made.
3. **DO NOT read source files to understand project structure** — the graph already has that information.
4. **Only read individual source files when:**
   - The user explicitly asks you to look at specific code
   - You need to see the exact implementation to make an edit
   - The graph tells you which file to edit — then read ONLY that file
5. When you need to modify code, use the graph to identify the exact file(s) and function(s) involved, then read only those specific files.
6. The graph includes: file structure, all functions & classes, import/export relationships, call graphs, and dependency chains.
`;

  const marker = '<!-- GRAPHIFY:START -->';
  const endMarker = '<!-- GRAPHIFY:END -->';

  let content = '';

  if (fs.existsSync(claudeMdPath)) {
    content = fs.readFileSync(claudeMdPath, 'utf-8');

    // Remove existing Graphify section if present
    const startIdx = content.indexOf(marker);
    const endIdx = content.indexOf(endMarker);
    if (startIdx !== -1 && endIdx !== -1) {
      content = content.slice(0, startIdx) + content.slice(endIdx + endMarker.length);
    }
  }

  // Prepend Graphify section (so it's read first)
  content = `${marker}\n${graphifySection}\n${endMarker}\n\n${content.trim()}\n`;

  fs.writeFileSync(claudeMdPath, content, 'utf-8');
}

/**
 * Ensure .graphify is in .gitignore.
 */
function ensureGitignore(rootDir) {
  const gitignorePath = path.join(rootDir, '.gitignore');
  let content = '';

  if (fs.existsSync(gitignorePath)) {
    content = fs.readFileSync(gitignorePath, 'utf-8');
  }

  if (!content.includes('.graphify')) {
    content += '\n# Graphify - generated knowledge graph\n.graphify/\n';
    fs.writeFileSync(gitignorePath, content, 'utf-8');
  }
}

module.exports = {
  graphify,
  sanitizeBranchName,
};
