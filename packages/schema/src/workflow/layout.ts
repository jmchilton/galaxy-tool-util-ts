/**
 * Compute and apply node positions for Galaxy workflows.
 *
 * Port of gxformat2/layout. Two strategies: `topological` (the cross-language
 * layering from `cytoscape-layout.ts`) and `layered` (barycenter Sugiyama
 * crossing reduction). Layered coordinates are not a cross-language contract;
 * both strategies are validated by the structural checkers in
 * `layout-properties.ts`. Cyclic workflows raise {@link LayoutCycleError}.
 */

import { COL_STRIDE, ROW_STRIDE, topologicalPositions } from "./cytoscape-layout.js";
import type { CytoscapeElements, CytoscapePosition } from "./cytoscape-models.js";
import { cytoscapeElements } from "./cytoscape.js";
import { rawStepRenderIdentity, unlabeledNodeId } from "./normalized/labels.js";
import { INPUT_STEP_TYPES } from "./normalized/toFormat2.js";

/** Sentinel value for `position:` that requests automatic layout. */
export const AUTO = "auto";

export type LayoutStrategy = "topological" | "layered";

export interface LayoutPosition {
  left: number;
  top: number;
}

export interface ApplyLayoutOptions {
  strategy?: LayoutStrategy;
  /** Replace explicit positions too (an `auto` sentinel is always replaced). */
  overwrite?: boolean;
  /** Also lay out embedded in-file subworkflows. Defaults to true. */
  recursive?: boolean;
}

/**
 * Raised when a workflow graph contains a cycle. The bake path refuses to lay
 * out a cyclic graph; the cytoscape viz path keeps its diagonal fallback.
 */
export class LayoutCycleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LayoutCycleError";
  }
}

type Dict = Record<string, unknown>;
export type Edge = [string, string];

function isDict(value: unknown): value is Dict {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function containerItems(container: unknown): unknown[] {
  if (Array.isArray(container)) return container;
  if (isDict(container)) return Object.values(container);
  return [];
}

// --- Graph + layering -------------------------------------------------------

/** Pull `[nodeIds, edges]` out of cytoscape elements, dropping dangling edges. */
export function extractGraph(elements: CytoscapeElements): [string[], Edge[]] {
  const nodeIds = elements.nodes.map((n) => n.data.id);
  const idSet = new Set(nodeIds);
  const edges: Edge[] = [];
  for (const edge of elements.edges) {
    const { source, target } = edge.data;
    if (idSet.has(source) && idSet.has(target)) edges.push([source, target]);
  }
  return [nodeIds, edges];
}

/**
 * Longest-path layering via Kahn topological sort with declaration-index tie
 * break (same as `topologicalPositions`). Throws {@link LayoutCycleError} when
 * the graph is not a DAG.
 */
export function layerAssignment(nodeIds: string[], edges: Edge[]): Map<string, number> {
  const indexById = new Map(nodeIds.map((id, i) => [id, i]));
  const incoming = new Map<string, string[]>(nodeIds.map((id) => [id, []]));
  const dependents = new Map<string, string[]>(nodeIds.map((id) => [id, []]));
  for (const [source, target] of edges) {
    incoming.get(target)!.push(source);
    dependents.get(source)!.push(target);
  }
  const inDegree = new Map(nodeIds.map((id) => [id, incoming.get(id)!.length]));
  const column = new Map<string, number>();

  const queue = nodeIds.filter((id) => inDegree.get(id) === 0);
  while (queue.length > 0) {
    let best = 0;
    for (let i = 1; i < queue.length; i++) {
      if (indexById.get(queue[i])! < indexById.get(queue[best])!) best = i;
    }
    const id = queue.splice(best, 1)[0];
    const sources = incoming.get(id)!;
    column.set(id, sources.length === 0 ? 0 : Math.max(...sources.map((s) => column.get(s)! + 1)));
    for (const dep of dependents.get(id)!) {
      const remaining = inDegree.get(dep)! - 1;
      inDegree.set(dep, remaining);
      if (remaining === 0) queue.push(dep);
    }
  }

  if (column.size !== nodeIds.length) {
    const unplaced = nodeIds.filter((id) => !column.has(id)).sort();
    throw new LayoutCycleError(
      "Workflow graph contains a cycle; cannot compute a layout. " +
        `Nodes on or downstream of the cycle: ${JSON.stringify(unplaced)}`,
    );
  }
  return column;
}

/** Throw {@link LayoutCycleError} if `elements` describes a cyclic graph. */
export function checkAcyclic(elements: CytoscapeElements): void {
  const [nodeIds, edges] = extractGraph(elements);
  layerAssignment(nodeIds, edges);
}

/** Barycenter sweeps to attempt; the best ordering seen is kept. */
const MAX_SWEEPS = 8;

function countCrossingsBetween(
  upper: string[],
  lower: string[],
  successors: Map<string, string[]>,
): number {
  const posLower = new Map(lower.map((id, i) => [id, i]));
  const edges: [number, number][] = [];
  upper.forEach((u, uIdx) => {
    for (const v of successors.get(u)!) {
      const vIdx = posLower.get(v);
      if (vIdx !== undefined) edges.push([uIdx, vIdx]);
    }
  });
  let crossings = 0;
  for (let i = 0; i < edges.length; i++) {
    const [ui, vi] = edges[i];
    for (let j = i + 1; j < edges.length; j++) {
      const [uj, vj] = edges[j];
      if ((ui < uj && vi > vj) || (ui > uj && vi < vj)) crossings += 1;
    }
  }
  return crossings;
}

function countAllCrossings(layers: string[][], successors: Map<string, string[]>): number {
  let total = 0;
  for (let col = 0; col < layers.length - 1; col++) {
    total += countCrossingsBetween(layers[col], layers[col + 1], successors);
  }
  return total;
}

/** Stable reorder of `layer` by mean position of each node's fixed neighbors. */
function orderByBarycenter(
  layer: string[],
  neighbors: Map<string, string[]>,
  posInFixed: Map<string, number>,
): string[] {
  const keyed = layer.map((id, idx) => {
    const fixed = neighbors
      .get(id)!
      .map((m) => posInFixed.get(m))
      .filter((p): p is number => p !== undefined);
    const key = fixed.length > 0 ? fixed.reduce((a, b) => a + b, 0) / fixed.length : idx;
    return { id, key };
  });
  // Array.prototype.sort is stable, so ties preserve input order.
  return keyed.sort((a, b) => a.key - b.key).map((k) => k.id);
}

function sweep(layers: string[][], neighbors: Map<string, string[]>, down: boolean): void {
  const columns: number[] = [];
  if (down) for (let col = 1; col < layers.length; col++) columns.push(col);
  else for (let col = layers.length - 2; col >= 0; col--) columns.push(col);
  for (const col of columns) {
    const fixed = layers[down ? col - 1 : col + 1];
    const posInFixed = new Map(fixed.map((id, i) => [id, i]));
    layers[col] = orderByBarycenter(layers[col], neighbors, posInFixed);
  }
}

/**
 * Sugiyama-style layered layout: longest-path layering, barycenter crossing
 * reduction, then order-index rows per layer. Skip-level edges are not split
 * into dummy nodes, so results can be suboptimal but every edge still points
 * rightward.
 */
export function layeredPositions(elements: CytoscapeElements): Map<string, CytoscapePosition> {
  const [nodeIds, edges] = extractGraph(elements);
  const column = layerAssignment(nodeIds, edges);

  const maxCol = Math.max(-1, ...column.values());
  const layers: string[][] = Array.from({ length: maxCol + 1 }, () => []);
  for (const id of nodeIds) layers[column.get(id)!].push(id);

  const predecessors = new Map<string, string[]>(nodeIds.map((id) => [id, []]));
  const successors = new Map<string, string[]>(nodeIds.map((id) => [id, []]));
  for (const [source, target] of edges) {
    successors.get(source)!.push(target);
    predecessors.get(target)!.push(source);
  }

  let bestLayers = layers.map((l) => [...l]);
  let bestCrossings = countAllCrossings(bestLayers, successors);
  for (let i = 0; i < MAX_SWEEPS && bestCrossings > 0; i++) {
    const goingDown = i % 2 === 0;
    sweep(layers, goingDown ? predecessors : successors, goingDown);
    const crossings = countAllCrossings(layers, successors);
    if (crossings < bestCrossings) {
      bestCrossings = crossings;
      bestLayers = layers.map((l) => [...l]);
    }
  }

  const positions = new Map<string, CytoscapePosition>();
  bestLayers.forEach((layer, col) => {
    layer.forEach((id, row) => positions.set(id, { x: col * COL_STRIDE, y: row * ROW_STRIDE }));
  });
  return positions;
}

// --- Document helpers (shared with layout-properties.ts) ---------------------

export function isNativeDocument(workflow: Dict): boolean {
  return workflow.a_galaxy_workflow === "true";
}

/** A `$graph` multi-workflow document (many workflows, one file). */
export function isGraphDocument(workflow: unknown): workflow is Dict {
  return isDict(workflow) && "$graph" in workflow && !("class" in workflow);
}

function isEmbeddedWorkflow(value: unknown): value is Dict {
  return isDict(value) && (value.class === "GalaxyWorkflow" || value.a_galaxy_workflow === "true");
}

/**
 * Yield in-file subworkflows embedded in `workflow`'s steps (native inline
 * `subworkflow`, Format2 embedded `run`). String references are not followed.
 */
export function* iterSubworkflows(workflow: Dict): Generator<Dict> {
  const native = isNativeDocument(workflow);
  for (const step of containerItems(workflow.steps)) {
    if (!isDict(step)) continue;
    const candidate = native ? step.subworkflow : step.run;
    if (isEmbeddedWorkflow(candidate)) yield candidate;
  }
}

/**
 * Id cytoscape assigns to a Format2 node: inputs by id, steps by render
 * identity. `key` is the dict-container key, or null for list form.
 */
export function format2NodeId(item: unknown, key: string | null, isInput: boolean): string | null {
  if (isInput) {
    if (key !== null) return key;
    return isDict(item) && typeof item.id === "string" ? item.id : null;
  }
  if (key !== null) return rawStepRenderIdentity(item, key);
  if (!isDict(item)) return null;
  const id = (item.label as string | undefined) || (item.id as string | undefined);
  return id ?? null;
}

/** Id normalization assigns to a native step (label, else unlabeled sentinel). */
export function nativeNodeId(key: string, step: Dict): string {
  return unlabeledNodeId(
    step.label as string | null | undefined,
    (step.id as string | number | undefined) ?? key,
    INPUT_STEP_TYPES.has(step.type as string),
  );
}

function stripPositions(workflow: Dict): Dict {
  const cleaned = JSON.parse(JSON.stringify(workflow)) as Dict;
  const containerKeys = isNativeDocument(cleaned) ? ["steps"] : ["inputs", "steps"];
  for (const containerKey of containerKeys) {
    for (const item of containerItems(cleaned[containerKey])) {
      if (isDict(item)) delete item.position;
    }
  }
  return cleaned;
}

function shouldWrite(existing: unknown, overwrite: boolean): boolean {
  if (existing == null || existing === AUTO) return true;
  return overwrite;
}

// --- Public API ---------------------------------------------------------------

/**
 * Compute node positions keyed by node id (Format2 input ids / step render
 * identities — the ids the cytoscape builder emits).
 */
/**
 * Preset cytoscape elements for one layout unit. `graphEntries` are the
 * sibling entries when `workflow` is part of a `$graph` document.
 */
export function layoutElements(workflow: unknown, graphEntries: Dict[] = []): CytoscapeElements {
  // Strip positions first: strategies ignore them and `auto` isn't a valid position.
  let source = isDict(workflow) ? stripPositions(workflow) : workflow;
  if (graphEntries.length > 0 && isDict(source)) {
    // Normalize the entry as `main` alongside its siblings so `#id` run
    // references resolve.
    const siblings = graphEntries.filter((e) => e !== workflow && e.id !== "main");
    source = { $graph: [{ ...source, id: "main" }, ...siblings] };
  }
  return cytoscapeElements(source, { layout: "preset", draftOverlay: null });
}

export function layoutPositions(
  workflow: unknown,
  strategy: LayoutStrategy = "topological",
  graphEntries: Dict[] = [],
): Map<string, LayoutPosition> {
  if (strategy !== "topological" && strategy !== "layered") {
    throw new Error(`Unknown layout strategy "${strategy}". Valid values: topological, layered.`);
  }
  const elements = layoutElements(workflow, graphEntries);
  let positions: Map<string, CytoscapePosition>;
  if (strategy === "topological") {
    // topologicalPositions silently falls back on cycles; refuse up front.
    checkAcyclic(elements);
    positions = topologicalPositions(elements);
  } else {
    positions = layeredPositions(elements);
  }
  const result = new Map<string, LayoutPosition>();
  for (const [id, p] of positions) result.set(id, { left: p.x, top: p.y });
  return result;
}

function applyToContainer(
  container: unknown,
  positions: Map<string, LayoutPosition>,
  overwrite: boolean,
  isInput: boolean,
): unknown {
  if (isDict(container)) {
    for (const key of Object.keys(container)) {
      const pos = positions.get(format2NodeId(container[key], key, isInput) ?? "");
      if (pos === undefined) continue;
      // Promote Format2 shorthand (e.g. `x: data`) to mapping form.
      const value = isDict(container[key]) ? (container[key] as Dict) : { type: container[key] };
      if (shouldWrite(value.position, overwrite)) value.position = { ...pos };
      container[key] = value;
    }
  } else if (Array.isArray(container)) {
    for (const item of container) {
      if (!isDict(item)) continue;
      const pos = positions.get(format2NodeId(item, null, isInput) ?? "");
      if (pos !== undefined && shouldWrite(item.position, overwrite)) item.position = { ...pos };
    }
  }
  return container;
}

function applyNative(workflow: Dict, positions: Map<string, LayoutPosition>, overwrite: boolean) {
  if (!isDict(workflow.steps)) return;
  for (const [key, step] of Object.entries(workflow.steps)) {
    if (!isDict(step)) continue;
    const pos = positions.get(nativeNodeId(key, step));
    if (pos !== undefined && shouldWrite(step.position, overwrite)) step.position = { ...pos };
  }
}

/**
 * Merge computed positions into a Format2 or native workflow dict, mutating it
 * in place and returning it. Explicit positions are kept unless `overwrite`;
 * `position: auto` is always replaced. With `recursive` (default), embedded
 * subworkflows and every `$graph` entry get their own coordinate space.
 */
export function applyLayout(workflow: Dict, opts: ApplyLayoutOptions = {}): Dict {
  if (isGraphDocument(workflow)) {
    const entries = containerItems(workflow.$graph).filter(isDict);
    for (const entry of entries) applyLayoutUnit(entry, opts, entries);
    return workflow;
  }
  return applyLayoutUnit(workflow, opts, []);
}

function applyLayoutUnit(workflow: Dict, opts: ApplyLayoutOptions, graphEntries: Dict[]): Dict {
  const { strategy = "topological", overwrite = false, recursive = true } = opts;
  const positions = layoutPositions(workflow, strategy, graphEntries);
  if (isNativeDocument(workflow)) {
    applyNative(workflow, positions, overwrite);
  } else {
    for (const containerKey of ["inputs", "steps"]) {
      if (workflow[containerKey] == null) continue;
      workflow[containerKey] = applyToContainer(
        workflow[containerKey],
        positions,
        overwrite,
        containerKey === "inputs",
      );
    }
  }

  if (recursive) {
    for (const sub of iterSubworkflows(workflow)) applyLayout(sub, opts);
  }
  return workflow;
}
