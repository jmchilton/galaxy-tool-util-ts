/**
 * HTTP server factory for gxwf-web.
 *
 * Creates a Node.js http.Server wired to the contents/workflow request handler.
 */

import { createServer, type Server } from "node:http";
import { createRequestHandler, type AppState } from "./router.js";

export type { AppState };

/** Create a configured gxwf-web HTTP server for the given workflow directory. */
export function createApp(directory: string): { server: Server; state: AppState } {
  const state: AppState = { directory };
  const handler = createRequestHandler(state);
  const server = createServer((req, res) => {
    void handler(req, res);
  });
  return { server, state };
}
