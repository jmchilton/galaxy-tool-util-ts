/**
 * Build Mermaid flowchart diagrams from Galaxy workflows.
 *
 * Port of gxformat2/mermaid/_builder.py.
 */

import type { EdgeAnnotation } from "./edge-annotation.js";
import { edgeAnnotationKey } from "./edge-annotation.js";
import { ensureFormat2 } from "./normalized/ensure.js";
import type { NormalizedFormat2Workflow } from "./normalized/format2.js";
import { isUnlabeledStep, resolveSourceReference } from "./normalized/labels.js";

type Shape = readonly [string, string];

const SHAPE_INPUT: Shape = [">", "]"];
const SHAPE_PARAM: Shape = ["{{", "}}"];
const SHAPE_TOOL: Shape = ["[", "]"];
const SHAPE_SUBWORKFLOW: Shape = ["[[", "]]"];

const STEP_TYPE_SHAPES: Record<string, Shape> = {
  data: SHAPE_INPUT,
  collection: SHAPE_INPUT,
  integer: SHAPE_PARAM,
  float: SHAPE_PARAM,
  text: SHAPE_PARAM,
  boolean: SHAPE_PARAM,
  color: SHAPE_PARAM,
  input: SHAPE_INPUT,
  tool: SHAPE_TOOL,
  subworkflow: SHAPE_SUBWORKFLOW,
};

const MAIN_TS_PREFIX = "toolshed.g2.bx.psu.edu/repos/";

export interface MermaidOptions {
  comments?: boolean;
  /**
   * Optional map of `EdgeAnnotation` keyed by `edgeAnnotationKey(...)`. When
   * provided, edges with map-over depth or reductions are styled distinctly.
   */
  edgeAnnotations?: Map<string, EdgeAnnotation>;
}

function sanitizeLabel(label: string): string {
  let out = label.replace(/"/g, "#quot;");
  for (const ch of "()[]{}<>") {
    out = out.replaceAll(ch, `#${ch.charCodeAt(0)};`);
  }
  return out;
}

function inputTypeStr(type: string | readonly string[] | null | undefined): string {
  if (type == null) return "input";
  if (Array.isArray(type)) return type.length > 0 ? (type[0] as string) : "input";
  return type as string;
}

function nodeLine(nodeId: string, label: string, shape: Shape): string {
  return `${nodeId}${shape[0]}"${label}"${shape[1]}`;
}

interface RawFrame {
  title?: string | null;
  containsSteps: string[];
}

function collectFrames(commentsRaw: unknown): RawFrame[] {
  if (commentsRaw == null) return [];
  const entries: unknown[] = Array.isArray(commentsRaw)
    ? commentsRaw
    : typeof commentsRaw === "object"
      ? Object.values(commentsRaw as Record<string, unknown>)
      : [];
  const frames: RawFrame[] = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const c = entry as Record<string, unknown>;
    if (c.type !== "frame") continue;
    const contains = c.contains_steps;
    if (!Array.isArray(contains) || contains.length === 0) continue;
    frames.push({
      title: typeof c.title === "string" ? c.title : null,
      containsSteps: contains.map((s) => String(s)),
    });
  }
  return frames;
}

export function workflowToMermaid(
  workflow: unknown | NormalizedFormat2Workflow,
  opts: MermaidOptions = {},
): string {
  const wf =
    typeof workflow === "object" &&
    workflow !== null &&
    (workflow as Record<string, unknown>).class === "GalaxyWorkflow" &&
    Array.isArray((workflow as Record<string, unknown>).inputs) &&
    "unique_tools" in (workflow as Record<string, unknown>)
      ? (workflow as NormalizedFormat2Workflow)
      : ensureFormat2(workflow);

  const lines: string[] = ["graph LR"];

  const inputIds = new Map<string, string>();
  const inputLines = new Map<string, string>();
  wf.inputs.forEach((inp, i) => {
    const nodeId = `input_${i}`;
    const inpLabel = inp.id || String(i);
    inputIds.set(inpLabel, nodeId);
    const label = sanitizeLabel(inpLabel);
    const typeStr = inputTypeStr(inp.type);
    const shape = STEP_TYPE_SHAPES[typeStr] ?? SHAPE_INPUT;
    inputLines.set(inpLabel, nodeLine(nodeId, `${label}<br/><i>${typeStr}</i>`, shape));
  });

  const stepIds = new Map<string, string>();
  const stepLines = new Map<string, string>();
  wf.steps.forEach((step, i) => {
    const nodeId = `step_${i}`;
    const stepLabel = step.label || step.id;
    stepIds.set(stepLabel, nodeId);

    let toolId = step.tool_id ?? null;
    if (toolId && toolId.startsWith(MAIN_TS_PREFIX)) {
      toolId = toolId.slice(MAIN_TS_PREFIX.length);
    }

    const displayId = step.id && !isUnlabeledStep(step.id) ? step.id : null;
    const rawLabel = step.label || displayId || (toolId ? `tool:${toolId}` : String(i));
    const label = sanitizeLabel(rawLabel);
    // The TS normalizer does not infer step.type the way gxformat2 does, so
    // fall back to `run` shape: anything non-null implies a subworkflow.
    const stepType = step.type || (step.run != null ? "subworkflow" : "tool");
    const shape = STEP_TYPE_SHAPES[stepType] ?? SHAPE_TOOL;
    stepLines.set(stepLabel, nodeLine(nodeId, label, shape));
  });

  const framed = new Set<string>();
  const frames: RawFrame[] = [];
  if (opts.comments) {
    const commentsRaw = (wf as unknown as Record<string, unknown>).comments;
    for (const frame of collectFrames(commentsRaw)) {
      frames.push(frame);
      for (const ref of frame.containsSteps) framed.add(ref);
    }
  }

  for (const [inpLabel, line] of inputLines) {
    if (!framed.has(inpLabel)) lines.push(`    ${line}`);
  }
  for (const [stepLabel, line] of stepLines) {
    if (!framed.has(stepLabel)) lines.push(`    ${line}`);
  }

  frames.forEach((frame, i) => {
    const title = sanitizeLabel(frame.title || `Group ${i}`);
    lines.push(`    subgraph sub_${i} ["${title}"]`);
    for (const ref of frame.containsSteps) {
      if (inputLines.has(ref)) lines.push(`        ${inputLines.get(ref)}`);
      else if (stepLines.has(ref)) lines.push(`        ${stepLines.get(ref)}`);
    }
    lines.push("    end");
  });

  // Build the set of known labels for source resolution: input ids + step labels/ids.
  const knownLabels = new Set<string>([...inputIds.keys(), ...stepIds.keys()]);

  const seenEdges = new Set<string>();
  const linkStyles: string[] = [];
  let edgeIndex = 0;
  wf.steps.forEach((step, i) => {
    const nodeId = `step_${i}`;
    const targetLabel = step.label || step.id;
    for (const stepInput of step.in) {
      if (stepInput.source == null) continue;
      const inputId = stepInput.id || "";
      const sources = Array.isArray(stepInput.source) ? stepInput.source : [stepInput.source];
      for (const source of sources) {
        const [sourceLabel, outputName] = resolveSourceReference(source, knownLabels);
        const sourceId = inputIds.get(sourceLabel) ?? stepIds.get(sourceLabel);
        if (!sourceId) continue;
        const edgeKey = `${sourceId}->${nodeId}`;
        if (seenEdges.has(edgeKey)) continue;
        seenEdges.add(edgeKey);

        const annotation = opts.edgeAnnotations?.get(
          edgeAnnotationKey(sourceLabel, outputName, targetLabel, inputId),
        );
        const { line, linkStyle } = _renderEdge(sourceId, nodeId, annotation, edgeIndex);
        lines.push(`    ${line}`);
        if (linkStyle) linkStyles.push(linkStyle);
        edgeIndex++;
      }
    }
  });

  for (const ls of linkStyles) {
    lines.push(`    ${ls}`);
  }

  return lines.join("\n");
}

function _renderEdge(
  sourceId: string,
  targetId: string,
  annotation: EdgeAnnotation | undefined,
  edgeIndex: number,
): { line: string; linkStyle: string | null } {
  if (!annotation || (annotation.mapDepth === 0 && !annotation.reduction)) {
    return { line: `${sourceId} --> ${targetId}`, linkStyle: null };
  }
  if (annotation.reduction) {
    const label = annotation.mapping ? sanitizeLabel(`reduce ${annotation.mapping}`) : "reduce";
    return {
      line: `${sourceId} -. "${label}" .-> ${targetId}`,
      linkStyle: `linkStyle ${edgeIndex} stroke:#a55,stroke-dasharray:6 4`,
    };
  }
  const labelText = annotation.mapping ?? "map";
  const label = sanitizeLabel(labelText);
  const width = 2 + annotation.mapDepth;
  return {
    line: `${sourceId} ==>|"${label}"| ${targetId}`,
    linkStyle: `linkStyle ${edgeIndex} stroke:#5a8,stroke-width:${width}px`,
  };
}
