/**
 * Browser-mode tests for IndexedDBCacheStorage and ToolCache against a real
 * IndexedDB (via vitest browser mode + Playwright). Run with:
 *   pnpm -F @galaxy-tool-util/core run test:browser
 */
import { describe, it, expect, beforeEach } from "vitest";

import { IndexedDBCacheStorage, ToolCache, cacheKey } from "../src/index.js";
import type { ParsedTool } from "@galaxy-tool-util/schema";

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
} as unknown as ParsedTool;

let counter = 0;
function freshDbName(): string {
  counter += 1;
  return `gxwf-browser-test-${Date.now()}-${counter}`;
}

describe("IndexedDBCacheStorage (browser)", () => {
  let storage: IndexedDBCacheStorage;

  beforeEach(() => {
    storage = new IndexedDBCacheStorage(freshDbName());
  });

  it("save + load round-trip", async () => {
    await storage.save("k1", { hello: "world" });
    expect(await storage.load("k1")).toEqual({ hello: "world" });
  });

  it("returns null for missing keys", async () => {
    expect(await storage.load("missing")).toBeNull();
  });

  it("list returns saved keys", async () => {
    await storage.save("a", { v: 1 });
    await storage.save("b", { v: 2 });
    const keys = await storage.list();
    expect(keys.sort()).toEqual(["a", "b"]);
  });

  it("delete removes an entry", async () => {
    await storage.save("gone", { v: 1 });
    await storage.delete("gone");
    expect(await storage.load("gone")).toBeNull();
  });

  it("stat returns sizeBytes for stored values", async () => {
    await storage.save("size1", { hello: "world" });
    const s = await storage.stat("size1");
    expect(s).not.toBeNull();
    expect(s!.sizeBytes).toBeGreaterThan(0);
    expect(await storage.stat("missing")).toBeNull();
  });
});

describe("ToolCache with IndexedDBCacheStorage (browser)", () => {
  it("save + load tool round-trip", async () => {
    const cache = new ToolCache({ storage: new IndexedDBCacheStorage(freshDbName()) });
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
    expect(loaded!.name).toBe("FastQC");
  });

  it("persists across ToolCache instances on the same DB", async () => {
    const dbName = freshDbName();
    const cache1 = new ToolCache({ storage: new IndexedDBCacheStorage(dbName) });
    const key = await cacheKey(
      "https://toolshed.g2.bx.psu.edu",
      "devteam~fastqc~fastqc",
      "0.74+galaxy0",
    );
    await cache1.saveTool(key, sampleTool, "fastqc", "0.74+galaxy0", "api");

    const cache2 = new ToolCache({ storage: new IndexedDBCacheStorage(dbName) });
    const loaded = await cache2.loadCached(key);
    expect(loaded).not.toBeNull();
    expect(loaded!.name).toBe("FastQC");
  });
});
