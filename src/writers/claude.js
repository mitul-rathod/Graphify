const fs = require('fs');
const path = require('path');
const { buildTreeString, pathToDisplayName, truncate } = require('../utils');
const { EDGE_TYPES } = require('../graph/edges');
const { computeMetrics } = require('../graph/builder');

/**
 * Write the Claude Code-optimized GRAPH.md file.
 * This file is designed to be compact yet comprehensive — giving Claude
 * instant awareness of the entire codebase structure.
 *
 * @param {Object} graph - The knowledge graph
 * @param {string} outputPath - Path to write GRAPH.md
 */
function writeClaudeIndex(graph, outputPath) {
  const metrics = computeMetrics(graph);

  // Pre-index edges by sourceId for O(1) lookups
  const edgesBySource = new Map();
  for (const edge of graph.edges) {
    if (!edgesBySource.has(edge.sourceId)) {
      edgesBySource.set(edge.sourceId, new Map());
    }
    const srcMap = edgesBySource.get(edge.sourceId);
    if (!srcMap.has(edge.type)) {
      srcMap.set(edge.type, []);
    }
    srcMap.get(edge.type).push(edge);
  }

  function getEdges(sourceId, type) {
    const srcMap = edgesBySource.get(sourceId);
    if (!srcMap) return [];
    return srcMap.get(type) || [];
  }

  let content = '';

  // ── Header ──────────────────────────────────────────────────
  content += `# 🧠 Graphify — Project Knowledge Graph

**Branch:** \`${graph.branch}\` | **Generated:** ${graph.generatedAt} | **Files:** ${graph.stats.totalFiles} | **Functions:** ${graph.stats.totalFunctions} | **Classes:** ${graph.stats.totalClasses}

---

## 📋 Instructions for Claude Code

> **This file is your persistent memory of the codebase.**
> - Use this graph to understand the project structure, file purposes, dependencies, and relationships.
> - When asked to make changes, consult this graph FIRST to identify which files to modify.
> - Only read individual source files when you need to see exact implementation details.
> - The graph is branch-aware: it reflects the current branch \`${graph.branch}\`.

---

`;

  // ── Project Structure Tree ─────────────────────────────────
  content += `## 📂 Project Structure\n\n\`\`\`\n`;

  const fileDescriptions = Object.entries(graph.fileNodes)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([filePath, fileNode]) => {
      const entities = [];
      for (const funcName of fileNode.functions) {
        entities.push(`${funcName}()`);
      }
      for (const className of fileNode.classes) {
        entities.push(className);
      }

      const desc = entities.length > 0
        ? `[${entities.join(', ')}]`
        : `${fileNode.lineCount} lines`;

      return {
        relativePath: filePath,
        description: desc,
      };
    });

  content += buildTreeString(fileDescriptions);
  content += `\n\`\`\`\n\n`;

  // ── File Details ───────────────────────────────────────────
  content += `## 📄 File Details\n\n`;

  const sortedFiles = Object.entries(graph.fileNodes)
    .sort((a, b) => a[0].localeCompare(b[0]));

  for (const [filePath, fileNode] of sortedFiles) {
    const lang = fileNode.language;
    const lines = fileNode.lineCount;

    // Imports — O(1) lookup
    const importsEdges = getEdges(fileNode.id, EDGE_TYPES.IMPORTS);
    const importsList = importsEdges.map(e => {
      const targetPath = e.targetId.replace('file:', '');
      const specs = (e.specifiers || []).map(s => s.alias || s.name).filter(s => s !== '*').join(', ');
      return specs ? `${targetPath} (${specs})` : targetPath;
    });

    // Imported by — O(1) lookup
    const importedByEdges = getEdges(fileNode.id, EDGE_TYPES.IMPORTED_BY);
    const importedByList = importedByEdges.map(e => e.targetId.replace('file:', ''));

    // Exports
    const exportsList = fileNode.exports.map(e => {
      const typeTag = e.exportType === 'default' ? ' (default)' : '';
      return `${e.name}${typeTag}`;
    });

    content += `### \`${filePath}\`\n`;
    content += `> ${lang} | ${lines} lines`;

    if (fileNode.functions.length > 0) {
      content += ` | Functions: ${fileNode.functions.join(', ')}`;
    }
    if (fileNode.classes.length > 0) {
      content += ` | Classes: ${fileNode.classes.join(', ')}`;
    }
    content += `\n`;

    if (exportsList.length > 0) {
      content += `- **Exports:** ${exportsList.join(', ')}\n`;
    }
    if (importsList.length > 0) {
      content += `- **Imports from:** ${importsList.join(', ')}\n`;
    }
    if (importedByList.length > 0) {
      content += `- **Imported by:** ${importedByList.join(', ')}\n`;
    }

    content += `\n`;
  }

  // ── Dependency Graph ───────────────────────────────────────
  content += `## 🔗 Dependency Graph\n\n`;
  content += `\`\`\`\n`;

  for (const [filePath, fileNode] of sortedFiles) {
    const deps = getEdges(fileNode.id, EDGE_TYPES.IMPORTS)
      .map(e => e.targetId.replace('file:', ''));

    if (deps.length > 0) {
      content += `${filePath} → ${deps.join(', ')}\n`;
    }
  }

  content += `\`\`\`\n\n`;

  // ── Functions Index ────────────────────────────────────────
  if (graph.stats.totalFunctions > 0) {
    content += `## ⚡ Functions\n\n`;
    content += `| Function | File | Line | Exported | Async | Params |\n`;
    content += `|----------|------|------|----------|-------|--------|\n`;

    const sortedFuncs = Object.values(graph.functionNodes)
      .sort((a, b) => a.filePath.localeCompare(b.filePath) || a.line - b.line);

    for (const fn of sortedFuncs) {
      const params = fn.params.length > 0 ? truncate(fn.params.join(', '), 40) : '-';
      content += `| \`${fn.name}()\` | \`${fn.filePath}\` | ${fn.line} | ${fn.exported ? '✅' : '❌'} | ${fn.isAsync ? '✅' : '❌'} | ${params} |\n`;
    }

    content += `\n`;
  }

  // ── Classes Index ──────────────────────────────────────────
  if (graph.stats.totalClasses > 0) {
    content += `## 🏗️ Classes\n\n`;

    const sortedClasses = Object.values(graph.classNodes)
      .sort((a, b) => a.filePath.localeCompare(b.filePath));

    for (const cls of sortedClasses) {
      const extendsStr = cls.superClass ? ` extends \`${cls.superClass}\`` : '';
      const methodNames = cls.methods.map(m => `${m.name}()`).join(', ');

      content += `### \`${cls.name}\`${extendsStr}\n`;
      content += `> ${cls.filePath}:${cls.line}`;
      if (cls.docstring) content += ` — ${cls.docstring}`;
      content += `\n`;
      if (methodNames) content += `- **Methods:** ${methodNames}\n`;
      if (cls.properties.length > 0) {
        content += `- **Properties:** ${cls.properties.map(p => p.name).join(', ')}\n`;
      }
      content += `\n`;
    }
  }

  // ── Metrics ────────────────────────────────────────────────
  content += `## 📊 Metrics & Insights\n\n`;

  if (metrics.mostImported.length > 0) {
    content += `### Most Imported Files\n`;
    for (const item of metrics.mostImported) {
      content += `- \`${item.file}\` — imported by ${item.importedByCount} files\n`;
    }
    content += `\n`;
  }

  if (metrics.mostConnectedFunctions.length > 0) {
    content += `### Most Connected Functions\n`;
    for (const item of metrics.mostConnectedFunctions) {
      content += `- \`${item.name}()\` @ \`${item.file}:${item.line}\` — ${item.connections} connections\n`;
    }
    content += `\n`;
  }

  if (metrics.orphanFiles.length > 0) {
    content += `### Orphan Files (no imports in or out)\n`;
    for (const file of metrics.orphanFiles) {
      content += `- \`${file}\`\n`;
    }
    content += `\n`;
  }

  // ── Modules ────────────────────────────────────────────────
  if (Object.keys(graph.moduleNodes).length > 0) {
    content += `## 📦 Modules\n\n`;
    const sortedModules = Object.entries(graph.moduleNodes)
      .sort((a, b) => a[0].localeCompare(b[0]));

    for (const [dirPath, moduleNode] of sortedModules) {
      content += `- \`${dirPath}/\` — ${moduleNode.files.length} files: ${moduleNode.files.map(f => pathToDisplayName(f)).join(', ')}\n`;
    }
    content += `\n`;
  }

  // Write the file
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(outputPath, content, 'utf-8');
}

module.exports = {
  writeClaudeIndex,
};
