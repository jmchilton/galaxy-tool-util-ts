import { type ToolCache, type ToolInfoService, cacheKey } from "@galaxy-tool-util/core";
import { makeNodeToolCache, makeNodeToolInfoService } from "@galaxy-tool-util/core/node";
import type { ParsedTool } from "@galaxy-tool-util/schema";

export interface ResolvedTool {
  tool: ParsedTool;
  key: string;
}

export type ResolveError =
  | { kind: "no_version"; toolId: string }
  | { kind: "not_cached"; toolId: string; key: string; fetchAttempted?: boolean };

export function isResolveError(r: ResolvedTool | ResolveError): r is ResolveError {
  return "kind" in r;
}

/** Human-readable reason a tool failed to resolve, for skip messages. */
export function describeResolveError(err: ResolveError): string {
  if (err.kind === "no_version") return `no version for ${err.toolId}`;
  return err.fetchAttempted
    ? `${err.toolId} not in cache (fetch failed)`
    : `${err.toolId} not in cache`;
}

/**
 * Resolve a tool to its parsed metadata and cache key. With a fetch `service`,
 * the service reads the cache and fetches+caches on miss (it owns the key).
 * Without a service, performs a network-free cache read. The passed `cache` is
 * only consulted in the offline branch — online, the service's own cache is
 * authoritative, so the two can never diverge.
 */
export async function resolveTool(
  cache: ToolCache,
  toolId: string,
  version?: string | null,
  service?: ToolInfoService,
): Promise<ResolvedTool | ResolveError> {
  if (service) {
    const resolved = await service.resolveTool(toolId, version ?? null);
    if (resolved !== null) return resolved;
    return notCached(cache, toolId, version, true);
  }
  const hit = await cache.loadByToolId(toolId, version ?? null);
  if (hit !== null) return hit;
  return notCached(cache, toolId, version, false);
}

async function notCached(
  cache: ToolCache,
  toolId: string,
  version: string | null | undefined,
  fetchAttempted: boolean,
): Promise<ResolveError> {
  const coords = cache.resolveToolCoordinates(toolId, version);
  if (coords.version === null) return { kind: "no_version", toolId };
  const key = await cacheKey(coords.toolshedUrl, coords.trsToolId, coords.version);
  return { kind: "not_cached", toolId, key, fetchAttempted };
}

/** Options shared by validation commands for resolving (and optionally fetching) tools. */
export interface ValidationFetchOptions {
  cacheDir?: string;
  /** Skip the network: read only the local cache (uncached tools are skipped). */
  offline?: boolean;
  /** Extra Galaxy instance tried as a tool source after the ToolShed. */
  galaxyUrl?: string;
}

export interface ValidationResolver {
  cache: ToolCache;
  /** Present unless `offline` — fetches and caches tools missing locally. */
  service?: ToolInfoService;
}

/**
 * Build the cache (and, unless `offline`, the fetch service) for tool-state
 * validation. When fetching is on, validation reads `service.cache` so freshly
 * fetched tools are visible without a disk round-trip.
 */
export function makeValidationResolver(opts: ValidationFetchOptions): ValidationResolver {
  if (opts.offline) {
    return { cache: makeNodeToolCache({ cacheDir: opts.cacheDir }) };
  }
  const service = makeNodeToolInfoService({ cacheDir: opts.cacheDir, galaxyUrl: opts.galaxyUrl });
  return { cache: service.cache, service };
}
