/**
 * Structural graph properties any conforming workflow layout must satisfy.
 *
 * Port of gxformat2/layout/_properties.py. The property names are the
 * cross-language contract for `graph_properties` in layout.yml expectations;
 * each checker takes a laid-out document and throws on violation.
 */

import {
  type Edge,
  extractGraph,
  format2NodeId,
  isGraphDocument,
  isNativeDocument,
  iterSubworkflows,
  layoutElements,
  type LayoutPosition,
  nativeNodeId,
} from "./layout.js";

type Dict = Record<string, unknown>;
export type GraphPropertyChecker = (workflow: unknown) => void;

function isDict(value: unknown): value is Dict {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Read `{nodeId: position}` straight from the document (not from cytoscape). */
function readNodePositions(workflow: Dict): Map<string, LayoutPosition> {
  const positions = new Map<string, LayoutPosition>();
  if (isNativeDocument(workflow)) {
    if (isDict(workflow.steps)) {
      for (const [key, step] of Object.entries(workflow.steps)) {
        if (isDict(step) && step.position != null) {
          positions.set(nativeNodeId(key, step), step.position as LayoutPosition);
        }
      }
    }
    return positions;
  }
  for (const containerKey of ["inputs", "steps"]) {
    const container = workflow[containerKey];
    const isInput = containerKey === "inputs";
    const entries: [string | null, unknown][] = isDict(container)
      ? Object.entries(container)
      : Array.isArray(container)
        ? container.map((item) => [null, item])
        : [];
    for (const [key, item] of entries) {
      const nodeId = format2NodeId(item, key, isInput);
      if (isDict(item) && item.position != null && nodeId !== null) {
        positions.set(nodeId, item.position as LayoutPosition);
      }
    }
  }
  return positions;
}

type Graph = [string[], Edge[], Map<string, LayoutPosition>];

function graph(workflow: Dict, graphEntries: Dict[]): Graph {
  const [nodeIds, edges] = extractGraph(layoutElements(workflow, graphEntries));
  return [nodeIds, edges, readNodePositions(workflow)];
}

function check(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

/** Every edge points strictly rightward: `target.left > source.left`. */
function downstreamRightOfUpstream([, edges, positions]: Graph): void {
  for (const [source, target] of edges) {
    const s = positions.get(source);
    const t = positions.get(target);
    check(s !== undefined, `edge ${source}->${target}: source ${source} has no position`);
    check(t !== undefined, `edge ${source}->${target}: target ${target} has no position`);
    check(
      t!.left > s!.left,
      `edge ${source}->${target}: target.left ${t!.left} not strictly right of source.left ${s!.left}`,
    );
  }
}

/** Every graph node has a position in the document. */
function allNodesPositioned([nodeIds, , positions]: Graph): void {
  const missing = nodeIds.filter((id) => !positions.has(id)).sort();
  check(missing.length === 0, `nodes missing a position: ${JSON.stringify(missing)}`);
}

/** No two nodes occupy the same `{left, top}` coordinate. */
function noPositionCollisions([, , positions]: Graph): void {
  const seen = new Map<string, string>();
  for (const [id, pos] of positions) {
    const key = `${pos.left},${pos.top}`;
    check(!seen.has(key), `nodes ${seen.get(key)} and ${id} share position (${key})`);
    seen.set(key, id);
  }
}

/** Nodes with no incoming edge sit at the minimum `left`. */
function rootsLeftmost([nodeIds, edges, positions]: Graph): void {
  const targets = new Set(edges.map(([, target]) => target));
  const roots = nodeIds.filter((id) => !targets.has(id));
  if (roots.length === 0 || positions.size === 0) return;
  const minLeft = Math.min(...[...positions.values()].map((p) => p.left));
  for (const id of roots) {
    const pos = positions.get(id);
    check(pos !== undefined, `root ${id} has no position`);
    check(
      pos!.left === minLeft,
      `root ${id} at left ${pos!.left} is not at the minimum left ${minLeft}`,
    );
  }
}

/** The document plus every in-file subworkflow / `$graph` entry it lays out. */
function* iterLayoutUnits(workflow: Dict, graphEntries: Dict[] = []): Generator<Graph> {
  if (isGraphDocument(workflow)) {
    const raw = workflow.$graph;
    const entries = (Array.isArray(raw) ? raw : isDict(raw) ? Object.values(raw) : []).filter(
      isDict,
    );
    for (const entry of entries) yield* iterLayoutUnits(entry, entries);
    return;
  }
  yield graph(workflow, graphEntries);
  for (const sub of iterSubworkflows(workflow)) yield* iterLayoutUnits(sub);
}

function recursive(checker: (unit: Graph) => void): GraphPropertyChecker {
  return (workflow: unknown) => {
    for (const unit of iterLayoutUnits(workflow as Dict)) checker(unit);
  };
}

export const GRAPH_PROPERTY_CHECKERS: Record<string, GraphPropertyChecker> = {
  downstream_right_of_upstream: recursive(downstreamRightOfUpstream),
  all_nodes_positioned: recursive(allNodesPositioned),
  no_position_collisions: recursive(noPositionCollisions),
  roots_leftmost: recursive(rootsLeftmost),
};
