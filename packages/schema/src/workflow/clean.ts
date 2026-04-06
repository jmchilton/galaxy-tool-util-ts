/**
 * Workflow tool_state cleaning — strip stale keys and decode legacy encoding.
 *
 * Port of Galaxy's workflow_state clean operation. Removes bookkeeping keys
 * (__page__, __rerun_remap_job_id__), runtime leak keys (chromInfo, __input_ext),
 * and decodes JSON-encoded tool_state strings into proper dicts.
 *
 * Also provides a tool-definition-aware strip (`stripStaleKeysToolAware`)
 * that mirrors Galaxy's `clean._strip_recursive`: uses the declared
 * parameter tree to drop any undeclared key (runtime leaks, stale-branch
 * params, tool-upgrade residue) honoring conditional branch selection,
 * repeat expansion, and section nesting.
 */

import type { ToolParameterModel } from "../schema/bundle-types.js";
import type { CleanStepResult } from "./report-models.js";
import { cleanDisplayLabel } from "./report-models.js";
import { detectFormat } from "./detect-format.js";
import { walkNativeState, SKIP_VALUE } from "./walker.js";

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
    } catch {
      /* not valid JSON */
    }
    return null;
  }
  if (toolState !== null && typeof toolState === "object" && !Array.isArray(toolState)) {
    return toolState as Record<string, unknown>;
  }
  return null;
}

/** Recursively remove stale keys from a tool_state dict, tracking removed top-level keys. */
function stripStaleKeys(
  state: Record<string, unknown>,
  removedKeys?: string[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(state)) {
    if (STALE_KEYS.has(key)) {
      removedKeys?.push(key);
      continue;
    }
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

/** Clean a single native step's tool_state in place, returning step result info. */
function cleanNativeStep(stepDef: Record<string, unknown>, stepLabel: string): CleanStepResult {
  const toolId = (stepDef.tool_id as string) ?? null;
  const toolVersion = (stepDef.tool_version as string) ?? null;

  if (!toolId) {
    return {
      step: stepLabel,
      tool_id: null,
      version: null,
      removed_keys: [],
      skipped: true,
      skip_reason: "no tool_id",
      display_label: cleanDisplayLabel(null, null),
    };
  }

  const rawState = stepDef.tool_state;
  if (rawState === undefined || rawState === null) {
    return {
      step: stepLabel,
      tool_id: toolId,
      version: toolVersion,
      removed_keys: [],
      skipped: true,
      skip_reason: "no tool_state",
      display_label: cleanDisplayLabel(toolId, toolVersion),
    };
  }

  const parsed = parseToolState(rawState);
  if (!parsed) {
    return {
      step: stepLabel,
      tool_id: toolId,
      version: toolVersion,
      removed_keys: [],
      skipped: true,
      skip_reason: "unparseable tool_state",
      display_label: cleanDisplayLabel(toolId, toolVersion),
    };
  }

  const removedKeys: string[] = [];
  stepDef.tool_state = stripStaleKeys(parsed, removedKeys);

  return {
    step: stepLabel,
    tool_id: toolId,
    version: toolVersion,
    removed_keys: removedKeys,
    skipped: false,
    skip_reason: "",
    display_label: cleanDisplayLabel(toolId, toolVersion),
  };
}

/** Recursively clean all steps in a native workflow dict. */
function cleanNativeSteps(workflowDict: Record<string, unknown>, prefix = ""): CleanStepResult[] {
  const steps = workflowDict.steps as Record<string, Record<string, unknown>> | undefined;
  if (!steps) return [];
  const results: CleanStepResult[] = [];

  for (const [key, stepDef] of Object.entries(steps)) {
    const stepLabel = prefix ? `${prefix}${key}` : key;
    if (stepDef.type === "subworkflow" && stepDef.subworkflow) {
      results.push(
        ...cleanNativeSteps(stepDef.subworkflow as Record<string, unknown>, `${stepLabel}.`),
      );
      continue;
    }
    results.push(cleanNativeStep(stepDef, stepLabel));
  }
  return results;
}

/**
 * Strip all keys from a native step's `tool_state` that are not declared in
 * the tool's parameter tree. Mirrors Galaxy's `clean._strip_recursive`.
 *
 * Uses `walkNativeState` with an identity leaf callback: the walker builds
 * its output from declared params only, silently dropping undeclared keys
 * (runtime leaks like `|__identifier__`, stale-branch conditional params,
 * tool-upgrade residue). Missing declared leaves are omitted via
 * `SKIP_VALUE` rather than written back as `undefined`.
 *
 * Used by `roundtripValidate` to pre-clean the original workflow before
 * diffing (matches Galaxy's `roundtrip_validate(clean_stale=True)`
 * default).
 *
 * @param state - Raw tool_state dict (parsed, not a JSON string)
 * @param toolInputs - Declared parameter models from the tool definition
 * @param inputConnections - Flat connection map; only used for repeat
 *   instance-count inference. Pass `{}` if not relevant.
 */
export function stripStaleKeysToolAware(
  state: Record<string, unknown>,
  toolInputs: ToolParameterModel[],
  inputConnections: Record<string, unknown> = {},
): Record<string, unknown> {
  return walkNativeState(inputConnections, toolInputs, state, (_input, value) =>
    value === undefined ? SKIP_VALUE : value,
  );
}

export interface CleanWorkflowResult {
  workflow: Record<string, unknown>;
  results: CleanStepResult[];
}

/**
 * Clean a workflow — strip stale keys and decode legacy tool_state encoding.
 * Mutates the workflow dict in place. Format2 workflows pass through unchanged.
 * Returns both the mutated workflow and per-step clean results.
 */
export function cleanWorkflow(workflowDict: Record<string, unknown>): CleanWorkflowResult {
  if (detectFormat(workflowDict) === "format2") {
    return { workflow: workflowDict, results: [] };
  }
  const results = cleanNativeSteps(workflowDict);
  return { workflow: workflowDict, results };
}
