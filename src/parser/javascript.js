const parser = require('@babel/parser');
const traverse = require('@babel/traverse');

/**
 * Parse a JavaScript or TypeScript file using Babel.
 * Extracts functions, classes, imports, exports, and top-level variables.
 *
 * @param {string} filePath - File path for reference
 * @param {string} source - File content
 * @param {string} language - 'javascript' or 'typescript'
 * @returns {Object} - { functions, classes, imports, exports, variables, callExpressions }
 */
function parseJavaScript(filePath, source, language) {
  const functions = [];
  const classes = [];
  const imports = [];
  const exports = [];
  const variables = [];
  const callExpressions = [];

  let ast;
  try {
    ast = parser.parse(source, {
      sourceType: 'module',
      allowImportExportEverywhere: true,
      allowReturnOutsideFunction: true,
      allowSuperOutsideMethod: true,
      plugins: [
        'jsx',
        language === 'typescript' ? 'typescript' : null,
        'decorators-legacy',
        'classProperties',
        'classPrivateProperties',
        'classPrivateMethods',
        'optionalChaining',
        'nullishCoalescingOperator',
        'dynamicImport',
        'exportDefaultFrom',
        'exportNamespaceFrom',
        'topLevelAwait',
      ].filter(Boolean),
    });
  } catch (e) {
    // If parsing fails, return empty results
    return { functions, classes, imports, exports, variables, callExpressions };
  }

  // Get the traverse function (handle default export from @babel/traverse)
  const traverseFn = traverse.default || traverse;

  traverseFn(ast, {
    // ── Imports ──────────────────────────────────────────────
    ImportDeclaration(path) {
      const node = path.node;
      const specifiers = [];
      let importType = 'named';

      for (const spec of node.specifiers) {
        if (spec.type === 'ImportDefaultSpecifier') {
          specifiers.push({ name: 'default', alias: spec.local.name });
          importType = 'default';
        } else if (spec.type === 'ImportNamespaceSpecifier') {
          specifiers.push({ name: '*', alias: spec.local.name });
          importType = 'namespace';
        } else {
          specifiers.push({
            name: spec.imported.name || spec.imported.value,
            alias: spec.local.name,
          });
        }
      }

      if (node.specifiers.length === 0) {
        importType = 'side-effect';
      }

      imports.push({
        source: node.source.value,
        specifiers,
        importType,
      });
    },

    // ── Require calls ───────────────────────────────────────
    CallExpression(path) {
      const node = path.node;

      // Track require()
      if (
        node.callee.type === 'Identifier' &&
        node.callee.name === 'require' &&
        node.arguments.length > 0 &&
        node.arguments[0].type === 'StringLiteral'
      ) {
        imports.push({
          source: node.arguments[0].value,
          specifiers: [],
          importType: 'require',
        });
      }

      // Track function call expressions for the call graph
      let callName = null;
      if (node.callee.type === 'Identifier') {
        callName = node.callee.name;
      } else if (node.callee.type === 'MemberExpression' && node.callee.property) {
        callName = node.callee.property.name || node.callee.property.value;
      }

      if (callName) {
        callExpressions.push({
          name: callName,
          line: node.loc?.start?.line || 0,
        });
      }
    },

    // ── Function Declarations ────────────────────────────────
    FunctionDeclaration(path) {
      const node = path.node;
      if (!node.id) return;

      const isExported = path.parent.type === 'ExportNamedDeclaration' ||
        path.parent.type === 'ExportDefaultDeclaration';

      functions.push({
        name: node.id.name,
        line: node.loc?.start?.line || 0,
        params: extractParams(node.params),
        returnType: extractReturnType(node),
        exported: isExported,
        isAsync: node.async || false,
        isGenerator: node.generator || false,
        docstring: extractLeadingComment(path),
      });
    },

    // ── Arrow functions and function expressions assigned to variables ──
    VariableDeclarator(path) {
      const node = path.node;
      if (!node.id || node.id.type !== 'Identifier') return;

      const init = node.init;
      if (!init) return;

      // Check if this is a function expression / arrow function
      if (
        init.type === 'ArrowFunctionExpression' ||
        init.type === 'FunctionExpression'
      ) {
        const grandParent = path.parentPath?.parent;
        const isExported = grandParent?.type === 'ExportNamedDeclaration' ||
          grandParent?.type === 'ExportDefaultDeclaration';

        functions.push({
          name: node.id.name,
          line: node.loc?.start?.line || 0,
          params: extractParams(init.params),
          returnType: extractReturnType(init),
          exported: isExported,
          isAsync: init.async || false,
          isGenerator: init.generator || false,
          docstring: extractLeadingComment(path.parentPath),
        });
      } else {
        // Track top-level variable declarations
        const grandParent = path.parentPath?.parent;
        const isTopLevel = grandParent?.type === 'Program' ||
          grandParent?.type === 'ExportNamedDeclaration';

        if (isTopLevel) {
          variables.push({
            name: node.id.name,
            line: node.loc?.start?.line || 0,
            kind: path.parent?.kind || 'const',
            type: extractTypeAnnotation(node.id),
          });
        }
      }
    },

    // ── Classes ──────────────────────────────────────────────
    ClassDeclaration(path) {
      const node = path.node;
      const isExported = path.parent.type === 'ExportNamedDeclaration' ||
        path.parent.type === 'ExportDefaultDeclaration';

      const methods = [];
      const properties = [];

      for (const member of node.body.body) {
        if (member.type === 'ClassMethod' || member.type === 'ClassPrivateMethod') {
          const methodName = member.key?.name || member.key?.id?.name || 'anonymous';
          methods.push({
            name: methodName,
            line: member.loc?.start?.line || 0,
            kind: member.kind || 'method', // 'constructor', 'method', 'get', 'set'
            isStatic: member.static || false,
            isAsync: member.async || false,
            params: extractParams(member.params),
          });
        } else if (member.type === 'ClassProperty' || member.type === 'ClassPrivateProperty') {
          properties.push({
            name: member.key?.name || member.key?.id?.name || 'unknown',
            line: member.loc?.start?.line || 0,
            isStatic: member.static || false,
            type: extractTypeAnnotation(member),
          });
        }
      }

      classes.push({
        name: node.id?.name || 'AnonymousClass',
        line: node.loc?.start?.line || 0,
        superClass: node.superClass?.name || null,
        interfaces: extractImplements(node),
        methods,
        properties,
        exported: isExported,
        docstring: extractLeadingComment(path),
      });
    },

    // ── Exports ──────────────────────────────────────────────
    ExportNamedDeclaration(path) {
      const node = path.node;

      // Re-exports: export { x } from 'module'
      if (node.source) {
        for (const spec of node.specifiers) {
          exports.push({
            name: spec.exported.name || spec.exported.value,
            exportType: 're-export',
            source: node.source.value,
          });
        }
        return;
      }

      // Named exports without declaration: export { x, y }
      if (!node.declaration && node.specifiers.length > 0) {
        for (const spec of node.specifiers) {
          exports.push({
            name: spec.exported.name || spec.exported.value,
            exportType: 'named',
          });
        }
        return;
      }

      // The declaration itself is handled by FunctionDeclaration/ClassDeclaration visitors
      if (node.declaration) {
        if (node.declaration.id) {
          exports.push({
            name: node.declaration.id.name,
            exportType: 'named',
          });
        } else if (node.declaration.declarations) {
          for (const decl of node.declaration.declarations) {
            if (decl.id?.name) {
              exports.push({
                name: decl.id.name,
                exportType: 'named',
              });
            }
          }
        }
      }
    },

    ExportDefaultDeclaration(path) {
      const node = path.node;
      let name = 'default';

      if (node.declaration?.id?.name) {
        name = node.declaration.id.name;
      } else if (node.declaration?.name) {
        name = node.declaration.name;
      }

      exports.push({
        name,
        exportType: 'default',
      });
    },

    // module.exports = ...
    AssignmentExpression(path) {
      const node = path.node;
      if (
        node.left.type === 'MemberExpression' &&
        node.left.object?.name === 'module' &&
        node.left.property?.name === 'exports'
      ) {
        if (node.right.type === 'ObjectExpression') {
          for (const prop of node.right.properties) {
            if (prop.key?.name) {
              exports.push({
                name: prop.key.name,
                exportType: 'named',
              });
            }
          }
        } else {
          exports.push({
            name: 'default',
            exportType: 'default',
          });
        }
      }
    },
  });

  return { functions, classes, imports, exports, variables, callExpressions };
}

// ── Helper functions ──────────────────────────────────────────

function extractParams(params) {
  return params.map(p => {
    if (p.type === 'Identifier') {
      const type = extractTypeAnnotation(p);
      return type ? `${p.name}: ${type}` : p.name;
    }
    if (p.type === 'AssignmentPattern' && p.left?.name) {
      return `${p.left.name}?`;
    }
    if (p.type === 'RestElement' && p.argument?.name) {
      return `...${p.argument.name}`;
    }
    if (p.type === 'ObjectPattern') {
      return '{ ... }';
    }
    if (p.type === 'ArrayPattern') {
      return '[ ... ]';
    }
    return 'unknown';
  });
}

function extractReturnType(node) {
  if (node.returnType?.typeAnnotation) {
    return typeAnnotationToString(node.returnType.typeAnnotation);
  }
  return null;
}

function extractTypeAnnotation(node) {
  if (node.typeAnnotation?.typeAnnotation) {
    return typeAnnotationToString(node.typeAnnotation.typeAnnotation);
  }
  return null;
}

function typeAnnotationToString(ann) {
  if (!ann) return null;
  switch (ann.type) {
    case 'TSStringKeyword': return 'string';
    case 'TSNumberKeyword': return 'number';
    case 'TSBooleanKeyword': return 'boolean';
    case 'TSVoidKeyword': return 'void';
    case 'TSAnyKeyword': return 'any';
    case 'TSNullKeyword': return 'null';
    case 'TSUndefinedKeyword': return 'undefined';
    case 'TSNeverKeyword': return 'never';
    case 'TSObjectKeyword': return 'object';
    case 'TSArrayType':
      return `${typeAnnotationToString(ann.elementType)}[]`;
    case 'TSTypeReference':
      return ann.typeName?.name || 'unknown';
    case 'TSUnionType':
      return ann.types.map(t => typeAnnotationToString(t)).join(' | ');
    case 'TSFunctionType':
      return '(...) => ...';
    default:
      return null;
  }
}

function extractImplements(node) {
  if (node.implements) {
    return node.implements.map(i => i.expression?.name || i.id?.name || 'unknown');
  }
  return [];
}

function extractLeadingComment(path) {
  const node = path.node;
  if (node.leadingComments && node.leadingComments.length > 0) {
    const last = node.leadingComments[node.leadingComments.length - 1];
    if (last.type === 'CommentBlock') {
      // Clean JSDoc comment
      return last.value
        .replace(/^\*\s*/gm, '')
        .replace(/^\s*\*\s?/gm, '')
        .replace(/^\s*\/?\*+\/?/gm, '')
        .trim()
        .split('\n')[0]; // Take first line only for brevity
    }
    if (last.type === 'CommentLine') {
      return last.value.trim();
    }
  }
  return null;
}

module.exports = { parseJavaScript };
