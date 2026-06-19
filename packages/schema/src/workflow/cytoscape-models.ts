/**
 * Output-only TS interfaces for Cytoscape.js workflow visualization elements.
 *
 * Port of gxformat2/cytoscape/models.py. Field names stay snake_case so the
 * emitted JSON is byte-identical to the Python builder.
 */

import type { PlanField } from "./draft-checks.js";

export interface CytoscapePosition {
  x: number;
  y: number;
}

/**
 * Per-node planning context surfaced for draft (planned) nodes — the structured
 * twin of `DraftPlannedReason`, snake_cased for cytoscape JSON parity. Absent on
 * concrete nodes so default emit stays byte-identical.
 */
export interface CytoscapePlanReason {
  /** Formatted TODO sentinel locations on (or under) this step, in survey order. */
  todos: string[];
  /** Non-empty `_plan_*` fields on this step, kept structured. */
  plan_fields: Partial<Record<PlanField, string>>;
}

export interface CytoscapeNodeData {
  id: string;
  label: string;
  doc: string | null;
  tool_id: string | null;
  step_type: string;
  repo_link: string | null;
  /**
   * True on planned (draft) step nodes. Optional so concrete emit stays
   * byte-identical with the Python builder; the HTML viewer can key a
   * dashed/muted treatment off it.
   */
  planned?: boolean;
  /** Planning context for planned nodes; absent on concrete nodes. */
  plan_reason?: CytoscapePlanReason;
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
  /**
   * True when this connection touches a planned step or a surviving `TODO_*`
   * port. Optional so default emit stays byte-identical; coexists with
   * `map_depth`/`reduction`/`mapping`.
   */
  planned?: boolean;
}

export interface CytoscapeNode {
  group: "nodes";
  data: CytoscapeNodeData;
  classes: string[];
  /**
   * Present for `preset` and `topological` layouts; omitted for hint-only
   * layouts (`dagre`, `breadthfirst`, `grid`, `cose`, `random`) so the runtime
   * renderer is responsible for placement.
   */
  position?: CytoscapePosition;
}

export interface CytoscapeEdge {
  group: "edges";
  data: CytoscapeEdgeData;
  /** Optional class hints (e.g. "mapover_2", "reduction") used by the HTML viewer's stylesheet. */
  classes?: string[];
}

export interface CytoscapeLayoutHint {
  name: string;
}

export interface CytoscapeElements {
  nodes: CytoscapeNode[];
  edges: CytoscapeEdge[];
  /**
   * Present only when the builder was invoked with a non-`preset` layout.
   * Carried out-of-band so `elementsToList` keeps Python parity for the flat
   * list shape.
   */
  layout?: CytoscapeLayoutHint;
}

export type CytoscapeListItem = CytoscapeNode | CytoscapeEdge;

export function elementsToList(els: CytoscapeElements): CytoscapeListItem[] {
  return [...els.nodes, ...els.edges];
}
