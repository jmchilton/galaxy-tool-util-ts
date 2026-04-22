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

import type { ToolParameterModel } from "../schema/bundle-types.js";
import {
  NO_DEFAULT,
  coerceTextNullIfNeeded,
  scalarParameterDefault,
} from "../schema/parameter-defaults.js";
import { SKIP_VALUE, walkNativeState } from "./walker.js";

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
): Record<string, unknown> {
  return walkNativeState(
    {},
    toolInputs,
    currentState,
    (param, value) => {
      if (value === undefined) {
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
