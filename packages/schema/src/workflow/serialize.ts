/**
 * Format-aware workflow serialization + format resolution.
 *
 * Shared between the CLI (`@galaxy-tool-util/cli`) and the web server
 * (`@galaxy-tool-util/gxwf-web`) so both produce byte-compatible output.
 */

import { stringify as stringifyYaml } from "yaml";
import { detectFormat, type WorkflowFormat } from "./detect-format.js";

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
 */
export function serializeWorkflow(
  data: Record<string, unknown>,
  format: WorkflowFormat,
  opts: SerializeWorkflowOptions = {},
): string {
  const useYaml = opts.yaml || (!opts.json && format === "format2");
  const newline = opts.trailingNewline ?? true;
  if (useYaml) {
    const out = stringifyYaml(data, { lineWidth: 0 });
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
