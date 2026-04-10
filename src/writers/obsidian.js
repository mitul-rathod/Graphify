const fs = require('fs');
const path = require('path');
const { pathToNoteName, pathToDisplayName, ensureDir, timestamp } = require('../utils');
const { EDGE_TYPES } = require('../graph/edges');

/**
 * Build edge indexes for O(1) lookups instead of O(n) scans.
 */
function buildEdgeIndex(graph) {
  const index = {
    // edgesBySourceAndType[sourceId][type] = [edge, ...]
    bySource: new Map(),
    // edgesByTargetAndType[targetId][type] = [edge, ...]
    byTarget: new Map(),
    // funcById[funcId] = funcNode
    funcById: new Map(),
  };

  for (const edge of graph.edges) {
    // Index by source
    if (!index.bySource.has(edge.sourceId)) {
      index.bySource.set(edge.sourceId, new Map());
    }
    const srcMap = index.bySource.get(edge.sourceId);
    if (!srcMap.has(edge.type)) {
      srcMap.set(edge.type, []);
    }
    srcMap.get(edge.type).push(edge);

    // Index by target
    if (!index.byTarget.has(edge.targetId)) {
      index.byTarget.set(edge.targetId, new Map());
    }
    const tgtMap = index.byTarget.get(edge.targetId);
    if (!tgtMap.has(edge.type)) {
      tgtMap.set(edge.type, []);
    }
    tgtMap.get(edge.type).push(edge);
  }

  // Index functions by ID
  for (const funcNode of Object.values(graph.functionNodes)) {
    index.funcById.set(funcNode.id, funcNode);
  }

  return index;
}

/**
 * Get edges by source and type from the index.
 */
function getEdges(index, sourceId, type) {
  const srcMap = index.bySource.get(sourceId);
  if (!srcMap) return [];
  return srcMap.get(type) || [];
}

/**
 * Get edges by target and type from the index.
 */
function getEdgesByTarget(index, targetId, type) {
  const tgtMap = index.byTarget.get(targetId);
  if (!tgtMap) return [];
  return tgtMap.get(type) || [];
}

/**
 * Write the complete Obsidian vault from the graph.
 *
 * @param {Object} graph - The knowledge graph
 * @param {string} outputDir - Base directory for vault output (e.g., .graphify/vault/<branch>/)
 */
function writeObsidianVault(graph, outputDir) {
  // Clean the output directory
  if (fs.existsSync(outputDir)) {
    fs.rmSync(outputDir, { recursive: true, force: true });
  }

  // Create subdirectories
  const dirs = {
    files: path.join(outputDir, 'Files'),
    functions: path.join(outputDir, 'Functions'),
    classes: path.join(outputDir, 'Classes'),
    modules: path.join(outputDir, 'Modules'),
  };
  Object.values(dirs).forEach(d => ensureDir(d));

  // Pre-build edge index for O(1) lookups
  const edgeIndex = buildEdgeIndex(graph);

  // Write file nodes
  for (const [filePath, fileNode] of Object.entries(graph.fileNodes)) {
    writeFileNote(fileNode, filePath, graph, edgeIndex, dirs.files);
  }

  // Write function nodes
  for (const [key, funcNode] of Object.entries(graph.functionNodes)) {
    writeFunctionNote(funcNode, graph, edgeIndex, dirs.functions);
  }

  // Write class nodes
  for (const [key, classNode] of Object.entries(graph.classNodes)) {
    writeClassNote(classNode, graph, dirs.classes);
  }

  // Write module nodes
  for (const [dirPath, moduleNode] of Object.entries(graph.moduleNodes)) {
    writeModuleNote(moduleNode, graph, dirs.modules);
  }

  // Write the index (Map of Content)
  writeIndex(graph, outputDir);
}

/**
 * Generate an Obsidian note for a file node.
 */
function writeFileNote(fileNode, filePath, graph, edgeIndex, dir) {
  const noteName = pathToNoteName(filePath);
  const displayName = pathToDisplayName(filePath);

  // Find imports (files this file imports from) — O(1) lookup
  const importsFrom = getEdges(edgeIndex, fileNode.id, EDGE_TYPES.IMPORTS)
    .map(e => {
      const targetPath = e.targetId.replace('file:', '');
      return {
        noteName: pathToNoteName(targetPath),
        displayName: pathToDisplayName(targetPath),
        specifiers: e.specifiers || [],
      };
    });

  // Find files that import this file — O(1) lookup
  const importedBy = getEdges(edgeIndex, fileNode.id, EDGE_TYPES.IMPORTED_BY)
    .map(e => {
      const importerPath = e.targetId.replace('file:', '');
      return {
        noteName: pathToNoteName(importerPath),
        displayName: pathToDisplayName(importerPath),
      };
    });

  let content = `---
type: file
path: ${filePath}
language: ${fileNode.language}
lines: ${fileNode.lineCount}
branch: ${graph.branch}
last_updated: ${graph.generatedAt}
---

# ${displayName}

**Path:** \`${filePath}\`
**Language:** ${fileNode.language}
**Lines:** ${fileNode.lineCount}
`;

  // Contains section
  if (fileNode.functions.length > 0 || fileNode.classes.length > 0) {
    content += `\n## Contains\n\n`;

    for (const funcName of fileNode.functions) {
      const funcKey = `${filePath}:${funcName}`;
      const funcNode = graph.functionNodes[funcKey];
      const desc = funcNode?.docstring ? ` — ${funcNode.docstring}` : '';
      const asyncTag = funcNode?.isAsync ? ' ⚡' : '';
      content += `- [[Functions/${funcName}|${funcName}()]]${asyncTag}${desc}\n`;
    }

    for (const className of fileNode.classes) {
      const classKey = `${filePath}:${className}`;
      const classNode = graph.classNodes[classKey];
      const desc = classNode?.docstring ? ` — ${classNode.docstring}` : '';
      content += `- [[Classes/${className}|${className}]]${desc}\n`;
    }
  }

  // Imports section
  if (importsFrom.length > 0) {
    content += `\n## Imports\n\n`;
    for (const imp of importsFrom) {
      const specs = imp.specifiers.map(s => s.alias || s.name).join(', ');
      const specsStr = specs ? ` (${specs})` : '';
      content += `- [[Files/${imp.noteName}|${imp.displayName}]]${specsStr}\n`;
    }
  }

  // Imported By section
  if (importedBy.length > 0) {
    content += `\n## Imported By\n\n`;
    for (const imp of importedBy) {
      content += `- [[Files/${imp.noteName}|${imp.displayName}]]\n`;
    }
  }

  // Exports section
  if (fileNode.exports.length > 0) {
    content += `\n## Exports\n\n`;
    for (const exp of fileNode.exports) {
      const typeTag = exp.exportType === 'default' ? ' (default)' : '';
      content += `- \`${exp.name}\`${typeTag}\n`;
    }
  }

  // Tags
  const tags = ['#file', `#${fileNode.language}`];
  if (fileNode.exports.length > 0) tags.push('#has-exports');
  if (importedBy.length > 5) tags.push('#hub');
  content += `\n${tags.join(' ')}\n`;

  const noteFile = path.join(dir, `${noteName}.md`);
  fs.writeFileSync(noteFile, content, 'utf-8');
}

/**
 * Generate an Obsidian note for a function node.
 */
function writeFunctionNote(funcNode, graph, edgeIndex, dir) {
  const fileNoteName = pathToNoteName(funcNode.filePath);
  const fileDisplayName = pathToDisplayName(funcNode.filePath);

  // Find calls from this function — O(1) lookup
  const calls = getEdges(edgeIndex, funcNode.id, EDGE_TYPES.CALLS)
    .map(e => {
      const target = edgeIndex.funcById.get(e.targetId);
      return target ? { name: target.name, file: target.filePath } : null;
    })
    .filter(Boolean);

  // Find calls to this function — O(1) lookup
  const calledBy = getEdgesByTarget(edgeIndex, funcNode.id, EDGE_TYPES.CALLS)
    .map(e => {
      const source = edgeIndex.funcById.get(e.sourceId);
      return source ? { name: source.name, file: source.filePath } : null;
    })
    .filter(Boolean);

  const params = funcNode.params.length > 0
    ? funcNode.params.join(', ')
    : 'none';

  let content = `---
type: function
name: ${funcNode.name}
file: ${funcNode.filePath}
line: ${funcNode.line}
exported: ${funcNode.exported}
async: ${funcNode.isAsync}
branch: ${graph.branch}
---

# ${funcNode.name}()

**Defined in:** [[Files/${fileNoteName}|${fileDisplayName}]]
**Line:** ${funcNode.line}
**Exported:** ${funcNode.exported ? 'Yes' : 'No'}
**Async:** ${funcNode.isAsync ? 'Yes' : 'No'}
**Parameters:** \`${params}\`
`;

  if (funcNode.returnType) {
    content += `**Returns:** \`${funcNode.returnType}\`\n`;
  }

  if (funcNode.docstring) {
    content += `\n> ${funcNode.docstring}\n`;
  }

  if (calledBy.length > 0) {
    content += `\n## Called By\n\n`;
    for (const caller of calledBy) {
      content += `- [[Functions/${caller.name}|${caller.name}()]] in [[Files/${pathToNoteName(caller.file)}|${pathToDisplayName(caller.file)}]]\n`;
    }
  }

  if (calls.length > 0) {
    content += `\n## Calls\n\n`;
    for (const callee of calls) {
      content += `- [[Functions/${callee.name}|${callee.name}()]] in [[Files/${pathToNoteName(callee.file)}|${pathToDisplayName(callee.file)}]]\n`;
    }
  }

  // Tags
  const tags = ['#function', funcNode.exported ? '#exported' : '#internal'];
  if (funcNode.isAsync) tags.push('#async');
  if (calledBy.length > 3) tags.push('#hot-path');
  content += `\n${tags.join(' ')}\n`;

  const noteFile = path.join(dir, `${funcNode.name}.md`);
  fs.writeFileSync(noteFile, content, 'utf-8');
}

/**
 * Generate an Obsidian note for a class node.
 */
function writeClassNote(classNode, graph, dir) {
  const fileNoteName = pathToNoteName(classNode.filePath);
  const fileDisplayName = pathToDisplayName(classNode.filePath);

  let content = `---
type: class
name: ${classNode.name}
file: ${classNode.filePath}
line: ${classNode.line}
exported: ${classNode.exported}
extends: ${classNode.superClass || 'none'}
branch: ${graph.branch}
---

# ${classNode.name}

**Defined in:** [[Files/${fileNoteName}|${fileDisplayName}]]
**Line:** ${classNode.line}
**Exported:** ${classNode.exported ? 'Yes' : 'No'}
`;

  if (classNode.superClass) {
    content += `**Extends:** [[Classes/${classNode.superClass}|${classNode.superClass}]]\n`;
  }

  if (classNode.interfaces.length > 0) {
    content += `**Implements:** ${classNode.interfaces.map(i => `[[Classes/${i}|${i}]]`).join(', ')}\n`;
  }

  if (classNode.docstring) {
    content += `\n> ${classNode.docstring}\n`;
  }

  if (classNode.methods.length > 0) {
    content += `\n## Methods\n\n`;
    for (const method of classNode.methods) {
      const asyncTag = method.isAsync ? ' ⚡' : '';
      const staticTag = method.isStatic ? ' 🔒' : '';
      const params = method.params.length > 0 ? method.params.join(', ') : '';
      content += `- \`${method.name}(${params})\`${asyncTag}${staticTag} — Line ${method.line}\n`;
    }
  }

  if (classNode.properties.length > 0) {
    content += `\n## Properties\n\n`;
    for (const prop of classNode.properties) {
      const type = prop.type ? `: ${prop.type}` : '';
      content += `- \`${prop.name}${type}\` — Line ${prop.line}\n`;
    }
  }

  // Tags
  const tags = ['#class', classNode.exported ? '#exported' : '#internal'];
  if (classNode.superClass) tags.push('#extends');
  content += `\n${tags.join(' ')}\n`;

  const noteFile = path.join(dir, `${classNode.name}.md`);
  fs.writeFileSync(noteFile, content, 'utf-8');
}

/**
 * Generate an Obsidian note for a module (directory).
 */
function writeModuleNote(moduleNode, graph, dir) {
  let content = `---
type: module
path: ${moduleNode.dirPath}
files: ${moduleNode.files.length}
branch: ${graph.branch}
---

# 📦 ${moduleNode.name}/

**Path:** \`${moduleNode.dirPath}/\`
**Files:** ${moduleNode.files.length}

## Files

`;

  for (const filePath of moduleNode.files) {
    const noteName = pathToNoteName(filePath);
    const displayName = pathToDisplayName(filePath);
    content += `- [[Files/${noteName}|${displayName}]]\n`;
  }

  content += `\n#module\n`;

  const noteFile = path.join(dir, `${moduleNode.name}.md`);
  fs.writeFileSync(noteFile, content, 'utf-8');
}

/**
 * Write the index / Map of Content file.
 */
function writeIndex(graph, outputDir) {
  const stats = graph.stats;

  let content = `---
type: index
branch: ${graph.branch}
generated: ${graph.generatedAt}
total_files: ${stats.totalFiles}
total_functions: ${stats.totalFunctions}
total_classes: ${stats.totalClasses}
---

# 📊 Project Graph — ${graph.branch}

> Auto-generated by **Graphify** on ${new Date(graph.generatedAt).toLocaleString()}

## 📈 Stats

| Metric | Count |
|--------|-------|
| Files | ${stats.totalFiles} |
| Functions | ${stats.totalFunctions} |
| Classes | ${stats.totalClasses} |
| Imports | ${stats.totalImports} |
| Modules | ${stats.totalModules} |

## 📁 Files

`;

  const sortedFiles = Object.entries(graph.fileNodes)
    .sort((a, b) => a[0].localeCompare(b[0]));

  for (const [filePath, fileNode] of sortedFiles) {
    const noteName = pathToNoteName(filePath);
    const entities = [
      ...fileNode.functions.map(f => `${f}()`),
      ...fileNode.classes,
    ];
    const entitiesStr = entities.length > 0 ? ` — [${entities.join(', ')}]` : '';
    content += `- [[Files/${noteName}|${filePath}]]${entitiesStr}\n`;
  }

  if (stats.totalFunctions > 0) {
    content += `\n## ⚡ Functions\n\n`;
    const sortedFuncs = Object.values(graph.functionNodes)
      .sort((a, b) => a.name.localeCompare(b.name));

    for (const funcNode of sortedFuncs) {
      const asyncTag = funcNode.isAsync ? ' ⚡' : '';
      const exportTag = funcNode.exported ? '' : ' 🔒';
      content += `- [[Functions/${funcNode.name}|${funcNode.name}()]]${asyncTag}${exportTag} — ${pathToDisplayName(funcNode.filePath)}:${funcNode.line}\n`;
    }
  }

  if (stats.totalClasses > 0) {
    content += `\n## 🏗️ Classes\n\n`;
    const sortedClasses = Object.values(graph.classNodes)
      .sort((a, b) => a.name.localeCompare(b.name));

    for (const classNode of sortedClasses) {
      const extendsStr = classNode.superClass ? ` extends ${classNode.superClass}` : '';
      content += `- [[Classes/${classNode.name}|${classNode.name}]]${extendsStr} — ${pathToDisplayName(classNode.filePath)}:${classNode.line}\n`;
    }
  }

  if (Object.keys(graph.moduleNodes).length > 0) {
    content += `\n## 📦 Modules\n\n`;
    const sortedModules = Object.entries(graph.moduleNodes)
      .sort((a, b) => a[0].localeCompare(b[0]));

    for (const [dirPath, moduleNode] of sortedModules) {
      content += `- [[Modules/${moduleNode.name}|${dirPath}/]] — ${moduleNode.files.length} files\n`;
    }
  }

  content += `\n#index #${graph.branch}\n`;

  const indexFile = path.join(outputDir, '_Index.md');
  fs.writeFileSync(indexFile, content, 'utf-8');
}

module.exports = {
  writeObsidianVault,
};
