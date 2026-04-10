/**
 * Shell/Bash parser — regex-based extraction.
 * Handles .sh files.
 */

/**
 * Parse a shell script and extract structural information.
 */
function parseShell(filePath, source) {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const functions = [];
  const classes = [];
  const imports = [];
  const exports = [];
  const variables = [];
  const callExpressions = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) continue;

    // ── Source / dot imports ─────────────────────────────
    const sourceMatch = trimmed.match(/^(?:source|\.)(?:\s+)["']?([^"'\s;]+)["']?/);
    if (sourceMatch) {
      imports.push({
        source: sourceMatch[1],
        specifiers: [{ name: sourceMatch[1], alias: sourceMatch[1] }],
        importType: 'namespace',
      });
      continue;
    }

    // ── Function definitions (two forms) ─────────────────
    // Form 1: function name() { ... }
    // Form 2: name() { ... }
    const funcMatch = trimmed.match(/^(?:function\s+)?(\w+)\s*\(\s*\)\s*\{?/);
    if (funcMatch && !trimmed.startsWith('if') && !trimmed.startsWith('for') &&
        !trimmed.startsWith('while') && !trimmed.startsWith('case')) {
      functions.push({
        name: funcMatch[1],
        line: lineNum,
        params: [],
        returnType: null,
        exported: true,
        isAsync: false,
        isGenerator: false,
        docstring: null,
      });
      continue;
    }

    // ── Environment variable exports ─────────────────────
    const exportMatch = trimmed.match(/^export\s+(\w+)(?:=|$)/);
    if (exportMatch) {
      exports.push({
        name: exportMatch[1],
        exportType: 'named',
      });
      variables.push({
        name: exportMatch[1],
        line: lineNum,
        kind: 'env',
        type: null,
      });
      continue;
    }

    // ── Variable assignments ─────────────────────────────
    const varMatch = trimmed.match(/^([A-Z_][A-Z0-9_]*)=/);
    if (varMatch) {
      variables.push({
        name: varMatch[1],
        line: lineNum,
        kind: 'variable',
        type: null,
      });
    }

    // ── Call expressions ─────────────────────────────────
    const callMatches = trimmed.matchAll(/(?<!\w)(\w+)\s*(?:\s|$|;|\|)/g);
    for (const match of callMatches) {
      const callName = match[1];
      const skip = new Set([
        'if', 'then', 'else', 'fi', 'for', 'do', 'done', 'while',
        'case', 'esac', 'in', 'function', 'return', 'exit', 'echo',
        'export', 'local', 'readonly', 'declare', 'set', 'unset',
        'true', 'false', 'test',
      ]);
      if (!skip.has(callName) && callName.length > 1) {
        callExpressions.push({ name: callName, line: lineNum });
      }
    }
  }

  return { functions, classes, imports, exports, variables, callExpressions };
}

module.exports = { parseShell };
