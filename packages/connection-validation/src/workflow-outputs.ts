import type { NormalizedNativeStep, NormalizedNativeWorkflow } from "@galaxy-tool-util/schema";
import { isValidCollectionTypeStr } from "@galaxy-tool-util/workflow-graph";

import { isAnyDesc, isNullDesc } from "./collection-type-functions.js";
import { validateConnectionGraph } from "./connection-validator.js";
import type { GetToolInfo } from "./get-tool-info.js";
import { buildWorkflowGraph, coerceNormalizedNative } from "./graph-builder.js";
import type { ResolvedOutputDataType, WorkflowConnectionResult, WorkflowGraph } from "./types.js";

/** What the connection graph says about one workflow output. Absent fields are unknown. */
export interface ResolvedWorkflowOutput {
  kind?: "dataset" | "collection";
  collectionType?: string;
  /** Datatype the output always has: a `ChangeDatatypeAction` or a fixed tool format. */
  format?: string;
}

/**
 * Resolve the shape and fixed format of each workflow output, keyed by label
 * (or output name when unlabelled). Each output is resolved on its own: an
 * output whose producing step, or any step upstream of it, has an invalid
 * connection gets no shape, and the rest still resolve. Outputs of a step that
 * can be skipped (a step with `when`, or one downstream of it) get no format:
 * Galaxy writes a skipped output as `expression.json`. An output label used
 * twice resolves to nothing.
 */
export function resolveWorkflowOutputs(
  workflow: unknown,
  getToolInfo: GetToolInfo,
): Map<string, ResolvedWorkflowOutput> {
  const native = coerceNormalizedNative(workflow);
  const graph = buildWorkflowGraph(native, getToolInfo);
  const [connections, resolvedTypes] = validateConnectionGraph(graph);
  const unreliable = downstreamOf(graph, invalidSteps(connections));
  const skippable = skippableSteps(native);
  const result = new Map<string, ResolvedWorkflowOutput>();
  const seen = new Set<string>();
  for (const [stepId, step] of Object.entries(native.steps)) {
    for (const exposed of step.workflow_outputs) {
      const port = exposed.output_name;
      const name = exposed.label ?? port;
      if (seen.has(name)) {
        result.set(name, {});
        continue;
      }
      seen.add(name);
      const entry: ResolvedWorkflowOutput = {};
      const format = skippable.has(stepId) ? undefined : outputFormat(native, graph, stepId, port);
      if (format) entry.format = format;
      const descriptor = unreliable.has(stepId) ? undefined : resolvedTypes[stepId]?.[port];
      const type = portType(graph, stepId, port);
      if (descriptor && !isAnyDesc(descriptor)) {
        if (!isNullDesc(descriptor) && descriptor.collectionType) {
          entry.kind = "collection";
          entry.collectionType = descriptor.collectionType;
        } else if (isNullDesc(descriptor) && type === "data") {
          entry.kind = "dataset";
        }
      } else if (type === "collection") {
        entry.kind = "collection";
      }
      result.set(name, entry);
    }
  }
  return result;
}

function invalidSteps(connections: WorkflowConnectionResult): Set<string> {
  return new Set(
    connections.stepResults
      .filter((s) => s.errors.length > 0 || s.connections.some((c) => c.status === "invalid"))
      .map((s) => s.stepId),
  );
}

/** `seeds` plus every step that reads, directly or not, from one of them. */
function downstreamOf(graph: WorkflowGraph, seeds: Set<string>): Set<string> {
  const result = new Set(seeds);
  for (const stepId of graph.sortedStepIds) {
    const refs = Object.values(graph.steps[stepId]?.connections ?? {}).flat();
    if (refs.some((ref) => result.has(ref.sourceStep))) result.add(stepId);
  }
  return result;
}

/**
 * Steps with `when`, and every step downstream of one. Walks the workflow's own
 * `input_connections` rather than the graph, which drops connections it can't
 * type (pick_value's repeat inputs, for example).
 */
function skippableSteps(workflow: NormalizedNativeWorkflow): Set<string> {
  const sources = new Map(
    Object.entries(workflow.steps).map(([stepId, step]) => [
      stepId,
      Object.values(step.input_connections ?? {})
        .flat()
        .map((connection) => String((connection as { id?: unknown }).id)),
    ]),
  );
  const result = new Set(
    Object.entries(workflow.steps)
      .filter(([, step]) => step.when)
      .map(([stepId]) => stepId),
  );
  let grew = true;
  while (grew) {
    grew = false;
    for (const [stepId, ids] of sources) {
      if (!result.has(stepId) && ids.some((id) => result.has(id))) {
        result.add(stepId);
        grew = true;
      }
    }
  }
  return result;
}

/** Declared type of a step output, following subworkflow outputs to the inner step. */
function portType(
  graph: WorkflowGraph,
  stepId: string,
  outputName: string,
): ResolvedOutputDataType | undefined {
  const step = graph.steps[stepId];
  const source = step?.subworkflowOutputMap[outputName];
  if (source && step.innerGraph) return portType(step.innerGraph, source[0], source[1]);
  return step?.outputs[outputName]?.type;
}

function fixedFormat(format: unknown): string | undefined {
  if (
    typeof format !== "string" ||
    !format ||
    isValidCollectionTypeStr(format) ||
    /^(data|input|auto|sniff|_sniff_|collection|data_collection)$/.test(format)
  ) {
    return undefined;
  }
  return format;
}

function outputFormat(
  workflow: NormalizedNativeWorkflow,
  graph: WorkflowGraph,
  stepId: string,
  outputName: string,
): string | undefined {
  const step = workflow.steps[stepId] as NormalizedNativeStep | undefined;
  if (!step) return undefined;
  for (const action of Object.values(step.post_job_actions)) {
    if (action.action_type === "ChangeDatatypeAction" && action.output_name === outputName) {
      return fixedFormat(action.action_arguments?.newtype);
    }
  }

  const resolved = graph.steps[stepId];
  const source = resolved?.subworkflowOutputMap[outputName];
  if (source && resolved.innerGraph && step.subworkflow) {
    const [innerId, innerName] = source;
    if (skippableSteps(step.subworkflow).has(innerId)) return undefined;
    return outputFormat(step.subworkflow, resolved.innerGraph, innerId, innerName);
  }

  const output = resolved?.outputs[outputName];
  if (output?.type !== "data" || output.formatSource) return undefined;
  return fixedFormat(output.format);
}
