import type { WorkflowDataType } from "./types.js";

/**
 * Coarse compatibility check between a workflow-declared input type and the
 * runtime type tag of a test-job value. Matches the VS Code plugin's
 * `server-common/src/utils.ts::isCompatibleType` signature — callers pass a
 * runtime type *string*, not the raw value. Plugin callers derive the string
 * from an AST node's `.type` (YAML-language-server vocabulary:
 * `"string" | "number" | "boolean" | "null" | "object" | "array"`); our CLI
 * derives it from `typeof` via {@link jsTypeOf}.
 *
 * Unmapped declared types (`data`, `collection`, `color`, custom) fall
 * through as compatible — the strict structural check lives in the JSON
 * Schema layer.
 */
export function isCompatibleType(expectedType: WorkflowDataType, actualType: string): boolean {
  switch (expectedType) {
    case "int":
    case "integer":
    case "long":
    case "double":
    case "float":
      return actualType === "number";
    case "boolean":
      return actualType === "boolean";
    case "text":
    case "string":
      return actualType === "string";
    case "File":
      return actualType === "string" || actualType === "object";
    case "null":
      return actualType === "null";
    default:
      return true;
  }
}

/**
 * JS-side runtime type tag for a test-job value, in the same vocabulary
 * YAML-language-server's AST emits — so `isCompatibleType` produces the same
 * answer regardless of whether the caller walked an AST (plugin) or parsed
 * YAML into plain values (CLI).
 */
export function jsTypeOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}
