/**
 * ConnectedValue injection and stripping for workflow state dicts.
 *
 * Thin wrappers around walkNativeState that inject or strip
 * ConnectedValue markers. Mutate state in-place for caller compat.
 *
 * Port of Python galaxy.tool_util.workflow_state._state_merge.
 * Tree-walking helpers live in walk-helpers.ts; re-exported here
 * for backward compatibility.
 */

import type { ToolParameterModel } from "../schema/bundle-types.js";
import type { NormalizedFormat2StepInput } from "./normalized/format2.js";
import { CONNECTED_VALUE, isConnectedValue } from "./runtime-markers.js";
import { walkNativeState, SKIP_VALUE } from "./walker.js";
import {
  flatStatePath,
  keysStartingWith,
  repeatInputsToArray,
  selectWhichWhen,
} from "./walk-helpers.js";

// Re-export helpers so existing importers don't break
export { flatStatePath, keysStartingWith, repeatInputsToArray, selectWhichWhen };

// --- Connection-key construction ---

/**
 * Build the connections map for a format2 step's `in` block so a verbatim
 * native `tool_state` block can be validated through the native path.
 *
 * injectConnectionsIntoState consumes only the *keys* of this map — it matches
 * them against state paths and substitutes ConnectedValue markers — so the value
 * is a bare presence marker. The connection's source is intentionally irrelevant
 * here; encoding it would be dead computation.
 */
export function nativeConnectionsFromFormat2In(
  inputs: readonly NormalizedFormat2StepInput[],
): Record<string, true> {
  const connections: Record<string, true> = {};
  for (const input of inputs) {
    if (input.id && input.source) {
      connections[input.id] = true;
    }
  }
  return connections;
}

// --- Main injection function ---

export interface InjectConnectionsOptions {
  /**
   * Target the `workflow_step_linked` representation. A connected `multiple`
   * select is encoded there as a single-element list `[{ConnectedValue}]` (the
   * select-multiple linked schema accepts ConnectedValue only as an array item,
   * per Galaxy's parameter_specification.yml), whereas every other parameter —
   * and the native representation — uses a bare `{ConnectedValue}`.
   */
  linked?: boolean;
}

function isMultipleSelect(input: ToolParameterModel): boolean {
  const p = input as { parameter_type?: string; multiple?: boolean };
  return p.parameter_type === "gx_select" && p.multiple === true;
}

/**
 * Inject ConnectedValue markers into a state dict for all connections.
 *
 * Uses walkNativeState with a leaf callback that replaces connected
 * leaves with ConnectedValue markers, then reassigns the input state
 * in-place to preserve the mutation contract callers expect.
 *
 * @returns remaining unmatched connection paths (empty if all consumed)
 */
export function injectConnectionsIntoState(
  toolInputs: ToolParameterModel[],
  state: Record<string, unknown>,
  connections: Record<string, unknown>,
  options?: InjectConnectionsOptions,
): Record<string, unknown> {
  const remaining = { ...connections };
  const result = walkNativeState(
    connections,
    toolInputs,
    state,
    (input, value, statePath) => {
      if (statePath in remaining) {
        delete remaining[statePath];
        return options?.linked && isMultipleSelect(input)
          ? [{ ...CONNECTED_VALUE }]
          : { ...CONNECTED_VALUE };
      }
      return value === undefined ? SKIP_VALUE : value;
    },
    { preserveUnknownKeys: true },
  );
  for (const key of Object.keys(state)) delete state[key];
  Object.assign(state, result);
  return remaining;
}

// --- ConnectedValue stripping ---

/**
 * Strip ConnectedValue markers from a state dict using the parameter tree.
 *
 * Uses walkNativeState with a leaf callback that omits ConnectedValue
 * entries via SKIP_VALUE, then reassigns the input state in-place to
 * preserve the mutation contract callers expect.
 */
export function stripConnectedValues(
  toolInputs: ToolParameterModel[],
  state: Record<string, unknown>,
): void {
  const cleaned = walkNativeState(
    {},
    toolInputs,
    state,
    (_input, value) =>
      isConnectedValue(value) ? SKIP_VALUE : value === undefined ? SKIP_VALUE : value,
    { preserveUnknownKeys: true },
  );
  for (const key of Object.keys(state)) delete state[key];
  Object.assign(state, cleaned);
}
