const path = require('path');
const fs = require('fs');
const { parseFile } = require('../parser');
const { createFileNode, createFunctionNode, createClassNode, createModuleNode } = require('./nodes');
const { EDGE_TYPES, createEdge } = require('./edges');
const { resolveImportPath } = require('../utils');
const { getLineCount } = require('../scanner');

/**
 * Build a complete knowledge graph from scanned files.
 *
 * @param {Object[]} files - Array of { absolutePath, relativePath, extension, language }
 * @param {string} rootDir - Project root directory
 * @param {string} branch - Current git branch
 * @returns {Object} - Complete graph object
 */
function buildGraph(files, rootDir, branch) {
  const graph = {
    branch,
    generatedAt: new Date().toISOString(),
    rootDir,
    fileNodes: {},      // key: relativePath
    functionNodes: {},   // key: filePath:funcName
    classNodes: {},      // key: filePath:className
    moduleNodes: {},     // key: dirPath
    edges: [],
    stats: {
      totalFiles: 0,
      totalFunctions: 0,
      totalClasses: 0,
      totalImports: 0,
      totalExports: 0,
    },
  };

  const allRelativePaths = files.map(f => f.relativePath);

  // ── Phase 1: Parse all files and create nodes ──────────────
  for (const file of files) {
    let source;
    try {
      source = fs.readFileSync(file.absolutePath, 'utf-8');
    } catch {
      continue;
    }

    const lineCount = source.split('\n').length;
    const parsed = parseFile(file.absolutePath, file.language, source);

    // Create file node
    const fileNode = createFileNode(file.relativePath, file.language, lineCount);
    fileNode.imports = parsed.imports || [];
    fileNode.exports = parsed.exports || [];
    fileNode.variables = parsed.variables || [];
    fileNode.callExpressions = parsed.callExpressions || [];

    // Create function nodes
    for (const fn of parsed.functions || []) {
      const funcNode = createFunctionNode({
        name: fn.name,
        filePath: file.relativePath,
        line: fn.line,
        params: fn.params,
        returnType: fn.returnType,
        exported: fn.exported,
        isAsync: fn.isAsync,
        isGenerator: fn.isGenerator,
        docstring: fn.docstring,
      });
      const funcKey = `${file.relativePath}:${fn.name}`;
      graph.functionNodes[funcKey] = funcNode;
      fileNode.functions.push(fn.name);

      // CONTAINS edge: File → Function
      graph.edges.push(createEdge(
        EDGE_TYPES.CONTAINS,
        fileNode.id,
        funcNode.id,
      ));
    }

    // Create class nodes
    for (const cls of parsed.classes || []) {
      const classNode = createClassNode({
        name: cls.name,
        filePath: file.relativePath,
        line: cls.line,
        superClass: cls.superClass,
        interfaces: cls.interfaces,
        methods: cls.methods,
        properties: cls.properties,
        exported: cls.exported,
        docstring: cls.docstring,
      });
      const classKey = `${file.relativePath}:${cls.name}`;
      graph.classNodes[classKey] = classNode;
      fileNode.classes.push(cls.name);

      // CONTAINS edge: File → Class
      graph.edges.push(createEdge(
        EDGE_TYPES.CONTAINS,
        fileNode.id,
        classNode.id,
      ));
    }

    graph.fileNodes[file.relativePath] = fileNode;
  }

  // ── Phase 2: Resolve imports and build edges ───────────────
  for (const [filePath, fileNode] of Object.entries(graph.fileNodes)) {
    for (const imp of fileNode.imports) {
      const resolvedPath = resolveImportPath(imp.source, filePath, allRelativePaths);

      if (resolvedPath) {
        imp.resolvedPath = resolvedPath;

        // IMPORTS edge: File → File
        graph.edges.push(createEdge(
          EDGE_TYPES.IMPORTS,
          fileNode.id,
          `file:${resolvedPath}`,
          { specifiers: imp.specifiers, importType: imp.importType },
        ));

        // IMPORTED_BY edge (reverse): Target ← File
        graph.edges.push(createEdge(
          EDGE_TYPES.IMPORTED_BY,
          `file:${resolvedPath}`,
          fileNode.id,
        ));
      }
    }
  }

  // ── Phase 3: Build call graph (best-effort) ────────────────
  // Map function names to their node IDs for resolution
  // Using Map to avoid Object.prototype collisions (e.g., 'constructor')
  const funcNameToIds = new Map();
  for (const [key, funcNode] of Object.entries(graph.functionNodes)) {
    const name = funcNode.name;
    if (!funcNameToIds.has(name)) {
      funcNameToIds.set(name, []);
    }
    funcNameToIds.get(name).push(funcNode.id);
  }

  // For each file, check its call expressions against known functions
  for (const [filePath, fileNode] of Object.entries(graph.fileNodes)) {
    const callExpressions = fileNode.callExpressions || [];
    const fileFunctions = fileNode.functions;

    for (const call of callExpressions) {
      // Find the enclosing function for this call
      let callerFuncId = null;
      for (const funcName of fileFunctions) {
        const funcKey = `${filePath}:${funcName}`;
        const funcNode = graph.functionNodes[funcKey];
        if (funcNode && funcNode.line <= call.line) {
          callerFuncId = funcNode.id;
        }
      }

      // Resolve the call target
      const targetIds = funcNameToIds.get(call.name) || [];
      for (const targetId of targetIds) {
        // Avoid self-calls being duplicated
        if (targetId !== callerFuncId) {
          graph.edges.push(createEdge(
            EDGE_TYPES.CALLS,
            callerFuncId || fileNode.id,
            targetId,
          ));
        }
      }
    }
  }

  // ── Phase 4: Build inheritance edges ───────────────────────
  const classNameToId = {};
  for (const [key, classNode] of Object.entries(graph.classNodes)) {
    classNameToId[classNode.name] = classNode.id;
  }

  for (const [key, classNode] of Object.entries(graph.classNodes)) {
    if (classNode.superClass && classNameToId[classNode.superClass]) {
      graph.edges.push(createEdge(
        EDGE_TYPES.EXTENDS,
        classNode.id,
        classNameToId[classNode.superClass],
      ));
    }

    for (const iface of classNode.interfaces) {
      if (classNameToId[iface]) {
        graph.edges.push(createEdge(
          EDGE_TYPES.IMPLEMENTS,
          classNode.id,
          classNameToId[iface],
        ));
      }
    }
  }

  // ── Phase 5: Build module nodes ────────────────────────────
  const dirs = new Set();
  for (const filePath of Object.keys(graph.fileNodes)) {
    const dir = path.dirname(filePath);
    if (dir && dir !== '.') {
      dirs.add(dir);
    }
  }

  for (const dir of dirs) {
    const filesInDir = Object.keys(graph.fileNodes)
      .filter(fp => path.dirname(fp) === dir);

    graph.moduleNodes[dir] = createModuleNode(dir, filesInDir);
  }

  // ── Compute stats ─────────────────────────────────────────
  graph.stats = {
    totalFiles: Object.keys(graph.fileNodes).length,
    totalFunctions: Object.keys(graph.functionNodes).length,
    totalClasses: Object.keys(graph.classNodes).length,
    totalImports: graph.edges.filter(e => e.type === EDGE_TYPES.IMPORTS).length,
    totalExports: Object.values(graph.fileNodes)
      .reduce((sum, fn) => sum + (fn.exports?.length || 0), 0),
    totalModules: Object.keys(graph.moduleNodes).length,
  };

  return graph;
}

/**
 * Compute connectivity metrics for the graph.
 * Returns files/functions sorted by how connected they are.
 */
function computeMetrics(graph) {
  const metrics = {
    mostImported: [],
    mostConnectedFunctions: [],
    orphanFiles: [],
  };

  // Count how many files import each file
  const importCount = {};
  for (const edge of graph.edges) {
    if (edge.type === EDGE_TYPES.IMPORTED_BY) {
      const fileId = edge.sourceId.replace('file:', '');
      importCount[fileId] = (importCount[fileId] || 0) + 1;
    }
  }

  metrics.mostImported = Object.entries(importCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([file, count]) => ({ file, importedByCount: count }));

  // Find orphan files (no imports in, no imports out)
  const filesWithEdges = new Set();
  for (const edge of graph.edges) {
    if (edge.type === EDGE_TYPES.IMPORTS || edge.type === EDGE_TYPES.IMPORTED_BY) {
      filesWithEdges.add(edge.sourceId.replace('file:', ''));
      filesWithEdges.add(edge.targetId.replace('file:', ''));
    }
  }

  metrics.orphanFiles = Object.keys(graph.fileNodes)
    .filter(fp => !filesWithEdges.has(fp));

  // Count function connectivity (calls + called_by)
  const funcConnections = {};
  for (const edge of graph.edges) {
    if (edge.type === EDGE_TYPES.CALLS) {
      funcConnections[edge.sourceId] = (funcConnections[edge.sourceId] || 0) + 1;
      funcConnections[edge.targetId] = (funcConnections[edge.targetId] || 0) + 1;
    }
  }

  metrics.mostConnectedFunctions = Object.entries(funcConnections)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([id, count]) => {
      const node = Object.values(graph.functionNodes).find(n => n.id === id);
      return node ? { name: node.name, file: node.filePath, line: node.line, connections: count } : null;
    })
    .filter(Boolean);

  return metrics;
}

module.exports = {
  buildGraph,
  computeMetrics,
};
