import { ref } from "vue";

import { parseToolshedToolId, toolIdFromTrs } from "@galaxy-tool-util/core";
import type { components } from "@galaxy-tool-util/gxwf-client";

import { useToolInfoService } from "./useToolInfoService";

type CachedToolEntry = components["schemas"]["CachedToolEntry"];
type CacheStats = components["schemas"]["CacheStats"];

// Module-level singleton: matches `useToolCache` shape so the existing
// /cache view components (ToolCacheTable, ToolCacheStats, ToolCacheRawDialog)
// can render the client-side IndexedDB cache without modification.
const entries = ref<CachedToolEntry[]>([]);
const stats = ref<CacheStats>({ count: 0, bySource: {} });
const loading = ref(false);
const error = ref<string | null>(null);

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function useClientToolCache() {
  async function refresh(opts: { decode?: boolean } = {}) {
    loading.value = true;
    error.value = null;
    try {
      const cache = useToolInfoService().cache;
      const raw = await cache.listCached();
      const decorated: CachedToolEntry[] = [];
      const bySource: Record<string, number> = {};
      let oldest: string | undefined;
      let newest: string | undefined;
      let totalBytes = 0;
      let anySize = false;
      for (const e of raw) {
        const parsed = parseToolshedToolId(e.tool_id);
        const refetchable = e.source !== "orphan" && e.tool_id !== "unknown" && e.tool_id !== "";
        const out: CachedToolEntry = {
          cacheKey: e.cache_key,
          toolId: e.tool_id,
          toolVersion: e.tool_version,
          source: e.source,
          sourceUrl: e.source_url,
          cachedAt: e.cached_at,
          decodable: true,
          refetchable,
        };
        if (parsed !== null) {
          out.toolshedUrl = `https://${toolIdFromTrs(parsed.toolshedUrl, parsed.trsToolId)}`;
        }
        const stat = await cache.statCached(e.cache_key);
        if (stat !== null) out.sizeBytes = stat.sizeBytes;
        if (opts.decode) {
          // ParsedTool decode happens at save-time on the browser cache, so a
          // cache miss is the only source of decode failure: `loadCached`
          // returns null both when the key is missing and when the payload no
          // longer decodes (e.g. after a schema migration).
          const decoded = await cache.loadCached(e.cache_key);
          out.decodable = decoded !== null;
        }
        decorated.push(out);
        bySource[out.source] = (bySource[out.source] ?? 0) + 1;
        if (oldest === undefined || out.cachedAt < oldest) oldest = out.cachedAt;
        if (newest === undefined || out.cachedAt > newest) newest = out.cachedAt;
        if (out.sizeBytes !== undefined) {
          totalBytes += out.sizeBytes;
          anySize = true;
        }
      }
      const next: CacheStats = { count: decorated.length, bySource };
      if (oldest !== undefined) next.oldest = oldest;
      if (newest !== undefined) next.newest = newest;
      if (anySize) next.totalBytes = totalBytes;
      entries.value = decorated;
      stats.value = next;
    } catch (e) {
      error.value = errMsg(e);
    } finally {
      loading.value = false;
    }
  }

  async function loadRaw(cacheKey: string) {
    const cache = useToolInfoService().cache;
    const contents = await cache.loadCachedRaw(cacheKey);
    if (contents === null) throw new Error(`No cached entry: ${cacheKey}`);
    const decoded = await cache.loadCached(cacheKey);
    return { contents, decodable: decoded !== null };
  }

  async function del(cacheKey: string) {
    error.value = null;
    try {
      const removed = await useToolInfoService().cache.removeCached(cacheKey);
      if (!removed) throw new Error(`No cached entry: ${cacheKey}`);
      await refresh();
    } catch (e) {
      const msg = errMsg(e);
      error.value = msg;
      throw e instanceof Error ? e : new Error(msg);
    }
  }

  async function clear(prefix?: string) {
    error.value = null;
    try {
      const removed = await useToolInfoService().cache.clearCache(prefix);
      await refresh();
      return { removed };
    } catch (e) {
      const msg = errMsg(e);
      error.value = msg;
      throw e instanceof Error ? e : new Error(msg);
    }
  }

  async function refetch(toolId: string, toolVersion?: string) {
    error.value = null;
    try {
      const r = await useToolInfoService().refetch(toolId, toolVersion ?? null, {
        force: true,
      });
      await refresh();
      return r;
    } catch (e) {
      const msg = errMsg(e);
      error.value = msg;
      throw e instanceof Error ? e : new Error(msg);
    }
  }

  async function add(toolId: string, toolVersion?: string) {
    error.value = null;
    try {
      const r = await useToolInfoService().refetch(toolId, toolVersion ?? null);
      await refresh();
      return { cacheKey: r.cacheKey, alreadyCached: r.alreadyCached };
    } catch (e) {
      const msg = errMsg(e);
      error.value = msg;
      throw e instanceof Error ? e : new Error(msg);
    }
  }

  return { entries, stats, loading, error, refresh, loadRaw, del, clear, refetch, add };
}

/** Test-only helper to reset module-level state between specs. */
export function _resetClientToolCacheForTests(): void {
  entries.value = [];
  stats.value = { count: 0, bySource: {} };
  loading.value = false;
  error.value = null;
}
