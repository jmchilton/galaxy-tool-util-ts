import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  HttpError,
  dispatchCacheRoute,
  matchCacheRoute,
  type HandlerCtx,
  type ToolInfoService,
  type ToolSource as CoreToolSource,
} from "@galaxy-tool-util/core";
import {
  makeNodeToolInfoService,
  readJsonBody,
  serveStatic,
  setCorsHeaders,
  writeJson,
} from "@galaxy-tool-util/core/node";
import type { ServerConfig } from "./config.js";

/** Shared context for the proxy server — holds config and the ToolInfoService. */
export interface ProxyContext {
  config: ServerConfig;
  service: ToolInfoService;
  /** If set, GET requests outside the API namespace are served from this directory. */
  uiDir?: string;
  /** Optional Content-Security-Policy header for static UI responses. */
  uiCsp?: string;
}

/** Optional inputs for building a {@link ProxyContext}. */
export interface CreateProxyContextOptions {
  /** Static-file directory for the bundled SPA. */
  uiDir?: string;
  /** Content-Security-Policy header to apply when serving from `uiDir`. */
  uiCsp?: string;
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
  return { config, service, uiDir: options.uiDir, uiCsp: options.uiCsp };
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
    setCorsHeaders(res, { methods: "GET, POST, DELETE, OPTIONS" });

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
        writeJson(res, 200, result);
        return;
      }

      if (ctx.uiDir && method === "GET") {
        const [pathOnly] = url.split("?");
        const opts: { csp?: string } = {};
        if (ctx.uiCsp) opts.csp = ctx.uiCsp;
        await serveStatic(res, ctx.uiDir, pathOnly, opts);
        return;
      }
      writeJson(res, 404, { detail: "Not found" });
    } catch (e) {
      if (e instanceof HttpError) {
        writeJson(res, e.status, { detail: e.message });
      } else {
        const msg = e instanceof Error ? e.message : String(e);
        writeJson(res, 500, { detail: msg });
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
