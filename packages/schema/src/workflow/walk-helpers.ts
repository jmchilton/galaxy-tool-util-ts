/**
 * Pure helper functions for walking Galaxy parameter trees.
 *
 * Extracted from state-merge.ts to break a circular dependency:
 * walker.ts needs these helpers, and state-merge.ts needs walkNativeState.
 *
 * Ported from Python galaxy.tool_util.parameters.visitor.
 */

import type {
  ConditionalParameterModel,
  ConditionalWhen,
  BooleanParameterModel,
  SelectParameterModel,
} from "../schema/bundle-types.js";
import { parseBool } from "./coercions.js";

// --- Path helpers ---

/** Build flat pipe-separated state path: `name` or `prefix|name`. */
export function flatStatePath(name: string, prefix?: string): string {
  return prefix != null ? `${prefix}|${name}` : name;
}

/** Filter a flat key-value map to keys starting with a given prefix. */
export function keysStartingWith<T>(map: Record<string, T>, prefix: string): Record<string, T> {
  const result: Record<string, T> = {};
  for (const [key, value] of Object.entries(map)) {
    if (key.startsWith(prefix)) {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Split flat connection keys for a repeat into per-instance arrays.
 *
 * Connection keys use the pattern `repeatName_N|paramName`.
 * Returns an array of per-instance connection dicts.
 */
export function repeatInputsToArray<T>(
  statePath: string,
  inputs: Record<string, T>,
): Record<string, T>[] {
  const repeatInputs = keysStartingWith(inputs, statePath + "_");
  let highestCount = -1;
  for (const key of Object.keys(repeatInputs)) {
    const numStr = key.slice(statePath.length + 1).split("|")[0];
    const num = parseInt(numStr, 10);
    if (!isNaN(num) && num > highestCount) {
      highestCount = num;
    }
  }

  const params: Record<string, T>[] = [];
  for (let i = 0; i <= highestCount; i++) {
    params.push({});
  }
  for (const [key, value] of Object.entries(repeatInputs)) {
    const numStr = key.slice(statePath.length + 1).split("|")[0];
    const num = parseInt(numStr, 10);
    if (!isNaN(num)) {
      params[num][key] = value;
    }
  }
  return params;
}

// --- Conditional branch selection ---

/**
 * Select the matching ConditionalWhen for a conditional state dict.
 *
 * Matches the test parameter's value in state against each when's
 * discriminator. Falls back to the default when if no match found.
 * Returns null if no match at all (graceful degradation).
 */
export function selectWhichWhen(
  conditional: ConditionalParameterModel,
  state: Record<string, unknown>,
): ConditionalWhen | null {
  const testParam = conditional.test_parameter;
  const testValue = state[testParam.name];

  // Try exact match first
  for (const when of conditional.whens) {
    if (_testValueMatchesDiscriminator(testParam, testValue, when.discriminator)) {
      return when;
    }
  }

  // Fall back to default when
  for (const when of conditional.whens) {
    if (when.is_default_when) {
      return when;
    }
  }

  return null;
}

function _testValueMatchesDiscriminator(
  testParam: BooleanParameterModel | SelectParameterModel,
  testValue: unknown,
  discriminator: string | boolean,
): boolean {
  if (testParam.parameter_type === "gx_boolean") {
    // Boolean coercion: handle string "true"/"false"/"True"/"False" and actual booleans
    const boolValue = parseBool(testValue);
    const discBool = typeof discriminator === "boolean" ? discriminator : parseBool(discriminator);
    return boolValue === discBool;
  }
  // Select: string comparison
  return String(testValue) === String(discriminator);
}
