const path = require('path');
const fs = require('fs');

/**
 * Sanitize a file path into a valid Obsidian note name.
 * Replaces path separators and dots with underscores.
 * e.g., "src/components/Button.tsx" → "src_components_Button"
 */
function pathToNoteName(filePath) {
  const parsed = path.parse(filePath);
  const withoutExt = path.join(parsed.dir, parsed.name);
  return withoutExt.replace(/[\\/]/g, '_').replace(/\./g, '_');
}

/**
 * Create a display name from a file path.
 * e.g., "src/components/Button.tsx" → "Button.tsx"
 */
function pathToDisplayName(filePath) {
  return path.basename(filePath);
}

/**
 * Ensure a directory exists, creating it recursively if needed.
 */
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Get the current ISO timestamp.
 */
function timestamp() {
  return new Date().toISOString();
}

/**
 * Normalize a relative import path to match against known file paths.
 * Handles missing extensions and index files.
 *
 * @param {string} importSource - The import source string (e.g., '../utils/theme')
 * @param {string} fromFile - The file containing the import
 * @param {string[]} allFiles - List of all known file relative paths
 * @returns {string|null} - Matched file path or null
 */
function resolveImportPath(importSource, fromFile, allFiles) {
  // Skip empty sources
  if (!importSource) return null;

  // ── JS-style relative imports ──────────────────────────
  if (importSource.startsWith('.') || importSource.startsWith('/')) {
    const fromDir = path.dirname(fromFile);
    const resolved = path.normalize(path.join(fromDir, importSource));

    const extensions = ['', '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.py',
      '/index.js', '/index.ts', '/index.jsx', '/index.tsx'];

    for (const ext of extensions) {
      const candidate = resolved + ext;
      const normalized = candidate.replace(/\\/g, '/');
      if (allFiles.has(normalized)) {
        return normalized;
      }
    }
    return null;
  }

  // ── Python module imports (dot notation) ────────────────
  // Convert "common_utils.tool_spec_decorator" → "common_utils/tool_spec_decorator"
  const asPath = importSource.replace(/\./g, '/');
  const pyCandidates = [
    asPath + '.py',
    asPath + '.pyi',
    asPath + '/__init__.py',
  ];

  for (const candidate of pyCandidates) {
    if (allFiles.has(candidate)) {
      return candidate;
    }
  }

  // Try relative to the importing file's directory
  const fromDir = path.dirname(fromFile);
  for (const candidate of pyCandidates) {
    const relCandidate = path.join(fromDir, candidate).replace(/\\/g, '/');
    if (allFiles.has(relCandidate)) {
      return relCandidate;
    }
  }

  // ── C/Proto includes — try direct match ────────────────
  if (allFiles.has(importSource)) {
    return importSource;
  }

  return null;
}

/**
 * Truncate a string to a max length, appending '...' if truncated.
 */
function truncate(str, maxLen = 80) {
  if (!str) return '';
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}

/**
 * Create a tree-like string representation of a directory structure.
 * 
 * @param {Object[]} files - Array of { relativePath, description }
 * @returns {string}
 */
function buildTreeString(files) {
  const tree = {};

  // Build nested object from file paths
  for (const file of files) {
    const parts = file.relativePath.split('/');
    let current = tree;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (i === parts.length - 1) {
        // Leaf node (file)
        current[part] = file.description || '';
      } else {
        // Directory node
        if (!current[part] || typeof current[part] === 'string') {
          current[part] = {};
        }
        current = current[part];
      }
    }
  }

  // Render the tree
  return renderTree(tree, '');
}

function renderTree(node, prefix) {
  const lines = [];
  const entries = Object.entries(node);

  entries.forEach(([key, value], index) => {
    const isLast = index === entries.length - 1;
    const connector = isLast ? '└── ' : '├── ';
    const childPrefix = isLast ? '    ' : '│   ';

    if (typeof value === 'string') {
      // File with description
      const desc = value ? ` — ${value}` : '';
      lines.push(`${prefix}${connector}${key}${desc}`);
    } else {
      // Directory
      lines.push(`${prefix}${connector}${key}/`);
      lines.push(renderTree(value, prefix + childPrefix));
    }
  });

  return lines.filter(l => l).join('\n');
}

/**
 * Generate a short hash for cache invalidation.
 */
function shortHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

module.exports = {
  pathToNoteName,
  pathToDisplayName,
  ensureDir,
  timestamp,
  resolveImportPath,
  truncate,
  buildTreeString,
  shortHash,
};
