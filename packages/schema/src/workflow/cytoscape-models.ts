/**
 * Output-only TS interfaces for Cytoscape.js workflow visualization elements.
 *
 * Port of gxformat2/cytoscape/models.py. Field names stay snake_case so the
 * emitted JSON is byte-identical to the Python builder.
 */

export interface CytoscapePosition {
  x: number;
  y: number;
}

export interface CytoscapeNodeData {
  id: string;
  label: string;
  doc: string | null;
  tool_id: string | null;
  step_type: string;
  repo_link: string | null;
}

export interface CytoscapeEdgeData {
  id: string;
  source: string;
  target: string;
  input: string;
  output: string | null;
  /**
   * Map-over depth applied at this connection, when annotated. Optional so the
   * default emit shape stays byte-identical with the Python builder.
   */
  map_depth?: number;
  /** True when the connection reduces a list-like source into a multi-data scalar input. */
  reduction?: boolean;
  /** Textual mapping (e.g. "list", "list:paired"); mirrors `ConnectionResult.mapping`. */
  mapping?: string | null;
}

export interface CytoscapeNode {
  group: "nodes";
  data: CytoscapeNodeData;
  classes: string[];
  position: CytoscapePosition;
}

export interface CytoscapeEdge {
  group: "edges";
  data: CytoscapeEdgeData;
  /** Optional class hints (e.g. "mapover_2", "reduction") used by the HTML viewer's stylesheet. */
  classes?: string[];
}

export interface CytoscapeElements {
  nodes: CytoscapeNode[];
  edges: CytoscapeEdge[];
}

export type CytoscapeListItem = CytoscapeNode | CytoscapeEdge;

export function elementsToList(els: CytoscapeElements): CytoscapeListItem[] {
  return [...els.nodes, ...els.edges];
}
