/**
 * Workflow tool_state cleaning — strip stale keys and decode legacy encoding.
 *
 * Port of Galaxy's workflow_state clean operation. Removes bookkeeping keys
 * (__page__, __rerun_remap_job_id__), runtime leak keys (chromInfo, __input_ext),
 * and decodes JSON-encoded tool_state strings into proper dicts.
 */

/** Keys injected by Galaxy's tool form machinery — never meaningful in saved workflows. */
const BOOKKEEPING_KEYS = new Set(["__page__", "__rerun_remap_job_id__"]);

/** Keys leaked from runtime context into saved state. */
const RUNTIME_LEAK_KEYS = new Set(["chromInfo", "__input_ext"]);

/** Internal indexing keys within conditionals and repeats. */
const INTERNAL_KEYS = new Set(["__current_case__", "__index__"]);

const STALE_KEYS = new Set([...BOOKKEEPING_KEYS, ...RUNTIME_LEAK_KEYS, ...INTERNAL_KEYS]);

/**
 * Decode a legacy JSON-encoded tool_state value. If the value is a string
 * that parses to a compound type (object/array), return the parsed value and
 * recurse. Primitive JSON strings (numbers, booleans, "null", quoted strings)
 * are left as their original string form.
 */
function decodeLegacyValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    const parsed = JSON.parse(value);
    if (parsed !== null && typeof parsed === "object") {
      // Compound type — recurse into it
      if (Array.isArray(parsed)) {
        return parsed.map(decodeLegacyValue);
      }
      return decodeLegacyDict(parsed as Record<string, unknown>);
    }
    // Primitive — keep original string
    return value;
  } catch {
    return value;
  }
}

/** Recursively decode all values in a dict that are legacy JSON strings. */
function decodeLegacyDict(dict: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(dict)) {
    result[key] = decodeLegacyValue(value);
  }
  return result;
}

/**
 * Parse and decode a tool_state. Handles both:
 * - String tool_state (JSON-encoded, possibly with nested legacy encoding)
 * - Dict tool_state (already parsed, values are proper types)
 */
function parseToolState(toolState: unknown): Record<string, unknown> | null {
  if (typeof toolState === "string") {
    try {
      const parsed = JSON.parse(toolState);
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        return decodeLegacyDict(parsed as Record<string, unknown>);
      }
    } catch { /* not valid JSON */ }
    return null;
  }
  if (toolState !== null && typeof toolState === "object" && !Array.isArray(toolState)) {
    return toolState as Record<string, unknown>;
  }
  return null;
}

/** Recursively remove stale keys from a tool_state dict. */
function stripStaleKeys(state: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(state)) {
    if (STALE_KEYS.has(key)) continue;
    result[key] = stripStaleValue(value);
  }
  return result;
}

/** Recurse into nested values (conditional dicts, repeat arrays). */
function stripStaleValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripStaleValue);
  }
  if (value !== null && typeof value === "object") {
    return stripStaleKeys(value as Record<string, unknown>);
  }
  return value;
}

/** Clean a single native step's tool_state in place. */
function cleanNativeStep(stepDef: Record<string, unknown>): void {
  const toolId = stepDef.tool_id;
  if (!toolId) return;

  const rawState = stepDef.tool_state;
  if (rawState === undefined || rawState === null) return;

  const parsed = parseToolState(rawState);
  if (!parsed) return;

  stepDef.tool_state = stripStaleKeys(parsed);
}

/** Recursively clean all steps in a native workflow dict. */
function cleanNativeSteps(workflowDict: Record<string, unknown>): void {
  const steps = workflowDict.steps as Record<string, Record<string, unknown>> | undefined;
  if (!steps) return;

  for (const stepDef of Object.values(steps)) {
    // Subworkflow steps don't have meaningful tool_state — recurse into the
    // embedded subworkflow's steps instead.
    if (stepDef.type === "subworkflow" && stepDef.subworkflow) {
      cleanNativeSteps(stepDef.subworkflow as Record<string, unknown>);
      continue;
    }
    cleanNativeStep(stepDef);
  }
}

import { detectFormat } from "./detect-format.js";

/**
 * Clean a workflow — strip stale keys and decode legacy tool_state encoding.
 * Mutates and returns the workflow dict. Format2 workflows pass through unchanged.
 */
export function cleanWorkflow(workflowDict: Record<string, unknown>): Record<string, unknown> {
  if (detectFormat(workflowDict) === "format2") {
    return workflowDict;
  }
  cleanNativeSteps(workflowDict);
  return workflowDict;
}
