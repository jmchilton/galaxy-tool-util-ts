import { beforeEach, describe, expect, it, vi } from "vitest";

interface IndexEntry {
  cache_key: string;
  tool_id: string;
  tool_version: string;
  source: string;
  source_url: string;
  cached_at: string;
}

const cacheBacking: {
  list: IndexEntry[];
  raw: Map<string, unknown>;
  decoded: Map<string, unknown>;
  stats: Map<string, { sizeBytes: number }>;
  removed: Set<string>;
} = {
  list: [],
  raw: new Map(),
  decoded: new Map(),
  stats: new Map(),
  removed: new Set(),
};

const refetchMock = vi.fn();

const fakeService = {
  cache: {
    async listCached() {
      return cacheBacking.list.filter((e) => !cacheBacking.removed.has(e.cache_key));
    },
    async loadCachedRaw(key: string) {
      return cacheBacking.raw.get(key) ?? null;
    },
    async loadCached(key: string) {
      return cacheBacking.decoded.get(key) ?? null;
    },
    async statCached(key: string) {
      return cacheBacking.stats.get(key) ?? null;
    },
    async removeCached(key: string) {
      const has = cacheBacking.list.some((e) => e.cache_key === key);
      if (has) cacheBacking.removed.add(key);
      return has;
    },
    async clearCache(prefix?: string) {
      const before = cacheBacking.list.filter((e) => !cacheBacking.removed.has(e.cache_key));
      const targets = prefix ? before.filter((e) => e.tool_id.startsWith(prefix)) : before;
      for (const t of targets) cacheBacking.removed.add(t.cache_key);
      return targets.length;
    },
  },
  refetch: refetchMock,
};

vi.mock("../../src/composables/useToolInfoService", () => ({
  useToolInfoService: () => fakeService,
}));

vi.mock("@galaxy-tool-util/core", () => ({
  parseToolshedToolId: (id: string) => {
    const m = id.match(/^(toolshed[^/]*)\/repos\/([^/]+)\/([^/]+)\/(.+)$/);
    if (!m) return null;
    return {
      toolshedUrl: `https://${m[1]}`,
      trsToolId: `repos/${m[2]}/${m[3]}/${m[4]}`,
      toolVersion: null,
    };
  },
  toolIdFromTrs: (toolshedUrl: string, trsToolId: string) =>
    `${toolshedUrl.replace(/^https?:\/\//, "")}/${trsToolId}`,
}));

const { useClientToolCache, _resetClientToolCacheForTests } =
  await import("../../src/composables/useClientToolCache");

beforeEach(() => {
  cacheBacking.list = [];
  cacheBacking.raw.clear();
  cacheBacking.stats.clear();
  cacheBacking.removed.clear();
  refetchMock.mockReset();
  _resetClientToolCacheForTests();
});

describe("useClientToolCache", () => {
  it("refresh decorates index entries into CachedToolEntry shape", async () => {
    cacheBacking.list = [
      {
        cache_key: "k1",
        tool_id: "toolshed.example/repos/iuc/fastqc/fastqc",
        tool_version: "0.74",
        source: "api",
        source_url: "https://x",
        cached_at: "2024-01-01T00:00:00Z",
      },
    ];
    cacheBacking.stats.set("k1", { sizeBytes: 1024 });

    const tc = useClientToolCache();
    await tc.refresh();

    expect(tc.entries.value).toHaveLength(1);
    const e = tc.entries.value[0]!;
    expect(e.cacheKey).toBe("k1");
    expect(e.toolId).toBe("toolshed.example/repos/iuc/fastqc/fastqc");
    expect(e.refetchable).toBe(true);
    expect(e.sizeBytes).toBe(1024);
    expect(e.toolshedUrl).toContain("toolshed.example");
    expect(e.decodable).toBe(true); // default without ?decode
    expect(tc.stats.value.count).toBe(1);
    expect(tc.stats.value.totalBytes).toBe(1024);
    expect(tc.stats.value.bySource).toEqual({ api: 1 });
  });

  it("flags orphan entries as non-refetchable", async () => {
    cacheBacking.list = [
      {
        cache_key: "k2",
        tool_id: "unknown",
        tool_version: "unknown",
        source: "orphan",
        source_url: "",
        cached_at: "2024-02-01T00:00:00Z",
      },
    ];
    const tc = useClientToolCache();
    await tc.refresh();
    expect(tc.entries.value[0]!.refetchable).toBe(false);
  });

  it("decode=true probes raw payload", async () => {
    cacheBacking.list = [
      {
        cache_key: "good",
        tool_id: "toolshed.example/repos/iuc/a/a",
        tool_version: "1",
        source: "api",
        source_url: "",
        cached_at: "2024-01-01T00:00:00Z",
      },
      {
        cache_key: "bad",
        tool_id: "toolshed.example/repos/iuc/b/b",
        tool_version: "1",
        source: "api",
        source_url: "",
        cached_at: "2024-01-02T00:00:00Z",
      },
    ];
    cacheBacking.raw.set("good", { id: "a" });
    cacheBacking.decoded.set("good", { id: "a" });
    cacheBacking.raw.set("bad", { junk: true });
    // bad has no decoded entry — simulates ParsedTool decode failure.

    const tc = useClientToolCache();
    await tc.refresh({ decode: true });
    const byKey = Object.fromEntries(tc.entries.value.map((e) => [e.cacheKey, e]));
    expect(byKey.good!.decodable).toBe(true);
    expect(byKey.bad!.decodable).toBe(false);
  });

  it("loadRaw returns contents + decodable", async () => {
    cacheBacking.raw.set("k", { id: "good" });
    cacheBacking.decoded.set("k", { id: "good" });
    const tc = useClientToolCache();
    const r = await tc.loadRaw("k");
    expect(r.contents).toEqual({ id: "good" });
    expect(r.decodable).toBe(true);
  });

  it("loadRaw throws for missing key", async () => {
    const tc = useClientToolCache();
    await expect(tc.loadRaw("missing")).rejects.toThrow(/No cached entry/);
  });

  it("del removes and refreshes", async () => {
    cacheBacking.list = [
      {
        cache_key: "k1",
        tool_id: "toolshed.example/repos/iuc/a/a",
        tool_version: "1",
        source: "api",
        source_url: "",
        cached_at: "2024-01-01T00:00:00Z",
      },
    ];
    const tc = useClientToolCache();
    await tc.refresh();
    expect(tc.entries.value).toHaveLength(1);
    await tc.del("k1");
    expect(tc.entries.value).toHaveLength(0);
  });

  it("del throws when key missing and surfaces error", async () => {
    const tc = useClientToolCache();
    await expect(tc.del("missing")).rejects.toThrow(/No cached entry/);
    expect(tc.error.value).toMatch(/No cached entry/);
  });

  it("clear returns removed count and refreshes", async () => {
    cacheBacking.list = [
      {
        cache_key: "k1",
        tool_id: "toolshed.example/repos/iuc/a/a",
        tool_version: "1",
        source: "api",
        source_url: "",
        cached_at: "2024-01-01T00:00:00Z",
      },
      {
        cache_key: "k2",
        tool_id: "toolshed.example/repos/iuc/b/b",
        tool_version: "1",
        source: "api",
        source_url: "",
        cached_at: "2024-01-02T00:00:00Z",
      },
    ];
    const tc = useClientToolCache();
    const r = await tc.clear();
    expect(r.removed).toBe(2);
    expect(tc.entries.value).toHaveLength(0);
  });

  it("refetch forwards force and refreshes", async () => {
    refetchMock.mockResolvedValue({ cacheKey: "k1", fetched: true, alreadyCached: false });
    const tc = useClientToolCache();
    await tc.refetch("toolid", "1.0");
    expect(refetchMock).toHaveBeenCalledWith("toolid", "1.0", { force: true });
  });

  it("add omits force", async () => {
    refetchMock.mockResolvedValue({ cacheKey: "k1", fetched: true, alreadyCached: false });
    const tc = useClientToolCache();
    const r = await tc.add("toolid");
    expect(refetchMock).toHaveBeenCalledWith("toolid", null);
    expect(r).toEqual({ cacheKey: "k1", alreadyCached: false });
  });
});
