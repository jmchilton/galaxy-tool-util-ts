import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import * as fs from "node:fs";
import * as fsPromises from "node:fs/promises";
import * as path from "node:path";
import {
  HttpError,
  dispatchCacheRoute,
  matchCacheRoute,
  type HandlerCtx,
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
    const cacheRoute = matchCacheRoute(method, url);
    const handlerCtx: HandlerCtx = { service: ctx.service, baseUrl: originFromRequest(req) };

    try {
      if (cacheRoute) {
        const result = await dispatchCacheRoute(cacheRoute, handlerCtx, () => readJsonBody(req));
        json(res, 200, result);
        return;
      }

      if (ctx.uiDir && method === "GET") {
        const [pathOnly] = url.split("?");
        await serveStatic(ctx.uiDir, pathOnly, res);
        return;
      }
      json(res, 404, { detail: "Not found" });
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
