/**
 * YAML parser — lightweight config-aware extraction.
 * Designed for .yaml and .yml configuration files.
 */

/**
 * Parse a YAML file and extract structural information.
 * Since YAML files are config, we extract top-level keys and structure.
 */
function parseYaml(filePath, source) {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const functions = [];
  const classes = [];
  const imports = [];
  const exports = [];
  const variables = [];
  const callExpressions = [];

  const topLevelKeys = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Skip empty lines and comments
    if (!line.trim() || line.trim().startsWith('#')) continue;

    // Skip lines that start with whitespace (not top-level)
    if (line.match(/^\s/)) continue;

    // Skip YAML document markers
    if (line === '---' || line === '...') continue;

    // Top-level key
    const keyMatch = line.match(/^([a-zA-Z_][\w.-]*)\s*:/);
    if (keyMatch) {
      const keyName = keyMatch[1];
      topLevelKeys.push(keyName);

      variables.push({
        name: keyName,
        line: lineNum,
        kind: 'key',
        type: 'yaml',
      });

      exports.push({
        name: keyName,
        exportType: 'named',
      });
    }
  }

  return { functions, classes, imports, exports, variables, callExpressions };
}

module.exports = { parseYaml };
