/**
 * Python parser — uses regex-based extraction.
 * Python's clean syntax makes regex parsing quite reliable for structural extraction.
 */

/**
 * Parse a Python file and extract structural information.
 *
 * @param {string} filePath - File path for reference
 * @param {string} source - File content
 * @returns {Object} - { functions, classes, imports, exports, variables, callExpressions }
 */
function parsePython(filePath, source) {
  const lines = source.split('\n');
  const functions = [];
  const classes = [];
  const imports = [];
  const exports = [];
  const variables = [];
  const callExpressions = [];

  // Track indentation context for class methods vs module-level functions
  let currentClass = null;
  let classIndent = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    const indent = getIndentLevel(line);
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) continue;

    // ── Imports ──────────────────────────────────────────────
    const importMatch = trimmed.match(/^import\s+(.+)$/);
    if (importMatch) {
      const modules = importMatch[1].split(',').map(m => m.trim());
      for (const mod of modules) {
        const asMatch = mod.match(/^(\S+)\s+as\s+(\S+)$/);
        if (asMatch) {
          imports.push({
            source: asMatch[1],
            specifiers: [{ name: asMatch[1], alias: asMatch[2] }],
            importType: 'namespace',
          });
        } else {
          imports.push({
            source: mod,
            specifiers: [{ name: mod, alias: mod }],
            importType: 'namespace',
          });
        }
      }
      continue;
    }

    const fromImportMatch = trimmed.match(/^from\s+(\S+)\s+import\s+(.+)$/);
    if (fromImportMatch) {
      const source_module = fromImportMatch[1];
      const imported = fromImportMatch[2];

      if (imported.trim() === '*') {
        imports.push({
          source: source_module,
          specifiers: [{ name: '*', alias: '*' }],
          importType: 'namespace',
        });
      } else {
        // Handle multi-line imports and inline imports
        const specs = imported
          .replace(/[()]/g, '')
          .split(',')
          .map(s => s.trim())
          .filter(Boolean)
          .map(s => {
            const asMatch = s.match(/^(\S+)\s+as\s+(\S+)$/);
            if (asMatch) {
              return { name: asMatch[1], alias: asMatch[2] };
            }
            return { name: s, alias: s };
          });

        imports.push({
          source: source_module,
          specifiers: specs,
          importType: 'named',
        });
      }
      continue;
    }

    // ── Classes ──────────────────────────────────────────────
    const classMatch = trimmed.match(/^class\s+(\w+)(?:\(([^)]*)\))?\s*:/);
    if (classMatch && indent === 0) {
      const className = classMatch[1];
      const bases = classMatch[2]
        ? classMatch[2].split(',').map(b => b.trim()).filter(Boolean)
        : [];

      const superClass = bases.length > 0 ? bases[0] : null;
      const docstring = extractDocstring(lines, i + 1, indent + 1);

      currentClass = {
        name: className,
        line: lineNum,
        superClass: superClass !== 'object' ? superClass : null,
        interfaces: [],
        methods: [],
        properties: [],
        exported: !className.startsWith('_'),
        docstring,
      };
      classIndent = indent;

      classes.push(currentClass);
      continue;
    }

    // ── Functions / Methods ──────────────────────────────────
    const funcMatch = trimmed.match(/^(async\s+)?def\s+(\w+)\s*\(([^)]*)\)(?:\s*->\s*(\S+))?\s*:/);
    if (funcMatch) {
      const isAsync = !!funcMatch[1];
      const funcName = funcMatch[2];
      const rawParams = funcMatch[3];
      const returnType = funcMatch[4] || null;
      const docstring = extractDocstring(lines, i + 1, indent + 1);

      const params = rawParams
        .split(',')
        .map(p => p.trim())
        .filter(p => p && p !== 'self' && p !== 'cls')
        .map(p => {
          // Strip default values for param display
          const eqIdx = p.indexOf('=');
          if (eqIdx !== -1) {
            return p.slice(0, eqIdx).trim() + '?';
          }
          return p;
        });

      // Check if inside a class
      if (currentClass && indent > classIndent) {
        currentClass.methods.push({
          name: funcName,
          line: lineNum,
          kind: funcName === '__init__' ? 'constructor' : 'method',
          isStatic: false,
          isAsync,
          params,
        });
      } else {
        // Module-level function
        currentClass = null;
        classIndent = -1;

        functions.push({
          name: funcName,
          line: lineNum,
          params,
          returnType,
          exported: !funcName.startsWith('_'),
          isAsync,
          isGenerator: false,
          docstring,
        });
      }
      continue;
    }

    // ── Decorators (track @staticmethod, @classmethod) ────────
    const decoratorMatch = trimmed.match(/^@(staticmethod|classmethod)/);
    if (decoratorMatch) {
      // Peek ahead for the next function def
      for (let j = i + 1; j < lines.length; j++) {
        const nextTrimmed = lines[j].trim();
        if (!nextTrimmed || nextTrimmed.startsWith('@')) continue;
        break;
      }
    }

    // ── Top-level variables / constants ──────────────────────
    if (indent === 0 && !currentClass) {
      const varMatch = trimmed.match(/^([A-Z_][A-Z0-9_]*)\s*[:=]/);
      if (varMatch) {
        variables.push({
          name: varMatch[1],
          line: lineNum,
          kind: 'const',
          type: null,
        });
      }
    }

    // ── __all__ exports ─────────────────────────────────────
    const allMatch = trimmed.match(/^__all__\s*=\s*\[([^\]]*)\]/);
    if (allMatch) {
      const names = allMatch[1]
        .match(/['"](\w+)['"]/g)
        ?.map(n => n.replace(/['"]/g, '')) || [];

      for (const name of names) {
        exports.push({
          name,
          exportType: 'named',
        });
      }
    }

    // ── Call expressions ────────────────────────────────────
    const callMatches = trimmed.matchAll(/(?<!\w)(\w+)\s*\(/g);
    for (const match of callMatches) {
      const callName = match[1];
      // Skip Python keywords and builtins
      const skip = new Set(['if', 'elif', 'for', 'while', 'with', 'def', 'class',
        'print', 'len', 'range', 'int', 'str', 'float', 'list', 'dict',
        'set', 'tuple', 'type', 'isinstance', 'hasattr', 'getattr',
        'setattr', 'super', 'property', 'staticmethod', 'classmethod']);
      if (!skip.has(callName)) {
        callExpressions.push({
          name: callName,
          line: lineNum,
        });
      }
    }

    // Reset class context when indent returns to top level
    if (indent === 0 && currentClass && !classMatch) {
      currentClass = null;
      classIndent = -1;
    }
  }

  // If no __all__ was found, export all public functions and classes
  if (exports.length === 0) {
    for (const fn of functions) {
      if (fn.exported) {
        exports.push({ name: fn.name, exportType: 'named' });
      }
    }
    for (const cls of classes) {
      if (cls.exported) {
        exports.push({ name: cls.name, exportType: 'named' });
      }
    }
  }

  return { functions, classes, imports, exports, variables, callExpressions };
}

// ── Helpers ──────────────────────────────────────────────────

function getIndentLevel(line) {
  const match = line.match(/^(\s*)/);
  if (!match) return 0;
  // Count spaces (tabs = 4 spaces)
  return match[1].replace(/\t/g, '    ').length;
}

function extractDocstring(lines, startIdx, expectedIndent) {
  if (startIdx >= lines.length) return null;

  const line = lines[startIdx].trim();
  const tripleQuoteMatch = line.match(/^("""|''')/);
  if (!tripleQuoteMatch) return null;

  const quote = tripleQuoteMatch[1];

  // Single-line docstring
  if (line.endsWith(quote) && line.length > 6) {
    return line.slice(3, -3).trim();
  }

  // Multi-line docstring — just take the first line
  const firstLine = line.slice(3).trim();
  if (firstLine) return firstLine;

  // Look at the next line
  if (startIdx + 1 < lines.length) {
    return lines[startIdx + 1].trim();
  }

  return null;
}

module.exports = { parsePython };
