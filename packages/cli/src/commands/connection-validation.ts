/**
 * CLI integration for connection validation.
 *
 * Walks a workflow dict to collect every tool reference (recursing into
 * subworkflows), preloads each tool from the cache, and runs
 * `validateConnectionsReport`. The connection validator wants a sync
 * `GetToolInfo` lookup, so async cache fetches happen up front.
 *
 * The walker + preloader live in `@galaxy-tool-util/connection-validation`
 * (`collectToolRefs`, `buildGetToolInfo`); this module is a thin wrapper that
 * adapts the CLI's on-disk `ToolCache` to the lifted helper's `AsyncToolFetcher`.
 */

import {
  buildGetToolInfo as _buildGetToolInfo,
  collectToolRefs,
  validateConnectionsReport,
  type GetToolInfo,
} from "@galaxy-tool-util/connection-validation";
import type { ToolCache } from "@galaxy-tool-util/core";
import type { ConnectionValidationReport } from "@galaxy-tool-util/schema";

import { isResolveError, loadCachedTool } from "./resolve-tool.js";

export { collectToolRefs };
export type { ToolRef } from "@galaxy-tool-util/connection-validation";

export async function buildConnectionReport(
  data: Record<string, unknown>,
  cache: ToolCache,
): Promise<ConnectionValidationReport> {
  const getToolInfo = await buildGetToolInfo(data, cache);
  return validateConnectionsReport(data, getToolInfo);
}

export async function buildGetToolInfo(
  data: Record<string, unknown>,
  cache: ToolCache,
): Promise<GetToolInfo> {
  return _buildGetToolInfo(data, async (id, version) => {
    const r = await loadCachedTool(cache, id, version);
    return isResolveError(r) ? null : r.tool;
  });
}
