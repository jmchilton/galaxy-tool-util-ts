/**
 * HTTP server factory for gxwf-web.
 *
 * Creates a Node.js http.Server wired to the contents/workflow request handler.
 * Returns a `ready` promise that resolves once the ToolCache is loaded and
 * initial workflow discovery completes — callers may await it before serving
 * traffic but the server is safe to bind before that.
 */

import { createServer, type Server } from "node:http";
import { ToolCache } from "@galaxy-tool-util/core";
import { createRequestHandler, type AppState } from "./router.js";
import { discoverWorkflows } from "./workflows.js";

export type { AppState };

export interface CreateAppOptions {
  cacheDir?: string;
}

/** Create a configured gxwf-web HTTP server for the given workflow directory. */
export function createApp(
  directory: string,
  opts: CreateAppOptions = {},
): { server: Server; state: AppState; ready: Promise<void> } {
  const cache = new ToolCache({ cacheDir: opts.cacheDir });
  const state: AppState = {
    directory,
    cache,
    workflows: { directory, workflows: [] },
    cacheDir: opts.cacheDir,
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
