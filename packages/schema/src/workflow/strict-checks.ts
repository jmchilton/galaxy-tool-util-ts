/**
 * Pre-normalization strict validation checks for workflows.
 *
 * These run on raw workflow dicts before any schema normalization,
 * matching the Python pattern of failing fast before decoding.
 */
import { NativeGalaxyWorkflowSchema, GalaxyWorkflowSchema } from "./raw/index.js";
import type { WorkflowFormat } from "./detect-format.js";
import { detectFormat } from "./detect-format.js";
import { withClass } from "./validators.js";
import * as ParseResult from "effect/ParseResult";
import * as S from "effect/Schema";

// ── Encoding checks ──────────────────────────────────────────────────

/**
 * Native: reject tool_state that is a JSON string instead of a parsed dict.
 * Walks top-level steps only (matching Python `validate_encoding_native`).
 */
export function validateEncodingNative(workflowDict: Record<string, unknown>): string[] {
  const errors: string[] = [];
  const steps = workflowDict.steps;
  if (!steps || typeof steps !== "object") return errors;

  const entries: [string, unknown][] = Array.isArray(steps)
    ? steps.map((s, i) => [String(i), s])
    : Object.entries(steps as Record<string, unknown>);

  for (const [key, step] of entries) {
    if (!step || typeof step !== "object") continue;
    const s = step as Record<string, unknown>;
    if (s.type === "subworkflow") continue;
    if (!s.tool_id) continue;

    const toolState = s.tool_state;
    if (typeof toolState === "string") {
      errors.push(`step ${key}: tool_state is a JSON string (legacy encoding), expected a dict`);
    }
  }
  return errors;
}

/**
 * Format2: reject steps using `tool_state` field instead of `state`.
 *
 * No string-state check — format2 state comes from YAML parsing so
 * it's always a dict. The Python side checks this defensively but
 * it's not a real-world scenario.
 */
export function validateEncodingFormat2(workflowDict: Record<string, unknown>): string[] {
  const errors: string[] = [];
  const steps = workflowDict.steps;
  if (!steps || !Array.isArray(steps)) return errors;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (!step || typeof step !== "object") continue;
    const s = step as Record<string, unknown>;
    if (s.run && typeof s.run === "object") continue; // subworkflow
    if (!s.tool_id) continue;

    if ("tool_state" in s && !("state" in s)) {
      errors.push(`step ${i}: uses "tool_state" instead of "state" (format2 should use "state")`);
    }
  }
  return errors;
}

/** Dispatch encoding check based on format auto-detection. */
export function checkStrictEncoding(
  workflowDict: Record<string, unknown>,
  format?: WorkflowFormat,
): string[] {
  const fmt = format ?? detectFormat(workflowDict);
  return fmt === "native"
    ? validateEncodingNative(workflowDict)
    : validateEncodingFormat2(workflowDict);
}

// ── Structure checks ─────────────────────────────────────────────────

function formatIssues(error: ParseResult.ParseError): string[] {
  const issues = ParseResult.ArrayFormatter.formatErrorSync(error);
  return issues.map((i) => `${i.path.join(".")}: ${i.message}`);
}

/**
 * Strict structure check — decode with onExcessProperty: "error" to
 * catch unknown keys at envelope and step level.
 */
export function checkStrictStructure(
  workflowDict: Record<string, unknown>,
  format?: WorkflowFormat,
): string[] {
  const fmt = format ?? detectFormat(workflowDict);
  const cls = fmt === "native" ? "NativeGalaxyWorkflow" : "GalaxyWorkflow";
  const data = withClass(workflowDict, cls);

  const schema: S.Schema<any> =
    fmt === "native" ? NativeGalaxyWorkflowSchema : GalaxyWorkflowSchema;
  const decode = S.decodeUnknownEither(schema, { onExcessProperty: "error" });
  const result = decode(data);

  if (result._tag === "Left") {
    return formatIssues(result.left);
  }
  return [];
}
