const { parseJavaScript } = require('./javascript');
const { parsePython } = require('./python');

/**
 * Parse a source file and extract its structural information.
 *
 * @param {string} filePath - Absolute path to the file
 * @param {string} language - Language identifier ('javascript', 'typescript', 'python')
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
    default:
      return { functions: [], classes: [], imports: [], exports: [], variables: [] };
  }
}

module.exports = {
  parseFile,
};
