import { describe, it, expect, vi, beforeEach } from "vitest";
import { useToolCache } from "../src/composables/useToolCache.js";
import type { CacheClient } from "../src/client.js";
import { createCacheClient } from "../src/client.js";

const calls: { method: string; path: string; init?: unknown }[] = [];
const responses = new Map<string, unknown>();
const errors = new Map<string, unknown>();

function reply(method: string, path: string, init: unknown) {
  calls.push({ method, path, init });
  const key = `${method} ${path}`;
  if (errors.has(key)) return { data: undefined, error: errors.get(key) };
  return { data: responses.get(key), error: undefined };
}

function fakeClient(): CacheClient {
  return {
    GET: vi.fn(async (path: string, init: unknown) => reply("GET", path, init)),
    POST: vi.fn(async (path: string, init: unknown) => reply("POST", path, init)),
    DELETE: vi.fn(async (path: string, init: unknown) => reply("DELETE", path, init)),
  } as unknown as CacheClient;
}

beforeEach(() => {
  calls.length = 0;
  responses.clear();
  errors.clear();
});

describe("useToolCache", () => {
  it("reads source as raw text, preserving quotes and newlines", async () => {
    const contents = '<tool id="x"><help>Résumé</help></tool>\n';
    const fetcher = vi.fn<typeof fetch>(async () => new Response(contents));
    const tc = useToolCache(createCacheClient("https://cache.test", { fetch: fetcher }));
    expect(await tc.loadToolSource("owner~repo~x", "1+2")).toBe(contents);
    expect((fetcher.mock.calls[0][0] as Request).url).toBe(
      "https://cache.test/api/tools/owner~repo~x/versions/1%2B2/tool_source",
    );
  });

  it("surfaces upstream source error details", async () => {
    const tc = useToolCache(
      createCacheClient("https://cache.test", {
        fetch: async () =>
          new Response(JSON.stringify({ detail: "Source display is disabled" }), {
            status: 502,
            headers: { "Content-Type": "application/json" },
          }),
      }),
    );
    await expect(tc.loadToolSource("cat1", "1.0")).rejects.toThrow("Source display is disabled");
  });

  it("refresh populates entries + stats", async () => {
    responses.set("GET /api/tool-cache", {
      entries: [
        {
          cacheKey: "k1",
          toolId: "fastqc",
          toolVersion: "0.74",
          source: "api",
          sourceUrl: "",
          cachedAt: new Date().toISOString(),
          decodable: true,
        },
      ],
      stats: { count: 1, bySource: { api: 1 } },
    });
    const tc = useToolCache(fakeClient());
    await tc.refresh();
    expect(tc.entries.value).toHaveLength(1);
    expect(tc.stats.value.count).toBe(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].path).toBe("/api/tool-cache");
    expect((calls[0].init as { params: { query: object } }).params.query).toEqual({});
  });

  it("refresh({decode: true}) sends ?decode=1", async () => {
    responses.set("GET /api/tool-cache", { entries: [], stats: { count: 0, bySource: {} } });
    const tc = useToolCache(fakeClient());
    await tc.refresh({ decode: true });
    expect((calls[0].init as { params: { query: object } }).params.query).toEqual({ decode: "1" });
  });

  it("delete refreshes after success", async () => {
    responses.set("DELETE /api/tool-cache/{cacheKey}", { removed: true });
    responses.set("GET /api/tool-cache", { entries: [], stats: { count: 0, bySource: {} } });
    const tc = useToolCache(fakeClient());
    await tc.del("k1");
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      "DELETE /api/tool-cache/{cacheKey}",
      "GET /api/tool-cache",
    ]);
  });

  it("refetch passes toolId + toolVersion", async () => {
    responses.set("POST /api/tool-cache/refetch", { cacheKey: "k1", fetched: true });
    responses.set("GET /api/tool-cache", { entries: [], stats: { count: 0, bySource: {} } });
    const tc = useToolCache(fakeClient());
    await tc.refetch("fastqc", "0.74");
    expect(calls[0].init).toEqual({ body: { toolId: "fastqc", toolVersion: "0.74" } });
  });

  it("add omits toolVersion when not given", async () => {
    responses.set("POST /api/tool-cache/add", { cacheKey: "k1", alreadyCached: false });
    responses.set("GET /api/tool-cache", { entries: [], stats: { count: 0, bySource: {} } });
    const tc = useToolCache(fakeClient());
    await tc.add("fastqc");
    expect(calls[0].init).toEqual({ body: { toolId: "fastqc" } });
  });

  it("surfaces server detail on mutating-method failures", async () => {
    errors.set("DELETE /api/tool-cache/{cacheKey}", { detail: "No cached entry: k1" });
    const tc = useToolCache(fakeClient());
    await expect(tc.del("k1")).rejects.toThrow("No cached entry: k1");
    expect(tc.error.value).toBe("No cached entry: k1");
  });
});
