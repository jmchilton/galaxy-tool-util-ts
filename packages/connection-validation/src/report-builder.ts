/**
 * Convert internal camelCase result + resolved-type map into the
 * snake_case `ConnectionValidationReport` whose shape matches Galaxy's
 * Pydantic model verbatim.
 *
 * Snake_case is the public contract here — `dictVerifyEach` walks this
 * report directly with no further translation. Do not rename or omit
 * fields without updating Python parity.
 */

import {
  ANY_COLLECTION_TYPE_DESCRIPTION,
  CollectionTypeDescription,
  NULL_COLLECTION_TYPE_DESCRIPTION,
  type CollectionTypeDescriptor,
} from "@galaxy-tool-util/workflow-graph";
import type {
  ConnectionResult,
  ConnectionStepResult,
  ConnectionValidationReport,
  ResolvedOutputType,
} from "@galaxy-tool-util/schema";

import { buildWorkflowGraph } from "./graph-builder.js";
import type { GetToolInfo } from "./get-tool-info.js";
import { validateConnectionGraph } from "./connection-validator.js";
import type { StepOutputTypeMap, WorkflowConnectionResult } from "./types.js";

export function validateConnectionsReport(
  workflow: unknown,
  getToolInfo: GetToolInfo,
): ConnectionValidationReport {
  const graph = buildWorkflowGraph(workflow, getToolInfo);
  const [result, resolved] = validateConnectionGraph(graph);
  return toConnectionValidationReport(result, resolved);
}

export function toConnectionValidationReport(
  result: WorkflowConnectionResult,
  resolvedOutputTypes: StepOutputTypeMap,
): ConnectionValidationReport {
  const stepResults: ConnectionStepResult[] = result.stepResults.map((sr) => {
    const connections: ConnectionResult[] = sr.connections.map((cr) => ({
      source_step: cr.sourceStep,
      source_output: cr.sourceOutput,
      target_step: cr.targetStep,
      target_input: cr.targetInput,
      status: cr.status,
      mapping: cr.mapping ?? null,
      errors: cr.errors,
    }));
    const stepOutputs = resolvedOutputTypes[sr.stepId] ?? {};
    const resolved_outputs: ResolvedOutputType[] = Object.entries(stepOutputs).map(([name, t]) => ({
      name,
      collection_type: _sentinelToCollectionType(t),
    }));
    return {
      step: sr.stepId,
      tool_id: sr.toolId ?? null,
      version: sr.toolVersion ?? null,
      step_type: sr.stepType,
      map_over: sr.mapOver ?? null,
      connections,
      resolved_outputs,
      errors: sr.errors,
    };
  });

  const has_details = stepResults.some((sr) => sr.connections.length > 0 || sr.errors.length > 0);

  return {
    valid: result.valid,
    step_results: stepResults,
    summary: result.summary,
    has_details,
  };
}

function _sentinelToCollectionType(t: CollectionTypeDescriptor): string | null {
  if (t === NULL_COLLECTION_TYPE_DESCRIPTION) return null;
  if (t === ANY_COLLECTION_TYPE_DESCRIPTION) return null;
  if (t instanceof CollectionTypeDescription) return t.collectionType;
  return null;
}
