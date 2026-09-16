/**
 * HTTP request handler for the gxwf-web API.
 *
 * Routes /api/contents/* paths to the contents module.
 * Routes /workflows/* paths to workflow operations.
 * Routes /api/schemas/structural to the structural JSON Schema export.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import {
  dispatchCacheRoute,
  matchCacheRoute,
  type HandlerCtx,
  type ToolCache,
  type ToolInfoService,
} from "@galaxy-tool-util/core";
import {
  readJsonBody,
  writeCacheResult,
  serveStatic,
  setCorsHeaders,
  writeJson as json,
} from "@galaxy-tool-util/core/node";
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
  operateEdgeAnnotations,
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

function noContent(res: ServerResponse): void {
  res.writeHead(204);
  res.end();
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

// ── Route matching ───────────────────────────────────────────────────

const CONTENTS_PREFIX = "/api/contents";

type WorkflowOp =
  | "validate"
  | "clean"
  | "lint"
  | "export"
  | "convert"
  | "roundtrip"
  | "edge-annotations";
const WORKFLOW_OPS = new Set<string>([
  "validate",
  "clean",
  "lint",
  "export",
  "convert",
  "roundtrip",
  "edge-annotations",
]);
const MUTATING_OPS = new Set<string>(["clean", "export", "convert"]);

type Route =
  | { handler: "healthz" }
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
  | { handler: "structuralSchema"; query: URLSearchParams };

function matchRoute(method: string, url: string): Route | null {
  const [rawPath, queryStr] = url.split("?");
  const query = new URLSearchParams(queryStr ?? "");

  if (rawPath === "/healthz" && method === "GET") {
    return { handler: "healthz" };
  }

  // Structural schema: GET /api/schemas/structural
  if (rawPath === "/api/schemas/structural" && method === "GET") {
    return { handler: "structuralSchema", query };
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
    setCorsHeaders(res);

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = req.url ?? "/";
    const method = req.method ?? "GET";

    try {
      const cacheRoute = matchCacheRoute(method, url);
      if (cacheRoute) {
        const result = await dispatchCacheRoute(cacheRoute, handlerCtx(req), () =>
          readJsonBody(req),
        );
        writeCacheResult(res, result);
        return;
      }

      const route = matchRoute(method, url);
      if (!route) {
        if (state.uiDir && method === "GET") {
          const [urlPath] = url.split("?");
          // /monaco/* ships the extension-host iframe and its workers; they need
          // a more permissive CSP than the Vue shell to boot.
          const staticCsp = urlPath.startsWith("/monaco/") ? monacoCspHeader : cspHeader;
          await serveStatic(res, state.uiDir, urlPath, { csp: staticCsp });
          return;
        }
        json(res, 404, { detail: "Not found" });
        return;
      }

      switch (route.handler) {
        case "healthz": {
          json(res, 200, {
            status: "ok",
            features: ["edge-annotations"],
          });
          break;
        }

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
            case "edge-annotations": {
              result = await operateEdgeAnnotations(wf, state.cache);
              break;
            }
          }
          if (MUTATING_OPS.has(route.op) && route.query.get("dry_run") !== "true") {
            state.workflows = discoverWorkflows(directory);
          }
          json(res, 200, result);
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
