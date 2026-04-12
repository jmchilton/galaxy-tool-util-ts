import { type ToolCache, cacheKey, type ParsedTool } from "@galaxy-tool-util/core";

export interface ResolvedTool {
  tool: ParsedTool;
  key: string;
}

export type ResolveError =
  | { kind: "no_version"; toolId: string }
  | { kind: "not_cached"; toolId: string; key: string };

export function isResolveError(r: ResolvedTool | ResolveError): r is ResolveError {
  return "kind" in r;
}

export async function loadCachedTool(
  cache: ToolCache,
  toolId: string,
  version?: string | null,
): Promise<ResolvedTool | ResolveError> {
  const coords = cache.resolveToolCoordinates(toolId, version);
  if (coords.version === null) {
    return { kind: "no_version", toolId };
  }
  const key = await cacheKey(coords.toolshedUrl, coords.trsToolId, coords.version);
  const tool = await cache.loadCached(key);
  if (tool === null) {
    return { kind: "not_cached", toolId, key };
  }
  return { tool, key };
}
