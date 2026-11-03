/**
 * The `$(inputs.<name>.<key>...)` references in a user-defined tool's output
 * `label`s. Labels are not JavaScript: Galaxy fills these references in from
 * the tool state when the job is created (`galaxy.tools.expressions.labels`)
 * and keeps a reference it can't fill in as written.
 */

import type { ToolParameterModel } from "../schema/bundle-types.js";

// galaxy.tool_util_models.tool_outputs.USER_TOOL_LABEL_REFERENCE_RE
const LABEL_REFERENCE_RE = /\$\((?:inputs\.(\w+)((?:\.\w+)*)|runtime\.on_string)\)/g;
const DATASET_LABEL_KEYS = ["element_identifier", "format", "name"];
const COLLECTION_LABEL_KEYS = ["element_identifier", "name"];

export interface LabelReference {
  /** The reference as written, `$(inputs...)`. */
  text: string;
  /** The root input name, then each key. */
  keys: string[];
}

/** Every `$(inputs...)` reference in `label`. */
export function labelReferences(label: string): LabelReference[] {
  return [...label.matchAll(LABEL_REFERENCE_RE)].flatMap((m) =>
    m[1] === undefined ? [] : [{ text: m[0], keys: [m[1], ...m[2].split(".").slice(1)] }],
  );
}

/** Why a label reference is never filled in, mirroring `labels._resolve`, or null when it is. */
export function resolveLabelReference(
  keys: readonly string[],
  params: readonly ToolParameterModel[],
): string | null {
  return params.some((p) => p.name === keys[0]) ? resolveLabelFrom(keys, 0, params) : null;
}

/**
 * Why `keys[i...]` is never filled in from `scope`, or null when it is. Conditional
 * branches may declare the same name, so any parameter with the name may fill it in.
 */
function resolveLabelFrom(
  keys: readonly string[],
  i: number,
  scope: readonly ToolParameterModel[],
): string | null {
  const candidates = scope.filter((p) => p.name === keys[i]);
  if (candidates.length === 0) return `there is no '${keys[i]}' in ${keys.slice(0, i).join(".")}`;
  const problems = candidates.map((param) => labelParameterProblem(keys, i, param));
  return problems.includes(null) ? null : problems[0];
}

function labelParameterProblem(
  keys: readonly string[],
  i: number,
  param: ToolParameterModel,
): string | null {
  const rest = keys.slice(i + 1);
  const kind = param.parameter_type.replace(/^gx_/, "");
  const path = keys.slice(0, i + 1).join(".");
  const nested = (children: readonly ToolParameterModel[]) =>
    rest.length === 0
      ? `${kind} ${path} is not text; reference one of its inputs`
      : resolveLabelFrom(keys, i + 1, children);
  const endsWithOneOf = (allowed: readonly string[]) =>
    rest.length === 1 && allowed.includes(rest[0])
      ? null
      : `a ${kind} input in a label must end with one of ${allowed.join(", ")}`;
  // A multiple input's state is a list, which a label can't read.
  const unreadableList = `multiple ${kind} input ${path} can't be read in a label`;
  switch (param.parameter_type) {
    case "gx_section":
      return nested(param.parameters);
    case "gx_conditional":
      return nested([param.test_parameter, ...param.whens.flatMap((w) => w.parameters)]);
    case "gx_data":
      return param.multiple ? unreadableList : endsWithOneOf(DATASET_LABEL_KEYS);
    case "gx_data_collection":
      return endsWithOneOf(COLLECTION_LABEL_KEYS);
    case "gx_repeat":
      return "a repeat can't be read in a label";
    case "gx_select":
      if (param.multiple) return unreadableList;
      break;
  }
  return rest.length === 0 ? null : `${kind} input ${path} has no fields`;
}
