import { ref } from "vue";
import { useApi } from "./useApi";
import type { components } from "@galaxy-tool-util/gxwf-client";

type CachedToolEntry = components["schemas"]["CachedToolEntry"];
type CacheStats = components["schemas"]["CacheStats"];

// Module-level singleton: cache state is shared across components that call
// useToolCache(), acting as a lightweight global store (mirrors useWorkflows).
const entries = ref<CachedToolEntry[]>([]);
const stats = ref<CacheStats>({ count: 0, bySource: {} });
const loading = ref(false);
const error = ref<string | null>(null);

/** Pull a server-side error message out of a router-style `{detail: "..."}` body, with fallbacks. */
function detailOf(err: unknown, fallback: string): string {
  if (err && typeof err === "object" && "detail" in err) {
    const d = (err as { detail: unknown }).detail;
    if (typeof d === "string" && d.length > 0) return d;
  }
  return fallback;
}

export function useToolCache() {
  const client = useApi();

  async function refresh(opts: { decode?: boolean } = {}) {
    loading.value = true;
    error.value = null;
    try {
      const { data, error: err } = await client.GET("/api/tool-cache", {
        params: { query: opts.decode ? { decode: "1" } : {} },
      });
      if (err) {
        error.value = detailOf(err, "Failed to load tool cache");
      } else if (data) {
        entries.value = data.entries;
        stats.value = data.stats;
      }
    } finally {
      loading.value = false;
    }
  }

  async function loadRaw(cacheKey: string) {
    const { data, error: err } = await client.GET("/api/tool-cache/{cacheKey}", {
      params: { path: { cacheKey } },
    });
    if (err) throw new Error(detailOf(err, "Failed to load raw entry"));
    return data;
  }

  async function del(cacheKey: string) {
    error.value = null;
    const { error: err } = await client.DELETE("/api/tool-cache/{cacheKey}", {
      params: { path: { cacheKey } },
    });
    if (err) {
      const msg = detailOf(err, "Delete failed");
      error.value = msg;
      throw new Error(msg);
    }
    await refresh();
  }

  async function clear(prefix?: string) {
    error.value = null;
    const { data, error: err } = await client.DELETE("/api/tool-cache", {
      params: { query: prefix ? { prefix } : {} },
    });
    if (err) {
      const msg = detailOf(err, "Clear failed");
      error.value = msg;
      throw new Error(msg);
    }
    await refresh();
    return data;
  }

  async function refetch(toolId: string, toolVersion?: string) {
    error.value = null;
    const { data, error: err } = await client.POST("/api/tool-cache/refetch", {
      body: { toolId, ...(toolVersion ? { toolVersion } : {}) },
    });
    if (err) {
      const msg = detailOf(err, "Refetch failed");
      error.value = msg;
      throw new Error(msg);
    }
    await refresh();
    return data;
  }

  async function add(toolId: string, toolVersion?: string) {
    error.value = null;
    const { data, error: err } = await client.POST("/api/tool-cache/add", {
      body: { toolId, ...(toolVersion ? { toolVersion } : {}) },
    });
    if (err) {
      const msg = detailOf(err, "Add failed");
      error.value = msg;
      throw new Error(msg);
    }
    await refresh();
    return data;
  }

  return { entries, stats, loading, error, refresh, loadRaw, del, clear, refetch, add };
}
