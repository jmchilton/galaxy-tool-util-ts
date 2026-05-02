import { IndexedDBCacheStorage, ToolInfoService, type ToolSource } from "@galaxy-tool-util/core";

/**
 * Singleton ToolInfoService for client-side workflow visualization. Backs
 * `useClientEdgeAnnotations` (and any future composable that needs `ParsedTool`
 * lookups in the browser) with a shared IndexedDB-backed cache. The Service's
 * internal `memoryCache` survives navigation, so re-opening a workflow is a
 * sync-feel operation once tools are warm.
 *
 * Source order (highest priority first):
 *  1. tool-cache-proxy / gxwf-web `/tools` route, when reachable — lower
 *     latency, no CORS, served by the same origin.
 *  2. ToolShed (default `https://toolshed.g2.bx.psu.edu`, override via
 *     `VITE_GXWF_TOOLSHED_URL`).
 *
 * Deployers overriding the default ToolShed *must* extend the page CSP
 * `connect-src` to include the override; otherwise fetches silently fail.
 * `gxwf-web` exposes `--csp-connect-src` for this; static deploys are on the
 * hook themselves.
 */

let _service: ToolInfoService | null = null;

const DEFAULT_TOOLSHED_URL = "https://toolshed.g2.bx.psu.edu";
const DEFAULT_DB_NAME = "gxwf-ui:tool-cache";

export interface UseToolInfoServiceOptions {
  /** Override the default ToolShed URL (overrides `VITE_GXWF_TOOLSHED_URL`). */
  toolshedUrl?: string;
  /** Optional gxwf-web / tool-cache-proxy URL (overrides `VITE_GXWF_TOOL_CACHE_PROXY_URL`). */
  toolCacheProxyUrl?: string;
  /** Override the IndexedDB database name (overrides `VITE_GXWF_CACHE_DB_NAME`). */
  cacheDbName?: string;
}

/**
 * Allow tests / hot reloads to reset the singleton. Not exported from the
 * public composable surface — production code should never call this.
 */
export function _resetToolInfoServiceForTests(): void {
  _service = null;
}

export function useToolInfoService(opts: UseToolInfoServiceOptions = {}): ToolInfoService {
  if (_service) return _service;

  const env = import.meta.env;
  const toolshedUrl = opts.toolshedUrl ?? env.VITE_GXWF_TOOLSHED_URL ?? DEFAULT_TOOLSHED_URL;
  const proxyUrl = opts.toolCacheProxyUrl ?? env.VITE_GXWF_TOOL_CACHE_PROXY_URL;
  const dbName = opts.cacheDbName ?? env.VITE_GXWF_CACHE_DB_NAME ?? DEFAULT_DB_NAME;

  const sources: ToolSource[] = [];
  if (proxyUrl) sources.push({ type: "galaxy", url: proxyUrl });
  sources.push({ type: "toolshed", url: toolshedUrl });

  const storage = new IndexedDBCacheStorage(dbName);

  if (toolshedUrl !== DEFAULT_TOOLSHED_URL) {
    // Best-effort warning — silently ignored if the host CSP already lists the
    // override. The actual failure surfaces as a fetch reject in
    // `ToolInfoService` and gets logged to console.debug there.
    console.info(
      `[gxwf-ui] VITE_GXWF_TOOLSHED_URL=${toolshedUrl} — ensure the page CSP connect-src includes this origin (gxwf-web: --csp-connect-src).`,
    );
  }

  _service = new ToolInfoService({
    storage,
    sources,
    defaultToolshedUrl: toolshedUrl,
  });
  return _service;
}
