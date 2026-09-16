import { ref } from "vue";
import type { CacheClient, CachedToolEntry, CacheStats } from "../client.js";

/** Pull a server-side error message out of a router-style `{detail: "..."}` body, with fallbacks. */
function detailOf(err: unknown, fallback: string): string {
  if (err && typeof err === "object" && "detail" in err) {
    const d = (err as { detail: unknown }).detail;
    if (typeof d === "string" && d.length > 0) return d;
  }
  return fallback;
}

export function useToolCache(client: CacheClient) {
  const entries = ref<CachedToolEntry[]>([]);
  const stats = ref<CacheStats>({ count: 0, bySource: {} });
  const loading = ref(false);
  const error = ref<string | null>(null);

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

  async function loadParameterModel(toolId: string, toolVersion: string) {
    const { data, error: err } = await client.GET("/api/tools/{tool_id}/versions/{tool_version}", {
      params: { path: { tool_id: toolId, tool_version: toolVersion } },
    });
    if (err) throw new Error(detailOf(err, "Failed to load parameter model"));
    return data;
  }

  async function loadParameterRequestSchema(toolId: string, toolVersion: string) {
    const { data, error: err } = await client.GET(
      "/api/tools/{tool_id}/versions/{tool_version}/parameter_request_schema",
      { params: { path: { tool_id: toolId, tool_version: toolVersion } } },
    );
    if (err) throw new Error(detailOf(err, "Failed to load request schema"));
    return data;
  }

  async function loadParameterLandingRequestSchema(toolId: string, toolVersion: string) {
    const { data, error: err } = await client.GET(
      "/api/tools/{tool_id}/versions/{tool_version}/parameter_landing_request_schema",
      { params: { path: { tool_id: toolId, tool_version: toolVersion } } },
    );
    if (err) throw new Error(detailOf(err, "Failed to load landing-request schema"));
    return data;
  }

  async function loadParameterTestCaseXmlSchema(toolId: string, toolVersion: string) {
    const { data, error: err } = await client.GET(
      "/api/tools/{tool_id}/versions/{tool_version}/parameter_test_case_xml_schema",
      { params: { path: { tool_id: toolId, tool_version: toolVersion } } },
    );
    if (err) throw new Error(detailOf(err, "Failed to load test-case-XML schema"));
    return data;
  }

  async function loadToolSource(toolId: string, toolVersion: string) {
    const { data, error: err } = await client.GET(
      "/api/tools/{tool_id}/versions/{tool_version}/tool_source",
      { params: { path: { tool_id: toolId, tool_version: toolVersion } }, parseAs: "text" },
    );
    if (err) throw new Error(detailOf(err, "Failed to load tool source"));
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

  return {
    entries,
    stats,
    loading,
    error,
    refresh,
    loadToolSource,
    loadParameterModel,
    loadParameterRequestSchema,
    loadParameterLandingRequestSchema,
    loadParameterTestCaseXmlSchema,
    del,
    clear,
    refetch,
    add,
  };
}
