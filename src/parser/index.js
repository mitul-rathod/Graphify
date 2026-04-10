const { parseJavaScript } = require('./javascript');
const { parsePython } = require('./python');
const { parseC } = require('./c');
const { parseProto } = require('./proto');
const { parseYaml } = require('./yaml');
const { parseShell } = require('./shell');
const { parseHtml } = require('./html');

/**
 * Parse a source file and extract its structural information.
 *
 * @param {string} filePath - Absolute path to the file
 * @param {string} language - Language identifier
 * @param {string} source - File contents
 * @returns {Object} - { functions, classes, imports, exports, variables }
 */
function parseFile(filePath, language, source) {
  switch (language) {
    case 'javascript':
    case 'typescript':
      return parseJavaScript(filePath, source, language);
    case 'python':
      return parsePython(filePath, source);
    case 'c':
      return parseC(filePath, source);
    case 'proto':
      return parseProto(filePath, source);
    case 'yaml':
      return parseYaml(filePath, source);
    case 'shell':
      return parseShell(filePath, source);
    case 'html':
      return parseHtml(filePath, source);
    default:
      return { functions: [], classes: [], imports: [], exports: [], variables: [] };
  }
}

module.exports = {
  parseFile,
};
