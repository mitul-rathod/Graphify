/**
 * HTML parser — lightweight regex-based extraction.
 * Extracts script/link references and major structural elements.
 */

/**
 * Parse an HTML file and extract structural information.
 */
function parseHtml(filePath, source) {
  const normalized = source.replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');
  const functions = [];
  const classes = [];
  const imports = [];
  const exports = [];
  const variables = [];
  const callExpressions = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    const trimmed = line.trim();

    if (!trimmed) continue;

    // ── <script src="..."> imports ───────────────────────
    const scriptMatch = trimmed.match(/<script[^>]+src\s*=\s*["']([^"']+)["']/i);
    if (scriptMatch) {
      imports.push({
        source: scriptMatch[1],
        specifiers: [{ name: scriptMatch[1], alias: scriptMatch[1] }],
        importType: 'namespace',
      });
    }

    // ── <link href="..." rel="stylesheet"> ───────────────
    const linkMatch = trimmed.match(/<link[^>]+href\s*=\s*["']([^"']+)["'][^>]*rel\s*=\s*["']stylesheet["']/i);
    const linkMatch2 = trimmed.match(/<link[^>]+rel\s*=\s*["']stylesheet["'][^>]*href\s*=\s*["']([^"']+)["']/i);
    if (linkMatch) {
      imports.push({
        source: linkMatch[1],
        specifiers: [{ name: linkMatch[1], alias: 'stylesheet' }],
        importType: 'namespace',
      });
    } else if (linkMatch2) {
      imports.push({
        source: linkMatch2[1],
        specifiers: [{ name: linkMatch2[1], alias: 'stylesheet' }],
        importType: 'namespace',
      });
    }

    // ── Major structure elements ─────────────────────────
    const idMatch = trimmed.match(/<(?:div|section|main|nav|header|footer|form|article)\b[^>]*id\s*=\s*["']([^"']+)["']/i);
    if (idMatch) {
      exports.push({
        name: `#${idMatch[1]}`,
        exportType: 'named',
      });
    }

    // ── <template> or named components ───────────────────
    const templateMatch = trimmed.match(/<template\b[^>]*(?:id|name)\s*=\s*["']([^"']+)["']/i);
    if (templateMatch) {
      exports.push({
        name: templateMatch[1],
        exportType: 'named',
      });
    }
  }

  // Extract title
  const titleMatch = normalized.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) {
    variables.push({
      name: 'title',
      line: 1,
      kind: 'meta',
      type: titleMatch[1].trim(),
    });
  }

  return { functions, classes, imports, exports, variables, callExpressions };
}

module.exports = { parseHtml };
