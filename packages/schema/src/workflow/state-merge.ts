/**
 * Inject ConnectedValue markers into workflow state dicts.
 *
 * Port of Python galaxy.tool_util.workflow_state._state_merge +
 * helper functions from galaxy.tool_util.parameters.visitor.
 *
 * Walks the parameter tree to match pipe-separated connection paths
 * (e.g. "queries_0|input2") to tool parameters. Handles conditionals,
 * repeats, and sections. Used by validate-workflow for both native
 * and format2 validation paths.
 */

import type {
  ToolParameterModel,
  ConditionalParameterModel,
  ConditionalWhen,
  RepeatParameterModel,
  SectionParameterModel,
  BooleanParameterModel,
  SelectParameterModel,
} from "../schema/bundle-types.js";

// --- Helpers (ported from Python visitor.py) ---

/** Build flat pipe-separated state path: `name` or `prefix|name`. */
export function flatStatePath(name: string, prefix?: string): string {
  return prefix != null ? `${prefix}|${name}` : name;
}

/** Filter a flat key→value map to keys starting with a given prefix. */
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
    const boolValue = _coerceToBool(testValue);
    const discBool =
      typeof discriminator === "boolean" ? discriminator : _coerceToBool(discriminator);
    return boolValue === discBool;
  }
  // Select: string comparison
  return String(testValue) === String(discriminator);
}

function _coerceToBool(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const lower = value.toLowerCase();
    if (lower === "true") return true;
    if (lower === "false") return false;
  }
  return null;
}

// --- Main injection function ---

const CONNECTED_VALUE = { __class__: "ConnectedValue" } as const;

/**
 * Inject ConnectedValue markers into a state dict for all connections.
 *
 * Walks the parameter tree to match connection paths to tool parameters,
 * setting matched leaves to `{"__class__": "ConnectedValue"}`.
 * Mutates `state` in-place.
 *
 * @returns remaining unmatched connection paths (empty if all consumed)
 */
export function injectConnectionsIntoState(
  toolInputs: ToolParameterModel[],
  state: Record<string, unknown>,
  connections: Record<string, unknown>,
): Record<string, unknown> {
  const remaining = { ...connections };
  for (const toolInput of toolInputs) {
    _mergeParam(remaining, toolInput, state);
  }
  return remaining;
}

function _mergeParam(
  connections: Record<string, unknown>,
  toolInput: ToolParameterModel,
  state: Record<string, unknown>,
  prefix?: string,
  branchConnections?: Record<string, unknown>,
): void {
  if (branchConnections == null) {
    branchConnections = connections;
  }

  const name = toolInput.name;
  const parameterType = toolInput.parameter_type;
  const statePath = flatStatePath(name, prefix);

  if (parameterType === "gx_conditional") {
    const conditional = toolInput as ConditionalParameterModel;
    let conditionalState = state[name] as Record<string, unknown> | undefined;
    if (conditionalState == null) {
      conditionalState = {};
      state[name] = conditionalState;
    }

    const when = selectWhichWhen(conditional, conditionalState);
    const conditionalConnections = keysStartingWith(branchConnections, statePath);

    _mergeParam(
      connections,
      conditional.test_parameter,
      conditionalState,
      statePath,
      conditionalConnections,
    );

    if (when != null) {
      for (const whenParameter of when.parameters) {
        _mergeParam(
          connections,
          whenParameter,
          conditionalState,
          statePath,
          conditionalConnections,
        );
      }
    }
  } else if (parameterType === "gx_repeat") {
    const repeat = toolInput as RepeatParameterModel;
    let repeatStateArray = state[name] as Record<string, unknown>[] | undefined;
    if (repeatStateArray == null) {
      repeatStateArray = [];
    }

    const repeatInstanceConnects = repeatInputsToArray(statePath, connections);

    for (let i = 0; i < repeatInstanceConnects.length; i++) {
      while (repeatStateArray.length <= i) {
        repeatStateArray.push({});
      }
      const instancePrefix = `${statePath}_${i}`;
      for (const repeatParameter of repeat.parameters) {
        _mergeParam(
          connections,
          repeatParameter,
          repeatStateArray[i],
          instancePrefix,
          repeatInstanceConnects[i],
        );
      }
    }

    if (repeatStateArray.length > 0 && !(name in state)) {
      state[name] = repeatStateArray;
    }
  } else if (parameterType === "gx_section") {
    const section = toolInput as SectionParameterModel;
    let sectionState = state[name] as Record<string, unknown> | undefined;
    if (sectionState == null) {
      sectionState = {};
      state[name] = sectionState;
    }

    const sectionConnections = keysStartingWith(branchConnections, statePath);
    for (const sectionParameter of section.parameters) {
      _mergeParam(connections, sectionParameter, sectionState, statePath, sectionConnections);
    }
  } else {
    // Leaf parameter
    if (statePath in branchConnections) {
      state[name] = { ...CONNECTED_VALUE };
      delete connections[statePath];
    }
  }
}

// --- ConnectedValue stripping ---

function _isConnectedValue(value: unknown): boolean {
  return (
    value != null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>).__class__ === "ConnectedValue"
  );
}

/**
 * Strip ConnectedValue markers from a state dict using the parameter tree.
 *
 * Walks conditionals, repeats, and sections so nested markers inside
 * container parameters are removed. Mutates `state` in-place.
 */
export function stripConnectedValues(
  toolInputs: ToolParameterModel[],
  state: Record<string, unknown>,
): void {
  for (const toolInput of toolInputs) {
    _stripParam(toolInput, state);
  }
}

function _stripParam(
  toolInput: ToolParameterModel,
  state: Record<string, unknown>,
  prefix?: string,
): void {
  const name = toolInput.name;
  const parameterType = toolInput.parameter_type;

  if (parameterType === "gx_conditional") {
    const conditional = toolInput as ConditionalParameterModel;
    const conditionalState = state[name] as Record<string, unknown> | undefined;
    if (conditionalState == null) return;

    const statePath = flatStatePath(name, prefix);
    _stripParam(conditional.test_parameter, conditionalState, statePath);

    const when = selectWhichWhen(conditional, conditionalState);
    if (when != null) {
      for (const whenParameter of when.parameters) {
        _stripParam(whenParameter, conditionalState, statePath);
      }
    }
  } else if (parameterType === "gx_repeat") {
    const repeat = toolInput as RepeatParameterModel;
    const repeatStateArray = state[name] as Record<string, unknown>[] | undefined;
    if (!Array.isArray(repeatStateArray)) return;

    const statePath = flatStatePath(name, prefix);
    for (let i = 0; i < repeatStateArray.length; i++) {
      const instancePrefix = `${statePath}_${i}`;
      for (const repeatParameter of repeat.parameters) {
        _stripParam(repeatParameter, repeatStateArray[i], instancePrefix);
      }
    }
  } else if (parameterType === "gx_section") {
    const section = toolInput as SectionParameterModel;
    const sectionState = state[name] as Record<string, unknown> | undefined;
    if (sectionState == null) return;

    const statePath = flatStatePath(name, prefix);
    for (const sectionParameter of section.parameters) {
      _stripParam(sectionParameter, sectionState, statePath);
    }
  } else {
    // Leaf parameter
    if (_isConnectedValue(state[name])) {
      delete state[name];
    }
  }
}
