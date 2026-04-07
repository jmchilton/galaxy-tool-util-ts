/**
 * Shared YAML configuration schema for Galaxy workflow tool settings.
 *
 * Both `galaxy-tool-proxy` and `gxwf-web` read the same `galaxy.workflows.*`
 * sections from their config files. This module defines those shared schemas
 * so the field names, types, and defaults stay in sync.
 *
 * Each server may extend this with its own fields (e.g. `port`/`host` for the
 * proxy). Use `S.Struct({ ...WorkflowToolConfig.fields, myField: ... })`.
 */

import * as S from "effect/Schema";
import { readFile } from "node:fs/promises";
import YAML from "yaml";
import type { ToolInfoOptions, ToolSource } from "./tool-info.js";

/** Effect Schema for a tool source entry. */
export const ToolSourceConfig = S.Struct({
  type: S.Union(S.Literal("toolshed"), S.Literal("galaxy")),
  url: S.String,
  /** Whether the source is active. Disabled sources are skipped at runtime. */
  enabled: S.optionalWith(S.Boolean, { default: () => true }),
});
export type ToolSourceConfig = S.Schema.Type<typeof ToolSourceConfig>;

/** Effect Schema for the cache directory setting. */
export const ToolCacheConfig = S.Struct({
  directory: S.optional(S.String),
});
export type ToolCacheConfig = S.Schema.Type<typeof ToolCacheConfig>;

/**
 * Shared Galaxy workflow tool configuration — the portion of the YAML config
 * common to both `galaxy-tool-proxy` and `gxwf-web`.
 *
 * ```yaml
 * galaxy.workflows.toolSources:
 *   - type: toolshed
 *     url: https://toolshed.g2.bx.psu.edu
 *   - type: galaxy
 *     url: https://usegalaxy.org
 *     enabled: false
 * galaxy.workflows.toolCache:
 *   directory: /tmp/galaxy-tool-cache
 * ```
 */
export const WorkflowToolConfig = S.Struct({
  "galaxy.workflows.toolSources": S.optionalWith(S.Array(ToolSourceConfig), {
    default: () => [],
  }),
  "galaxy.workflows.toolCache": S.optionalWith(ToolCacheConfig, {
    default: () => ({}) as S.Schema.Type<typeof ToolCacheConfig>,
  }),
});
export type WorkflowToolConfig = S.Schema.Type<typeof WorkflowToolConfig>;

/**
 * Load the shared tool configuration portion from a YAML file.
 * Unknown fields (e.g. `port`, `host`) are silently ignored.
 */
export async function loadWorkflowToolConfig(configPath: string): Promise<WorkflowToolConfig> {
  const raw = await readFile(configPath, "utf-8");
  const parsed = YAML.parse(raw) as unknown;
  return S.decodeUnknownSync(WorkflowToolConfig)(parsed);
}

/**
 * Convert a WorkflowToolConfig to ToolInfoOptions for constructing a
 * ToolInfoService. Filters out disabled sources.
 */
export function toolInfoOptionsFromConfig(config: WorkflowToolConfig): ToolInfoOptions {
  const enabledSources: ToolSource[] = config["galaxy.workflows.toolSources"]
    .filter((s) => s.enabled)
    .map((s) => ({ type: s.type, url: s.url }));
  return {
    cacheDir: config["galaxy.workflows.toolCache"]?.directory,
    sources: enabledSources.length > 0 ? enabledSources : undefined,
  };
}
