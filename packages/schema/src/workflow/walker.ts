/**
 * Schema-aware state walkers for native and format2 workflow tool state.
 *
 * Port of Python galaxy.tool_util.workflow_state._walker.
 *
 * Walks the parameter tree using tool definitions, calling a leaf callback
 * for each scalar parameter. Handles conditionals (branch selection),
 * repeats (instance expansion), and sections (recursion). Builds a new
 * state dict from callback return values.
 *
 * Design principles:
 * - No double encoding: containers must be proper dicts/lists, never JSON strings
 * - No legacy decode: string containers are errors, not silently accommodated
 * - SKIP_VALUE sentinel omits a value from the output
 */

import type {
  ToolParameterModel,
  ConditionalParameterModel,
  RepeatParameterModel,
  SectionParameterModel,
} from "../schema/bundle-types.js";

import { flatStatePath, repeatInputsToArray, selectWhichWhen } from "./walk-helpers.js";
import { STALE_KEYS } from "./stale-keys.js";

/** Sentinel: return from leaf callback to omit a value from output. */
export const SKIP_VALUE: unique symbol = Symbol("SKIP_VALUE");

export type LeafCallback = (
  toolInput: ToolParameterModel,
  value: unknown,
  statePath: string,
) => unknown | typeof SKIP_VALUE;

export interface WalkNativeOptions {
  prefix?: string;
  checkUnknownKeys?: boolean;
  /** Copy undeclared keys from input state to output (default: false). */
  preserveUnknownKeys?: boolean;
  /**
   * Switch repeat handling to `_initialize_repeat_state` semantics (default: false).
   * When true:
   *   - inputConnections are ignored for instance count,
   *   - instance count is padded to `repeat.min` (never shrinks existing state),
   *   - the repeat key is always written to output, even when empty (`[]`).
   * Used by expand-defaults, which must surface every declared repeat as a
   * container the user can populate.
   */
  repeatMinPad?: boolean;
}

/**
 * Walk native workflow tool_state using the parameter tree.
 *
 * For each leaf parameter, calls `leafCallback(toolInput, value, statePath)`.
 * Return values build the output dict; return SKIP_VALUE to omit.
 *
 * Containers (conditionals, repeats, sections) are recursed into.
 * Bookkeeping keys (__current_case__, etc.) are stripped.
 * Input connections are used to determine repeat instance counts.
 *
 * @throws Error if a container parameter value is a string (legacy encoding)
 */
export function walkNativeState(
  inputConnections: Record<string, unknown>,
  toolInputs: ToolParameterModel[],
  state: Record<string, unknown>,
  leafCallback: LeafCallback,
  options?: WalkNativeOptions,
): Record<string, unknown> {
  const prefix = options?.prefix;
  const checkUnknownKeys = options?.checkUnknownKeys ?? false;
  const preserveUnknownKeys = options?.preserveUnknownKeys ?? false;
  const repeatMinPad = options?.repeatMinPad ?? false;
  const result: Record<string, unknown> = {};
  const visitedKeys = new Set<string>();

  for (const toolInput of toolInputs) {
    const name = toolInput.name;
    visitedKeys.add(name);
    const parameterType = toolInput.parameter_type;
    const statePath = flatStatePath(name, prefix);

    if (parameterType === "gx_conditional") {
      const conditional = toolInput as ConditionalParameterModel;
      const conditionalState = state[name];

      _assertNotStringContainer(name, parameterType, conditionalState);
      const stateDict = (conditionalState as Record<string, unknown>) ?? {};

      const when = selectWhichWhen(conditional, stateDict);
      const branchParams = when != null ? when.parameters : [];

      // Walk the test parameter + branch parameters
      const innerResult = walkNativeState(
        inputConnections,
        [conditional.test_parameter, ...branchParams],
        stateDict,
        leafCallback,
        { prefix: statePath, checkUnknownKeys, preserveUnknownKeys, repeatMinPad },
      );

      if (Object.keys(innerResult).length > 0) {
        result[name] = innerResult;
      }
    } else if (parameterType === "gx_repeat") {
      const repeat = toolInput as RepeatParameterModel;
      const repeatState = state[name];

      _assertNotStringContainer(name, parameterType, repeatState);

      // Determine instance count from state array or input connections
      const stateArray = Array.isArray(repeatState)
        ? (repeatState as Record<string, unknown>[])
        : [];
      let instanceCount: number;
      if (repeatMinPad) {
        instanceCount = Math.max(stateArray.length, repeat.min ?? 0);
      } else {
        const connectionInstances = repeatInputsToArray(statePath, inputConnections);
        instanceCount = Math.max(stateArray.length, connectionInstances.length);
      }

      const instances: Record<string, unknown>[] = [];
      for (let i = 0; i < instanceCount; i++) {
        const instanceState = stateArray[i] ?? {};
        const instancePrefix = `${statePath}_${i}`;
        const instanceResult = walkNativeState(
          inputConnections,
          repeat.parameters,
          instanceState,
          leafCallback,
          { prefix: instancePrefix, checkUnknownKeys, preserveUnknownKeys, repeatMinPad },
        );
        instances.push(instanceResult);
      }

      // Preserve explicit empty arrays (valid state); omit only when key is absent.
      // In repeatMinPad mode (expand-defaults), always write the key — mirrors
      // Python's _initialize_repeat_state which creates tool_state[name] = [].
      if (repeatMinPad || name in state || instances.length > 0) {
        result[name] = instances;
      }
    } else if (parameterType === "gx_section") {
      const section = toolInput as SectionParameterModel;
      const sectionState = state[name];

      _assertNotStringContainer(name, parameterType, sectionState);
      const stateDict = (sectionState as Record<string, unknown>) ?? {};

      const innerResult = walkNativeState(
        inputConnections,
        section.parameters,
        stateDict,
        leafCallback,
        { prefix: statePath, checkUnknownKeys, preserveUnknownKeys, repeatMinPad },
      );

      if (Object.keys(innerResult).length > 0) {
        result[name] = innerResult;
      }
    } else {
      // Leaf parameter
      const value = state[name];
      const callbackResult = leafCallback(toolInput, value, statePath);
      if (callbackResult !== SKIP_VALUE) {
        result[name] = callbackResult;
      }
    }
  }

  if (checkUnknownKeys) {
    for (const key of Object.keys(state)) {
      if (!visitedKeys.has(key) && !STALE_KEYS.has(key)) {
        throw new UnknownKeyError(key, prefix);
      }
    }
  } else if (preserveUnknownKeys) {
    for (const key of Object.keys(state)) {
      if (!visitedKeys.has(key)) {
        result[key] = state[key];
      }
    }
  }

  return result;
}

/**
 * Walk format2 workflow tool state using the parameter tree.
 *
 * Simpler than native walking — no bookkeeping keys, no input connections,
 * no double-encoding concerns. Clean dict walking with conditional branch
 * selection, repeat iteration, section recursion.
 *
 * @throws Error if a container parameter value is a string
 */
export function walkFormat2State(
  toolInputs: ToolParameterModel[],
  state: Record<string, unknown>,
  leafCallback: LeafCallback,
  prefix?: string,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const toolInput of toolInputs) {
    const name = toolInput.name;
    const parameterType = toolInput.parameter_type;
    const statePath = flatStatePath(name, prefix);

    if (parameterType === "gx_conditional") {
      const conditional = toolInput as ConditionalParameterModel;
      const conditionalState = state[name];

      _assertNotStringContainer(name, parameterType, conditionalState);
      const stateDict = (conditionalState as Record<string, unknown>) ?? {};

      const when = selectWhichWhen(conditional, stateDict);
      const branchParams = when != null ? when.parameters : [];

      const innerResult = walkFormat2State(
        [conditional.test_parameter, ...branchParams],
        stateDict,
        leafCallback,
        statePath,
      );

      if (Object.keys(innerResult).length > 0) {
        result[name] = innerResult;
      }
    } else if (parameterType === "gx_repeat") {
      const repeat = toolInput as RepeatParameterModel;
      const repeatState = state[name];

      _assertNotStringContainer(name, parameterType, repeatState);
      const stateArray = Array.isArray(repeatState)
        ? (repeatState as Record<string, unknown>[])
        : [];

      const instances: Record<string, unknown>[] = [];
      for (let i = 0; i < stateArray.length; i++) {
        const instancePrefix = `${statePath}_${i}`;
        const instanceResult = walkFormat2State(
          repeat.parameters,
          stateArray[i],
          leafCallback,
          instancePrefix,
        );
        instances.push(instanceResult);
      }

      // Preserve explicit empty arrays (valid state); omit only when key is absent
      if (name in state || instances.length > 0) {
        result[name] = instances;
      }
    } else if (parameterType === "gx_section") {
      const section = toolInput as SectionParameterModel;
      const sectionState = state[name];

      _assertNotStringContainer(name, parameterType, sectionState);
      const stateDict = (sectionState as Record<string, unknown>) ?? {};

      const innerResult = walkFormat2State(section.parameters, stateDict, leafCallback, statePath);

      if (Object.keys(innerResult).length > 0) {
        result[name] = innerResult;
      }
    } else {
      // Leaf parameter
      const value = state[name];
      const callbackResult = leafCallback(toolInput, value, statePath);
      if (callbackResult !== SKIP_VALUE) {
        result[name] = callbackResult;
      }
    }
  }

  return result;
}

/** Error thrown when unknown keys are detected in native state. */
export class UnknownKeyError extends Error {
  constructor(
    public readonly key: string,
    public readonly prefix?: string,
  ) {
    const location = prefix ? ` under "${prefix}"` : " at root";
    super(`Unknown key "${key}"${location} in tool state`);
    this.name = "UnknownKeyError";
  }
}

/** Assert that a container parameter value is not a string (legacy encoding). */
function _assertNotStringContainer(name: string, parameterType: string, value: unknown): void {
  if (typeof value === "string") {
    throw new Error(
      `Container parameter "${name}" (${parameterType}) has string value — ` +
        `expected dict/list. This indicates legacy parameter encoding which is not supported. ` +
        `Decode the workflow first.`,
    );
  }
}
