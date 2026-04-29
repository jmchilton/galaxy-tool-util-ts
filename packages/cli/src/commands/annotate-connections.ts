/**
 * Helper for `gxwf mermaid` / `gxwf cytoscapejs` `--annotate-connections`:
 * runs the connection validator against a workflow and returns the
 * `EdgeAnnotation` lookup the emitters consume.
 */

import {
  buildEdgeAnnotations,
  buildGetToolInfo as _buildGetToolInfo,
  buildWorkflowGraph,
  validateConnectionGraph,
  type EdgeAnnotation,
} from "@galaxy-tool-util/connection-validation";
import type { ToolCache } from "@galaxy-tool-util/core";
import { makeNodeToolCache } from "@galaxy-tool-util/core/node";
import type { ParsedTool } from "@galaxy-tool-util/schema";

import { buildGetToolInfo } from "./connection-validation.js";
import { isResolveError, loadCachedTool } from "./resolve-tool.js";

export interface ResolveEdgeAnnotationsOptions {
  cacheDir?: string;
}

export async function resolveEdgeAnnotations(
  data: Record<string, unknown>,
  opts: ResolveEdgeAnnotationsOptions = {},
): Promise<Map<string, EdgeAnnotation>> {
  const cache = makeNodeToolCache({ cacheDir: opts.cacheDir });
  await cache.index.load();
  return resolveEdgeAnnotationsWithCache(data, cache);
}

export async function resolveEdgeAnnotationsWithCache(
  data: Record<string, unknown>,
  cache: ToolCache,
): Promise<Map<string, EdgeAnnotation>> {
  const getToolInfo = await buildGetToolInfo(data, cache);
  const graph = buildWorkflowGraph(data, getToolInfo);
  const [report] = validateConnectionGraph(graph);
  return buildEdgeAnnotations(report);
}

export interface ResolvedToolSpec {
  tool_id: string;
  tool_version: string;
  parsed: ParsedTool;
}

/**
 * Variant of `resolveEdgeAnnotationsWithCache` that also returns the
 * `ParsedTool` specs the validator consumed, keyed by `toolId@toolVersion`.
 * The hybrid `gxwf-web` edge-annotations response uses this so co-resident
 * browsers can write the specs into IndexedDB and warm the client-side
 * `useToolInfoService` for free.
 */
export async function resolveEdgeAnnotationsAndSpecsWithCache(
  data: Record<string, unknown>,
  cache: ToolCache,
): Promise<{
  annotations: Map<string, EdgeAnnotation>;
  specs: Map<string, ResolvedToolSpec>;
}> {
  const specs = new Map<string, ResolvedToolSpec>();
  const getToolInfo = await _buildGetToolInfo(data, async (id, version) => {
    const r = await loadCachedTool(cache, id, version);
    if (isResolveError(r)) return null;
    const ver = r.tool.version ?? version ?? "";
    specs.set(`${id}@${ver}`, { tool_id: id, tool_version: ver, parsed: r.tool });
    return r.tool;
  });
  const graph = buildWorkflowGraph(data, getToolInfo);
  const [report] = validateConnectionGraph(graph);
  return { annotations: buildEdgeAnnotations(report), specs };
}
