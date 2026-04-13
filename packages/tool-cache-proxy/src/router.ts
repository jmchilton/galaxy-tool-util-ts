import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { ToolInfoService, ToolSource as CoreToolSource } from "@galaxy-tool-util/core";
import { makeNodeToolInfoService } from "@galaxy-tool-util/core/node";
import {
  createFieldModel,
  STATE_REPRESENTATIONS,
  type StateRepresentation,
  type ToolParameterBundleModel,
} from "@galaxy-tool-util/schema";
import * as JSONSchema from "effect/JSONSchema";
import type { ServerConfig } from "./config.js";

/** Shared context for the proxy server — holds config and the ToolInfoService. */
export interface ProxyContext {
  config: ServerConfig;
  service: ToolInfoService;
}

/** Build a ProxyContext from config — initializes ToolInfoService with configured sources. */
export function createProxyContext(config: ServerConfig): ProxyContext {
  const enabledSources = config["galaxy.workflows.toolSources"].filter((s) => s.enabled);
  const coreSources: CoreToolSource[] = enabledSources.map((s) => ({
    type: s.type,
    url: s.url,
  }));

  const service = makeNodeToolInfoService({
    cacheDir: config["galaxy.workflows.toolCache"]?.directory,
    sources: coreSources,
  });
  return { config, service };
}

type RouteMatch = {
  trsId?: string;
  version?: string;
  schema?: boolean;
};

function matchRoute(method: string, url: string): { handler: string; params: RouteMatch } | null {
  const path = url.split("?")[0];

  if (method === "GET" && path === "/api/tools") {
    return { handler: "listTools", params: {} };
  }

  // /api/tools/:trs_id/versions/:version/schema
  const schemaMatch = path.match(/^\/api\/tools\/([^/]+)\/versions\/([^/]+)\/schema$/);
  if (method === "GET" && schemaMatch) {
    return {
      handler: "toolSchema",
      params: {
        trsId: decodeURIComponent(schemaMatch[1]),
        version: decodeURIComponent(schemaMatch[2]),
        schema: true,
      },
    };
  }

  // /api/tools/:trs_id/versions/:version
  const versionMatch = path.match(/^\/api\/tools\/([^/]+)\/versions\/([^/]+)$/);
  if (method === "GET" && versionMatch) {
    return {
      handler: "getTool",
      params: {
        trsId: decodeURIComponent(versionMatch[1]),
        version: decodeURIComponent(versionMatch[2]),
      },
    };
  }

  if (method === "DELETE" && path === "/api/tools/cache") {
    return { handler: "clearCache", params: {} };
  }

  return null;
}

function queryParam(url: string, key: string): string | undefined {
  const idx = url.indexOf("?");
  if (idx === -1) return undefined;
  const params = new URLSearchParams(url.slice(idx));
  return params.get(key) ?? undefined;
}

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
  res.setHeader("Access-Control-Allow-Methods", "GET, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

/** Create the async request handler that routes to tool cache/schema endpoints. */
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
      json(res, 404, { error: "Not found" });
      return;
    }

    try {
      switch (route.handler) {
        case "listTools": {
          await ctx.service.cache.index.load();
          const entries = await ctx.service.cache.listCached();
          json(res, 200, entries);
          break;
        }

        case "getTool": {
          const { trsId, version } = route.params;
          if (!trsId || !version) {
            json(res, 400, { error: "Missing trs_id or version" });
            return;
          }
          const tool = await ctx.service.getToolInfo(trsId, version);
          if (!tool) {
            json(res, 404, { error: "Tool not found" });
            return;
          }
          json(res, 200, tool);
          break;
        }

        case "toolSchema": {
          const { trsId, version } = route.params;
          if (!trsId || !version) {
            json(res, 400, { error: "Missing trs_id or version" });
            return;
          }
          const repName = queryParam(url, "representation") ?? "workflow_step";
          if (!STATE_REPRESENTATIONS.includes(repName as StateRepresentation)) {
            json(res, 400, {
              error: `Unknown representation: ${repName}`,
              available: [...STATE_REPRESENTATIONS],
            });
            return;
          }

          const tool = await ctx.service.getToolInfo(trsId, version);
          if (!tool) {
            json(res, 404, { error: "Tool not found" });
            return;
          }

          const bundle: ToolParameterBundleModel = {
            parameters: tool.inputs as ToolParameterBundleModel["parameters"],
          };
          const effectSchema = createFieldModel(bundle, repName as StateRepresentation);
          if (!effectSchema) {
            json(res, 500, {
              error: "Could not generate schema — unsupported parameter types",
            });
            return;
          }
          try {
            const jsonSchema = JSONSchema.make(effectSchema);
            json(res, 200, jsonSchema);
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            json(res, 500, { error: `JSON Schema generation failed: ${msg}` });
          }
          break;
        }

        case "clearCache": {
          await ctx.service.cache.index.load();
          const prefix = queryParam(url, "prefix");
          await ctx.service.cache.clearCache(prefix ?? undefined);
          json(res, 200, { status: "cleared" });
          break;
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      json(res, 500, { error: msg });
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
