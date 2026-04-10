const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { ensureDir } = require('./utils');

/**
 * Detect the current git branch name.
 *
 * @param {string} cwd - Working directory (project root)
 * @returns {string} - Branch name or 'unknown'
 */
function getCurrentBranch(cwd) {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return branch || 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Get the git repository root directory.
 *
 * @param {string} cwd - Working directory
 * @returns {string} - Repo root path or cwd if not a git repo
 */
function getRepoRoot(cwd) {
  try {
    return execSync('git rev-parse --show-toplevel', {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return cwd;
  }
}

/**
 * Get the latest commit hash (short).
 *
 * @param {string} cwd - Working directory
 * @returns {string}
 */
function getLatestCommitHash(cwd) {
  try {
    return execSync('git rev-parse --short HEAD', {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return 'none';
  }
}

/**
 * Get list of files changed since a given commit hash.
 *
 * @param {string} cwd - Working directory
 * @param {string} sinceCommit - Commit hash to diff from
 * @returns {string[]} - List of changed file paths (relative)
 */
function getChangedFilesSince(cwd, sinceCommit) {
  try {
    const output = execSync(`git diff --name-only ${sinceCommit} HEAD`, {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    if (!output) return [];
    return output.split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Load the branch manifest, which tracks when each branch was last analyzed.
 *
 * @param {string} graphifyDir - Path to .graphify directory
 * @returns {Object}
 */
function loadBranchManifest(graphifyDir) {
  const manifestPath = path.join(graphifyDir, 'branches.json');
  try {
    const content = fs.readFileSync(manifestPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return { branches: {} };
  }
}

/**
 * Save the branch manifest.
 *
 * @param {string} graphifyDir - Path to .graphify directory
 * @param {Object} manifest
 */
function saveBranchManifest(graphifyDir, manifest) {
  ensureDir(graphifyDir);
  const manifestPath = path.join(graphifyDir, 'branches.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
}

/**
 * Check if a re-analysis is needed based on the last commit analyzed.
 *
 * @param {string} graphifyDir - Path to .graphify directory
 * @param {string} branch - Current branch name
 * @param {string} currentCommit - Current HEAD commit hash
 * @returns {boolean}
 */
function needsUpdate(graphifyDir, branch, currentCommit) {
  const manifest = loadBranchManifest(graphifyDir);
  const branchData = manifest.branches[branch];

  if (!branchData) return true;
  if (branchData.lastCommit !== currentCommit) return true;

  return false;
}

/**
 * Record that a branch analysis was completed.
 *
 * @param {string} graphifyDir
 * @param {string} branch
 * @param {string} commitHash
 * @param {Object} stats - { files, functions, classes }
 */
function recordAnalysis(graphifyDir, branch, commitHash, stats = {}) {
  const manifest = loadBranchManifest(graphifyDir);
  manifest.branches[branch] = {
    lastCommit: commitHash,
    lastAnalyzed: new Date().toISOString(),
    stats,
  };
  saveBranchManifest(graphifyDir, manifest);
}

module.exports = {
  getCurrentBranch,
  getRepoRoot,
  getLatestCommitHash,
  getChangedFilesSince,
  loadBranchManifest,
  saveBranchManifest,
  needsUpdate,
  recordAnalysis,
};
