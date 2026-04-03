/**
 * Normalized native Galaxy workflow Effect schemas.
 *
 * Narrows raw native workflow dicts: optional containers become empty
 * defaults, tool_state JSON strings are parsed, subworkflows are
 * recursively normalized. Computed properties (unique_tools,
 * connected_paths) are derived during normalization.
 */

import { Schema } from "effect";

import {
  NativeStepTypeSchema,
  StepPositionSchema,
  ToolShedRepositorySchema,
  NativeStepInputSchema,
  NativeStepOutputSchema,
  NativeWorkflowOutputSchema,
  NativePostJobActionSchema,
} from "../raw/native.effect.js";

// --- ToolReference ---

export const ToolReferenceSchema = Schema.Struct({
  tool_id: Schema.String,
  tool_version: Schema.NullOr(Schema.String),
});
export type ToolReference = typeof ToolReferenceSchema.Type;

// --- Normalized workflow schema (defined first; uses suspend for step forward-ref) ---

export const NormalizedNativeWorkflowSchema = Schema.Struct({
  name: Schema.optional(Schema.NullOr(Schema.String)),
  a_galaxy_workflow: Schema.String,
  "format-version": Schema.String,
  annotation: Schema.optional(Schema.NullOr(Schema.String)),
  tags: Schema.Array(Schema.String),
  version: Schema.optional(Schema.NullOr(Schema.Number)),
  license: Schema.optional(Schema.NullOr(Schema.String)),
  release: Schema.optional(Schema.NullOr(Schema.String)),
  uuid: Schema.optional(Schema.NullOr(Schema.String)),
  steps: Schema.Record({
    key: Schema.String,
    value: Schema.suspend((): Schema.Schema<any> => NormalizedNativeStepSchema),
  }),
  unique_tools: Schema.Set(ToolReferenceSchema),
});
export type NormalizedNativeWorkflow = typeof NormalizedNativeWorkflowSchema.Type;

// --- Normalized step schema (references workflow directly) ---

export const NormalizedNativeStepSchema = Schema.Struct({
  id: Schema.Number,
  name: Schema.optional(Schema.NullOr(Schema.String)),
  type: Schema.optional(Schema.NullOr(NativeStepTypeSchema)),
  label: Schema.optional(Schema.NullOr(Schema.String)),
  annotation: Schema.optional(Schema.NullOr(Schema.String)),
  when: Schema.optional(Schema.NullOr(Schema.String)),
  content_id: Schema.optional(Schema.NullOr(Schema.String)),
  tool_state: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
  tool_id: Schema.optional(Schema.NullOr(Schema.String)),
  tool_version: Schema.optional(Schema.NullOr(Schema.String)),
  tool_shed_repository: Schema.optional(Schema.NullOr(ToolShedRepositorySchema)),
  uuid: Schema.optional(Schema.NullOr(Schema.String)),
  errors: Schema.optional(Schema.NullOr(Schema.String)),
  position: Schema.optional(Schema.NullOr(StepPositionSchema)),
  input_connections: Schema.Record({
    key: Schema.String,
    value: Schema.Array(Schema.Unknown),
  }),
  inputs: Schema.Array(NativeStepInputSchema),
  outputs: Schema.Array(NativeStepOutputSchema),
  workflow_outputs: Schema.Array(NativeWorkflowOutputSchema),
  post_job_actions: Schema.Record({ key: Schema.String, value: NativePostJobActionSchema }),
  subworkflow: Schema.optional(Schema.NullOr(NormalizedNativeWorkflowSchema)),
  tool_uuid: Schema.optional(Schema.NullOr(Schema.String)),
  tool_representation: Schema.optional(
    Schema.NullOr(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
  ),
  in: Schema.optional(Schema.NullOr(Schema.Record({ key: Schema.String, value: Schema.Unknown }))),
  connected_paths: Schema.Set(Schema.String),
});
export type NormalizedNativeStep = typeof NormalizedNativeStepSchema.Type;

// --- Normalization function ---

export function normalizedNative(raw: unknown): NormalizedNativeWorkflow {
  const wf = raw as Record<string, unknown>;
  const steps = _normalizeSteps(wf.steps as Record<string, unknown> | undefined);
  const tags = _normalizeTags(wf.tags);
  const uniqueTools = _collectUniqueTools(steps);

  const result: NormalizedNativeWorkflow = {
    name: wf.name as string | null | undefined,
    a_galaxy_workflow: (wf.a_galaxy_workflow as string) ?? "true",
    "format-version": (wf["format-version"] as string) ?? "0.1",
    annotation: wf.annotation as string | null | undefined,
    tags,
    version: wf.version as number | null | undefined,
    license: wf.license as string | null | undefined,
    release: wf.release as string | null | undefined,
    uuid: wf.uuid as string | null | undefined,
    steps,
    unique_tools: uniqueTools,
  };

  // Pass through comments if present (used by toFormat2 conversion)
  if (wf.comments != null) {
    (result as Record<string, unknown>).comments = wf.comments;
  }

  return result;
}

// --- Internal helpers ---

function _normalizeSteps(
  rawSteps: Record<string, unknown> | undefined,
): NormalizedNativeWorkflow["steps"] {
  const result: Record<string, NormalizedNativeStep> = {};
  if (!rawSteps) return result;
  for (const [key, rawStep] of Object.entries(rawSteps)) {
    result[key] = _normalizeStep(rawStep as Record<string, unknown>);
  }
  return result;
}

function _normalizeStep(step: Record<string, unknown>): NormalizedNativeStep {
  const toolState = _parseToolState(step.tool_state);
  const inputConnections = _normalizeInputConnections(
    step.input_connections as Record<string, unknown> | undefined,
  );
  const connectedPaths = new Set(Object.keys(inputConnections));

  let subworkflow: NormalizedNativeWorkflow | null = null;
  if (step.subworkflow != null) {
    subworkflow = normalizedNative(step.subworkflow);
  }

  return {
    id: (step.id as number) ?? 0,
    name: step.name as string | null | undefined,
    type: step.type as NormalizedNativeStep["type"],
    label: step.label as string | null | undefined,
    annotation: step.annotation as string | null | undefined,
    when: step.when as string | null | undefined,
    content_id: step.content_id as string | null | undefined,
    tool_state: toolState,
    tool_id: step.tool_id as string | null | undefined,
    tool_version: step.tool_version as string | null | undefined,
    tool_shed_repository: step.tool_shed_repository as NormalizedNativeStep["tool_shed_repository"],
    uuid: step.uuid as string | null | undefined,
    errors: step.errors as string | null | undefined,
    position: _normalizePosition(step.position as NormalizedNativeStep["position"]),
    input_connections: inputConnections,
    inputs: (step.inputs as NormalizedNativeStep["inputs"]) ?? [],
    outputs: (step.outputs as NormalizedNativeStep["outputs"]) ?? [],
    workflow_outputs: (step.workflow_outputs as NormalizedNativeStep["workflow_outputs"]) ?? [],
    post_job_actions: (step.post_job_actions as NormalizedNativeStep["post_job_actions"]) ?? {},
    subworkflow,
    tool_uuid: step.tool_uuid as string | null | undefined,
    tool_representation: step.tool_representation as NormalizedNativeStep["tool_representation"],
    in: step.in as NormalizedNativeStep["in"],
    connected_paths: connectedPaths,
  };
}

function _normalizePosition(
  position: NormalizedNativeStep["position"],
): NormalizedNativeStep["position"] {
  if (position == null) return position;
  return { top: position.top, left: position.left };
}

function _parseToolState(raw: unknown): Record<string, unknown> {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  if (raw != null && typeof raw === "object") {
    return raw as Record<string, unknown>;
  }
  return {};
}

function _normalizeInputConnections(
  raw: Record<string, unknown> | undefined,
): NormalizedNativeStep["input_connections"] {
  if (!raw) return {};
  const result: Record<string, readonly unknown[]> = {};
  for (const [key, val] of Object.entries(raw)) {
    result[key] = Array.isArray(val) ? val : [val];
  }
  return result;
}

function _normalizeTags(raw: unknown): readonly string[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    if (!raw) return [];
    return raw
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  }
  return [];
}

function _collectUniqueTools(steps: NormalizedNativeWorkflow["steps"]): Set<ToolReference> {
  const tools = new Set<ToolReference>();
  _collectToolsRecursive(steps, tools);
  return tools;
}

function _collectToolsRecursive(
  steps: NormalizedNativeWorkflow["steps"],
  into: Set<ToolReference>,
): void {
  for (const step of Object.values(steps)) {
    if (step.tool_id != null) {
      into.add({ tool_id: step.tool_id, tool_version: step.tool_version ?? null });
    }
    if (step.subworkflow) {
      _collectToolsRecursive(step.subworkflow.steps, into);
    }
  }
}
