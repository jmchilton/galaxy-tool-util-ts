/**
 * HTTP request handler for the gxwf-web API.
 *
 * Routes /api/contents/* paths to the contents module.
 * Routes /workflows/* paths to workflow operations (Phase 2b).
 * Routes /api/schemas/structural to the structural JSON Schema export.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { ToolCache } from "@galaxy-tool-util/core";
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
  operateToFormat2,
  operateToNative,
  operateRoundtrip,
} from "./workflows.js";

// ── State ────────────────────────────────────────────────────────────

export interface AppState {
  directory: string;
  cache: ToolCache;
  workflows: WorkflowIndex;
  cacheDir?: string;
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

// ── Route matching ───────────────────────────────────────────────────

const CONTENTS_PREFIX = "/api/contents";

type WorkflowOp = "validate" | "clean" | "lint" | "to-format2" | "to-native" | "roundtrip";
const WORKFLOW_OPS = new Set<string>([
  "validate",
  "clean",
  "lint",
  "to-format2",
  "to-native",
  "roundtrip",
]);

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
  | { handler: "structuralSchema"; query: URLSearchParams };

function matchRoute(method: string, url: string): Route | null {
  const [rawPath, queryStr] = url.split("?");
  const query = new URLSearchParams(queryStr ?? "");

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

  // Per-workflow operations: GET /workflows/{filePath}/{op}
  if (rawPath.startsWith("/workflows/") && method === "GET") {
    const rest = rawPath.slice("/workflows/".length); // "foo/bar.ga/validate"
    const lastSlash = rest.lastIndexOf("/");
    if (lastSlash > 0) {
      const op = rest.slice(lastSlash + 1);
      if (WORKFLOW_OPS.has(op)) {
        const filePath = rest.slice(0, lastSlash);
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

  const pathStr = rest.startsWith("/") ? rest.slice(1) : rest;

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

  function maybeRefreshWorkflows(relPath: string): void {
    if (isWorkflowFile(relPath)) {
      state.workflows = discoverWorkflows(directory);
    }
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
            case "validate":
              result = await operateValidate(wf, state.cache);
              break;
            case "lint":
              result = await operateLint(wf, state.cache, {
                strict: route.query.get("strict") === "true",
              });
              break;
            case "clean":
              result = operateClean(wf);
              break;
            case "to-format2":
              result = await operateToFormat2(wf, state.cache);
              break;
            case "to-native":
              result = await operateToNative(wf, state.cache);
              break;
            case "roundtrip":
              result = await operateRoundtrip(wf, state.cache);
              break;
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
