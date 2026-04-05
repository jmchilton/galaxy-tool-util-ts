/**
 * Schema-aware (stateful) state conversion between native and format2 formats.
 *
 * Uses the walker to traverse tool_state with parameter definitions,
 * coercing scalar types and separating connections/runtime values.
 *
 * Design: no double encoding, no legacy decode, clean dicts throughout.
 */

import type {
  ToolParameterModel,
  SelectParameterModel,
  DataColumnParameterModel,
} from "../schema/bundle-types.js";
import type { NormalizedNativeStep } from "./normalized/native.js";
import { walkNativeState, walkFormat2State, SKIP_VALUE } from "./walker.js";
import type { LeafCallback } from "./walker.js";
import { isConnectedValue, isRuntimeValue } from "./runtime-markers.js";
import { parseBool, parseNumber, parseStringArray, parseNumberArray } from "./coercions.js";

// --- Scalar coercions ---

/**
 * Coerce a native scalar value to its format2 representation.
 *
 * Native tool_state may have string-typed numbers, booleans, or
 * comma-delimited multi-selects. Format2 uses proper JS types.
 */
export function convertScalarValue(toolInput: ToolParameterModel, value: unknown): unknown {
  const paramType = toolInput.parameter_type;

  if (paramType === "gx_integer" || paramType === "gx_float") {
    return parseNumber(value) ?? value;
  }

  if (paramType === "gx_boolean") {
    return parseBool(value) ?? value;
  }

  if (paramType === "gx_select") {
    const select = toolInput as SelectParameterModel;
    if (select.multiple) {
      return parseStringArray(value) ?? value;
    }
    return value;
  }

  if (paramType === "gx_data_column") {
    const col = toolInput as DataColumnParameterModel;
    if (col.multiple) {
      return parseNumberArray(value) ?? value;
    }
    return parseNumber(value) ?? value;
  }

  // Passthrough for text, color, hidden, directory_uri, genomebuild,
  // baseurl, drill_down, group_tag, and CWL types
  return value;
}

/**
 * Reverse-coerce a format2 scalar value back to native representation.
 *
 * Format2 uses proper JS types; native may need string coercions for
 * multi-select and data_column values.
 */
export function reverseScalarValue(toolInput: ToolParameterModel, value: unknown): unknown {
  const paramType = toolInput.parameter_type;

  if (paramType === "gx_select") {
    const select = toolInput as SelectParameterModel;
    if (select.multiple && Array.isArray(value)) {
      return value.map(String);
    }
    return value;
  }

  if (paramType === "gx_data_column") {
    const col = toolInput as DataColumnParameterModel;
    if (col.multiple && Array.isArray(value)) {
      return value.map(String);
    }
    return typeof value === "number" ? String(value) : value;
  }

  // Most types pass through unchanged
  return value;
}

// --- Native → Format2 conversion ---

export interface Format2ConvertedState {
  state: Record<string, unknown>;
  in: Record<string, string>;
}

/** Data parameter types — always go to `in` block, never to state. */
const DATA_PARAM_TYPES = new Set(["gx_data", "gx_data_collection"]);

/**
 * Convert a native step's tool_state to format2 state + in block.
 *
 * Walks the parameter tree:
 * - Data params → `in` block (connected/runtime) or SKIP
 * - ConnectedValue/RuntimeValue markers → `in` block
 * - gx_rules → parse JSON string, SKIP if null/connected
 * - Null/"null" values → SKIP
 * - Scalars → coerce via convertScalarValue()
 */
export function convertStateToFormat2(
  nativeStep: NormalizedNativeStep,
  toolInputs: ToolParameterModel[],
): Format2ConvertedState {
  const toolState = nativeStep.tool_state;
  // Widen readonly tuples to unknown for the walker's connection lookup.
  const inputConnections = nativeStep.input_connections as Record<string, unknown>;
  const connectedPaths = nativeStep.connected_paths;
  const inBlock: Record<string, string> = {};

  const leafCallback: LeafCallback = (toolInput, value, statePath) => {
    const paramType = toolInput.parameter_type;

    // Data parameters: always to `in` block
    if (DATA_PARAM_TYPES.has(paramType)) {
      if (isConnectedValue(value) || connectedPaths.has(statePath)) {
        // Connected data param — recorded via input_connections, handled by structural conversion
      }
      if (isRuntimeValue(value)) {
        inBlock[statePath] = "runtime_value";
      }
      return SKIP_VALUE;
    }

    // Rules parameter: parse JSON string
    if (paramType === "gx_rules") {
      if (value == null || isConnectedValue(value)) {
        if (isConnectedValue(value) || connectedPaths.has(statePath)) {
          // Will be in `in` block via structural conversion
        }
        return SKIP_VALUE;
      }
      if (typeof value === "string") {
        try {
          return JSON.parse(value);
        } catch {
          return value;
        }
      }
      return value;
    }

    // ConnectedValue → record in `in` block, skip from state
    if (isConnectedValue(value)) {
      // Connection source handled by structural conversion's input_connections
      return SKIP_VALUE;
    }

    // RuntimeValue → record in `in` block, skip from state
    if (isRuntimeValue(value)) {
      inBlock[statePath] = "runtime_value";
      return SKIP_VALUE;
    }

    // Null / "null" values → skip
    if (value === null || value === undefined || value === "null") {
      return SKIP_VALUE;
    }

    // Scalar coercion
    return convertScalarValue(toolInput, value);
  };

  const state = walkNativeState(inputConnections, toolInputs, toolState, leafCallback);

  return { state, in: inBlock };
}

// --- Format2 → Native conversion ---

/**
 * Encode format2 state back to native tool_state.
 *
 * Walks format2 state reversing coercions (e.g. number arrays → string arrays
 * for multi-select/data_column). Returns a clean dict — no JSON.stringify per key.
 */
export function encodeStateToNative(
  toolInputs: ToolParameterModel[],
  state: Record<string, unknown>,
): Record<string, unknown> {
  const leafCallback: LeafCallback = (toolInput, value) => {
    return reverseScalarValue(toolInput, value);
  };

  return walkFormat2State(toolInputs, state, leafCallback);
}
