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
import {
  UnresolvedSourceError,
  type ConnectionResult,
  type ConnectionStepResult,
  type ConnectionValidationReport,
  type ResolvedOutputType,
} from "@galaxy-tool-util/schema";

import { buildWorkflowGraph } from "./graph-builder.js";
import type { GetToolInfo } from "./get-tool-info.js";
import { validateConnectionGraph } from "./connection-validator.js";
import type { StepOutputTypeMap, WorkflowConnectionResult } from "./types.js";

export function validateConnectionsReport(
  workflow: unknown,
  getToolInfo: GetToolInfo,
): ConnectionValidationReport {
  let graph;
  try {
    graph = buildWorkflowGraph(workflow, getToolInfo);
  } catch (error) {
    // A Format2 source naming no step or input: the workflow has no graph to
    // walk, and Galaxy would refuse it, so report it invalid rather than throw.
    if (error instanceof UnresolvedSourceError) return unresolvedSourceReport(error);
    throw error;
  }
  const [result, resolved] = validateConnectionGraph(graph);
  return toConnectionValidationReport(result, resolved);
}

function unresolvedSourceReport(error: UnresolvedSourceError): ConnectionValidationReport {
  return {
    valid: false,
    step_results: [
      {
        step: error.source,
        label: null,
        tool_id: null,
        version: null,
        step_type: "unresolved_source",
        map_over: null,
        connections: [],
        resolved_outputs: [],
        errors: [error.message],
      },
    ],
    summary: { ok: 0, invalid: 1, skip: 0 },
    has_details: true,
  };
}

export function toConnectionValidationReport(
  result: WorkflowConnectionResult,
  resolvedOutputTypes: StepOutputTypeMap,
): ConnectionValidationReport {
  const stepResults: ConnectionStepResult[] = result.stepResults.map((sr) => {
    const connections: ConnectionResult[] = sr.connections.map((cr) => {
      const out: ConnectionResult = {
        source_step: cr.sourceStep,
        source_output: cr.sourceOutput,
        target_step: cr.targetStep,
        target_input: cr.targetInput,
        status: cr.status,
        mapping: cr.mapping ?? null,
        errors: cr.errors,
      };
      if (cr.mapDepth !== undefined) out.map_depth = cr.mapDepth;
      if (cr.reduction !== undefined) out.reduction = cr.reduction;
      return out;
    });
    const stepOutputs = resolvedOutputTypes[sr.stepId] ?? {};
    const resolved_outputs: ResolvedOutputType[] = Object.entries(stepOutputs).map(([name, t]) => ({
      name,
      collection_type: _sentinelToCollectionType(t),
    }));
    const stepResult: ConnectionStepResult = {
      step: sr.stepId,
      tool_id: sr.toolId ?? null,
      version: sr.toolVersion ?? null,
      step_type: sr.stepType,
      map_over: sr.mapOver ?? null,
      connections,
      resolved_outputs,
      errors: sr.errors,
    };
    if (sr.label !== undefined && sr.label !== null) stepResult.label = sr.label;
    return stepResult;
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
