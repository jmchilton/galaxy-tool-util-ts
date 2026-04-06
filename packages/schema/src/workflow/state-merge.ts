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

// --- Main injection function ---

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
): Record<string, unknown> {
  const remaining = { ...connections };
  const result = walkNativeState(
    connections,
    toolInputs,
    state,
    (_input, value, statePath) => {
      if (statePath in remaining) {
        delete remaining[statePath];
        return { ...CONNECTED_VALUE };
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
