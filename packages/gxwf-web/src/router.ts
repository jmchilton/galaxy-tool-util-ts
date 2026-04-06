/**
 * HTTP request handler for the gxwf-web API.
 *
 * Routes all /api/contents/* paths to the contents module.
 * A stub /workflows route is provided for Phase 2b wiring.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import {
  createCheckpoint,
  createUntitled,
  deleteCheckpoint,
  deleteContents,
  HttpError,
  listCheckpoints,
  readContents,
  renameContents,
  restoreCheckpoint,
  writeContents,
} from "./contents.js";
import type { ContentsModel, CreateRequest, RenameRequest } from "./models.js";

// ── State ────────────────────────────────────────────────────────────

export interface AppState {
  directory: string;
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
  | { handler: "refreshWorkflows" };

function matchRoute(method: string, url: string): Route | null {
  const [rawPath, queryStr] = url.split("?");
  const query = new URLSearchParams(queryStr ?? "");

  // Workflow stubs (Phase 2b wiring point).
  if (rawPath === "/workflows") {
    if (method === "GET") return { handler: "listWorkflows" };
    if (method === "POST") return { handler: "refreshWorkflows" };
    return null;
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
          // Phase 2b stub — returns empty list until workflow discovery is wired.
          json(res, 200, { directory, workflows: [] });
          break;
        }

        case "refreshWorkflows": {
          json(res, 200, { directory, workflows: [] });
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
          json(res, 200, result);
          break;
        }

        case "renamePath": {
          const body = await readJsonBody<RenameRequest>(req);
          const result = renameContents(directory, route.filePath, body.path);
          json(res, 200, result);
          break;
        }

        case "deletePath": {
          deleteContents(directory, route.filePath);
          noContent(res);
          break;
        }

        case "createUntitled": {
          const body = await readJsonBody<CreateRequest>(req);
          const result = createUntitled(directory, route.filePath, body.type, body.ext);
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
