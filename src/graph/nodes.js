/**
 * Node types for the code knowledge graph.
 * Each node represents an entity in the codebase.
 */

const NODE_TYPES = {
  FILE: 'file',
  FUNCTION: 'function',
  CLASS: 'class',
  MODULE: 'module',
};

/**
 * Create a File node.
 */
function createFileNode(relativePath, language, lineCount) {
  return {
    type: NODE_TYPES.FILE,
    id: `file:${relativePath}`,
    relativePath,
    language,
    lineCount,
    functions: [],
    classes: [],
    imports: [],
    exports: [],
    variables: [],
  };
}

/**
 * Create a Function node.
 */
function createFunctionNode({ name, filePath, line, params = [], returnType = null, exported = false, isAsync = false, isGenerator = false, docstring = null }) {
  return {
    type: NODE_TYPES.FUNCTION,
    id: `func:${filePath}:${name}`,
    name,
    filePath,
    line,
    params,
    returnType,
    exported,
    isAsync,
    isGenerator,
    docstring,
    calls: [],
    calledBy: [],
  };
}

/**
 * Create a Class node.
 */
function createClassNode({ name, filePath, line, superClass = null, interfaces = [], methods = [], properties = [], exported = false, docstring = null }) {
  return {
    type: NODE_TYPES.CLASS,
    id: `class:${filePath}:${name}`,
    name,
    filePath,
    line,
    superClass,
    interfaces,
    methods,
    properties,
    exported,
    docstring,
  };
}

/**
 * Create a Module node (directory-level grouping).
 */
function createModuleNode(dirPath, files = []) {
  return {
    type: NODE_TYPES.MODULE,
    id: `module:${dirPath}`,
    dirPath,
    name: dirPath.split('/').pop() || dirPath,
    files,
  };
}

/**
 * Create an Import record.
 */
function createImport({ source, specifiers = [], importType = 'named', fromFile }) {
  return {
    source,
    specifiers,       // [{ name, alias }]
    importType,       // 'named', 'default', 'namespace', 'side-effect'
    fromFile,
    resolvedPath: null,  // Will be filled by the graph builder
  };
}

/**
 * Create an Export record.
 */
function createExport({ name, exportType = 'named', source = null }) {
  return {
    name,
    exportType,   // 'named', 'default', 're-export'
    source,       // Source module if re-export
  };
}

module.exports = {
  NODE_TYPES,
  createFileNode,
  createFunctionNode,
  createClassNode,
  createModuleNode,
  createImport,
  createExport,
};
