import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  parseToolshedToolId,
  toolIdFromTrs,
  cacheKey,
  CacheIndex,
  ToolCache,
} from "../src/cache/index.js";
import { FilesystemCacheStorage, makeNodeToolCache } from "../src/cache/node.js";

describe("parseToolshedToolId", () => {
  it("parses full toolshed tool ID with version", () => {
    const result = parseToolshedToolId(
      "toolshed.g2.bx.psu.edu/repos/devteam/fastqc/fastqc/0.74+galaxy0",
    );
    expect(result).toEqual({
      toolshedUrl: "https://toolshed.g2.bx.psu.edu",
      trsToolId: "devteam~fastqc~fastqc",
      toolVersion: "0.74+galaxy0",
    });
  });

  it("parses tool ID with https scheme", () => {
    const result = parseToolshedToolId(
      "https://toolshed.g2.bx.psu.edu/repos/iuc/multiqc/multiqc/1.11+galaxy1",
    );
    expect(result).toEqual({
      toolshedUrl: "https://toolshed.g2.bx.psu.edu",
      trsToolId: "iuc~multiqc~multiqc",
      toolVersion: "1.11+galaxy1",
    });
  });

  it("parses tool ID without version", () => {
    const result = parseToolshedToolId("toolshed.g2.bx.psu.edu/repos/devteam/fastqc/fastqc");
    expect(result).toEqual({
      toolshedUrl: "https://toolshed.g2.bx.psu.edu",
      trsToolId: "devteam~fastqc~fastqc",
      toolVersion: null,
    });
  });

  it("returns null for non-toolshed IDs", () => {
    expect(parseToolshedToolId("cat1")).toBeNull();
    expect(parseToolshedToolId("__DATA_FETCH__")).toBeNull();
    expect(parseToolshedToolId("upload1")).toBeNull();
  });

  it("returns null for malformed repos path", () => {
    expect(parseToolshedToolId("toolshed.g2.bx.psu.edu/repos/owner/repo")).toBeNull();
  });
});

describe("toolIdFromTrs", () => {
  it("reconstructs readable tool ID", () => {
    expect(toolIdFromTrs("https://toolshed.g2.bx.psu.edu", "devteam~fastqc~fastqc")).toBe(
      "toolshed.g2.bx.psu.edu/repos/devteam/fastqc/fastqc",
    );
  });
});

describe("cacheKey", () => {
  it("matches Python implementation", async () => {
    const key = await cacheKey(
      "https://toolshed.g2.bx.psu.edu",
      "devteam~fastqc~fastqc",
      "0.74+galaxy0",
    );
    expect(key).toBe("4442926e78fe6e6574ffb9110be50f9b72cc3eb3b133e5435cf7b8658cd0a0f5");
  });
});

describe("CacheIndex", () => {
  let tmpDir: string;
  let index: CacheIndex;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "cache-test-"));
    index = new CacheIndex(new FilesystemCacheStorage(tmpDir));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true });
  });

  it("starts empty", async () => {
    expect(await index.listAll()).toEqual([]);
    expect(await index.has("nonexistent")).toBe(false);
  });

  it("add + has + listAll", async () => {
    await index.add("key1", "tool/id", "1.0", "api", "http://example.com");
    expect(await index.has("key1")).toBe(true);
    const all = await index.listAll();
    expect(all).toHaveLength(1);
    expect(all[0].cache_key).toBe("key1");
    expect(all[0].tool_id).toBe("tool/id");
    expect(all[0].source).toBe("api");
  });

  it("remove", async () => {
    await index.add("key1", "tool/id", "1.0", "api");
    await index.remove("key1");
    expect(await index.has("key1")).toBe(false);
    expect(await index.listAll()).toHaveLength(0);
  });

  it("clear", async () => {
    await index.add("key1", "tool1", "1.0", "api");
    await index.add("key2", "tool2", "2.0", "api");
    await index.clear();
    expect(await index.listAll()).toHaveLength(0);
  });

  it("persists to disk and reloads", async () => {
    await index.add("key1", "tool/id", "1.0", "api", "http://example.com");
    const index2 = new CacheIndex(new FilesystemCacheStorage(tmpDir));
    await index2.load();
    expect(await index2.has("key1")).toBe(true);
    expect((await index2.listAll())[0].tool_id).toBe("tool/id");
  });

  it("handles missing index file gracefully", async () => {
    const emptyIndex = new CacheIndex(new FilesystemCacheStorage(join(tmpDir, "nonexistent")));
    await emptyIndex.load();
    expect(await emptyIndex.listAll()).toEqual([]);
  });
});

describe("ToolCache", () => {
  let tmpDir: string;
  let cache: ToolCache;

  const sampleTool = {
    id: "fastqc",
    version: "0.74+galaxy0",
    name: "FastQC",
    description: "Read Quality reports",
    inputs: [],
    outputs: [],
    citations: [],
    license: null,
    profile: "16.01",
    edam_operations: [],
    edam_topics: [],
    xrefs: [],
  };

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "toolcache-test-"));
    cache = makeNodeToolCache({ cacheDir: tmpDir });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true });
  });

  it("resolveToolCoordinates for toolshed tool", () => {
    const coords = cache.resolveToolCoordinates(
      "toolshed.g2.bx.psu.edu/repos/devteam/fastqc/fastqc/0.74+galaxy0",
    );
    expect(coords.trsToolId).toBe("devteam~fastqc~fastqc");
    expect(coords.version).toBe("0.74+galaxy0");
    expect(coords.readableId).toBe("toolshed.g2.bx.psu.edu/repos/devteam/fastqc/fastqc");
  });

  it("resolveToolCoordinates for stock tool", () => {
    const coords = cache.resolveToolCoordinates("cat1", "1.0.0");
    expect(coords.trsToolId).toBe("cat1");
    expect(coords.version).toBe("1.0.0");
    expect(coords.readableId).toBe("toolshed.g2.bx.psu.edu/repos/cat1");
  });

  it("save + load round-trip", async () => {
    const key = await cacheKey(
      "https://toolshed.g2.bx.psu.edu",
      "devteam~fastqc~fastqc",
      "0.74+galaxy0",
    );
    await cache.saveTool(
      key,
      sampleTool,
      "toolshed.g2.bx.psu.edu/repos/devteam/fastqc/fastqc",
      "0.74+galaxy0",
      "api",
    );
    const loaded = await cache.loadCached(key);
    expect(loaded).not.toBeNull();
    expect(loaded!.id).toBe("fastqc");
    expect(loaded!.name).toBe("FastQC");
  });

  it("hasCached returns true after save", async () => {
    const toolId = "toolshed.g2.bx.psu.edu/repos/devteam/fastqc/fastqc/0.74+galaxy0";
    expect(await cache.hasCached(toolId)).toBe(false);

    const coords = cache.resolveToolCoordinates(toolId);
    const key = await cacheKey(coords.toolshedUrl, coords.trsToolId, coords.version!);
    await cache.saveTool(key, sampleTool, coords.readableId, coords.version!, "api");
    expect(await cache.hasCached(toolId)).toBe(true);
  });

  it("listCached shows entries", async () => {
    expect(await cache.listCached()).toHaveLength(0);
    const key = "testkey";
    await cache.saveTool(key, sampleTool, "tool/id", "1.0", "api");
    const list = await cache.listCached();
    expect(list).toHaveLength(1);
    expect(list[0].tool_id).toBe("tool/id");
  });

  it("clearCache removes all entries", async () => {
    await cache.saveTool("k1", sampleTool, "tool1", "1.0", "api");
    await cache.saveTool("k2", sampleTool, "tool2", "2.0", "api");
    expect(await cache.listCached()).toHaveLength(2);
    await cache.clearCache();
    expect(await cache.listCached()).toHaveLength(0);
  });

  it("clearCache with prefix removes matching entries", async () => {
    await cache.saveTool(
      "k1",
      sampleTool,
      "toolshed.g2.bx.psu.edu/repos/devteam/fastqc/fastqc",
      "1.0",
      "api",
    );
    await cache.saveTool(
      "k2",
      sampleTool,
      "toolshed.g2.bx.psu.edu/repos/iuc/multiqc/multiqc",
      "1.0",
      "api",
    );
    await cache.clearCache("toolshed.g2.bx.psu.edu/repos/devteam");
    const remaining = await cache.listCached();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].tool_id).toContain("multiqc");
  });

  it("returns null for corrupt JSON on disk", async () => {
    await writeFile(join(tmpDir, "corrupt.json"), "NOT JSON {{{");
    const result = await cache.loadCached("corrupt");
    expect(result).toBeNull();
  });

  it("returns null version for stock tool without version", () => {
    const coords = cache.resolveToolCoordinates("cat1");
    expect(coords.version).toBeNull();
  });

  it("removeCached deletes one entry by cache key", async () => {
    await cache.saveTool("k1", sampleTool, "tool1", "1.0", "api");
    await cache.saveTool("k2", sampleTool, "tool2", "2.0", "api");
    expect(await cache.removeCached("k1")).toBe(true);
    const remaining = await cache.listCached();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].cache_key).toBe("k2");
    expect(await cache.loadCached("k1")).toBeNull();
  });

  it("removeCached returns false for unknown key", async () => {
    expect(await cache.removeCached("nope")).toBe(false);
  });

  it("removeCached returns true for orphan-only entry (storage but no index)", async () => {
    await writeFile(join(tmpDir, "orphan.json"), JSON.stringify(sampleTool));
    expect(await cache.removeCached("orphan")).toBe(true);
    expect(await cache.loadCachedRaw("orphan")).toBeNull();
  });

  it("removeCached returns true for index-only entry (index but no storage)", async () => {
    await cache.index.add("ghost", "tool/id", "1.0", "api");
    expect(await cache.removeCached("ghost")).toBe(true);
    expect(await cache.index.has("ghost")).toBe(false);
  });

  it("loadCachedRaw returns undecoded payload that fails ParsedTool decode", async () => {
    const malformed = { id: "x", legacy: true, version: 42 };
    await writeFile(join(tmpDir, "stale.json"), JSON.stringify(malformed));
    expect(await cache.loadCached("stale")).toBeNull();
    const raw = (await cache.loadCachedRaw("stale")) as typeof malformed;
    expect(raw).not.toBeNull();
    expect(raw.id).toBe("x");
    expect(raw.legacy).toBe(true);
    expect(raw.version).toBe(42);
  });

  it("loadCachedRaw returns null for missing key", async () => {
    expect(await cache.loadCachedRaw("missing")).toBeNull();
  });

  it("lazy-index backfill marks orphan entries", async () => {
    const key = "orphan1";
    await writeFile(join(tmpDir, `${key}.json`), JSON.stringify(sampleTool));
    const loaded = await cache.loadCached(key);
    expect(loaded).not.toBeNull();
    const entry = (await cache.listCached()).find((e) => e.cache_key === key);
    expect(entry).toBeDefined();
    expect(entry!.source).toBe("orphan");
    expect(entry!.tool_version).toBe("0.74+galaxy0");
    expect(entry!.tool_id).toBe("fastqc");
  });

  it("getCacheStats aggregates counts, sources, totals, and timestamps", async () => {
    await cache.saveTool("k1", sampleTool, "tool1", "1.0", "api");
    await cache.saveTool("k2", sampleTool, "tool2", "2.0", "api");
    await cache.saveTool("k3", sampleTool, "tool3", "3.0", "local");
    const stats = await cache.getCacheStats();
    expect(stats.count).toBe(3);
    expect(stats.bySource).toEqual({ api: 2, local: 1 });
    expect(stats.totalBytes).toBeGreaterThan(0);
    expect(stats.oldest).toBeDefined();
    expect(stats.newest).toBeDefined();
    expect(stats.oldest! <= stats.newest!).toBe(true);
  });

  it("getCacheStats omits totalBytes when storage lacks stat()", async () => {
    const data = new Map<string, unknown>();
    const statlessStorage = {
      load: async (k: string) => data.get(k) ?? null,
      save: async (k: string, v: unknown) => {
        data.set(k, v);
      },
      delete: async (k: string) => {
        data.delete(k);
      },
      list: async () => [...data.keys()].filter((k) => k !== "__index__"),
    };
    const statlessCache = new ToolCache({ storage: statlessStorage });
    await statlessCache.saveTool("k1", sampleTool, "tool1", "1.0", "api");
    const stats = await statlessCache.getCacheStats();
    expect(stats.count).toBe(1);
    expect(stats.bySource).toEqual({ api: 1 });
    expect(stats.totalBytes).toBeUndefined();
  });

  it("FilesystemCacheStorage.stat returns sizeBytes and mtime", async () => {
    const storage = new FilesystemCacheStorage(tmpDir);
    await storage.save("statkey", { hello: "world" });
    const s = await storage.stat("statkey");
    expect(s).not.toBeNull();
    expect(s!.sizeBytes).toBeGreaterThan(0);
    expect(typeof s!.mtime).toBe("string");
    expect(await storage.stat("missing")).toBeNull();
  });

  it("writes valid JSON to disk", async () => {
    const key = "diskcheck";
    await cache.saveTool(key, sampleTool, "tool/id", "1.0", "api");
    const raw = await readFile(join(tmpDir, `${key}.json`), "utf-8");
    const parsed = JSON.parse(raw);
    expect(parsed.id).toBe("fastqc");
    expect(parsed.name).toBe("FastQC");
  });
});
