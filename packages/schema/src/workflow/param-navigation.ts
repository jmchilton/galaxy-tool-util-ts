/**
 * Utility for navigating a ToolParameterModel tree by path segments.
 *
 * Used by LSP language servers to resolve completion and hover context
 * inside tool_state YAML, including conditional branch filtering.
 */

import type { ToolParameterModel } from "../schema/bundle-types.js";
import {
  isConditionalParam,
  isRepeatParam,
  isSectionParam,
} from "../schema/type-guards.js";
import { selectWhichWhen } from "./walk-helpers.js";

export interface ParamNavigationResult {
  /** The param at the final path segment (undefined if path doesn't resolve). */
  param: ToolParameterModel | undefined;
  /** All params available at the final level — used for name completions. */
  availableParams: ToolParameterModel[];
}

/**
 * Navigate a tool parameter tree by path segments.
 *
 * - Sections: recurse into `parameters`
 * - Repeats: skip numeric path segments, recurse into `parameters`
 * - Conditionals: call selectWhichWhen(conditional, stateAtCurrentLevel),
 *   fall back to all branches merged if no state provided or no match
 *
 * `state` is the full state dict at the top of the tree; the function
 * navigates it in parallel with the param tree to resolve nested conditionals.
 */
export function findParamAtPath(
  params: ToolParameterModel[],
  path: (string | number)[],
  state?: Record<string, unknown>,
): ParamNavigationResult {
  if (path.length === 0) return { param: undefined, availableParams: params };

  const [head, ...tail] = path;

  // Skip numeric segments (repeat instance indices)
  if (typeof head === "number") return findParamAtPath(params, tail, state);

  const match = params.find((p) => p.name === head);
  if (!match) return { param: undefined, availableParams: params };

  if (tail.length === 0) return { param: match, availableParams: params };

  if (isSectionParam(match)) {
    return findParamAtPath(match.parameters, tail, _getSubState(state, head));
  }

  if (isRepeatParam(match)) {
    return findParamAtPath(match.parameters, tail, _getSubState(state, head));
  }

  if (isConditionalParam(match)) {
    const conditionalState = _getSubState(state, head);
    // Only filter to a specific branch when state was provided — if no state
    // is available (e.g. user hasn't set the discriminator yet) show all
    // branch params so completions aren't artificially restricted.
    const activeWhen = conditionalState !== undefined
      ? selectWhichWhen(match, conditionalState)
      : null;
    const branchParams = activeWhen
      ? activeWhen.parameters
      : match.whens.flatMap((w) => w.parameters);
    return findParamAtPath(
      [match.test_parameter, ...branchParams],
      tail,
      conditionalState,
    );
  }

  return { param: undefined, availableParams: params };
}

function _getSubState(
  state: Record<string, unknown> | undefined,
  key: string,
): Record<string, unknown> | undefined {
  const val = state?.[key];
  return val && typeof val === "object" && !Array.isArray(val)
    ? (val as Record<string, unknown>)
    : undefined;
}
