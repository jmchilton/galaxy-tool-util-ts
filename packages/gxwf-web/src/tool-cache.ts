/**
 * Tool cache inspection / management endpoints.
 * Thin wrappers over `state.cache: ToolCache` and `state.infoService: ToolInfoService`.
 */

import * as S from "effect/Schema";
import { ParsedTool } from "@galaxy-tool-util/schema";
import { parseToolshedToolId, toolIdFromTrs } from "@galaxy-tool-util/core";
import type { CacheStats } from "@galaxy-tool-util/core";
import type { AppState } from "./router.js";
import { HttpError } from "./contents.js";

export interface CachedToolEntry {
  cacheKey: string;
  toolId: string;
  toolVersion: string;
  source: string;
  sourceUrl: string;
  cachedAt: string;
  sizeBytes?: number;
  decodable: boolean;
  /** Deep link to the ToolShed repo page when the tool id is parseable. */
  toolshedUrl?: string;
  /** Whether this entry can drive a refetch — false for orphans / unknown ids. */
  refetchable: boolean;
}

export interface ListResponse {
  entries: CachedToolEntry[];
  stats: CacheStats;
}

export interface RawResponse {
  contents: unknown;
  decodable: boolean;
}

export interface DeleteResponse {
  removed: boolean;
}

export interface ClearResponse {
  removed: number;
}

export interface RefetchRequest {
  toolId: string;
  toolVersion?: string;
}

export interface RefetchResponse {
  cacheKey: string;
  fetched: boolean;
  alreadyCached: boolean;
}

export interface AddRequest {
  toolId: string;
  toolVersion?: string;
}

export interface AddResponse {
  cacheKey: string;
  alreadyCached: boolean;
}

const decodeParsedTool = S.decodeUnknownSync(ParsedTool);

function tryDecode(contents: unknown): boolean {
  try {
    decodeParsedTool(contents);
    return true;
  } catch {
    return false;
  }
}

interface IndexEntry {
  cache_key: string;
  tool_id: string;
  tool_version: string;
  source: string;
  source_url: string;
  cached_at: string;
}

async function decorate(
  state: AppState,
  entry: IndexEntry,
  decode: boolean,
): Promise<CachedToolEntry> {
  const parsed = parseToolshedToolId(entry.tool_id);
  // An entry is refetchable when (a) we know which tool to ask for, and
  // (b) it isn't an orphan reconstruction with placeholder metadata.
  const refetchable =
    entry.source !== "orphan" && entry.tool_id !== "unknown" && entry.tool_id !== "";
  const out: CachedToolEntry = {
    cacheKey: entry.cache_key,
    toolId: entry.tool_id,
    toolVersion: entry.tool_version,
    source: entry.source,
    sourceUrl: entry.source_url,
    cachedAt: entry.cached_at,
    // Default to true when not probing — UI shouldn't flag-as-broken what we
    // didn't actually check. Callers wanting accuracy must pass `?decode=1`.
    decodable: true,
    refetchable,
  };
  if (parsed !== null) {
    out.toolshedUrl = `https://${toolIdFromTrs(parsed.toolshedUrl, parsed.trsToolId)}`;
  }

  const stat = await state.cache.statCached(entry.cache_key);
  if (stat !== null) out.sizeBytes = stat.sizeBytes;

  if (decode) {
    const raw = await state.cache.loadCachedRaw(entry.cache_key);
    out.decodable = raw !== null && tryDecode(raw);
  }

  return out;
}

export interface ListOptions {
  /** Probe each entry to flag undecodable payloads. Adds N file reads. */
  decode?: boolean;
}

export async function listToolCache(
  state: AppState,
  opts: ListOptions = {},
): Promise<ListResponse> {
  // Single pass: derive aggregate stats from the same per-entry stats we need
  // for the table. Avoids `getCacheStats()` re-walking the index.
  const raw = (await state.cache.listCached()) as IndexEntry[];
  const entries = await Promise.all(raw.map((e) => decorate(state, e, opts.decode === true)));

  const bySource: Record<string, number> = {};
  let oldest: string | undefined;
  let newest: string | undefined;
  let totalBytes = 0;
  let anySize = false;
  for (const e of entries) {
    bySource[e.source] = (bySource[e.source] ?? 0) + 1;
    if (oldest === undefined || e.cachedAt < oldest) oldest = e.cachedAt;
    if (newest === undefined || e.cachedAt > newest) newest = e.cachedAt;
    if (e.sizeBytes !== undefined) {
      totalBytes += e.sizeBytes;
      anySize = true;
    }
  }
  const stats: CacheStats = { count: entries.length, bySource };
  if (oldest !== undefined) stats.oldest = oldest;
  if (newest !== undefined) stats.newest = newest;
  if (anySize) stats.totalBytes = totalBytes;
  return { entries, stats };
}

export async function getToolCacheStats(state: AppState): Promise<CacheStats> {
  return state.cache.getCacheStats();
}

export async function getToolCacheRaw(state: AppState, key: string): Promise<RawResponse> {
  const contents = await state.cache.loadCachedRaw(key);
  if (contents === null) throw new HttpError(404, `No cached entry: ${key}`);
  return { contents, decodable: tryDecode(contents) };
}

export async function deleteToolCacheEntry(state: AppState, key: string): Promise<DeleteResponse> {
  const removed = await state.cache.removeCached(key);
  if (!removed) throw new HttpError(404, `No cached entry: ${key}`);
  return { removed };
}

export async function clearToolCache(state: AppState, prefix?: string): Promise<ClearResponse> {
  const removed = await state.cache.clearCache(prefix);
  return { removed };
}

export async function refetchToolCacheEntry(
  state: AppState,
  body: RefetchRequest,
): Promise<RefetchResponse> {
  if (!body.toolId) throw new HttpError(400, "toolId is required");
  try {
    return await state.infoService.refetch(body.toolId, body.toolVersion ?? null, { force: true });
  } catch (e) {
    throw new HttpError(502, e instanceof Error ? e.message : String(e));
  }
}

export async function addToolCacheEntry(state: AppState, body: AddRequest): Promise<AddResponse> {
  if (!body.toolId) throw new HttpError(400, "toolId is required");
  try {
    const r = await state.infoService.refetch(body.toolId, body.toolVersion ?? null);
    return { cacheKey: r.cacheKey, alreadyCached: r.alreadyCached };
  } catch (e) {
    throw new HttpError(502, e instanceof Error ? e.message : String(e));
  }
}
