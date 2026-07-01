import {
  type ToolCache,
  type ToolInfoService,
  cacheKey,
  normalizeShortTrsToolId,
  parseToolshedToolId,
} from "@galaxy-tool-util/core";
import { makeNodeToolCache, makeNodeToolInfoService } from "@galaxy-tool-util/core/node";
import type { ParsedTool } from "@galaxy-tool-util/schema";

export interface ResolvedTool {
  tool: ParsedTool;
  key: string;
}

export type ResolveError =
  | { kind: "no_version"; toolId: string }
  | { kind: "not_cached"; toolId: string; key: string; fetchAttempted?: boolean }
  | {
      kind: "stock_version_mismatch";
      toolId: string;
      pinnedVersion: string;
      resolvedVersion: string;
    };

export function isResolveError(r: ResolvedTool | ResolveError): r is ResolveError {
  return "kind" in r;
}

/**
 * Whether a resolve error should fail validation rather than skip it. A
 * hallucinated stock-tool pin (`stock_version_mismatch`) is a hard error — the
 * tool exists but not at the pinned version; every other miss is a skip.
 */
export function resolveErrorIsFailure(err: ResolveError): boolean {
  return err.kind === "stock_version_mismatch";
}

/** Human-readable reason a tool failed to resolve, for skip/fail messages. */
export function describeResolveError(err: ResolveError): string {
  if (err.kind === "no_version") return `no version for ${err.toolId}`;
  if (err.kind === "stock_version_mismatch") {
    return `${err.toolId} pinned version ${err.pinnedVersion} does not exist (resolves to ${err.resolvedVersion})`;
  }
  return err.fetchAttempted
    ? `${err.toolId} not in cache (fetch failed)`
    : `${err.toolId} not in cache`;
}

/**
 * A stock/built-in Galaxy tool id: a bare id carrying no owner/repo — `Cut1`,
 * `Show beginning1`, collection ops, `__APPLY_RULES__`. Neither a full ToolShed
 * id nor the `owner/repo/tool` short form. The ToolShed can still resolve these
 * by bare id even though it doesn't host them as repos.
 */
function isStockToolId(toolId: string): boolean {
  return parseToolshedToolId(toolId) === null && normalizeShortTrsToolId(toolId) === null;
}

/**
 * A pinned stock version missed. Ask the shed for the tool version-agnostically:
 * if it resolves to a *different* concrete version, the pin is a hallucination —
 * flag it as a hard error. If the tool can't be resolved at all (offline, unknown
 * to the shed) we can't prove the pin wrong, so return null and let it skip.
 */
async function detectStockVersionMismatch(
  service: ToolInfoService,
  toolId: string,
  pinnedVersion: string,
): Promise<ResolveError | null> {
  const anyVersion = await service.resolveTool(toolId, null);
  if (anyVersion === null) return null;
  const resolvedVersion = anyVersion.tool.version;
  if (resolvedVersion == null || resolvedVersion === pinnedVersion) return null;
  return { kind: "stock_version_mismatch", toolId, pinnedVersion, resolvedVersion };
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
    // A pinned stock version that missed may be a hallucinated guess. If the shed
    // resolves the tool at a different version, treat the pin as a hard error
    // rather than a silent skip (closes the #139 draft-validate loophole).
    if (version != null && isStockToolId(toolId)) {
      const mismatch = await detectStockVersionMismatch(service, toolId, version);
      if (mismatch !== null) return mismatch;
    }
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
