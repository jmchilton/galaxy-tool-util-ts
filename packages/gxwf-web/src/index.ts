/**
 * @module @galaxy-tool-util/gxwf-web
 *
 * Galaxy workflow development HTTP server.
 * Validate, lint, clean, and convert Galaxy workflows.
 *
 * `api-types.ts` is auto-generated from `openapi.json` via `pnpm codegen`.
 * Use with `openapi-fetch` for a fully-typed HTTP client:
 *
 * ```ts
 * import createClient from "openapi-fetch";
 * import type { paths } from "@galaxy-tool-util/gxwf-web/api-types";
 * const client = createClient<paths>({ baseUrl: "http://localhost:8000" });
 * ```
 */

export type { paths, components, operations } from "./generated/api-types.js";
export { createApp } from "./app.js";
export type { AppState, CreateAppOptions } from "./app.js";
export { createRequestHandler } from "./router.js";
export { discoverWorkflows, loadWorkflowFile } from "./workflows.js";
export type { ValidateOptions, LintOptions, CleanOptions } from "./workflows.js";
export {
  readContents,
  writeContents,
  deleteContents,
  createUntitled,
  renameContents,
  createCheckpoint,
  listCheckpoints,
  restoreCheckpoint,
  deleteCheckpoint,
  resolveSafePath,
  isIgnored,
  isWorkflowFile,
  HttpError,
} from "./contents.js";
export type { ContentsModel, CheckpointModel, RenameRequest, CreateRequest } from "./models.js";
