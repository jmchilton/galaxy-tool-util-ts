/**
 * Format-aware workflow serialization + format resolution.
 *
 * Shared between the CLI (`@galaxy-tool-util/cli`) and the web server
 * (`@galaxy-tool-util/gxwf-web`) so both produce byte-compatible output.
 */

import { stringify as stringifyYaml } from "yaml";
import { detectFormat, type WorkflowFormat } from "./detect-format.js";

/**
 * In-memory-only fields derived during normalization (see
 * `workflow/normalized/native.ts` and `format2.ts`). They are never part of
 * the on-disk Galaxy format: `unique_tools` is a workflow-level `Set` of tool
 * references, `connected_paths` is a per-step `Set` of input-connection keys.
 * Serializing a `Set` yields `{}` (JSON) / an empty mapping (YAML), so left in
 * place they leak as stray keys that downstream schema validators reject.
 *
 * Stripped structurally (workflow level / step level / subworkflows) rather
 * than by a blanket recursive key match so a tool parameter that happens to be
 * named `unique_tools`/`connected_paths` inside `tool_state` is preserved.
 */
function stripDerivedFields(data: Record<string, unknown>): Record<string, unknown> {
  return stripWorkflowDict(data);
}

function stripWorkflowDict(wf: Record<string, unknown>): Record<string, unknown> {
  const out = { ...wf };
  delete out.unique_tools;
  if (out.steps && typeof out.steps === "object") {
    out.steps = stripSteps(out.steps as Record<string, unknown> | unknown[]);
  }
  return out;
}

function stripSteps(
  steps: Record<string, unknown> | unknown[],
): Record<string, unknown> | unknown[] {
  if (Array.isArray(steps)) return steps.map(stripStep);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(steps)) out[key] = stripStep(value);
  return out;
}

function stripStep(step: unknown): unknown {
  if (step == null || typeof step !== "object") return step;
  const out = { ...(step as Record<string, unknown>) };
  delete out.connected_paths;
  // Embedded subworkflows: `subworkflow` (native) / `run` (format2).
  for (const key of ["subworkflow", "run"] as const) {
    if (out[key] && typeof out[key] === "object") {
      out[key] = stripWorkflowDict(out[key] as Record<string, unknown>);
    }
  }
  return out;
}

export interface SerializeWorkflowOptions {
  /** Force JSON output regardless of format. */
  json?: boolean;
  /** Force YAML output regardless of format. */
  yaml?: boolean;
  /** JSON indent level (ignored for YAML). Default: 2. */
  indent?: number;
  /** Append a trailing newline (both JSON and YAML). Default: true. */
  trailingNewline?: boolean;
}

/**
 * Serialize a workflow dict as JSON or YAML based on `format` (or explicit
 * `json` / `yaml` overrides).
 *
 * YAML uses `lineWidth: 0` to disable line-wrapping so diffs stay stable.
 *
 * The `yaml-1.1` schema is used for emission so the writer quotes plain scalars
 * that a YAML 1.1 reader (e.g. PyYAML, which Galaxy uses) would otherwise coerce
 * — the word-form booleans `no`/`yes`/`on`/`off`/`y`/`n`. Tool_state stores these
 * as strings (a select option value like `"no"`); emitting them bare lets a 1.1
 * reader decode them as booleans. Real numbers/booleans are unaffected.
 */
export function serializeWorkflow(
  data: Record<string, unknown>,
  format: WorkflowFormat,
  opts: SerializeWorkflowOptions = {},
): string {
  data = stripDerivedFields(data);
  const useYaml = opts.yaml || (!opts.json && format === "format2");
  const newline = opts.trailingNewline ?? true;
  if (useYaml) {
    const out = stringifyYaml(data, { lineWidth: 0, schema: "yaml-1.1" });
    // `yaml` already ends with a newline; don't double-append.
    if (newline) return out.endsWith("\n") ? out : out + "\n";
    return out.endsWith("\n") ? out.slice(0, -1) : out;
  }
  const indent = opts.indent ?? 2;
  return JSON.stringify(data, null, indent) + (newline ? "\n" : "");
}

/**
 * Resolve workflow format from an optional explicit choice, falling back to
 * `detectFormat` on the dict.
 */
export function resolveFormat(data: Record<string, unknown>, formatOpt?: string): WorkflowFormat {
  if (formatOpt === "native" || formatOpt === "format2") return formatOpt;
  return detectFormat(data);
}
