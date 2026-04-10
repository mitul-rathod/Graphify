/**
 * Protocol Buffers (.proto) parser — regex-based extraction.
 */

/**
 * Parse a .proto file and extract structural information.
 */
function parseProto(filePath, source) {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const functions = [];  // RPC methods
  const classes = [];    // messages, enums, services
  const imports = [];
  const exports = [];
  const variables = [];  // package, syntax, options
  const callExpressions = [];

  let currentMessage = null;
  let currentService = null;
  let braceDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('//')) continue;

    // ── Package & syntax declarations ─────────────────────
    const syntaxMatch = trimmed.match(/^syntax\s*=\s*"([^"]+)"/);
    if (syntaxMatch) {
      variables.push({ name: 'syntax', line: lineNum, kind: 'const', type: syntaxMatch[1] });
      continue;
    }

    const packageMatch = trimmed.match(/^package\s+([\w.]+)\s*;/);
    if (packageMatch) {
      variables.push({ name: 'package', line: lineNum, kind: 'const', type: packageMatch[1] });
      continue;
    }

    // ── Import statements ────────────────────────────────
    const importMatch = trimmed.match(/^import\s+(?:public\s+)?"([^"]+)"\s*;/);
    if (importMatch) {
      imports.push({
        source: importMatch[1],
        specifiers: [{ name: importMatch[1], alias: importMatch[1] }],
        importType: 'namespace',
      });
      continue;
    }

    // ── Message definitions ──────────────────────────────
    const msgMatch = trimmed.match(/^message\s+(\w+)\s*\{/);
    if (msgMatch) {
      const fields = [];
      // Scan for fields
      for (let j = i + 1; j < lines.length; j++) {
        const ft = lines[j].trim();
        if (ft === '}') break;
        if (ft.startsWith('//') || ft.startsWith('message') || ft.startsWith('enum')) continue;
        const fieldMatch = ft.match(/^\s*(?:optional|required|repeated)?\s*(\w+)\s+(\w+)\s*=/);
        if (fieldMatch) {
          fields.push({ name: fieldMatch[2], type: fieldMatch[1], line: j + 1 });
        }
      }
      classes.push({
        name: msgMatch[1],
        line: lineNum,
        superClass: null,
        interfaces: [],
        methods: [],
        properties: fields,
        exported: true,
        docstring: null,
      });
      exports.push({ name: msgMatch[1], exportType: 'named' });
      continue;
    }

    // ── Enum definitions ─────────────────────────────────
    const enumMatch = trimmed.match(/^enum\s+(\w+)\s*\{/);
    if (enumMatch) {
      const values = [];
      for (let j = i + 1; j < lines.length; j++) {
        const et = lines[j].trim();
        if (et === '}') break;
        const valMatch = et.match(/^(\w+)\s*=/);
        if (valMatch) {
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
      exports.push({ name: enumMatch[1], exportType: 'named' });
      continue;
    }

    // ── Service definitions ──────────────────────────────
    const serviceMatch = trimmed.match(/^service\s+(\w+)\s*\{/);
    if (serviceMatch) {
      const methods = [];
      for (let j = i + 1; j < lines.length; j++) {
        const st = lines[j].trim();
        if (st === '}') break;
        const rpcMatch = st.match(/^rpc\s+(\w+)\s*\(\s*(?:stream\s+)?(\w+)\s*\)\s*returns\s*\(\s*(?:stream\s+)?(\w+)\s*\)/);
        if (rpcMatch) {
          methods.push({
            name: rpcMatch[1],
            line: j + 1,
            kind: 'rpc',
            isStatic: false,
            isAsync: false,
            params: [rpcMatch[2]],
          });
          functions.push({
            name: rpcMatch[1],
            line: j + 1,
            params: [rpcMatch[2]],
            returnType: rpcMatch[3],
            exported: true,
            isAsync: false,
            isGenerator: false,
            docstring: `RPC ${serviceMatch[1]}.${rpcMatch[1]}(${rpcMatch[2]}) → ${rpcMatch[3]}`,
          });
        }
      }
      classes.push({
        name: serviceMatch[1],
        line: lineNum,
        superClass: null,
        interfaces: [],
        methods,
        properties: [],
        exported: true,
        docstring: `gRPC service`,
      });
      exports.push({ name: serviceMatch[1], exportType: 'named' });
      continue;
    }

    // ── Option statements ────────────────────────────────
    const optMatch = trimmed.match(/^option\s+(\w+)\s*=\s*"?([^";]+)"?\s*;/);
    if (optMatch) {
      variables.push({ name: `option:${optMatch[1]}`, line: lineNum, kind: 'option', type: optMatch[2] });
    }
  }

  return { functions, classes, imports, exports, variables, callExpressions };
}

module.exports = { parseProto };
