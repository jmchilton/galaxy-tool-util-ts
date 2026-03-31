/**
 * Detect legacy replacement parameters (${...}) in workflow tool state.
 *
 * Port of Python galaxy.tool_util.workflow_state.legacy_parameters.
 *
 * Walks the parameter tree type-aware: ${...} in text/hidden fields is
 * MAYBE (could be literal), in typed fields (integer, float, etc.) is YES
 * (definitely a replacement). Validation should be skipped when YES.
 */

import type {
  ToolParameterModel,
  ConditionalParameterModel,
  RepeatParameterModel,
  SectionParameterModel,
} from "../schema/bundle-types.js";

export type ReplacementClassification = "yes" | "maybe_assumed_no" | "no";

/** Check if a string value contains legacy replacement syntax. */
function _isReplacementParam(value: unknown): boolean {
  return typeof value === "string" && value.includes("${");
}

const _MAYBE_TYPES = new Set(["gx_text", "gx_hidden"]);
const _SKIP_TYPES = new Set(["gx_data", "gx_data_collection", "gx_rules"]);

function _classifyHit(parameterType: string): "yes" | "maybe_assumed_no" {
  if (_MAYBE_TYPES.has(parameterType)) return "maybe_assumed_no";
  return "yes";
}

/**
 * Scan a state dict for replacement parameters, walking the tool input tree
 * for type-aware classification.
 *
 * Returns "yes" if any typed field contains ${...} (skip validation),
 * "maybe_assumed_no" if only text/hidden fields have it (still validate),
 * "no" if no replacement params found.
 */
export function scanForReplacements(
  toolInputs: ToolParameterModel[],
  state: Record<string, unknown>,
): ReplacementClassification {
  let hasYes = false;
  let hasMaybe = false;

  _scanParams(toolInputs, state, (classification) => {
    if (classification === "yes") hasYes = true;
    else hasMaybe = true;
  });

  if (hasYes) return "yes";
  if (hasMaybe) return "maybe_assumed_no";
  return "no";
}

function _scanParams(
  toolInputs: ToolParameterModel[],
  state: Record<string, unknown>,
  onHit: (classification: "yes" | "maybe_assumed_no") => void,
): void {
  for (const param of toolInputs) {
    const paramType = param.parameter_type;

    if (paramType === "gx_conditional") {
      const cond = param as ConditionalParameterModel;
      const condState = state[param.name] as Record<string, unknown> | undefined;
      if (condState) {
        // Check test parameter
        const testValue = condState[cond.test_parameter.name];
        if (_isReplacementParam(testValue) && !_SKIP_TYPES.has(cond.test_parameter.parameter_type)) {
          onHit(_classifyHit(cond.test_parameter.parameter_type));
        }
        // Check all when branches (scan all since we can't always determine the active branch)
        for (const when of cond.whens) {
          _scanParams(when.parameters, condState, onHit);
        }
      }
    } else if (paramType === "gx_repeat") {
      const repeat = param as RepeatParameterModel;
      const repeatState = state[param.name];
      if (Array.isArray(repeatState)) {
        for (const instance of repeatState) {
          if (instance && typeof instance === "object") {
            _scanParams(repeat.parameters, instance as Record<string, unknown>, onHit);
          }
        }
      }
    } else if (paramType === "gx_section") {
      const section = param as SectionParameterModel;
      const sectionState = state[param.name] as Record<string, unknown> | undefined;
      if (sectionState) {
        _scanParams(section.parameters, sectionState, onHit);
      }
    } else {
      // Leaf parameter
      if (_SKIP_TYPES.has(paramType)) continue;
      const value = state[param.name];
      if (_isReplacementParam(value)) {
        onHit(_classifyHit(paramType));
      }
    }
  }
}
