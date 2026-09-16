/**
 * @module @galaxy-tool-util/core/node-http
 *
 * Shared Node `http` adapter helpers for servers that compose
 * `matchCacheRoute` / `dispatchCacheRoute` with their own routes
 * (`gxwf-web`, `tool-cache-proxy`).
 *
 * Re-exported from `@galaxy-tool-util/core/node` — import from there.
 */

import * as fs from "node:fs";
import * as fsPromises from "node:fs/promises";
import * as path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { CacheResult } from "./cache-http/route-table.js";
import { HttpError } from "./cache-http/error.js";

const DEFAULT_MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".map": "application/json",
};

/** Write a JSON response with status, content-type, and content-length set. */
export function writeJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

/** Serialize a cache handler result, preserving source bytes and response headers. */
export function writeCacheResult(res: ServerResponse, result: CacheResult): void {
  if (result.kind === "json") {
    writeJson(res, 200, result.body);
  } else {
    res.writeHead(200, { ...result.headers, "Content-Length": result.body.byteLength });
    res.end(result.body);
  }
}

export interface CorsOptions {
  /** `Access-Control-Allow-Origin` value. Default `*`. */
  origin?: string;
  /** `Access-Control-Allow-Methods` value. */
  methods?: string;
  /** `Access-Control-Allow-Headers` value. */
  headers?: string;
}

/** Set `Access-Control-Allow-*` headers on a response. */
export function setCorsHeaders(res: ServerResponse, opts: CorsOptions = {}): void {
  res.setHeader("Access-Control-Expose-Headers", "language, X-Tool-Source-Macros-Expanded");
  res.setHeader("Access-Control-Allow-Origin", opts.origin ?? "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    opts.methods ?? "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    opts.headers ?? "Content-Type, Authorization, If-Unmodified-Since",
  );
}

/** Read a JSON body off the request. Throws `HttpError(400)` on parse failure. */
export async function readJsonBody<T>(req: IncomingMessage): Promise<T> {
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

export interface ServeStaticOptions {
  /** Content-Security-Policy header to set on responses. Omit to skip. */
  csp?: string;
  /** Extra MIME-type entries, merged over the defaults. */
  mimeTypes?: Record<string, string>;
}

/**
 * Serve a file from `uiDir` based on `urlPath`, falling back to `index.html`
 * for SPA routing. Guards against path traversal. Uses the merged MIME table.
 */
export async function serveStatic(
  res: ServerResponse,
  uiDir: string,
  urlPath: string,
  opts: ServeStaticOptions = {},
): Promise<void> {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    writeJson(res, 400, { detail: "Invalid URL encoding" });
    return;
  }
  const relPath = decoded.replace(/^\/+/, "") || "index.html";
  const base = path.resolve(uiDir);
  const resolved = path.resolve(base, relPath);
  if (resolved !== base && !resolved.startsWith(base + path.sep)) {
    writeJson(res, 403, { detail: "Forbidden" });
    return;
  }
  const filePath =
    fs.existsSync(resolved) && fs.statSync(resolved).isFile()
      ? resolved
      : path.join(base, "index.html");
  if (!fs.existsSync(filePath)) {
    writeJson(res, 404, { detail: "Not found" });
    return;
  }
  const ext = path.extname(filePath);
  const mime = opts.mimeTypes ? { ...DEFAULT_MIME_TYPES, ...opts.mimeTypes } : DEFAULT_MIME_TYPES;
  const contentType = mime[ext] ?? "application/octet-stream";
  const content = await fsPromises.readFile(filePath);
  const headers: Record<string, string | number> = {
    "Content-Type": contentType,
    "Content-Length": content.length,
  };
  if (opts.csp) headers["Content-Security-Policy"] = opts.csp;
  res.writeHead(200, headers);
  res.end(content);
}
