/**
 * Cross-language topological layout for Cytoscape elements.
 *
 * Spec: docs/architecture/cytoscape-layout.md. Any change here is a breaking
 * visual diff and must land in lockstep with the gxformat2 port.
 */

import type { CytoscapeElements, CytoscapePosition } from "./cytoscape-models.js";

export const COL_STRIDE = 220;
export const ROW_STRIDE = 100;

export type LayoutName =
  | "preset"
  | "topological"
  | "dagre"
  | "breadthfirst"
  | "grid"
  | "cose"
  | "random";

export const LAYOUT_NAMES: readonly LayoutName[] = [
  "preset",
  "topological",
  "dagre",
  "breadthfirst",
  "grid",
  "cose",
  "random",
];

export function isLayoutName(value: string): value is LayoutName {
  return (LAYOUT_NAMES as readonly string[]).includes(value);
}

/**
 * Layouts that bake coordinates into `data.position`. All other layouts are
 * hint-only and rely on the runtime renderer.
 */
export function bakesCoordinates(layout: LayoutName): boolean {
  return layout === "preset" || layout === "topological";
}

/**
 * Compute positions per the topological layering spec. Returns a map keyed by
 * node `data.id` so callers can overwrite `node.position` in declaration order.
 */
export function topologicalPositions(elements: CytoscapeElements): Map<string, CytoscapePosition> {
  const nodeIds = elements.nodes.map((n) => n.data.id);
  const indexById = new Map<string, number>();
  nodeIds.forEach((id, i) => indexById.set(id, i));

  const incoming = new Map<string, string[]>();
  for (const id of nodeIds) incoming.set(id, []);
  for (const edge of elements.edges) {
    const { source, target } = edge.data;
    if (!indexById.has(source) || !indexById.has(target)) continue;
    incoming.get(target)!.push(source);
  }

  const inDegree = new Map<string, number>();
  for (const [id, srcs] of incoming) inDegree.set(id, srcs.length);

  // Kahn topo sort with declaration-index tie break. We avoid a heap to keep
  // the algorithm trivially portable; node counts are tiny (workflows
  // typically <100 steps).
  const column = new Map<string, number>();
  const ready = nodeIds.filter((id) => inDegree.get(id) === 0);
  const queue: string[] = [...ready];
  // sort once by declaration index — entries already in declaration order, but
  // keep the sort explicit so the contract stays obvious.
  queue.sort((a, b) => indexById.get(a)! - indexById.get(b)!);

  const visited = new Set<string>();
  const dependents = new Map<string, string[]>();
  for (const id of nodeIds) dependents.set(id, []);
  for (const [target, sources] of incoming) {
    for (const s of sources) dependents.get(s)!.push(target);
  }

  while (queue.length > 0) {
    // pop lowest declaration index
    let bestIdx = 0;
    for (let i = 1; i < queue.length; i++) {
      if (indexById.get(queue[i])! < indexById.get(queue[bestIdx])!) bestIdx = i;
    }
    const id = queue.splice(bestIdx, 1)[0];
    visited.add(id);

    const sources = incoming.get(id)!;
    if (sources.length === 0) {
      column.set(id, 0);
    } else {
      let max = 0;
      for (const s of sources) {
        const c = column.get(s);
        if (c !== undefined && c + 1 > max) max = c + 1;
      }
      column.set(id, max);
    }

    for (const dep of dependents.get(id)!) {
      const remaining = inDegree.get(dep)! - 1;
      inDegree.set(dep, remaining);
      if (remaining === 0) queue.push(dep);
    }
  }

  // Cycle fallback: any node not visited gets column = declaration index.
  for (const id of nodeIds) {
    if (!visited.has(id)) column.set(id, indexById.get(id)!);
  }

  // Row assignment: per column, declaration order.
  const rowsByColumn = new Map<number, string[]>();
  for (const id of nodeIds) {
    const c = column.get(id)!;
    if (!rowsByColumn.has(c)) rowsByColumn.set(c, []);
    rowsByColumn.get(c)!.push(id);
  }

  const positions = new Map<string, CytoscapePosition>();
  for (const [c, ids] of rowsByColumn) {
    ids.forEach((id, row) => {
      positions.set(id, { x: c * COL_STRIDE, y: row * ROW_STRIDE });
    });
  }
  return positions;
}
