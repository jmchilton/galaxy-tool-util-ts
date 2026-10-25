/**
 * Expand defaults into a tool state dict.
 *
 * Port of `galaxy.tool_util.parameters.convert.fill_static_defaults` (partial=True).
 * Pure, idempotent. Reads currentState so conditional branches honor the user's
 * active `test_value`, repeats preserve existing instances, and sections recurse
 * into present subdicts. Does not validate. Does not pre-fill data /
 * data_collection (non-optional) / data_column / baseurl / color / directory_uri /
 * group_tag / rules inputs — the user must wire those explicitly.
 *
 * Designed for user-invoked "expand defaults" actions and scripting use cases
 * where an explicit dump of defaults is wanted. Not used by the step-skeleton
 * generator (which builds minimal state via `buildMinimalToolState`).
 *
 * Divergence from Python: when a conditional's `test_value` matches no `when`
 * and no branch is flagged `is_default_when`, Python raises. Here, we stay
 * lenient via the existing walker semantics — the test parameter still gets
 * its default filled, but no branch defaults are emitted. This avoids crashing
 * on corrupt/partially-authored workflows, which matters for a user-invoked
 * UI action.
 */

import type {
  ConditionalParameterModel,
  RepeatParameterModel,
  SectionParameterModel,
  ToolParameterModel,
} from "../schema/bundle-types.js";
import {
  NO_DEFAULT,
  coerceTextNullIfNeeded,
  scalarParameterDefault,
} from "../schema/parameter-defaults.js";
import { SKIP_VALUE, walkNativeState } from "./walker.js";

export interface ExpandDefaultsOptions {
  /** Flat state paths (`a|b`, `rep_0|x`) fed by connections; left absent rather than defaulted. */
  connectedPaths?: ReadonlySet<string>;
}

/**
 * Return a new tool state dict with defaults filled in for any parameter
 * absent from `currentState`. Does not validate.
 *
 * Idempotent: `expandToolStateDefaults(t, expandToolStateDefaults(t, s))`
 * deep-equals `expandToolStateDefaults(t, s)`.
 *
 * Honors the user's active conditional `test_value` (only the chosen branch's
 * defaults are filled). Existing repeat instances are preserved and recursed
 * into; empty repeats are padded to `repeat.min`. Sections present in state
 * are recursed; absent sections are created as `{}` and filled.
 *
 * Unknown keys (including bookkeeping like `__current_case__`) are preserved
 * in the output.
 */
export function expandToolStateDefaults(
  toolInputs: ToolParameterModel[],
  currentState: Record<string, unknown>,
  options: ExpandDefaultsOptions = {},
): Record<string, unknown> {
  return walkNativeState(
    {},
    toolInputs,
    currentState,
    (param, value, statePath) => {
      if (value === undefined) {
        if (options.connectedPaths?.has(statePath)) return SKIP_VALUE;
        const def = scalarParameterDefault(param);
        if (def === NO_DEFAULT) return SKIP_VALUE;
        return def;
      }
      const coerced = coerceTextNullIfNeeded(param, value);
      if (coerced !== NO_DEFAULT) return coerced;
      return value;
    },
    { preserveUnknownKeys: true, repeatMinPad: true },
  );
}

/**
 * Report reachable conditionals (absent containers included) whose test parameter is absent.
 * Galaxy's import raises `KeyError` on these; absent leaves are tolerated.
 */
export function findMissingConditionalTests(
  toolInputs: ToolParameterModel[],
  state: Record<string, unknown>,
): string[] {
  const testParams = new Set<ToolParameterModel>();
  collectTestParams(toolInputs, testParams);
  const missing: string[] = [];
  walkNativeState({}, toolInputs, state, (param, value, statePath) => {
    if (value === undefined && testParams.has(param)) {
      const parent = statePath.slice(0, statePath.length - param.name.length - 1);
      missing.push(`${parent}: missing conditional test parameter '${param.name}'`);
    }
    return SKIP_VALUE;
  });
  return missing;
}

function collectTestParams(inputs: ToolParameterModel[], out: Set<ToolParameterModel>): void {
  for (const p of inputs) {
    if (p.parameter_type === "gx_conditional") {
      const cond = p as ConditionalParameterModel;
      out.add(cond.test_parameter);
      for (const when of cond.whens) collectTestParams(when.parameters, out);
    } else if (p.parameter_type === "gx_repeat" || p.parameter_type === "gx_section") {
      collectTestParams((p as RepeatParameterModel | SectionParameterModel).parameters, out);
    }
  }
}
