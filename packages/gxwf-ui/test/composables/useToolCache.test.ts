import { describe, it, expect, vi, beforeEach } from "vitest";

const calls: { method: string; path: string; init?: unknown }[] = [];
const responses = new Map<string, unknown>();
const errors = new Map<string, unknown>();

function reply(method: string, path: string, init: unknown) {
  calls.push({ method, path, init });
  const key = `${method} ${path}`;
  if (errors.has(key)) return { data: undefined, error: errors.get(key) };
  return { data: responses.get(key), error: undefined };
}

function fakeClient() {
  return {
    GET: vi.fn(async (path: string, init: unknown) => reply("GET", path, init)),
    POST: vi.fn(async (path: string, init: unknown) => reply("POST", path, init)),
    DELETE: vi.fn(async (path: string, init: unknown) => reply("DELETE", path, init)),
  };
}

vi.mock("../../src/composables/useApi", () => ({ useApi: () => fakeClient() }));

const { useToolCache } = await import("../../src/composables/useToolCache");

beforeEach(() => {
  calls.length = 0;
  responses.clear();
  errors.clear();
});

describe("useToolCache", () => {
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
    const tc = useToolCache();
    await tc.refresh();
    expect(tc.entries.value).toHaveLength(1);
    expect(tc.stats.value.count).toBe(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].path).toBe("/api/tool-cache");
    expect((calls[0].init as { params: { query: object } }).params.query).toEqual({});
  });

  it("refresh({decode: true}) sends ?decode=1", async () => {
    responses.set("GET /api/tool-cache", { entries: [], stats: { count: 0, bySource: {} } });
    const tc = useToolCache();
    await tc.refresh({ decode: true });
    expect((calls[0].init as { params: { query: object } }).params.query).toEqual({ decode: "1" });
  });

  it("delete refreshes after success", async () => {
    responses.set("DELETE /api/tool-cache/{cacheKey}", { removed: true });
    responses.set("GET /api/tool-cache", { entries: [], stats: { count: 0, bySource: {} } });
    const tc = useToolCache();
    await tc.del("k1");
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      "DELETE /api/tool-cache/{cacheKey}",
      "GET /api/tool-cache",
    ]);
  });

  it("refetch passes toolId + toolVersion", async () => {
    responses.set("POST /api/tool-cache/refetch", { cacheKey: "k1", fetched: true });
    responses.set("GET /api/tool-cache", { entries: [], stats: { count: 0, bySource: {} } });
    const tc = useToolCache();
    await tc.refetch("fastqc", "0.74");
    expect(calls[0].init).toEqual({ body: { toolId: "fastqc", toolVersion: "0.74" } });
  });

  it("add omits toolVersion when not given", async () => {
    responses.set("POST /api/tool-cache/add", { cacheKey: "k1", alreadyCached: false });
    responses.set("GET /api/tool-cache", { entries: [], stats: { count: 0, bySource: {} } });
    const tc = useToolCache();
    await tc.add("fastqc");
    expect(calls[0].init).toEqual({ body: { toolId: "fastqc" } });
  });

  it("surfaces server detail on mutating-method failures", async () => {
    errors.set("DELETE /api/tool-cache/{cacheKey}", { detail: "No cached entry: k1" });
    const tc = useToolCache();
    await expect(tc.del("k1")).rejects.toThrow("No cached entry: k1");
    expect(tc.error.value).toBe("No cached entry: k1");
  });
});
