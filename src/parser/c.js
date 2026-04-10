/**
 * C/C++ header parser — regex-based extraction.
 * Handles .c and .h files.
 */

/**
 * Parse a C/C++ file and extract structural information.
 *
 * @param {string} filePath - File path for reference
 * @param {string} source - File content
 * @returns {Object}
 */
function parseC(filePath, source) {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const functions = [];
  const classes = [];  // structs, enums, unions
  const imports = [];
  const exports = [];
  const variables = [];
  const callExpressions = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    const trimmed = line.trim();

    // Skip empty lines and single-line comments
    if (!trimmed || trimmed.startsWith('//')) continue;

    // ── #include directives ──────────────────────────────
    const includeMatch = trimmed.match(/^#include\s+["<]([^">]+)[">]/);
    if (includeMatch) {
      imports.push({
        source: includeMatch[1],
        specifiers: [{ name: includeMatch[1], alias: includeMatch[1] }],
        importType: 'namespace',
      });
      continue;
    }

    // ── #define constants ────────────────────────────────
    const defineMatch = trimmed.match(/^#define\s+([A-Z_][A-Z0-9_]*)\s/);
    if (defineMatch) {
      variables.push({
        name: defineMatch[1],
        line: lineNum,
        kind: 'define',
        type: null,
      });
      continue;
    }

    // ── Struct / Union ───────────────────────────────────
    const structMatch = trimmed.match(/^(?:typedef\s+)?(?:struct|union)\s+(\w+)\s*\{?/);
    if (structMatch && structMatch[1]) {
      const methods = [];
      // Scan for fields
      const properties = [];
      for (let j = i + 1; j < lines.length; j++) {
        const ft = lines[j].trim();
        if (ft === '};' || ft.startsWith('}')) break;
        const fieldMatch = ft.match(/^\s*(?:(?:unsigned|signed|const|volatile|struct|enum)\s+)*(\w+)\s+(\w+)/);
        if (fieldMatch && !ft.startsWith('//') && !ft.startsWith('/*')) {
          properties.push({ name: fieldMatch[2], type: fieldMatch[1], line: j + 1 });
        }
      }
      classes.push({
        name: structMatch[1],
        line: lineNum,
        superClass: null,
        interfaces: [],
        methods,
        properties,
        exported: true,
        docstring: null,
      });
      continue;
    }

    // ── Enum ─────────────────────────────────────────────
    const enumMatch = trimmed.match(/^(?:typedef\s+)?enum\s+(\w+)\s*\{?/);
    if (enumMatch) {
      const values = [];
      for (let j = i + 1; j < lines.length; j++) {
        const et = lines[j].trim();
        if (et === '};' || et.startsWith('}')) break;
        const valMatch = et.match(/^(\w+)/);
        if (valMatch && !et.startsWith('//') && !et.startsWith('/*')) {
          values.push({ name: valMatch[1], type: 'enum', line: j + 1 });
        }
      }
      classes.push({
        name: enumMatch[1],
        line: lineNum,
        superClass: null,
        interfaces: [],
        methods: [],
        properties: values,
        exported: true,
        docstring: null,
      });
      continue;
    }

    // ── Typedef ──────────────────────────────────────────
    const typedefMatch = trimmed.match(/^typedef\s+(.+?)\s+(\w+)\s*;/);
    if (typedefMatch) {
      variables.push({
        name: typedefMatch[2],
        line: lineNum,
        kind: 'typedef',
        type: typedefMatch[1],
      });
      continue;
    }

    // ── Function definitions ─────────────────────────────
    // Match: return_type [modifiers] func_name(params) {  or  )  at start of line
    const funcMatch = trimmed.match(
      /^(?:static\s+|inline\s+|extern\s+)*(?:(?:unsigned|signed|const|volatile|struct|enum)\s+)*(\w[\w\s*]*?)\s+(\w+)\s*\(([^)]*)\)\s*\{?\s*$/
    );
    if (funcMatch && !trimmed.startsWith('#') && !trimmed.startsWith('//')) {
      const returnType = funcMatch[1].trim();
      const funcName = funcMatch[2];
      const rawParams = funcMatch[3];

      // Skip keywords that look like function calls
      const skipNames = new Set(['if', 'for', 'while', 'switch', 'return', 'sizeof', 'typeof']);
      if (skipNames.has(funcName)) continue;

      const params = rawParams
        .split(',')
        .map(p => p.trim())
        .filter(p => p && p !== 'void')
        .map(p => {
          // Extract just the param name from "type name"
          const parts = p.replace(/\*/g, '').trim().split(/\s+/);
          return parts[parts.length - 1] || p;
        });

      const isStatic = trimmed.startsWith('static');
      functions.push({
        name: funcName,
        line: lineNum,
        params,
        returnType,
        exported: !isStatic,
        isAsync: false,
        isGenerator: false,
        docstring: null,
      });
    }

    // ── Call expressions ─────────────────────────────────
    const callMatches = trimmed.matchAll(/(?<!\w)(\w+)\s*\(/g);
    for (const match of callMatches) {
      const callName = match[1];
      const skip = new Set([
        'if', 'for', 'while', 'switch', 'return', 'sizeof', 'typeof',
        'define', 'include', 'ifdef', 'ifndef', 'endif', 'else',
        'struct', 'enum', 'union', 'typedef',
      ]);
      if (!skip.has(callName)) {
        callExpressions.push({ name: callName, line: lineNum });
      }
    }
  }

  // Export all non-static functions
  for (const fn of functions) {
    if (fn.exported) {
      exports.push({ name: fn.name, exportType: 'named' });
    }
  }
  for (const cls of classes) {
    exports.push({ name: cls.name, exportType: 'named' });
  }

  return { functions, classes, imports, exports, variables, callExpressions };
}

module.exports = { parseC };
