/**
 * Workflow tool_state cleaning — strip stale keys and decode legacy encoding.
 *
 * Port of Galaxy's workflow_state clean operation. Removes bookkeeping keys
 * (__page__, __rerun_remap_job_id__), runtime leak keys (chromInfo, __input_ext),
 * and decodes JSON-encoded tool_state strings into proper dicts.
 *
 * Also strips Galaxy-injected structural properties (`uuid`, `errors`) from both
 * native and format2 workflow and step dicts.
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
import { walkNativeState, walkFormat2State, SKIP_VALUE } from "./walker.js";
import type { ToolInputsResolver } from "./normalized/stateful-runner.js";

/** Keys injected by Galaxy's tool form machinery — never meaningful in saved workflows. */
const BOOKKEEPING_KEYS = new Set(["__page__", "__rerun_remap_job_id__"]);

/** Canonical position keys — only left/top are kept; browser-computed extras are stripped. */
const POSITION_CANONICAL_KEYS = new Set(["left", "top"]);

/** Keys leaked from runtime context into saved state. */
const RUNTIME_LEAK_KEYS = new Set(["chromInfo", "__input_ext"]);

/** Internal indexing keys within conditionals and repeats. */
const INTERNAL_KEYS = new Set(["__current_case__", "__index__"]);

const STALE_KEYS = new Set([...BOOKKEEPING_KEYS, ...RUNTIME_LEAK_KEYS, ...INTERNAL_KEYS]);

/**
 * Galaxy-injected structural properties — present on workflow and step dicts
 * in both native and format2 exports, but not meaningful in saved/shared
 * workflows. Stripped from workflow-level and step-level dicts.
 *
 * `position` is intentionally excluded — it is a legitimate workflow property
 * that VS Code and other tools may use.
 *
 * `errors` is always stripped. `uuid` is stripped by default but can be
 * suppressed with `CleanWorkflowOptions.skipUuid`.
 */
const ALWAYS_STRIP_STEP_KEYS = new Set(["errors"]);

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

/**
 * Strip Galaxy-injected structural properties from a step dict in-place.
 * Always removes `errors`; removes `uuid` unless `skipUuid` is true.
 * Returns the list of keys actually removed.
 */
function stripStructuralStep(stepDict: Record<string, unknown>, skipUuid: boolean): string[] {
  const removed: string[] = [];
  for (const key of ALWAYS_STRIP_STEP_KEYS) {
    if (key in stepDict) {
      delete stepDict[key];
      removed.push(key);
    }
  }
  if (!skipUuid && "uuid" in stepDict) {
    delete stepDict.uuid;
    removed.push("uuid");
  }
  return removed;
}

/** Clean a single native step's tool_state in place, returning step result info. */
async function cleanNativeStep(
  stepDef: Record<string, unknown>,
  stepLabel: string,
  opts: CleanWorkflowOptions,
): Promise<CleanStepResult> {
  const toolId = (stepDef.tool_id as string) ?? null;
  const toolVersion = (stepDef.tool_version as string) ?? null;

  // Strip structural properties from the step dict itself (uuid, errors)
  const removedKeys: string[] = stripStructuralStep(stepDef, opts.skipUuid ?? false);

  if (!toolId) {
    return {
      step: stepLabel,
      tool_id: null,
      version: null,
      removed_keys: removedKeys,
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
      removed_keys: removedKeys,
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
      removed_keys: removedKeys,
      skipped: true,
      skip_reason: "unparseable tool_state",
      display_label: cleanDisplayLabel(toolId, toolVersion),
    };
  }

  let cleaned = stripStaleKeys(parsed, removedKeys);

  // Tool-aware strip: drop keys not in the tool's parameter tree
  if (opts.toolInputsResolver) {
    const inputs = opts.toolInputsResolver(toolId, toolVersion);
    if (inputs) {
      const inputConnections = (stepDef.input_connections ?? {}) as Record<string, unknown>;
      cleaned = stripStaleKeysToolAware(cleaned, inputs, inputConnections);
    }
  }

  stepDef.tool_state = cleaned;

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

/** Normalize a step's position dict to only canonical keys (left, top). */
function normalizeStepPosition(stepDef: Record<string, unknown>): void {
  const pos = stepDef.position;
  if (pos !== null && typeof pos === "object" && !Array.isArray(pos)) {
    for (const key of Object.keys(pos as Record<string, unknown>)) {
      if (!POSITION_CANONICAL_KEYS.has(key)) {
        delete (pos as Record<string, unknown>)[key];
      }
    }
  }
}

/** Recursively clean all steps in a native workflow dict. */
async function cleanNativeSteps(
  workflowDict: Record<string, unknown>,
  opts: CleanWorkflowOptions,
  prefix = "",
): Promise<CleanStepResult[]> {
  const steps = workflowDict.steps as Record<string, Record<string, unknown>> | undefined;
  if (!steps) return [];
  const results: CleanStepResult[] = [];

  for (const [key, stepDef] of Object.entries(steps)) {
    const stepLabel = prefix ? `${prefix}${key}` : key;
    normalizeStepPosition(stepDef);
    if (stepDef.type === "subworkflow" && stepDef.subworkflow) {
      results.push(
        ...(await cleanNativeSteps(
          stepDef.subworkflow as Record<string, unknown>,
          opts,
          `${stepLabel}.`,
        )),
      );
      continue;
    }
    results.push(await cleanNativeStep(stepDef, stepLabel, opts));
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

/**
 * Strip all keys from a format2 step's `state` that are not declared in
 * the tool's parameter tree. Format2 analogue of `stripStaleKeysToolAware`.
 */
function stripStaleKeysToolAwareFormat2(
  state: Record<string, unknown>,
  toolInputs: ToolParameterModel[],
): Record<string, unknown> {
  return walkFormat2State(toolInputs, state, (_input, value) =>
    value === undefined ? SKIP_VALUE : value,
  );
}

/** Clean a single format2 step dict in place, returning step result info. */
async function cleanFormat2Step(
  stepDef: Record<string, unknown>,
  stepLabel: string,
  opts: CleanWorkflowOptions,
): Promise<CleanStepResult> {
  const toolId = (stepDef.tool_id as string | null | undefined) ?? null;
  const toolVersion = (stepDef.tool_version as string | null | undefined) ?? null;

  const removedKeys: string[] = stripStructuralStep(stepDef, opts.skipUuid ?? false);

  // Tool-aware strip on `state` field
  if (opts.toolInputsResolver && toolId) {
    const inputs = opts.toolInputsResolver(toolId, toolVersion);
    if (inputs) {
      if (stepDef.state && typeof stepDef.state === "object" && !Array.isArray(stepDef.state)) {
        stepDef.state = stripStaleKeysToolAwareFormat2(
          stepDef.state as Record<string, unknown>,
          inputs,
        );
      }
      if (
        stepDef.tool_state &&
        typeof stepDef.tool_state === "object" &&
        !Array.isArray(stepDef.tool_state)
      ) {
        stepDef.tool_state = stripStaleKeysToolAwareFormat2(
          stepDef.tool_state as Record<string, unknown>,
          inputs,
        );
      }
    }
  }

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

/** Clean all steps in a format2 workflow dict. Steps may be a list or a dict. */
async function cleanFormat2Steps(
  workflowDict: Record<string, unknown>,
  opts: CleanWorkflowOptions,
): Promise<CleanStepResult[]> {
  const rawSteps = workflowDict.steps;
  if (!rawSteps) return [];

  const results: CleanStepResult[] = [];

  if (Array.isArray(rawSteps)) {
    for (let i = 0; i < rawSteps.length; i++) {
      const stepDef = rawSteps[i] as Record<string, unknown>;
      const label =
        (stepDef.label as string | undefined) ?? (stepDef.id as string | undefined) ?? String(i);
      results.push(await cleanFormat2Step(stepDef, label, opts));
    }
  } else if (rawSteps !== null && typeof rawSteps === "object") {
    for (const [key, stepDef] of Object.entries(rawSteps as Record<string, unknown>)) {
      const step = stepDef as Record<string, unknown>;
      const label = (step.label as string | undefined) ?? (step.id as string | undefined) ?? key;
      results.push(await cleanFormat2Step(step, label, opts));
    }
  }

  return results;
}

export interface CleanWorkflowOptions {
  toolInputsResolver?: ToolInputsResolver;
  /**
   * When true, skip stripping `uuid` from workflow and step dicts.
   * Defaults to false (strip uuid).
   */
  skipUuid?: boolean;
}

export interface CleanWorkflowResult {
  workflow: Record<string, unknown>;
  results: CleanStepResult[];
}

/**
 * Clean a workflow — strip structural properties (`uuid`, `errors`), stale
 * tool_state bookkeeping keys, and decode legacy tool_state encoding.
 *
 * Mutates the workflow dict in place. Handles both native and format2 formats.
 * Returns both the mutated workflow and per-step clean results.
 *
 * When `opts.toolInputsResolver` is provided, also performs tool-aware stale
 * key removal: drops any `tool_state` / `state` keys not declared in the
 * tool's parameter tree (native via `stripStaleKeysToolAware`, format2 via
 * `walkFormat2State`). Steps whose tool is not found in the resolver are
 * left unchanged.
 */
export async function cleanWorkflow(
  workflowDict: Record<string, unknown>,
  opts: CleanWorkflowOptions = {},
): Promise<CleanWorkflowResult> {
  // Strip workflow-level uuid from both formats
  if (!opts.skipUuid) delete workflowDict.uuid;

  if (detectFormat(workflowDict) === "format2") {
    const results = await cleanFormat2Steps(workflowDict, opts);
    return { workflow: workflowDict, results };
  }

  const results = await cleanNativeSteps(workflowDict, opts);
  return { workflow: workflowDict, results };
}
