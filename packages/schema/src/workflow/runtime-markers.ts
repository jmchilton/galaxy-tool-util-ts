/**
 * Runtime value markers used inside workflow tool_state.
 *
 * Galaxy has two in-band markers indicating a parameter value is not a
 * literal but will be supplied at invocation time:
 * - `ConnectedValue`: value comes from an upstream step output
 * - `RuntimeValue`: value is supplied by the user at workflow runtime
 *
 * Both are encoded as `{ __class__: "ConnectedValue" | "RuntimeValue" }`
 * inside native tool_state dicts. Matches Galaxy Python terminology.
 */

export const CONNECTED_VALUE = { __class__: "ConnectedValue" } as const;
export const RUNTIME_VALUE = { __class__: "RuntimeValue" } as const;

export function isConnectedValue(value: unknown): boolean {
  return (
    value != null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>).__class__ === "ConnectedValue"
  );
}

export function isRuntimeValue(value: unknown): boolean {
  return (
    value != null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>).__class__ === "RuntimeValue"
  );
}
