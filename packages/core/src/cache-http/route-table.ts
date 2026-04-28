/**
 * URL routing for the shared cache HTTP surface.
 *
 * `matchCacheRoute` returns a tagged-union route object given a method + url
 * (or null if no cache route matches). `dispatchCacheRoute` invokes the
 * matching handler. Both are framework-agnostic — server adapters (Node http,
 * Effect HttpServer, …) compose them with their own non-cache routes.
 */

import {
  addTool,
  cacheStats,
  clearCache,
  deleteCacheEntry,
  getParameterSchema,
  getParsedTool,
  getToolSource,
  listCache,
  refetchTool,
  searchTools,
  trsGetTool,
  trsListTools,
  trsListVersions,
  type HandlerCtx,
} from "./handlers.js";
import type { AddRequest, ParameterSchemaKind, RefetchRequest } from "./dto.js";

export type CacheRoute =
  // Read surface (mirrors Galaxy/ToolShed shapes)
  | { handler: "searchTools"; query: URLSearchParams }
  | { handler: "trsListTools" }
  | { handler: "trsGetTool"; toolId: string }
  | { handler: "trsListVersions"; toolId: string }
  | { handler: "getParsedTool"; toolId: string; toolVersion: string }
  | {
      handler: "getParameterSchema";
      toolId: string;
      toolVersion: string;
      kind: ParameterSchemaKind;
    }
  | { handler: "getToolSource"; toolId: string; toolVersion: string }
  // Admin namespace (cacheKey-addressed for writes)
  | { handler: "listCache"; query: URLSearchParams }
  | { handler: "cacheStats" }
  | { handler: "deleteCacheEntry"; cacheKey: string }
  | { handler: "clearCache"; query: URLSearchParams }
  | { handler: "refetchTool" }
  | { handler: "addTool" };

const PARAMETER_SCHEMA_TAILS: Record<string, ParameterSchemaKind> = {
  parameter_request_schema: "request",
  parameter_landing_request_schema: "landing_request",
  parameter_test_case_xml_schema: "test_case_xml",
};

const TRS_PREFIX = "/api/ga4gh/trs/v2/tools";

/** Match a method + url against the shared cache HTTP surface. */
export function matchCacheRoute(method: string, url: string): CacheRoute | null {
  const [rawPath, queryStr] = url.split("?");
  const query = new URLSearchParams(queryStr ?? "");

  // Admin namespace
  if (rawPath === "/api/tool-cache" || rawPath.startsWith("/api/tool-cache/")) {
    if (rawPath === "/api/tool-cache") {
      if (method === "GET") return { handler: "listCache", query };
      if (method === "DELETE") return { handler: "clearCache", query };
      return null;
    }
    if (rawPath === "/api/tool-cache/stats" && method === "GET") {
      return { handler: "cacheStats" };
    }
    if (rawPath === "/api/tool-cache/refetch" && method === "POST") {
      return { handler: "refetchTool" };
    }
    if (rawPath === "/api/tool-cache/add" && method === "POST") {
      return { handler: "addTool" };
    }
    const keyMatch = rawPath.match(/^\/api\/tool-cache\/([^/]+)$/);
    if (keyMatch && method === "DELETE") {
      return { handler: "deleteCacheEntry", cacheKey: decodeURIComponent(keyMatch[1]) };
    }
    return null;
  }

  // TRS namespace
  if (rawPath === TRS_PREFIX || rawPath.startsWith(`${TRS_PREFIX}/`)) {
    if (method !== "GET") return null;
    if (rawPath === TRS_PREFIX) return { handler: "trsListTools" };
    const versionsMatch = rawPath.match(/^\/api\/ga4gh\/trs\/v2\/tools\/([^/]+)\/versions$/);
    if (versionsMatch) {
      return { handler: "trsListVersions", toolId: decodeURIComponent(versionsMatch[1]) };
    }
    const toolMatch = rawPath.match(/^\/api\/ga4gh\/trs\/v2\/tools\/([^/]+)$/);
    if (toolMatch) {
      return { handler: "trsGetTool", toolId: decodeURIComponent(toolMatch[1]) };
    }
    return null;
  }

  // /api/tools (search + per-version reads)
  if (rawPath === "/api/tools" && method === "GET") {
    return { handler: "searchTools", query };
  }
  const versionMatch = rawPath.match(/^\/api\/tools\/([^/]+)\/versions\/([^/]+)(?:\/([^/]+))?$/);
  if (versionMatch && method === "GET") {
    const toolId = decodeURIComponent(versionMatch[1]);
    const toolVersion = decodeURIComponent(versionMatch[2]);
    const tail = versionMatch[3];
    if (tail === undefined) {
      return { handler: "getParsedTool", toolId, toolVersion };
    }
    if (tail === "tool_source") {
      return { handler: "getToolSource", toolId, toolVersion };
    }
    const kind = PARAMETER_SCHEMA_TAILS[tail];
    if (kind !== undefined) {
      return { handler: "getParameterSchema", toolId, toolVersion, kind };
    }
  }

  return null;
}

/**
 * Run the handler for a matched cache route. Body-bearing routes
 * (`refetchTool`, `addTool`) call `readBody` to obtain the parsed JSON body.
 * Errors throw `HttpError`; adapters translate them.
 */
export async function dispatchCacheRoute(
  route: CacheRoute,
  ctx: HandlerCtx,
  readBody: <T>() => Promise<T>,
): Promise<unknown> {
  switch (route.handler) {
    case "searchTools": {
      const q = route.query.get("q") ?? undefined;
      const pageStr = route.query.get("page");
      const pageSizeStr = route.query.get("page_size");
      const opts: { q?: string; page?: number; pageSize?: number } = {};
      if (q !== undefined) opts.q = q;
      if (pageStr !== null) opts.page = Number(pageStr);
      if (pageSizeStr !== null) opts.pageSize = Number(pageSizeStr);
      return searchTools(ctx, opts);
    }
    case "trsListTools":
      return trsListTools(ctx);
    case "trsGetTool":
      return trsGetTool(ctx, route.toolId);
    case "trsListVersions":
      return trsListVersions(ctx, route.toolId);
    case "getParsedTool":
      return getParsedTool(ctx, route.toolId, route.toolVersion);
    case "getParameterSchema":
      return getParameterSchema(ctx, route.toolId, route.toolVersion, route.kind);
    case "getToolSource":
      // Always throws HttpError(501) for now.
      getToolSource(ctx, route.toolId, route.toolVersion);
      return null;
    case "listCache": {
      const decode = route.query.get("decode") === "1";
      return listCache(ctx, { decode });
    }
    case "cacheStats":
      return cacheStats(ctx);
    case "deleteCacheEntry":
      return deleteCacheEntry(ctx, route.cacheKey);
    case "clearCache": {
      const prefix = route.query.get("prefix") ?? undefined;
      return clearCache(ctx, prefix);
    }
    case "refetchTool":
      return refetchTool(ctx, await readBody<RefetchRequest>());
    case "addTool":
      return addTool(ctx, await readBody<AddRequest>());
  }
}
