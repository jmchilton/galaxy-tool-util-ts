/**
 * Build Cytoscape.js elements from a Galaxy workflow.
 *
 * Port of gxformat2/cytoscape/_builder.py. Snake_case field names + edge id
 * format are preserved byte-for-byte to interop with the Python emitter and
 * the standalone HTML template.
 */

import type {
  CytoscapeEdge,
  CytoscapeElements,
  CytoscapeNode,
  CytoscapePosition,
} from "./cytoscape-models.js";
import type { LayoutName } from "./cytoscape-layout.js";
import { bakesCoordinates, topologicalPositions } from "./cytoscape-layout.js";
import type { EdgeAnnotation } from "./edge-annotation.js";
import { edgeAnnotationKey } from "./edge-annotation.js";
import { ensureFormat2 } from "./normalized/ensure.js";
import type {
  NormalizedFormat2Input,
  NormalizedFormat2Step,
  NormalizedFormat2Workflow,
} from "./normalized/format2.js";
import { resolveSourceReference } from "./normalized/labels.js";

const MAIN_TS_PREFIX = "toolshed.g2.bx.psu.edu/repos/";

export interface CytoscapeOptions {
  /**
   * Optional `EdgeAnnotation` map keyed by `edgeAnnotationKey(...)`. When
   * present, edges gain `data.map_depth`, `data.reduction`, `data.mapping`
   * and class hints (`mapover_<n>`, `reduction`).
   */
  edgeAnnotations?: Map<string, EdgeAnnotation>;
  /**
   * Layout strategy. `preset` (default) keeps today's coordinate-from-NF2
   * behavior with a `(10*i, 10*i)` fallback. `topological` overwrites
   * coordinates per `cytoscape-layout.ts`. Hint-only layouts (`dagre`,
   * `breadthfirst`, `grid`, `cose`, `random`) drop coordinates and emit a
   * top-level `elements.layout = { name }` hint for the runtime renderer.
   */
  layout?: LayoutName;
}

export function cytoscapeElements(
  workflow: unknown | NormalizedFormat2Workflow,
  opts: CytoscapeOptions = {},
): CytoscapeElements {
  const wf =
    typeof workflow === "object" &&
    workflow !== null &&
    (workflow as Record<string, unknown>).class === "GalaxyWorkflow" &&
    Array.isArray((workflow as Record<string, unknown>).inputs) &&
    "unique_tools" in (workflow as Record<string, unknown>)
      ? (workflow as NormalizedFormat2Workflow)
      : ensureFormat2(workflow);

  const layout: LayoutName = opts.layout ?? "preset";
  const nodes: CytoscapeNode[] = [];
  const edges: CytoscapeEdge[] = [];

  wf.inputs.forEach((inp, i) => {
    nodes.push(_inputNode(inp, i));
  });

  const inputsOffset = wf.inputs.length;
  const knownLabels = new Set<string>();
  for (const inp of wf.inputs) knownLabels.add(inp.id);
  for (const step of wf.steps) knownLabels.add(step.label || step.id);

  wf.steps.forEach((step, i) => {
    nodes.push(_stepNode(step, i + inputsOffset));
    edges.push(..._stepEdges(step, knownLabels, opts.edgeAnnotations));
  });

  const elements: CytoscapeElements = { nodes, edges };

  if (layout === "preset") {
    return elements;
  }

  if (bakesCoordinates(layout)) {
    // Currently only `topological` reaches here; computed off the
    // already-built elements per docs/architecture/cytoscape-layout.md.
    const positions = topologicalPositions(elements);
    for (const node of nodes) {
      const p = positions.get(node.data.id);
      if (p) node.position = p;
    }
  } else {
    // Hint-only layout: positions are the renderer's job.
    for (const node of nodes) delete node.position;
  }

  elements.layout = { name: layout };
  return elements;
}

function _fallbackPosition(orderIndex: number): CytoscapePosition {
  return { x: 10 * orderIndex, y: 10 * orderIndex };
}

function _toPosition(
  raw: Record<string, unknown> | null | undefined,
  orderIndex: number,
): CytoscapePosition {
  if (raw == null) return _fallbackPosition(orderIndex);
  const left = raw.left;
  const top = raw.top;
  const x = typeof left === "number" ? Math.trunc(left) : Number.parseInt(String(left ?? 0), 10);
  const y = typeof top === "number" ? Math.trunc(top) : Number.parseInt(String(top ?? 0), 10);
  return {
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(y) ? y : 0,
  };
}

function _inputTypeStr(type: NormalizedFormat2Input["type"]): string {
  if (type == null) return "input";
  if (typeof type === "string") return type;
  return type.length > 0 ? `${type[0]}[]` : "input";
}

function _inputNode(inp: NormalizedFormat2Input, orderIndex: number): CytoscapeNode {
  const inputId = inp.id || String(orderIndex);
  const typeStr = _inputTypeStr(inp.type);
  return {
    group: "nodes",
    data: {
      id: inputId,
      label: inputId,
      doc: typeof inp.doc === "string" ? inp.doc : null,
      tool_id: null,
      step_type: typeStr,
      repo_link: null,
    },
    classes: [`type_${typeStr}`, "input"],
    position: _toPosition(inp.position, orderIndex),
  };
}

function _stepNode(step: NormalizedFormat2Step, orderIndex: number): CytoscapeNode {
  const stepId = step.label || step.id;
  // The TS normalizer doesn't infer step.type the way gxformat2 does, so fall
  // back to a `run`-derived hint for subworkflows (matches mermaid emitter).
  const stepType = step.type || (step.run != null ? "subworkflow" : "tool");

  let strippedToolId = step.tool_id ?? null;
  if (strippedToolId && strippedToolId.startsWith(MAIN_TS_PREFIX)) {
    strippedToolId = strippedToolId.slice(MAIN_TS_PREFIX.length);
  }

  const label =
    step.label || step.id || (strippedToolId ? `tool:${strippedToolId}` : String(orderIndex));

  let repoLink: string | null = null;
  const repo = step.tool_shed_repository;
  if (repo) {
    const toolShed = repo.tool_shed;
    const owner = repo.owner;
    const name = repo.name;
    const changesetRevision = repo.changeset_revision;
    repoLink = `https://${toolShed}/view/${owner}/${name}/${changesetRevision}`;
  }

  return {
    group: "nodes",
    data: {
      id: stepId,
      label,
      doc: typeof step.doc === "string" ? step.doc : null,
      tool_id: step.tool_id ?? null,
      step_type: stepType,
      repo_link: repoLink,
    },
    classes: [`type_${stepType}`, "runnable"],
    position: _toPosition(step.position, orderIndex),
  };
}

function _stepEdges(
  step: NormalizedFormat2Step,
  knownLabels: Set<string>,
  edgeAnnotations: Map<string, EdgeAnnotation> | undefined,
): CytoscapeEdge[] {
  const stepId = step.label || step.id;
  const edges: CytoscapeEdge[] = [];
  for (const stepInput of step.in) {
    if (stepInput.source == null) continue;
    const inputId = stepInput.id || "unknown";
    const sources = Array.isArray(stepInput.source) ? stepInput.source : [stepInput.source];
    for (const source of sources) {
      const [sourceLabel, outputName] = resolveSourceReference(source, knownLabels);
      const output = outputName === "output" ? null : outputName;
      const edgeId = `${stepId}__${inputId}__from__${sourceLabel}`;
      const edge: CytoscapeEdge = {
        group: "edges",
        data: {
          id: edgeId,
          source: sourceLabel,
          target: stepId,
          input: inputId,
          output,
        },
      };
      const annotation = edgeAnnotations?.get(
        edgeAnnotationKey(sourceLabel, outputName, stepId, inputId),
      );
      if (annotation) {
        edge.data.map_depth = annotation.mapDepth;
        edge.data.reduction = annotation.reduction;
        edge.data.mapping = annotation.mapping ?? null;
        const classes: string[] = [];
        if (annotation.mapDepth > 0) classes.push(`mapover_${annotation.mapDepth}`);
        if (annotation.reduction) classes.push("reduction");
        if (classes.length > 0) edge.classes = classes;
      }
      edges.push(edge);
    }
  }
  return edges;
}
