/**
 * HTTP request handler for the gxwf-web API.
 *
 * Routes /api/contents/* paths to the contents module.
 * Routes /workflows/* paths to workflow operations.
 * Routes /api/schemas/structural to the structural JSON Schema export.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import * as fs from "node:fs";
import * as fsPromises from "node:fs/promises";
import * as path from "node:path";
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
  type AddRequest as ToolAddRequest,
  type HandlerCtx,
  type ParameterSchemaKind,
  type RefetchRequest as ToolRefetchRequest,
  type ToolCache,
  type ToolInfoService,
} from "@galaxy-tool-util/core";
import {
  GalaxyWorkflowSchema,
  NativeGalaxyWorkflowSchema,
  type WorkflowIndex,
} from "@galaxy-tool-util/schema";
import * as JSONSchema from "effect/JSONSchema";
import {
  createCheckpoint,
  createUntitled,
  deleteCheckpoint,
  deleteContents,
  HttpError,
  isWorkflowFile,
  listCheckpoints,
  readContents,
  renameContents,
  restoreCheckpoint,
  writeContents,
} from "./contents.js";
import type { ContentsModel, CreateRequest, RenameRequest } from "./models.js";
import {
  discoverWorkflows,
  loadWorkflowFile,
  operateValidate,
  operateLint,
  operateClean,
  operateExport,
  operateConvert,
  operateRoundtrip,
  type ValidateOptions,
  type LintOptions,
  type CleanOptions,
  type ExportConvertOptions,
  type RoundtripOptions,
} from "./workflows.js";

// ── State ────────────────────────────────────────────────────────────

export interface AppState {
  directory: string;
  cache: ToolCache;
  infoService: ToolInfoService;
  workflows: WorkflowIndex;
  cacheDir?: string;
  /** Absolute path to a built gxwf-ui dist directory to serve as the frontend. */
  uiDir?: string;
  /** Extra origins appended to the CSP `connect-src` directive. */
  extraConnectSrc?: string[];
}

// ── Helpers ──────────────────────────────────────────────────────────

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function noContent(res: ServerResponse): void {
  res.writeHead(204);
  res.end();
}

function cors(res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, If-Unmodified-Since");
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

function parseHttpDate(s: string): Date | null {
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

// ── Content Security Policy ──────────────────────────────────────────

// Baseline connect-src origins: the public Galaxy ToolShed for direct
// tool-cache reads. Per-deployment tool-cache proxies or alternate ToolShed
// mirrors extend this via `extraConnectSrc` on CreateAppOptions. The Monaco
// extension is now served from `/ext/` on this same origin (staged-unpacked
// .vsix), so no extra origins are needed for the extension file fetches.
const CSP_CONNECT_SRC_BASE = ["https://toolshed.g2.bx.psu.edu"];

export function buildCspHeader(extraConnectSrc: string[] = []): string {
  const connectSrc = ["'self'", ...CSP_CONNECT_SRC_BASE, ...extraConnectSrc].join(" ");
  return [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval'",
    "worker-src 'self' blob:",
    "frame-src 'self' blob:",
    `connect-src ${connectSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "img-src 'self' data:",
  ].join("; ");
}

// Served only for /monaco/* assets (e.g. webWorkerExtensionHostIframe.html,
// workers). The iframe ships its own meta CSP tight enough for the extension
// host; the HTTP CSP here just needs to be permissive enough not to intersect
// that meta policy into uselessness. Inline scripts + `unsafe-eval` are the
// extension host's baseline requirements.
export function buildMonacoCspHeader(extraConnectSrc: string[] = []): string {
  const connectSrc = ["'self'", ...CSP_CONNECT_SRC_BASE, ...extraConnectSrc].join(" ");
  return [
    "default-src 'self' blob: data:",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' blob:",
    "worker-src 'self' blob:",
    "frame-src 'self' blob:",
    `connect-src ${connectSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "img-src 'self' data: blob:",
  ].join("; ");
}

// ── Static file serving ──────────────────────────────────────────────

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".map": "application/json",
};

async function serveStatic(
  uiDir: string,
  urlPath: string,
  res: ServerResponse,
  cspHeader: string,
): Promise<void> {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    json(res, 400, { detail: "Invalid URL encoding" });
    return;
  }

  // Normalise to a relative path and guard against traversal
  const relPath = decoded.replace(/^\/+/, "") || "index.html";
  const base = path.resolve(uiDir);
  const resolved = path.resolve(base, relPath);
  if (resolved !== base && !resolved.startsWith(base + path.sep)) {
    json(res, 403, { detail: "Forbidden" });
    return;
  }

  // Serve the file if it exists, otherwise fall back to index.html (SPA routing)
  const filePath =
    fs.existsSync(resolved) && fs.statSync(resolved).isFile()
      ? resolved
      : path.join(base, "index.html");

  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] ?? "application/octet-stream";
  const content = await fsPromises.readFile(filePath);

  res.writeHead(200, {
    "Content-Type": contentType,
    "Content-Length": content.length,
    "Content-Security-Policy": cspHeader,
  });
  res.end(content);
}

// ── Route matching ───────────────────────────────────────────────────

const CONTENTS_PREFIX = "/api/contents";

const PARAMETER_SCHEMA_TAILS: Record<string, ParameterSchemaKind> = {
  parameter_request_schema: "request",
  parameter_landing_request_schema: "landing_request",
  parameter_test_case_xml_schema: "test_case_xml",
};

type WorkflowOp = "validate" | "clean" | "lint" | "export" | "convert" | "roundtrip";
const WORKFLOW_OPS = new Set<string>([
  "validate",
  "clean",
  "lint",
  "export",
  "convert",
  "roundtrip",
]);
const MUTATING_OPS = new Set<string>(["clean", "export", "convert"]);

type Route =
  | { handler: "readRoot"; query: URLSearchParams }
  | { handler: "createRootUntitled"; query: URLSearchParams }
  | { handler: "readPath"; filePath: string; query: URLSearchParams }
  | { handler: "writePath"; filePath: string; query: URLSearchParams }
  | { handler: "renamePath"; filePath: string; query: URLSearchParams }
  | { handler: "deletePath"; filePath: string; query: URLSearchParams }
  | { handler: "createUntitled"; filePath: string; query: URLSearchParams }
  | { handler: "listCheckpoints"; filePath: string; query: URLSearchParams }
  | { handler: "createCheckpoint"; filePath: string; query: URLSearchParams }
  | { handler: "restoreCheckpoint"; filePath: string; cpId: string; query: URLSearchParams }
  | { handler: "deleteCheckpoint"; filePath: string; cpId: string; query: URLSearchParams }
  | { handler: "listWorkflows" }
  | { handler: "refreshWorkflows" }
  | { handler: "workflowOp"; filePath: string; op: WorkflowOp; query: URLSearchParams }
  | { handler: "structuralSchema"; query: URLSearchParams }
  // Tool-cache admin namespace (cacheKey is the addressing key for writes).
  | { handler: "toolCacheList"; query: URLSearchParams }
  | { handler: "toolCacheStats" }
  | { handler: "toolCacheDelete"; cacheKey: string }
  | { handler: "toolCacheClear"; query: URLSearchParams }
  | { handler: "toolCacheRefetch" }
  | { handler: "toolCacheAdd" }
  // Read surface (TRS + parsed tool + parameter schemas)
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
  | { handler: "getToolSource"; toolId: string; toolVersion: string };

function matchRoute(method: string, url: string): Route | null {
  const [rawPath, queryStr] = url.split("?");
  const query = new URLSearchParams(queryStr ?? "");

  // Structural schema: GET /api/schemas/structural
  if (rawPath === "/api/schemas/structural" && method === "GET") {
    return { handler: "structuralSchema", query };
  }

  // Tool cache admin routes (cacheKey-addressed)
  if (rawPath === "/api/tool-cache" || rawPath.startsWith("/api/tool-cache/")) {
    if (rawPath === "/api/tool-cache") {
      if (method === "GET") return { handler: "toolCacheList", query };
      if (method === "DELETE") return { handler: "toolCacheClear", query };
      return null;
    }
    if (rawPath === "/api/tool-cache/stats" && method === "GET") {
      return { handler: "toolCacheStats" };
    }
    if (rawPath === "/api/tool-cache/refetch" && method === "POST") {
      return { handler: "toolCacheRefetch" };
    }
    if (rawPath === "/api/tool-cache/add" && method === "POST") {
      return { handler: "toolCacheAdd" };
    }
    const keyMatch = rawPath.match(/^\/api\/tool-cache\/([^/]+)$/);
    if (keyMatch && method === "DELETE") {
      return { handler: "toolCacheDelete", cacheKey: decodeURIComponent(keyMatch[1]) };
    }
    return null;
  }

  // ── Read surface (mirrors Galaxy/ToolShed shapes) ─────────────────
  if (rawPath === "/api/ga4gh/trs/v2/tools" && method === "GET") {
    return { handler: "trsListTools" };
  }
  const trsVersionsMatch = rawPath.match(/^\/api\/ga4gh\/trs\/v2\/tools\/([^/]+)\/versions$/);
  if (trsVersionsMatch && method === "GET") {
    return { handler: "trsListVersions", toolId: decodeURIComponent(trsVersionsMatch[1]) };
  }
  const trsToolMatch = rawPath.match(/^\/api\/ga4gh\/trs\/v2\/tools\/([^/]+)$/);
  if (trsToolMatch && method === "GET") {
    return { handler: "trsGetTool", toolId: decodeURIComponent(trsToolMatch[1]) };
  }
  if (rawPath === "/api/tools" && method === "GET") {
    return { handler: "searchTools", query };
  }
  const toolVersionMatch = rawPath.match(
    /^\/api\/tools\/([^/]+)\/versions\/([^/]+)(?:\/([^/]+))?$/,
  );
  if (toolVersionMatch && method === "GET") {
    const toolId = decodeURIComponent(toolVersionMatch[1]);
    const toolVersion = decodeURIComponent(toolVersionMatch[2]);
    const tail = toolVersionMatch[3];
    if (tail === undefined) return { handler: "getParsedTool", toolId, toolVersion };
    if (tail === "tool_source") return { handler: "getToolSource", toolId, toolVersion };
    const schemaKind = PARAMETER_SCHEMA_TAILS[tail];
    if (schemaKind !== undefined) {
      return { handler: "getParameterSchema", toolId, toolVersion, kind: schemaKind };
    }
  }

  // Workflow list/refresh (must match before the per-workflow op pattern)
  if (rawPath === "/workflows") {
    if (method === "GET") return { handler: "listWorkflows" };
    return null;
  }
  if (rawPath === "/workflows/refresh") {
    if (method === "POST") return { handler: "refreshWorkflows" };
    return null;
  }

  // Per-workflow operations: POST /workflows/{filePath}/{op}
  if (rawPath.startsWith("/workflows/") && method === "POST") {
    const rest = rawPath.slice("/workflows/".length); // "foo/bar.ga/validate"
    const lastSlash = rest.lastIndexOf("/");
    if (lastSlash > 0) {
      const op = rest.slice(lastSlash + 1);
      if (WORKFLOW_OPS.has(op)) {
        const filePath = decodeURIComponent(rest.slice(0, lastSlash));
        return { handler: "workflowOp", filePath, op: op as WorkflowOp, query };
      }
    }
  }

  if (!rawPath.startsWith(CONTENTS_PREFIX)) return null;

  const rest = rawPath.slice(CONTENTS_PREFIX.length); // "" | "/" | "/{path}"

  // Root: /api/contents or /api/contents/
  if (rest === "" || rest === "/") {
    if (method === "GET") return { handler: "readRoot", query };
    if (method === "POST") return { handler: "createRootUntitled", query };
    // DELETE on root → routes to handler that returns 403.
    if (method === "DELETE") return { handler: "deletePath", filePath: "", query };
    return null;
  }

  const pathStr = decodeURIComponent(rest.startsWith("/") ? rest.slice(1) : rest);

  // /checkpoints/{id}: POST = restore, DELETE = delete checkpoint.
  const cpIdMatch = pathStr.match(/^(.+)\/checkpoints\/([^/]+)$/);
  if (cpIdMatch) {
    const filePath = cpIdMatch[1];
    const cpId = cpIdMatch[2];
    if (method === "POST") return { handler: "restoreCheckpoint", filePath, cpId, query };
    if (method === "DELETE") return { handler: "deleteCheckpoint", filePath, cpId, query };
    return null;
  }

  // /checkpoints: GET = list, POST = create checkpoint.
  const cpMatch = pathStr.match(/^(.+)\/checkpoints$/);
  if (cpMatch) {
    const filePath = cpMatch[1];
    if (method === "GET") return { handler: "listCheckpoints", filePath, query };
    if (method === "POST") return { handler: "createCheckpoint", filePath, query };
    return null;
  }

  // Generic path.
  if (method === "GET") return { handler: "readPath", filePath: pathStr, query };
  if (method === "PUT") return { handler: "writePath", filePath: pathStr, query };
  if (method === "PATCH") return { handler: "renamePath", filePath: pathStr, query };
  if (method === "DELETE") return { handler: "deletePath", filePath: pathStr, query };
  if (method === "POST") return { handler: "createUntitled", filePath: pathStr, query };

  return null;
}

// ── Request handler ──────────────────────────────────────────────────

export function createRequestHandler(state: AppState) {
  const { directory } = state;
  const cspHeader = buildCspHeader(state.extraConnectSrc);
  const monacoCspHeader = buildMonacoCspHeader(state.extraConnectSrc);

  function maybeRefreshWorkflows(relPath: string): void {
    if (isWorkflowFile(relPath)) {
      state.workflows = discoverWorkflows(directory);
    }
  }

  function handlerCtx(req: IncomingMessage): HandlerCtx {
    const host = (req.headers["x-forwarded-host"] ?? req.headers.host) as string | undefined;
    const proto =
      (req.headers["x-forwarded-proto"] as string | undefined) ??
      ((req.socket as { encrypted?: boolean }).encrypted ? "https" : "http");
    return {
      service: state.infoService,
      baseUrl: host ? `${proto}://${host}` : "",
    };
  }

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
      if (state.uiDir && method === "GET") {
        const [urlPath] = url.split("?");
        // /monaco/* ships the extension-host iframe and its workers; they need
        // a more permissive CSP than the Vue shell to boot.
        const staticCsp = urlPath.startsWith("/monaco/") ? monacoCspHeader : cspHeader;
        await serveStatic(state.uiDir, urlPath, res, staticCsp);
        return;
      }
      json(res, 404, { detail: "Not found" });
      return;
    }

    try {
      switch (route.handler) {
        case "listWorkflows": {
          json(res, 200, state.workflows);
          break;
        }

        case "refreshWorkflows": {
          state.workflows = discoverWorkflows(directory);
          json(res, 200, state.workflows);
          break;
        }

        case "workflowOp": {
          const wf = loadWorkflowFile(directory, route.filePath);
          let result: unknown;
          switch (route.op) {
            case "validate": {
              const vopts: ValidateOptions = {
                strict_structure: route.query.get("strict_structure") === "true",
                strict_encoding: route.query.get("strict_encoding") === "true",
                connections: route.query.get("connections") === "true",
                mode: route.query.get("mode") ?? undefined,
                clean_first: route.query.get("clean_first") === "true",
                allow: route.query.getAll("allow"),
                deny: route.query.getAll("deny"),
              };
              result = await operateValidate(wf, state.cache, vopts);
              break;
            }
            case "lint": {
              const lopts: LintOptions = {
                strict_structure: route.query.get("strict_structure") === "true",
                strict_encoding: route.query.get("strict_encoding") === "true",
                allow: route.query.getAll("allow"),
                deny: route.query.getAll("deny"),
              };
              result = await operateLint(wf, state.cache, lopts);
              break;
            }
            case "clean": {
              const copts: CleanOptions = {
                preserve: route.query.getAll("preserve"),
                strip: route.query.getAll("strip"),
                dry_run: route.query.get("dry_run") === "true",
              };
              result = await operateClean(wf, copts);
              break;
            }
            case "export": {
              const eopts: ExportConvertOptions = {
                dry_run: route.query.get("dry_run") === "true",
              };
              result = await operateExport(wf, state.cache, eopts);
              break;
            }
            case "convert": {
              const eopts: ExportConvertOptions = {
                dry_run: route.query.get("dry_run") === "true",
              };
              result = await operateConvert(wf, state.cache, eopts);
              break;
            }
            case "roundtrip": {
              const ropts: RoundtripOptions = {
                strict_structure: route.query.get("strict_structure") === "true",
                strict_encoding: route.query.get("strict_encoding") === "true",
                strict_state: route.query.get("strict_state") === "true",
                include_content: route.query.get("include_content") === "true",
              };
              result = await operateRoundtrip(wf, state.cache, ropts);
              break;
            }
          }
          if (MUTATING_OPS.has(route.op) && route.query.get("dry_run") !== "true") {
            state.workflows = discoverWorkflows(directory);
          }
          json(res, 200, result);
          break;
        }

        case "toolCacheList": {
          const decode = route.query.get("decode") === "1";
          json(res, 200, await listCache(handlerCtx(req), { decode }));
          break;
        }

        case "toolCacheStats": {
          json(res, 200, await cacheStats(handlerCtx(req)));
          break;
        }

        case "toolCacheDelete": {
          json(res, 200, await deleteCacheEntry(handlerCtx(req), route.cacheKey));
          break;
        }

        case "toolCacheClear": {
          const prefix = route.query.get("prefix") ?? undefined;
          json(res, 200, await clearCache(handlerCtx(req), prefix));
          break;
        }

        case "toolCacheRefetch": {
          const body = await readJsonBody<ToolRefetchRequest>(req);
          json(res, 200, await refetchTool(handlerCtx(req), body));
          break;
        }

        case "toolCacheAdd": {
          const body = await readJsonBody<ToolAddRequest>(req);
          json(res, 200, await addTool(handlerCtx(req), body));
          break;
        }

        case "searchTools": {
          const q = route.query.get("q") ?? undefined;
          const pageStr = route.query.get("page");
          const pageSizeStr = route.query.get("page_size");
          const opts: { q?: string; page?: number; pageSize?: number } = {};
          if (q !== undefined) opts.q = q;
          if (pageStr !== null) opts.page = Number(pageStr);
          if (pageSizeStr !== null) opts.pageSize = Number(pageSizeStr);
          json(res, 200, await searchTools(handlerCtx(req), opts));
          break;
        }

        case "trsListTools": {
          json(res, 200, await trsListTools(handlerCtx(req)));
          break;
        }

        case "trsGetTool": {
          json(res, 200, await trsGetTool(handlerCtx(req), route.toolId));
          break;
        }

        case "trsListVersions": {
          json(res, 200, await trsListVersions(handlerCtx(req), route.toolId));
          break;
        }

        case "getParsedTool": {
          json(res, 200, await getParsedTool(handlerCtx(req), route.toolId, route.toolVersion));
          break;
        }

        case "getParameterSchema": {
          json(
            res,
            200,
            await getParameterSchema(handlerCtx(req), route.toolId, route.toolVersion, route.kind),
          );
          break;
        }

        case "getToolSource": {
          getToolSource(handlerCtx(req), route.toolId, route.toolVersion);
          break;
        }

        case "structuralSchema": {
          const format = route.query.get("format") ?? "format2";
          if (format !== "format2" && format !== "native") {
            json(res, 400, { detail: `Unknown format: ${format}. Use 'format2' or 'native'.` });
            break;
          }
          const schema =
            format === "native"
              ? JSONSchema.make(NativeGalaxyWorkflowSchema)
              : JSONSchema.make(GalaxyWorkflowSchema);
          json(res, 200, schema);
          break;
        }

        case "readRoot": {
          const includeContent = route.query.get("content") !== "0";
          const format = route.query.get("format") ?? undefined;
          const result = readContents(directory, "", includeContent, format);
          json(res, 200, result);
          break;
        }

        case "createRootUntitled": {
          const body = await readJsonBody<CreateRequest>(req);
          const result = createUntitled(directory, "", body.type, body.ext);
          maybeRefreshWorkflows(result.path);
          json(res, 200, result);
          break;
        }

        case "readPath": {
          const includeContent = route.query.get("content") !== "0";
          const format = route.query.get("format") ?? undefined;
          const result = readContents(directory, route.filePath, includeContent, format);
          json(res, 200, result);
          break;
        }

        case "writePath": {
          const model = await readJsonBody<ContentsModel>(req);
          const rawHeader = req.headers["if-unmodified-since"];
          const headerStr = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
          let expectedMtime: Date | undefined;
          if (headerStr) {
            const parsed = parseHttpDate(headerStr);
            if (!parsed) {
              json(res, 400, { detail: "Invalid If-Unmodified-Since header" });
              return;
            }
            expectedMtime = parsed;
          }
          const result = writeContents(directory, route.filePath, model, expectedMtime);
          maybeRefreshWorkflows(route.filePath);
          json(res, 200, result);
          break;
        }

        case "renamePath": {
          const body = await readJsonBody<RenameRequest>(req);
          const result = renameContents(directory, route.filePath, body.path);
          maybeRefreshWorkflows(route.filePath);
          maybeRefreshWorkflows(body.path);
          json(res, 200, result);
          break;
        }

        case "deletePath": {
          deleteContents(directory, route.filePath);
          maybeRefreshWorkflows(route.filePath);
          noContent(res);
          break;
        }

        case "createUntitled": {
          const body = await readJsonBody<CreateRequest>(req);
          const result = createUntitled(directory, route.filePath, body.type, body.ext);
          maybeRefreshWorkflows(result.path);
          json(res, 200, result);
          break;
        }

        case "listCheckpoints": {
          const result = listCheckpoints(directory, route.filePath);
          json(res, 200, result);
          break;
        }

        case "createCheckpoint": {
          const result = createCheckpoint(directory, route.filePath);
          json(res, 201, result);
          break;
        }

        case "restoreCheckpoint": {
          restoreCheckpoint(directory, route.filePath, route.cpId);
          maybeRefreshWorkflows(route.filePath);
          noContent(res);
          break;
        }

        case "deleteCheckpoint": {
          deleteCheckpoint(directory, route.filePath, route.cpId);
          noContent(res);
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
