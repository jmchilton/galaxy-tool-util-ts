import type { WorkflowInput, WorkflowOutput } from "./types.js";

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : undefined;
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function parseInputEntry(name: string, raw: unknown): WorkflowInput {
  // Shorthand: `name: File` or `name: int` — a bare string is the type.
  if (typeof raw === "string") {
    return { name, type: raw };
  }
  const entry = asRecord(raw);
  if (!entry) {
    return { name, type: "data" };
  }
  const type = asString(entry.type) ?? "data";
  const doc = asString(entry.doc);
  const optional = typeof entry.optional === "boolean" ? entry.optional : undefined;
  const hasDefault = Object.prototype.hasOwnProperty.call(entry, "default");
  const out: WorkflowInput = { name, type };
  if (doc !== undefined) out.doc = doc;
  if (optional !== undefined) out.optional = optional;
  if (hasDefault) out.default = entry.default;
  return out;
}

/**
 * Extract workflow inputs from a parsed Format2 (.gxwf.yml) workflow dict.
 *
 * Handles both dict form (`inputs: { name: { type: ... } }`) and list form
 * (`inputs: [{ id: name, type: ... }]`). Plugin accepts both.
 */
export function extractFormat2Inputs(parsed: unknown): WorkflowInput[] {
  const wf = asRecord(parsed);
  if (!wf) return [];
  const inputs = wf.inputs;
  if (inputs === undefined || inputs === null) return [];

  if (Array.isArray(inputs)) {
    const out: WorkflowInput[] = [];
    for (const entry of inputs) {
      const r = asRecord(entry);
      if (!r) continue;
      const name = asString(r.id) ?? asString(r.name);
      if (!name) continue;
      out.push(parseInputEntry(name, r));
    }
    return out;
  }

  const dict = asRecord(inputs);
  if (!dict) return [];
  return Object.entries(dict).map(([name, raw]) => parseInputEntry(name, raw));
}

function parseOutputEntry(name: string, raw: unknown): WorkflowOutput {
  const entry = asRecord(raw);
  const doc = entry ? asString(entry.doc) : undefined;
  const out: WorkflowOutput = { name };
  if (doc !== undefined) out.doc = doc;
  return out;
}

/**
 * Extract workflow outputs from a parsed Format2 workflow dict.
 */
export function extractFormat2Outputs(parsed: unknown): WorkflowOutput[] {
  const wf = asRecord(parsed);
  if (!wf) return [];
  const outputs = wf.outputs;
  if (outputs === undefined || outputs === null) return [];

  if (Array.isArray(outputs)) {
    const out: WorkflowOutput[] = [];
    for (const entry of outputs) {
      const r = asRecord(entry);
      if (!r) continue;
      const name = asString(r.id) ?? asString(r.name);
      if (!name) continue;
      out.push(parseOutputEntry(name, r));
    }
    return out;
  }

  const dict = asRecord(outputs);
  if (!dict) return [];
  return Object.entries(dict).map(([name, raw]) => parseOutputEntry(name, raw));
}
