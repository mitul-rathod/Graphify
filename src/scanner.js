const fs = require('fs');
const path = require('path');
const ignore = require('ignore');

/**
 * Supported file extensions and their language mappings.
 */
const LANGUAGE_MAP = {
  // JavaScript / TypeScript
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  // Python family
  '.py': 'python',
  '.pyi': 'python',     // type stubs — same parser
  '.pyx': 'python',     // Cython — close enough to Python
  '.pxd': 'python',     // Cython declarations
  // C / C++ headers
  '.c': 'c',
  '.h': 'c',
  // Protocol Buffers
  '.proto': 'proto',
  // Config
  '.yaml': 'yaml',
  '.yml': 'yaml',
  // Shell
  '.sh': 'shell',
  // Web
  '.html': 'html',
  '.htm': 'html',
};

const SUPPORTED_EXTENSIONS = new Set(Object.keys(LANGUAGE_MAP));

/**
 * Default directories/patterns to always skip.
 */
const DEFAULT_IGNORES = [
  'node_modules',
  '.git',
  '.graphify',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  'coverage',
  '__pycache__',
  '.pytest_cache',
  'venv',
  '.venv',
  'env',
  '.env',
  '*.min.js',
  '*.bundle.js',
  '*.map',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
];

/**
 * Scan the project directory for supported source files.
 *
 * @param {string} rootDir - Project root directory
 * @returns {Object[]} - Array of { absolutePath, relativePath, extension, language }
 */
function scanProject(rootDir) {
  const ig = createIgnoreFilter(rootDir);
  const files = [];

  walkDir(rootDir, rootDir, ig, files);

  // Sort for deterministic output
  files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

  return files;
}

/**
 * Create an ignore filter from .gitignore + default ignores.
 */
function createIgnoreFilter(rootDir) {
  const ig = ignore();

  // Add default ignores
  ig.add(DEFAULT_IGNORES);

  // Read .gitignore if it exists
  const gitignorePath = path.join(rootDir, '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
    ig.add(gitignoreContent);
  }

  return ig;
}

/**
 * Recursively walk a directory, collecting supported files.
 */
function walkDir(baseDir, currentDir, ig, results) {
  let entries;
  try {
    entries = fs.readdirSync(currentDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(currentDir, entry.name);
    const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, '/');

    // Check ignore filter
    if (ig.ignores(relativePath)) {
      continue;
    }

    if (entry.isDirectory()) {
      // Check if directory itself is ignored
      if (!ig.ignores(relativePath + '/')) {
        walkDir(baseDir, fullPath, ig, results);
      }
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (SUPPORTED_EXTENSIONS.has(ext)) {
        results.push({
          absolutePath: fullPath,
          relativePath,
          extension: ext,
          language: LANGUAGE_MAP[ext],
        });
      }
    }
  }
}

/**
 * Get the total line count of a file.
 */
function getLineCount(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return content.split('\n').length;
  } catch {
    return 0;
  }
}

module.exports = {
  scanProject,
  getLineCount,
  LANGUAGE_MAP,
  SUPPORTED_EXTENSIONS,
};
