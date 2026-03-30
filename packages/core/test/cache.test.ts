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
  it("matches Python implementation", () => {
    const key = cacheKey("https://toolshed.g2.bx.psu.edu", "devteam~fastqc~fastqc", "0.74+galaxy0");
    expect(key).toBe("4442926e78fe6e6574ffb9110be50f9b72cc3eb3b133e5435cf7b8658cd0a0f5");
  });
});

describe("CacheIndex", () => {
  let tmpDir: string;
  let index: CacheIndex;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "cache-test-"));
    index = new CacheIndex(tmpDir);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true });
  });

  it("starts empty", () => {
    expect(index.listAll()).toEqual([]);
    expect(index.has("nonexistent")).toBe(false);
  });

  it("add + has + listAll", async () => {
    await index.add("key1", "tool/id", "1.0", "api", "http://example.com");
    expect(index.has("key1")).toBe(true);
    const all = index.listAll();
    expect(all).toHaveLength(1);
    expect(all[0].cache_key).toBe("key1");
    expect(all[0].tool_id).toBe("tool/id");
    expect(all[0].source).toBe("api");
  });

  it("remove", async () => {
    await index.add("key1", "tool/id", "1.0", "api");
    await index.remove("key1");
    expect(index.has("key1")).toBe(false);
    expect(index.listAll()).toHaveLength(0);
  });

  it("clear", async () => {
    await index.add("key1", "tool1", "1.0", "api");
    await index.add("key2", "tool2", "2.0", "api");
    await index.clear();
    expect(index.listAll()).toHaveLength(0);
  });

  it("persists to disk and reloads", async () => {
    await index.add("key1", "tool/id", "1.0", "api", "http://example.com");
    const index2 = new CacheIndex(tmpDir);
    await index2.load();
    expect(index2.has("key1")).toBe(true);
    expect(index2.listAll()[0].tool_id).toBe("tool/id");
  });

  it("handles missing index file gracefully", async () => {
    const emptyIndex = new CacheIndex(join(tmpDir, "nonexistent"));
    await emptyIndex.load();
    expect(emptyIndex.listAll()).toEqual([]);
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
    cache = new ToolCache({ cacheDir: tmpDir });
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
    const key = cacheKey("https://toolshed.g2.bx.psu.edu", "devteam~fastqc~fastqc", "0.74+galaxy0");
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
    expect(cache.hasCached(toolId)).toBe(false);

    const coords = cache.resolveToolCoordinates(toolId);
    const key = cacheKey(coords.toolshedUrl, coords.trsToolId, coords.version!);
    await cache.saveTool(key, sampleTool, coords.readableId, coords.version!, "api");
    expect(cache.hasCached(toolId)).toBe(true);
  });

  it("listCached shows entries", async () => {
    expect(cache.listCached()).toHaveLength(0);
    const key = "testkey";
    await cache.saveTool(key, sampleTool, "tool/id", "1.0", "api");
    const list = cache.listCached();
    expect(list).toHaveLength(1);
    expect(list[0].tool_id).toBe("tool/id");
  });

  it("clearCache removes all entries", async () => {
    await cache.saveTool("k1", sampleTool, "tool1", "1.0", "api");
    await cache.saveTool("k2", sampleTool, "tool2", "2.0", "api");
    expect(cache.listCached()).toHaveLength(2);
    await cache.clearCache();
    expect(cache.listCached()).toHaveLength(0);
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
    const remaining = cache.listCached();
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

  it("writes valid JSON to disk", async () => {
    const key = "diskcheck";
    await cache.saveTool(key, sampleTool, "tool/id", "1.0", "api");
    const raw = await readFile(join(tmpDir, `${key}.json`), "utf-8");
    const parsed = JSON.parse(raw);
    expect(parsed.id).toBe("fastqc");
    expect(parsed.name).toBe("FastQC");
  });
});
