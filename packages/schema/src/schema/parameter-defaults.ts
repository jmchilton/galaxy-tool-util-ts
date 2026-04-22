/**
 * Per-parameter-type default emission.
 *
 * Port of scalar branches of `galaxy.tool_util.parameters.convert._fill_default_for`.
 * Container types (conditional, repeat, section) are handled by the walker in
 * `workflow/fill-defaults.ts`, not here.
 */

import type {
  DrillDownOption,
  DrillDownParameterModel,
  SelectParameterModel,
  ToolParameterModel,
} from "./bundle-types.js";

/** Sentinel: return from scalarParameterDefault to leave the key absent. */
export const NO_DEFAULT: unique symbol = Symbol("NO_DEFAULT");

/**
 * First selected option value (single-select), else first option when required,
 * else null. Mirrors `SelectParameterModel.default_value` in Python.
 */
function selectDefaultSingle(param: SelectParameterModel): string | null {
  if (!param.options || param.options.length === 0) return null;
  for (const opt of param.options) {
    if (opt.selected) return opt.value;
  }
  if (!param.optional) return param.options[0].value;
  return null;
}

/** Selected option values (multi-select). Mirrors `default_values` in Python. */
function selectDefaultMultiple(param: SelectParameterModel): string[] | null {
  if (!param.options) return null;
  return param.options.filter((o) => o.selected).map((o) => o.value);
}

/** Walk drill-down option tree collecting values of selected nodes (any depth). */
function selectedDrillDownOptions(options: DrillDownOption[]): string[] {
  const out: string[] = [];
  const walk = (opts: DrillDownOption[]) => {
    for (const opt of opts) {
      if (opt.selected && opt.value) out.push(opt.value);
      if (opt.options && opt.options.length > 0) walk(opt.options);
    }
  };
  walk(options);
  return out;
}

function drillDownDefaultSingle(param: DrillDownParameterModel): string | null {
  const selected = selectedDrillDownOptions(param.options);
  return selected.length > 0 ? selected[0] : null;
}

function drillDownDefaultMultiple(param: DrillDownParameterModel): string[] | null {
  if (!param.options || param.options.length === 0) return null;
  return selectedDrillDownOptions(param.options);
}

/**
 * Return the default value to emit for a scalar (leaf) parameter when the key
 * is absent from tool state, or NO_DEFAULT to leave the key absent.
 *
 * Mirrors `_fill_default_for` scalar branches in convert.py. Container types
 * (gx_conditional, gx_repeat, gx_section) are not handled here — they are
 * the walker's concern. CWL parameter types fall through to NO_DEFAULT.
 *
 * Dynamic-options selects (`options === null`) return NO_DEFAULT; the value
 * is resolved at runtime.
 *
 * Never emits placeholder values (e.g. RuntimeValue) for data / data_column /
 * data_collection-nonoptional / baseurl / color / directory_uri / group_tag /
 * rules — those keys stay absent so the caller wires them explicitly, rather
 * than mimicking the Galaxy UI's runtime-value scaffolding.
 */
export function scalarParameterDefault(param: ToolParameterModel): unknown | typeof NO_DEFAULT {
  switch (param.parameter_type) {
    case "gx_boolean":
      // TS schema types value as non-nullable boolean; Python tolerates None and
      // coerces via `value or False` (convert.py:348).
      return param.value;
    case "gx_integer":
    case "gx_float":
    case "gx_hidden":
      return param.value;
    case "gx_genomebuild":
      return param.optional ? null : NO_DEFAULT;
    case "gx_select": {
      if (param.options === null) return NO_DEFAULT; // dynamic
      if (param.multiple) {
        const values = selectDefaultMultiple(param);
        return values && values.length > 0 ? values : null;
      }
      return selectDefaultSingle(param);
    }
    case "gx_drill_down": {
      if (param.multiple) {
        const opts = drillDownDefaultMultiple(param);
        return opts !== null ? opts : NO_DEFAULT;
      }
      const opt = drillDownDefaultSingle(param);
      return opt !== null ? opt : NO_DEFAULT;
    }
    case "gx_data_collection":
      return param.optional ? null : NO_DEFAULT;
    case "gx_text":
      if (!param.optional) return param.value ?? "";
      return param.value;
    default:
      // gx_data, gx_data_column, gx_baseurl, gx_color, gx_directory_uri,
      // gx_group_tag, gx_rules, cwl_*, and containers (which shouldn't reach
      // here via the walker leaf callback) all fall through.
      return NO_DEFAULT;
  }
}

/**
 * Text-null coercion: if a text parameter is present with `null` and is
 * non-optional, coerce to default_value ?? "". This is the only place
 * expand-defaults mutates a present key. Idempotent because "" stays "".
 *
 * Returns the coerced value, or the sentinel to signal "no coercion needed".
 */
export function coerceTextNullIfNeeded(
  param: ToolParameterModel,
  value: unknown,
): unknown | typeof NO_DEFAULT {
  if (param.parameter_type !== "gx_text") return NO_DEFAULT;
  if (value !== null) return NO_DEFAULT;
  if (param.optional) return NO_DEFAULT;
  return param.value ?? "";
}
