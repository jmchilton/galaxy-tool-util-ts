import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import * as fs from "node:fs";
import * as fsPromises from "node:fs/promises";
import * as path from "node:path";
import {
  HttpError,
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
  type AddRequest,
  type HandlerCtx,
  type ParameterSchemaKind,
  type RefetchRequest,
  type ToolInfoService,
  type ToolSource as CoreToolSource,
} from "@galaxy-tool-util/core";
import { makeNodeToolInfoService } from "@galaxy-tool-util/core/node";
import type { ServerConfig } from "./config.js";

/** Shared context for the proxy server — holds config and the ToolInfoService. */
export interface ProxyContext {
  config: ServerConfig;
  service: ToolInfoService;
  /** If set, GET requests outside the API namespace are served from this directory. */
  uiDir?: string;
}

/** Optional inputs for building a {@link ProxyContext}. */
export interface CreateProxyContextOptions {
  /** Static-file directory for the bundled SPA. */
  uiDir?: string;
}

/** Build a ProxyContext from config — initializes ToolInfoService with configured sources. */
export function createProxyContext(
  config: ServerConfig,
  options: CreateProxyContextOptions = {},
): ProxyContext {
  const enabledSources = config["galaxy.workflows.toolSources"].filter((s) => s.enabled);
  const coreSources: CoreToolSource[] = enabledSources.map((s) => ({
    type: s.type,
    url: s.url,
  }));
  const service = makeNodeToolInfoService({
    cacheDir: config["galaxy.workflows.toolCache"]?.directory,
    sources: coreSources,
  });
  return { config, service, uiDir: options.uiDir };
}

// ── Route table ──────────────────────────────────────────────────────────

type Route =
  // Read surface
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
  // Admin namespace
  | { handler: "listCache"; query: URLSearchParams }
  | { handler: "cacheStats" }
  | { handler: "deleteCacheEntry"; cacheKey: string }
  | { handler: "clearCache"; query: URLSearchParams }
  | { handler: "refetchTool" }
  | { handler: "addTool" };

const TRS_PREFIX = "/api/ga4gh/trs/v2/tools";

const PARAMETER_SCHEMA_TAILS: Record<string, ParameterSchemaKind> = {
  parameter_request_schema: "request",
  parameter_landing_request_schema: "landing_request",
  parameter_test_case_xml_schema: "test_case_xml",
};

function matchRoute(method: string, url: string): Route | null {
  const [rawPath, queryStr] = url.split("?");
  const query = new URLSearchParams(queryStr ?? "");

  // ── Admin namespace ────────────────────────────────────────────────
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

  // ── TRS namespace ──────────────────────────────────────────────────
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

  // ── /api/tools (search + per-version reads) ────────────────────────
  if (rawPath === "/api/tools" && method === "GET") {
    return { handler: "searchTools", query };
  }

  // /api/tools/:tool_id/versions/:version[/<tail>]
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

// ── Adapter helpers ──────────────────────────────────────────────────────

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function cors(res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

async function readJsonBody<T>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf-8")) as T);
      } catch (e) {
        reject(new HttpError(400, `Invalid JSON body: ${String(e)}`));
      }
    });
    req.on("error", reject);
  });
}

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json",
};

async function serveStatic(uiDir: string, urlPath: string, res: ServerResponse): Promise<void> {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    json(res, 400, { detail: "Invalid URL encoding" });
    return;
  }
  const relPath = decoded.replace(/^\/+/, "") || "index.html";
  const base = path.resolve(uiDir);
  const resolved = path.resolve(base, relPath);
  if (resolved !== base && !resolved.startsWith(base + path.sep)) {
    json(res, 403, { detail: "Forbidden" });
    return;
  }
  const filePath =
    fs.existsSync(resolved) && fs.statSync(resolved).isFile()
      ? resolved
      : path.join(base, "index.html");
  if (!fs.existsSync(filePath)) {
    json(res, 404, { detail: "Not found" });
    return;
  }
  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] ?? "application/octet-stream";
  const content = await fsPromises.readFile(filePath);
  res.writeHead(200, {
    "Content-Type": contentType,
    "Content-Length": content.length,
  });
  res.end(content);
}

function originFromRequest(req: IncomingMessage): string {
  const host = (req.headers["x-forwarded-host"] ?? req.headers.host) as string | undefined;
  const proto =
    (req.headers["x-forwarded-proto"] as string | undefined) ??
    ((req.socket as { encrypted?: boolean }).encrypted ? "https" : "http");
  return host ? `${proto}://${host}` : "";
}

// ── Request handler ──────────────────────────────────────────────────────

/** Create the async request handler that routes to the shared cache-http handlers. */
export function createRequestHandler(ctx: ProxyContext) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    cors(res);

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = req.url ?? "/";
    const method = req.method ?? "GET";
    const route = matchRoute(method, url);

    if (!route) {
      if (ctx.uiDir && method === "GET") {
        const [pathOnly] = url.split("?");
        await serveStatic(ctx.uiDir, pathOnly, res);
        return;
      }
      json(res, 404, { detail: "Not found" });
      return;
    }

    const handlerCtx: HandlerCtx = { service: ctx.service, baseUrl: originFromRequest(req) };

    try {
      switch (route.handler) {
        case "searchTools": {
          const q = route.query.get("q") ?? undefined;
          const pageStr = route.query.get("page");
          const pageSizeStr = route.query.get("page_size");
          const opts: { q?: string; page?: number; pageSize?: number } = {};
          if (q !== undefined) opts.q = q;
          if (pageStr !== null) opts.page = Number(pageStr);
          if (pageSizeStr !== null) opts.pageSize = Number(pageSizeStr);
          json(res, 200, await searchTools(handlerCtx, opts));
          break;
        }
        case "trsListTools":
          json(res, 200, await trsListTools(handlerCtx));
          break;
        case "trsGetTool":
          json(res, 200, await trsGetTool(handlerCtx, route.toolId));
          break;
        case "trsListVersions":
          json(res, 200, await trsListVersions(handlerCtx, route.toolId));
          break;
        case "getParsedTool":
          json(res, 200, await getParsedTool(handlerCtx, route.toolId, route.toolVersion));
          break;
        case "getParameterSchema":
          json(
            res,
            200,
            await getParameterSchema(handlerCtx, route.toolId, route.toolVersion, route.kind),
          );
          break;
        case "getToolSource":
          // Always throws HttpError(501) for now.
          getToolSource(handlerCtx, route.toolId, route.toolVersion);
          break;
        case "listCache": {
          const decode = route.query.get("decode") === "1";
          json(res, 200, await listCache(handlerCtx, { decode }));
          break;
        }
        case "cacheStats":
          json(res, 200, await cacheStats(handlerCtx));
          break;
        case "deleteCacheEntry":
          json(res, 200, await deleteCacheEntry(handlerCtx, route.cacheKey));
          break;
        case "clearCache": {
          const prefix = route.query.get("prefix") ?? undefined;
          json(res, 200, await clearCache(handlerCtx, prefix));
          break;
        }
        case "refetchTool": {
          const body = await readJsonBody<RefetchRequest>(req);
          json(res, 200, await refetchTool(handlerCtx, body));
          break;
        }
        case "addTool": {
          const body = await readJsonBody<AddRequest>(req);
          json(res, 200, await addTool(handlerCtx, body));
          break;
        }
      }
    } catch (e) {
      if (e instanceof HttpError) {
        json(res, e.status, { detail: e.message });
      } else {
        const msg = e instanceof Error ? e.message : String(e);
        json(res, 500, { detail: msg });
      }
    }
  };
}

/** Create an HTTP server wired to the proxy request handler. */
export function createProxyServer(ctx: ProxyContext) {
  const handler = createRequestHandler(ctx);
  return createServer((req, res) => {
    void handler(req, res);
  });
}
