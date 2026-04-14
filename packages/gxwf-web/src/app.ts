/**
 * HTTP server factory for gxwf-web.
 *
 * Creates a Node.js http.Server wired to the contents/workflow request handler.
 * Returns a `ready` promise that resolves once the ToolCache is loaded and
 * initial workflow discovery completes — callers may await it before serving
 * traffic but the server is safe to bind before that.
 */

import { createServer, type Server } from "node:http";
import type { ToolSource } from "@galaxy-tool-util/core";
import { makeNodeToolInfoService } from "@galaxy-tool-util/core/node";
import { createRequestHandler, type AppState } from "./router.js";
import { discoverWorkflows } from "./workflows.js";

export type { AppState };

export interface CreateAppOptions {
  cacheDir?: string;
  /** Tool sources to fetch from when a tool is not in cache. */
  sources?: ToolSource[];
  /** Absolute path to a built gxwf-ui dist directory. When set, the server
   *  serves the frontend at the root and falls back to index.html for SPA routing. */
  uiDir?: string;
  /** Extra origins appended to the CSP `connect-src` directive (tool-cache
   *  proxies, custom ToolShed mirrors). Applied when uiDir is set. */
  extraConnectSrc?: string[];
}

/** Create a configured gxwf-web HTTP server for the given workflow directory. */
export function createApp(
  directory: string,
  opts: CreateAppOptions = {},
): { server: Server; state: AppState; ready: Promise<void> } {
  const service = makeNodeToolInfoService({
    cacheDir: opts.cacheDir,
    sources: opts.sources,
  });
  const cache = service.cache;

  const state: AppState = {
    directory,
    cache,
    workflows: { directory, workflows: [] },
    cacheDir: opts.cacheDir,
    uiDir: opts.uiDir,
    extraConnectSrc: opts.extraConnectSrc,
  };

  const handler = createRequestHandler(state);
  const server = createServer((req, res) => {
    void handler(req, res);
  });

  const ready = (async () => {
    await cache.index.load();
    state.workflows = discoverWorkflows(directory);
  })();

  return { server, state, ready };
}
