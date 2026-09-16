/**
 * Framework-agnostic handler functions for the shared cache HTTP surface.
 *
 * Both gxwf-web (Route-union dispatch) and tool-cache-proxy (node:http switch)
 * call these functions; their server-specific layer just parses URL/body and
 * serializes the return value. HTTP failures throw `HttpError`.
 */

import * as S from "effect/Schema";
import * as JSONSchema from "effect/JSONSchema";
import {
  ParsedTool,
  createFieldModel,
  type StateRepresentation,
  type ToolParameterBundleModel,
  type TrsTool,
  type TrsToolVersion,
} from "@galaxy-tool-util/schema";
import type { ToolInfoService } from "../tool-info.js";
import type { ToolSourceDocument } from "../tool-source.js";
import { parseToolshedToolId, toolIdFromTrs } from "../cache/tool-id.js";
import type { CacheStats } from "../cache/tool-cache.js";
import { HttpError } from "./error.js";
import { cacheToTrs, cacheToTrsOne, toTrsToolId, type CacheIndexRecord } from "./cache-to-trs.js";
import type {
  AddRequest,
  AddResponse,
  CachedToolEntry,
  ClearResponse,
  DeleteResponse,
  ListResponse,
  ParameterSchemaKind,
  RefetchRequest,
  RefetchResponse,
  SearchResults,
} from "./dto.js";

/** Per-request context — the service implements both reads and admin ops. */
export interface HandlerCtx {
  service: ToolInfoService;
  /** Absolute base URL for self-referential links (TRS Tool.url etc.). May be empty. */
  baseUrl: string;
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

async function decorate(
  ctx: HandlerCtx,
  entry: CacheIndexRecord,
  decode: boolean,
): Promise<CachedToolEntry> {
  const parsed = parseToolshedToolId(entry.tool_id);
  const refetchable =
    entry.source !== "orphan" && entry.tool_id !== "unknown" && entry.tool_id !== "";
  const out: CachedToolEntry = {
    cacheKey: entry.cache_key,
    toolId: entry.tool_id,
    toolVersion: entry.tool_version,
    source: entry.source,
    sourceUrl: entry.source_url,
    cachedAt: entry.cached_at,
    // Optimistic when not probing — UI shouldn't flag-as-broken what we
    // didn't actually check.
    decodable: true,
    refetchable,
  };
  if (parsed !== null) {
    out.toolshedUrl = `https://${toolIdFromTrs(parsed.toolshedUrl, parsed.trsToolId)}`;
  }
  const stat = await ctx.service.cache.statCached(entry.cache_key);
  if (stat !== null) out.sizeBytes = stat.sizeBytes;
  if (decode) {
    const raw = await ctx.service.cache.loadCachedRaw(entry.cache_key);
    out.decodable = raw !== null && tryDecode(raw);
  }
  return out;
}

export interface ListOptions {
  /** Probe each entry to flag undecodable payloads. Adds N file reads. */
  decode?: boolean;
}

// ── Admin namespace ────────────────────────────────────────────────────

export async function listCache(ctx: HandlerCtx, opts: ListOptions = {}): Promise<ListResponse> {
  const raw = (await ctx.service.cache.listCached()) as CacheIndexRecord[];
  const entries = await Promise.all(raw.map((e) => decorate(ctx, e, opts.decode === true)));

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

export async function cacheStats(ctx: HandlerCtx): Promise<CacheStats> {
  return ctx.service.cache.getCacheStats();
}

export async function deleteCacheEntry(ctx: HandlerCtx, cacheKey: string): Promise<DeleteResponse> {
  const removed = await ctx.service.cache.removeCached(cacheKey);
  if (!removed) throw new HttpError(404, `No cached entry: ${cacheKey}`);
  return { removed };
}

export async function clearCache(ctx: HandlerCtx, prefix?: string): Promise<ClearResponse> {
  const removed = await ctx.service.cache.clearCache(prefix);
  return { removed };
}

export async function refetchTool(ctx: HandlerCtx, body: RefetchRequest): Promise<RefetchResponse> {
  if (!body.toolId) throw new HttpError(400, "toolId is required");
  try {
    return await ctx.service.refetch(body.toolId, body.toolVersion ?? null, { force: true });
  } catch (e) {
    throw new HttpError(502, e instanceof Error ? e.message : String(e));
  }
}

export async function addTool(ctx: HandlerCtx, body: AddRequest): Promise<AddResponse> {
  if (!body.toolId) throw new HttpError(400, "toolId is required");
  try {
    const r = await ctx.service.refetch(body.toolId, body.toolVersion ?? null);
    return { cacheKey: r.cacheKey, alreadyCached: r.alreadyCached };
  } catch (e) {
    throw new HttpError(502, e instanceof Error ? e.message : String(e));
  }
}

// ── Read namespace ─────────────────────────────────────────────────────

export interface SearchOptions {
  q?: string;
  page?: number;
  pageSize?: number;
}

const DEFAULT_PAGE_SIZE = 25;

export async function searchTools(ctx: HandlerCtx, opts: SearchOptions): Promise<SearchResults> {
  const q = (opts.q ?? "").trim().toLowerCase();
  const page = Math.max(1, Math.floor(opts.page ?? 1));
  const pageSize = Math.max(1, Math.min(200, Math.floor(opts.pageSize ?? DEFAULT_PAGE_SIZE)));

  const entries = (await ctx.service.cache.listCached()) as CacheIndexRecord[];
  const enriched = await Promise.all(
    entries.map(async (entry) => {
      let name: string | undefined;
      let description: string | undefined;
      const raw = await ctx.service.cache.loadCachedRaw(entry.cache_key);
      if (raw !== null && typeof raw === "object") {
        const r = raw as { name?: unknown; description?: unknown };
        if (typeof r.name === "string") name = r.name;
        if (typeof r.description === "string") description = r.description;
      }
      return { entry, name, description };
    }),
  );
  const filtered =
    q === ""
      ? enriched
      : enriched.filter(({ entry, name, description }) => {
          if (entry.tool_id.toLowerCase().includes(q)) return true;
          if (name !== undefined && name.toLowerCase().includes(q)) return true;
          if (description !== undefined && description.toLowerCase().includes(q)) return true;
          return false;
        });
  const total = filtered.length;
  const start = (page - 1) * pageSize;
  const slice = filtered.slice(start, start + pageSize);
  return {
    q,
    page,
    pageSize,
    total,
    hits: slice.map(({ entry, name, description }) => {
      const hit: SearchResults["hits"][number] = {
        toolId: toTrsToolId(entry.tool_id),
        toolVersion: entry.tool_version,
      };
      if (name !== undefined) hit.name = name;
      if (description !== undefined) hit.description = description;
      return hit;
    }),
  };
}

export async function trsListTools(ctx: HandlerCtx): Promise<TrsTool[]> {
  const entries = (await ctx.service.cache.listCached()) as CacheIndexRecord[];
  return cacheToTrs(entries, ctx.baseUrl);
}

export async function trsGetTool(ctx: HandlerCtx, toolId: string): Promise<TrsTool> {
  const entries = (await ctx.service.cache.listCached()) as CacheIndexRecord[];
  const tool = cacheToTrsOne(entries, toolId, ctx.baseUrl);
  if (tool === null) throw new HttpError(404, `Tool not found: ${toolId}`);
  return tool;
}

export async function trsListVersions(ctx: HandlerCtx, toolId: string): Promise<TrsToolVersion[]> {
  const tool = await trsGetTool(ctx, toolId);
  return [...tool.versions];
}

export async function getParsedTool(
  ctx: HandlerCtx,
  toolId: string,
  toolVersion: string,
): Promise<unknown> {
  const tool = await ctx.service.getToolInfo(toolId, toolVersion);
  if (tool === null) throw new HttpError(404, `Tool not found: ${toolId}@${toolVersion}`);
  return tool;
}

const SCHEMA_KIND_TO_REPRESENTATION: Record<ParameterSchemaKind, StateRepresentation> = {
  request: "request",
  landing_request: "landing_request",
  test_case_xml: "test_case_xml",
};

export async function getParameterSchema(
  ctx: HandlerCtx,
  toolId: string,
  toolVersion: string,
  kind: ParameterSchemaKind,
): Promise<unknown> {
  const representation = SCHEMA_KIND_TO_REPRESENTATION[kind];
  if (representation === undefined) {
    throw new HttpError(400, `Unknown parameter schema kind: ${kind}`);
  }
  const tool = await ctx.service.getToolInfo(toolId, toolVersion);
  if (tool === null) throw new HttpError(404, `Tool not found: ${toolId}@${toolVersion}`);
  const bundle: ToolParameterBundleModel = {
    parameters: tool.inputs as ToolParameterBundleModel["parameters"],
  };
  const effectSchema = createFieldModel(bundle, representation);
  if (!effectSchema) {
    throw new HttpError(500, "Could not generate schema — unsupported parameter types");
  }
  try {
    return JSONSchema.make(effectSchema);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new HttpError(500, `JSON Schema generation failed: ${msg}`);
  }
}

export async function getToolSource(
  ctx: HandlerCtx,
  toolId: string,
  toolVersion: string,
): Promise<ToolSourceDocument> {
  let source: ToolSourceDocument | null;
  try {
    source = await ctx.service.fetchToolSource(toolId, toolVersion);
  } catch (err) {
    throw new HttpError(502, err instanceof Error ? err.message : String(err));
  }
  if (source === null) throw new HttpError(404, `Tool source not found: ${toolId}@${toolVersion}`);
  return source;
}
