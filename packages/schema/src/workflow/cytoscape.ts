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
  CytoscapePlanReason,
} from "./cytoscape-models.js";
import type { LayoutName } from "./cytoscape-layout.js";
import { bakesCoordinates, topologicalPositions } from "./cytoscape-layout.js";
import type { DraftOverlay } from "./draft-checks.js";
import {
  isDraftWorkflow,
  isTodoSentinel,
  PLANNED_CLASS,
  resolveDraftOverlay,
} from "./draft-checks.js";
import type { EdgeAnnotation } from "./edge-annotation.js";
import { edgeAnnotationKey } from "./edge-annotation.js";
import { ensureFormat2 } from "./normalized/ensure.js";
import type {
  NormalizedFormat2Input,
  NormalizedFormat2Step,
  NormalizedFormat2Workflow,
} from "./normalized/format2.js";
import {
  isUnlabeledStep,
  resolveSourceReference,
  stepRenderIdentity,
} from "./normalized/labels.js";

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
  /**
   * Overlay marking planned (draft) nodes/edges with a `planned` class + plan
   * context. Mirrors {@link MermaidOptions.draftOverlay}:
   *   - omitted (`undefined`): auto-detect — a `GalaxyWorkflowDraft` input
   *     resolves its own overlay, a concrete workflow emits unchanged.
   *   - a `DraftOverlay`: use it verbatim.
   *   - `null`: force plain (byte-identical) output even for a draft.
   */
  draftOverlay?: DraftOverlay | null;
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

  // Resolve the draft overlay from the RAW input (normalization strips
  // `_plan_*` and rewrites the class). `undefined` → auto-detect; `null` →
  // caller forced plain rendering. Mirrors workflowToMermaid.
  const overlay =
    opts.draftOverlay === undefined
      ? isDraftWorkflow(workflow)
        ? resolveDraftOverlay(workflow)
        : undefined
      : (opts.draftOverlay ?? undefined);

  const layout: LayoutName = opts.layout ?? "preset";
  const nodes: CytoscapeNode[] = [];
  const edges: CytoscapeEdge[] = [];

  wf.inputs.forEach((inp, i) => {
    nodes.push(_inputNode(inp, i));
  });

  const inputsOffset = wf.inputs.length;
  const knownLabels = new Set<string>();
  for (const inp of wf.inputs) knownLabels.add(inp.id);
  for (const step of wf.steps) knownLabels.add(stepRenderIdentity(step));

  wf.steps.forEach((step, i) => {
    nodes.push(_stepNode(step, i + inputsOffset, overlay));
    edges.push(..._stepEdges(step, knownLabels, opts.edgeAnnotations, overlay));
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

function _stepNode(
  step: NormalizedFormat2Step,
  orderIndex: number,
  overlay: DraftOverlay | undefined,
): CytoscapeNode {
  const stepId = stepRenderIdentity(step);
  // The TS normalizer doesn't infer step.type the way gxformat2 does, so fall
  // back to a `run`-derived hint for subworkflows (matches mermaid emitter).
  const stepType = step.type || (step.run != null ? "subworkflow" : "tool");

  let strippedToolId = step.tool_id ?? null;
  if (strippedToolId && strippedToolId.startsWith(MAIN_TS_PREFIX)) {
    strippedToolId = strippedToolId.slice(MAIN_TS_PREFIX.length);
  }

  const displayId = step.id && !isUnlabeledStep(step.id) ? step.id : null;
  const label =
    step.label || displayId || (strippedToolId ? `tool:${strippedToolId}` : String(orderIndex));

  let repoLink: string | null = null;
  const repo = step.tool_shed_repository;
  if (repo) {
    const toolShed = repo.tool_shed;
    const owner = repo.owner;
    const name = repo.name;
    const changesetRevision = repo.changeset_revision;
    repoLink = `https://${toolShed}/view/${owner}/${name}/${changesetRevision}`;
  }

  const node: CytoscapeNode = {
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

  // Planned (draft) node: keep `type_*`/`runnable` (they still encode node kind)
  // and append `planned` LAST so concrete-node `value_set` goldens are
  // unaffected. Carry plan context in `data` for the viewer's tooltip. Gated on
  // overlay presence so concrete emit stays byte-identical.
  if (overlay?.plannedSteps.has(stepId)) {
    node.classes = [...node.classes, PLANNED_CLASS];
    node.data.planned = true;
    const reason = overlay.plannedReason.get(stepId);
    if (reason != null) {
      const planReason: CytoscapePlanReason = {
        todos: reason.todos,
        plan_fields: reason.planFields,
      };
      node.data.plan_reason = planReason;
    }
  }

  return node;
}

function _stepEdges(
  step: NormalizedFormat2Step,
  knownLabels: Set<string>,
  edgeAnnotations: Map<string, EdgeAnnotation> | undefined,
  overlay: DraftOverlay | undefined,
): CytoscapeEdge[] {
  const stepId = stepRenderIdentity(step);
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
      const classes: string[] = [];
      const annotation = edgeAnnotations?.get(
        edgeAnnotationKey(sourceLabel, outputName, stepId, inputId),
      );
      if (annotation) {
        edge.data.map_depth = annotation.mapDepth;
        edge.data.reduction = annotation.reduction;
        edge.data.mapping = annotation.mapping ?? null;
        if (annotation.mapDepth > 0) classes.push(`mapover_${annotation.mapDepth}`);
        if (annotation.reduction) classes.push("reduction");
      }
      // An edge is planned when either endpoint step is planned, or a port it
      // touches is still a TODO sentinel. Computed inline (no overlay port set)
      // and gated on overlay presence so concrete emit stays byte-identical.
      // `planned` coexists with any `mapover_*`/`reduction` class.
      const planned =
        overlay != null &&
        (overlay.plannedSteps.has(sourceLabel) ||
          overlay.plannedSteps.has(stepId) ||
          isTodoSentinel(outputName) ||
          isTodoSentinel(inputId));
      if (planned) {
        classes.push(PLANNED_CLASS);
        edge.data.planned = true;
      }
      if (classes.length > 0) edge.classes = classes;
      edges.push(edge);
    }
  }
  return edges;
}
