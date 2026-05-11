/**
 * Normalized Format2 Galaxy workflow Effect schemas.
 *
 * Normalizes raw gxformat2 workflow dicts: $graph extraction with
 * #ref subworkflow inlining, dict→list conversion for inputs/outputs/steps,
 * shorthand expansion for inputs and step in/out, doc array joining.
 * Computed properties (unique_tools) are derived during normalization.
 */

import { Schema } from "effect";

import { ToolReferenceSchema, type ToolReference } from "./native.js";

// --- Input type alias mapping ---
// gxformat2 accepts several aliases for input types

const INPUT_TYPE_ALIASES: Record<string, string> = {
  File: "data",
  data_input: "data",
  data_collection: "collection",
};

function _resolveInputType(raw: string): string {
  return INPUT_TYPE_ALIASES[raw] ?? raw;
}

// --- Normalized Format2 schemas ---

export const NormalizedFormat2StepInputSchema = Schema.Struct({
  id: Schema.String,
  source: Schema.optional(Schema.NullOr(Schema.Union(Schema.String, Schema.Array(Schema.String)))),
  label: Schema.optional(Schema.NullOr(Schema.String)),
  default: Schema.optional(Schema.NullOr(Schema.Unknown)),
});
export type NormalizedFormat2StepInput = typeof NormalizedFormat2StepInputSchema.Type;

export const NormalizedFormat2StepOutputSchema = Schema.Struct({
  id: Schema.optional(Schema.NullOr(Schema.String)),
  add_tags: Schema.optional(Schema.NullOr(Schema.Array(Schema.String))),
  change_datatype: Schema.optional(Schema.NullOr(Schema.String)),
  delete_intermediate_datasets: Schema.optional(Schema.NullOr(Schema.Boolean)),
  hide: Schema.optional(Schema.NullOr(Schema.Boolean)),
  remove_tags: Schema.optional(Schema.NullOr(Schema.Array(Schema.String))),
  rename: Schema.optional(Schema.NullOr(Schema.String)),
  set_columns: Schema.optional(
    Schema.NullOr(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
  ),
});
export type NormalizedFormat2StepOutput = typeof NormalizedFormat2StepOutputSchema.Type;

export const NormalizedFormat2InputSchema = Schema.Struct({
  id: Schema.String,
  label: Schema.optional(Schema.NullOr(Schema.String)),
  doc: Schema.optional(Schema.NullOr(Schema.String)),
  type: Schema.optional(Schema.NullOr(Schema.Union(Schema.String, Schema.Array(Schema.String)))),
  optional: Schema.optional(Schema.NullOr(Schema.Boolean)),
  default: Schema.optional(Schema.NullOr(Schema.Unknown)),
  format: Schema.optional(Schema.NullOr(Schema.Array(Schema.String))),
  collection_type: Schema.optional(Schema.NullOr(Schema.String)),
  position: Schema.optional(
    Schema.NullOr(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
  ),
});
export type NormalizedFormat2Input = typeof NormalizedFormat2InputSchema.Type;

export const NormalizedFormat2OutputSchema = Schema.Struct({
  id: Schema.String,
  label: Schema.optional(Schema.NullOr(Schema.String)),
  doc: Schema.optional(Schema.NullOr(Schema.String)),
  outputSource: Schema.optional(Schema.NullOr(Schema.String)),
  type: Schema.optional(Schema.NullOr(Schema.String)),
});
export type NormalizedFormat2Output = typeof NormalizedFormat2OutputSchema.Type;

// Workflow defined first; step uses suspend for forward ref
export const NormalizedFormat2WorkflowSchema = Schema.Struct({
  class: Schema.Literal("GalaxyWorkflow"),
  label: Schema.optional(Schema.NullOr(Schema.String)),
  doc: Schema.optional(Schema.NullOr(Schema.String)),
  inputs: Schema.Array(NormalizedFormat2InputSchema),
  outputs: Schema.Array(NormalizedFormat2OutputSchema),
  steps: Schema.Array(Schema.suspend((): Schema.Schema<any> => NormalizedFormat2StepSchema)),
  tags: Schema.optional(Schema.NullOr(Schema.Array(Schema.String))),
  uuid: Schema.optional(Schema.NullOr(Schema.String)),
  report: Schema.optional(
    Schema.NullOr(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
  ),
  license: Schema.optional(Schema.NullOr(Schema.String)),
  release: Schema.optional(Schema.NullOr(Schema.String)),
  unique_tools: Schema.Set(ToolReferenceSchema),
});
export type NormalizedFormat2Workflow = typeof NormalizedFormat2WorkflowSchema.Type;

export const NormalizedFormat2StepSchema = Schema.Struct({
  id: Schema.String,
  label: Schema.optional(Schema.NullOr(Schema.String)),
  doc: Schema.optional(Schema.NullOr(Schema.String)),
  tool_id: Schema.optional(Schema.NullOr(Schema.String)),
  tool_version: Schema.optional(Schema.NullOr(Schema.String)),
  tool_shed_repository: Schema.optional(
    Schema.NullOr(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
  ),
  type: Schema.optional(Schema.NullOr(Schema.String)),
  run: Schema.optional(Schema.NullOr(Schema.Union(NormalizedFormat2WorkflowSchema, Schema.String))),
  in: Schema.Array(NormalizedFormat2StepInputSchema),
  out: Schema.Array(NormalizedFormat2StepOutputSchema),
  post_job_actions: Schema.optional(
    Schema.NullOr(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
  ),
  state: Schema.optional(
    Schema.NullOr(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
  ),
  tool_state: Schema.optional(
    Schema.NullOr(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
  ),
  when: Schema.optional(Schema.NullOr(Schema.String)),
  position: Schema.optional(
    Schema.NullOr(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
  ),
  errors: Schema.optional(Schema.NullOr(Schema.String)),
  uuid: Schema.optional(Schema.NullOr(Schema.String)),
  runtime_inputs: Schema.optional(Schema.NullOr(Schema.Array(Schema.String))),
});
export type NormalizedFormat2Step = typeof NormalizedFormat2StepSchema.Type;

// --- Entry point ---

export function normalizedFormat2(raw: unknown): NormalizedFormat2Workflow {
  const doc = raw as Record<string, unknown>;

  // $graph extraction: find main, build subworkflow map
  if (doc.$graph) {
    const graph = doc.$graph as Record<string, unknown>[];
    const subworkflows = new Map<string, Record<string, unknown>>();
    let main: Record<string, unknown> | undefined;
    for (const entry of graph) {
      if (entry.id === "main") {
        main = entry;
      } else {
        subworkflows.set(entry.id as string, entry);
      }
    }
    if (!main) {
      throw new Error("$graph workflow missing 'main' entry");
    }
    return _normalizeWorkflow(main, subworkflows);
  }

  return _normalizeWorkflow(doc, new Map());
}

// --- Internal helpers ---

function _normalizeWorkflow(
  raw: Record<string, unknown>,
  subworkflows: Map<string, Record<string, unknown>>,
): NormalizedFormat2Workflow {
  const inputs = _normalizeInputs(raw.inputs);
  const outputs = _normalizeOutputs(raw.outputs);
  const steps = _normalizeSteps(raw.steps, subworkflows);
  const uniqueTools = _collectUniqueTools(steps);

  const result: NormalizedFormat2Workflow = {
    class: "GalaxyWorkflow",
    label: (raw.label as string | null) ?? null,
    doc: _joinDoc(raw.doc),
    inputs,
    outputs,
    steps,
    tags: raw.tags as string[] | undefined,
    uuid: raw.uuid as string | undefined,
    report: raw.report as NormalizedFormat2Workflow["report"],
    license: raw.license as string | undefined,
    release: raw.release as string | undefined,
    unique_tools: uniqueTools,
  };

  // Pass through comments if present (used by toNative conversion)
  if (raw.comments != null) {
    (result as Record<string, unknown>).comments = raw.comments;
  }
  // Pass through creator if present (used by best practices linting)
  if (raw.creator != null) {
    (result as Record<string, unknown>).creator = raw.creator;
  }

  return result;
}

function _normalizeInputs(raw: unknown): NormalizedFormat2Input[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map((item) => {
      const obj = item as Record<string, unknown>;
      return { ...obj, id: obj.id as string, doc: _joinDoc(obj.doc) } as NormalizedFormat2Input;
    });
  }
  // Dict form: {key: value} where value is string shorthand or object
  const result: NormalizedFormat2Input[] = [];
  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof val === "string") {
      // Shorthand: "data" → {id, type: "data"}
      result.push({ id: key, type: _resolveInputType(val) });
    } else if (val && typeof val === "object") {
      const obj = val as Record<string, unknown>;
      const type = typeof obj.type === "string" ? _resolveInputType(obj.type) : obj.type;
      result.push({ ...obj, id: key, type, doc: _joinDoc(obj.doc) } as NormalizedFormat2Input);
    } else {
      result.push({ id: key });
    }
  }
  return result;
}

function _normalizeOutputs(raw: unknown): NormalizedFormat2Output[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map((item) => {
      const obj = item as Record<string, unknown>;
      return { ...obj, id: obj.id as string, doc: _joinDoc(obj.doc) } as NormalizedFormat2Output;
    });
  }
  const result: NormalizedFormat2Output[] = [];
  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    if (val && typeof val === "object") {
      const obj = val as Record<string, unknown>;
      result.push({ ...obj, id: key, doc: _joinDoc(obj.doc) } as NormalizedFormat2Output);
    } else {
      result.push({ id: key });
    }
  }
  return result;
}

function _normalizeSteps(
  raw: unknown,
  subworkflows: Map<string, Record<string, unknown>>,
): NormalizedFormat2Step[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map((item, idx) => {
      const obj = item as Record<string, unknown>;
      return _normalizeStep(obj, (obj.id as string) ?? String(idx), subworkflows);
    });
  }
  const result: NormalizedFormat2Step[] = [];
  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    if (val && typeof val === "object") {
      let stepDict = val as Record<string, unknown>;
      // Map-form steps: key becomes both id and label (if no explicit label)
      if (!("label" in stepDict)) {
        stepDict = { ...stepDict, label: key };
      }
      result.push(_normalizeStep(stepDict, key, subworkflows));
    }
  }
  return result;
}

function _normalizeStep(
  raw: Record<string, unknown>,
  id: string,
  subworkflows: Map<string, Record<string, unknown>>,
): NormalizedFormat2Step {
  const stepIn = _normalizeStepIn(raw.in);
  const stepOut = _normalizeStepOut(raw.out);
  const run = _resolveRun(raw.run, subworkflows);

  // Resolve $link references in state: replace with ConnectedValue and
  // collect corresponding in entries for downstream connection injection
  const linkConnections: Map<string, string[]> = new Map();
  const state =
    raw.state != null
      ? (_resolveLinks(
          raw.state as Record<string, unknown>,
          "",
          linkConnections,
        ) as NormalizedFormat2Step["state"])
      : (raw.state as NormalizedFormat2Step["state"]);
  const linkInputs: NormalizedFormat2StepInput[] = [];
  for (const [key, sources] of linkConnections) {
    linkInputs.push({ id: key, source: sources.length === 1 ? sources[0] : (sources as any) });
  }

  // Merge explicit in entries with link-derived entries (explicit first)
  const existingIds = new Set(stepIn.map((i) => i.id));
  for (const li of linkInputs) {
    if (!existingIds.has(li.id)) {
      stepIn.push(li);
    }
  }

  return {
    id,
    label: raw.label as string | undefined,
    doc: _joinDoc(raw.doc),
    tool_id: raw.tool_id as string | undefined,
    tool_version: raw.tool_version as string | undefined,
    tool_shed_repository: raw.tool_shed_repository as NormalizedFormat2Step["tool_shed_repository"],
    type: raw.type as string | undefined,
    run,
    in: stepIn,
    out: stepOut,
    post_job_actions: raw.post_job_actions as Record<string, unknown> | null | undefined,
    state,
    tool_state: _parseToolState(raw.tool_state),
    when: raw.when as string | undefined,
    position: raw.position as NormalizedFormat2Step["position"],
    errors: raw.errors as string | undefined,
    uuid: raw.uuid as string | undefined,
    runtime_inputs: raw.runtime_inputs as string[] | undefined,
  };
}

function _normalizeStepIn(raw: unknown): NormalizedFormat2StepInput[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map((item) => {
      if (typeof item === "string") {
        return { id: item };
      }
      const obj = item as Record<string, unknown>;
      return { ...obj, id: obj.id as string } as NormalizedFormat2StepInput;
    });
  }
  // Dict form: {inputName: source} or {inputName: {source: ..., ...}}
  const result: NormalizedFormat2StepInput[] = [];
  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof val === "string") {
      result.push({ id: key, source: val });
    } else if (Array.isArray(val)) {
      // mapPredicate: source shorthand — bare list value is the multi-source.
      result.push({ id: key, source: val as string[] } as NormalizedFormat2StepInput);
    } else if (val && typeof val === "object") {
      const obj = val as Record<string, unknown>;
      result.push({ ...obj, id: key } as NormalizedFormat2StepInput);
    } else {
      result.push({ id: key });
    }
  }
  return result;
}

function _normalizeStepOut(raw: unknown): NormalizedFormat2StepOutput[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map((item) => {
      if (typeof item === "string") {
        return { id: item };
      }
      return item as NormalizedFormat2StepOutput;
    });
  }
  // Dict form
  const result: NormalizedFormat2StepOutput[] = [];
  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    if (val && typeof val === "object") {
      result.push({ ...val, id: key } as NormalizedFormat2StepOutput);
    } else {
      result.push({ id: key });
    }
  }
  return result;
}

function _resolveRun(
  raw: unknown,
  subworkflows: Map<string, Record<string, unknown>>,
): NormalizedFormat2Workflow | string | null | undefined {
  if (raw == null) return raw as null | undefined;
  if (typeof raw === "string") {
    // #ref → inline subworkflow
    if (raw.startsWith("#")) {
      const refId = raw.slice(1);
      const sub = subworkflows.get(refId);
      if (!sub) {
        throw new Error(`Subworkflow reference not found: ${raw}`);
      }
      return _normalizeWorkflow(sub, subworkflows);
    }
    // URL or other string passes through
    return raw;
  }
  if (typeof raw === "object") {
    const dict = raw as Record<string, unknown>;
    // @import reference → pass through as string path for expansion to resolve
    if ("@import" in dict && typeof dict["@import"] === "string") {
      return dict["@import"];
    }
    // User-defined tool — pass through as-is
    if (dict.class === "GalaxyUserTool") {
      return dict as any;
    }
    // Inline workflow definition
    return _normalizeWorkflow(dict, subworkflows);
  }
  return null;
}

const _CONNECTED_VALUE: Record<string, string> = { __class__: "ConnectedValue" };

/**
 * Walk a state value replacing {$link: "source"} with ConnectedValue markers
 * and collecting connections keyed by pipe-separated state paths.
 *
 * Matches Python gxformat2 _resolve_links — $link is a format-level construct
 * resolved before tool definitions are available.
 */
function _coerceLinkValue(link: unknown): string {
  // YAML unquoted integers (e.g. `$link: 0`) parse as number; downstream
  // source resolution expects a string.
  if (typeof link === "number" && Number.isInteger(link)) return String(link);
  return link as string;
}

function _resolveLinks(value: unknown, key: string, connections: Map<string, string[]>): unknown {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    if ("$link" in obj) {
      const sources = connections.get(key) ?? [];
      sources.push(_coerceLinkValue(obj.$link));
      connections.set(key, sources);
      return { ..._CONNECTED_VALUE };
    }
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      const childKey = key ? `${key}|${k}` : k;
      result[k] = _resolveLinks(v, childKey, connections);
    }
    return result;
  }

  if (Array.isArray(value)) {
    return value.map((v, i) => {
      if (
        v &&
        typeof v === "object" &&
        !Array.isArray(v) &&
        "$link" in (v as Record<string, unknown>)
      ) {
        const sources = connections.get(key) ?? [];
        sources.push(_coerceLinkValue((v as Record<string, unknown>).$link));
        connections.set(key, sources);
        return null;
      }
      const childKey = `${key}_${i}`;
      return _resolveLinks(v, childKey, connections);
    });
  }

  return value;
}

function _parseToolState(raw: unknown): Record<string, unknown> | null | undefined {
  if (raw == null) return raw as null | undefined;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  if (typeof raw === "object") {
    return raw as Record<string, unknown>;
  }
  return null;
}

function _joinDoc(raw: unknown): string | null | undefined {
  if (Array.isArray(raw)) return raw.join("\n");
  if (typeof raw === "string") return raw;
  return raw as null | undefined;
}

function _collectUniqueTools(steps: NormalizedFormat2Step[]): Set<ToolReference> {
  const tools = new Set<ToolReference>();
  _collectToolsRecursive(steps, tools);
  return tools;
}

function _collectToolsRecursive(
  steps: readonly NormalizedFormat2Step[],
  into: Set<ToolReference>,
): void {
  for (const step of steps) {
    if (step.tool_id != null) {
      into.add({ tool_id: step.tool_id, tool_version: step.tool_version ?? null });
    }
    if (step.run && typeof step.run === "object" && (step.run as any).class === "GalaxyWorkflow") {
      const sub = step.run as NormalizedFormat2Workflow;
      _collectToolsRecursive(sub.steps as readonly NormalizedFormat2Step[], into);
    }
  }
}
