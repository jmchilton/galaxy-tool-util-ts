import { parseToolState } from "../../workflow/tool-state-io.js";
import type { WorkflowInput, WorkflowOutput } from "./types.js";

const INPUT_STEP_TYPES = new Set(["data_input", "data_collection_input", "parameter_input"]);

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : undefined;
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function inputTypeFor(stepType: string, toolState: Record<string, unknown>): string {
  if (stepType === "data_input") return "data";
  if (stepType === "data_collection_input") return "collection";
  // parameter_input — tool_state carries `parameter_type` (e.g. "integer", "text", "boolean").
  return asString(toolState.parameter_type) ?? "data";
}

/**
 * Return parsed steps as an array ordered by numeric id. Native workflows
 * store `steps` as a dict keyed by stringified id.
 */
function orderedSteps(parsed: Record<string, unknown>): Record<string, unknown>[] {
  const steps = asRecord(parsed.steps);
  if (!steps) return [];
  return Object.entries(steps)
    .map(([key, value]) => {
      const step = asRecord(value);
      const id = step && typeof step.id === "number" ? step.id : Number.parseInt(key, 10);
      return { id: Number.isFinite(id) ? id : 0, step };
    })
    .filter((e): e is { id: number; step: Record<string, unknown> } => !!e.step)
    .sort((a, b) => a.id - b.id)
    .map((e) => e.step);
}

export function extractNativeInputs(parsed: unknown): WorkflowInput[] {
  const wf = asRecord(parsed);
  if (!wf) return [];
  const out: WorkflowInput[] = [];
  for (const step of orderedSteps(wf)) {
    const stepType = asString(step.type);
    if (!stepType || !INPUT_STEP_TYPES.has(stepType)) continue;
    const name = asString(step.label);
    if (!name) continue;
    const toolState = parseToolState(step.tool_state);
    const type = inputTypeFor(stepType, toolState);
    const input: WorkflowInput = { name, type };
    const doc = asString(step.annotation);
    if (doc) input.doc = doc;
    if (typeof toolState.optional === "boolean") input.optional = toolState.optional;
    if (Object.prototype.hasOwnProperty.call(toolState, "default")) {
      input.default = toolState.default;
    }
    out.push(input);
  }
  return out;
}

export function extractNativeOutputs(parsed: unknown): WorkflowOutput[] {
  const wf = asRecord(parsed);
  if (!wf) return [];
  const out: WorkflowOutput[] = [];
  for (const step of orderedSteps(wf)) {
    const workflowOutputs = step.workflow_outputs;
    if (!Array.isArray(workflowOutputs)) continue;
    for (const wo of workflowOutputs) {
      const r = asRecord(wo);
      if (!r) continue;
      const name = asString(r.label) ?? asString(r.output_name);
      if (!name) continue;
      const entry: WorkflowOutput = { name };
      const uuid = asString(r.uuid);
      if (uuid) entry.uuid = uuid;
      out.push(entry);
    }
  }
  return out;
}
