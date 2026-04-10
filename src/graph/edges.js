/**
 * Edge types for the code knowledge graph.
 * Each edge represents a relationship between nodes.
 */

const EDGE_TYPES = {
  IMPORTS: 'imports',         // File A imports from File B
  EXPORTS: 'exports',         // File A exports symbol X
  CONTAINS: 'contains',       // File contains Function/Class
  CALLS: 'calls',             // Function A calls Function B
  CALLED_BY: 'called_by',     // Inverse of CALLS
  EXTENDS: 'extends',         // Class A extends Class B
  IMPLEMENTS: 'implements',   // Class A implements Interface B
  DEPENDS_ON: 'depends_on',   // Module A depends on Module B
  IMPORTED_BY: 'imported_by', // Inverse of IMPORTS
};

/**
 * Create an edge between two nodes.
 *
 * @param {string} type - One of EDGE_TYPES
 * @param {string} sourceId - Source node ID
 * @param {string} targetId - Target node ID
 * @param {Object} metadata - Optional extra data (e.g., specifiers, line number)
 */
function createEdge(type, sourceId, targetId, metadata = {}) {
  return {
    type,
    sourceId,
    targetId,
    ...metadata,
  };
}

module.exports = {
  EDGE_TYPES,
  createEdge,
};
