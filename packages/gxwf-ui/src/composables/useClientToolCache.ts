import { ref } from "vue";

import { getParameterSchema, listCache, type ParameterSchemaKind } from "@galaxy-tool-util/core";
import type { components } from "@galaxy-tool-util/gxwf-client";

import { useToolInfoService } from "./useToolInfoService";

type CachedToolEntry = components["schemas"]["CachedToolEntry"];
type CacheStats = components["schemas"]["CacheStats"];

// Module-level singleton for the browser cache inspector.
const entries = ref<CachedToolEntry[]>([]);
const stats = ref<CacheStats>({ count: 0, bySource: {} });
const loading = ref(false);
const error = ref<string | null>(null);

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function useClientToolCache() {
  async function loadParameterModel(toolId: string, toolVersion: string) {
    const tool = await useToolInfoService().getToolInfo(toolId, toolVersion);
    if (tool === null) throw new Error("Tool not found");
    return tool;
  }

  async function loadParameterSchema(
    toolId: string,
    toolVersion: string,
    kind: ParameterSchemaKind,
  ) {
    return getParameterSchema(
      { service: useToolInfoService(), baseUrl: "" },
      toolId,
      toolVersion,
      kind,
    );
  }

  async function loadToolSource(toolId: string, toolVersion: string) {
    const source = await useToolInfoService().fetchToolSource(toolId, toolVersion);
    if (source === null) throw new Error("Tool source not found");
    return source.contents;
  }

  async function refresh(opts: { decode?: boolean } = {}) {
    loading.value = true;
    error.value = null;
    try {
      const data = await listCache({ service: useToolInfoService(), baseUrl: "" }, opts);
      entries.value = data.entries;
      stats.value = data.stats;
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

  return {
    entries,
    stats,
    loading,
    error,
    refresh,
    loadRaw,
    loadParameterModel,
    loadParameterSchema,
    loadToolSource,
    del,
    clear,
    refetch,
    add,
  };
}

/** Test-only helper to reset module-level state between specs. */
export function _resetClientToolCacheForTests(): void {
  entries.value = [];
  stats.value = { count: 0, bySource: {} };
  loading.value = false;
  error.value = null;
}
