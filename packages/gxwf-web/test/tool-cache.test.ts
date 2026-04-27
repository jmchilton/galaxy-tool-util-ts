/**
 * Tool cache API tests.
 * Real HTTP server against a temp dir; cache state seeded via
 * `state.cache.saveTool` and the upstream FilesystemCacheStorage.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { AddressInfo } from "node:net";
import type { ParsedTool } from "@galaxy-tool-util/schema";
import { cacheKey } from "@galaxy-tool-util/core";

import { createApp } from "../src/app.js";
import type { AppState } from "../src/app.js";

interface TestServer {
  baseUrl: string;
  state: AppState;
  close: () => Promise<void>;
}

const sampleToolJson = {
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

async function startTestServer(directory: string, cacheDir: string): Promise<TestServer> {
  const { server, state, ready } = createApp(directory, { cacheDir });
  await ready;
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as AddressInfo;
      resolve({
        baseUrl: `http://127.0.0.1:${addr.port}`,
        state,
        close: () =>
          new Promise<void>((res, rej) => server.close((err) => (err ? rej(err) : res()))),
      });
    });
  });
}

let tmpDir: string;
let cacheDir: string;
let srv: TestServer;

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gxwf-tc-"));
  cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "gxwf-tc-cache-"));
  srv = await startTestServer(tmpDir, cacheDir);
});

afterEach(async () => {
  await srv.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.rmSync(cacheDir, { recursive: true, force: true });
});

async function seedTool(
  key: string,
  toolId: string,
  version: string,
  source = "api",
): Promise<void> {
  await srv.state.cache.saveTool(
    key,
    sampleToolJson as unknown as ParsedTool,
    toolId,
    version,
    source,
    `https://example.test/api/tools/${toolId}/versions/${version}`,
  );
}

describe("GET /api/tool-cache", () => {
  it("returns empty list when nothing cached", async () => {
    const res = await fetch(`${srv.baseUrl}/api/tool-cache`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.entries).toEqual([]);
    expect(data.stats.count).toBe(0);
    expect(data.stats.bySource).toEqual({});
  });

  it("returns entries + stats after seeding", async () => {
    await seedTool("k1", "fastqc", "0.74+galaxy0", "api");
    await seedTool("k2", "samtools_view", "1.15.1", "api");
    const res = await fetch(`${srv.baseUrl}/api/tool-cache`);
    const data = await res.json();
    expect(data.entries).toHaveLength(2);
    expect(data.stats.count).toBe(2);
    expect(data.stats.bySource.api).toBe(2);
    expect(data.stats.totalBytes).toBeGreaterThan(0);
    const e = data.entries.find((x: { cacheKey: string }) => x.cacheKey === "k1");
    expect(e.toolId).toBe("fastqc");
    expect(e.toolVersion).toBe("0.74+galaxy0");
    expect(e.decodable).toBe(true);
    expect(e.refetchable).toBe(true);
    expect(typeof e.sizeBytes).toBe("number");
    expect(e.sizeBytes).toBeGreaterThan(0);
  });

  it("flags orphan / unknown entries as not refetchable + emits deep toolshedUrl", async () => {
    await seedTool("k1", "unknown", "unknown", "orphan");
    await seedTool("k2", "toolshed.g2.bx.psu.edu/repos/iuc/bwa/bwa_mem", "0.7.17.2", "api");
    const res = await fetch(`${srv.baseUrl}/api/tool-cache`);
    const data = await res.json();
    const orphan = data.entries.find((x: { cacheKey: string }) => x.cacheKey === "k1");
    const real = data.entries.find((x: { cacheKey: string }) => x.cacheKey === "k2");
    expect(orphan.refetchable).toBe(false);
    expect(orphan.toolshedUrl).toBeUndefined();
    expect(real.refetchable).toBe(true);
    // Deep link to the specific repo, not just the shed root.
    expect(real.toolshedUrl).toBe("https://toolshed.g2.bx.psu.edu/repos/iuc/bwa/bwa_mem");
  });

  it("does not probe payloads without ?decode=1 (defaults decodable: true)", async () => {
    await seedTool("k1", "fastqc", "0.74+galaxy0", "api");
    fs.writeFileSync(path.join(cacheDir, "k1.json"), JSON.stringify({ not: "a parsed tool" }));
    const res = await fetch(`${srv.baseUrl}/api/tool-cache`);
    const data = await res.json();
    expect(data.entries[0].decodable).toBe(true);
  });

  it("flags malformed payloads as undecodable when ?decode=1 is set", async () => {
    await seedTool("k1", "fastqc", "0.74+galaxy0", "api");
    fs.writeFileSync(path.join(cacheDir, "k1.json"), JSON.stringify({ not: "a parsed tool" }));
    const res = await fetch(`${srv.baseUrl}/api/tool-cache?decode=1`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.entries[0].decodable).toBe(false);
  });
});

describe("GET /api/tool-cache/stats", () => {
  it("returns aggregate stats", async () => {
    await seedTool("k1", "fastqc", "0.74+galaxy0", "api");
    await seedTool("k2", "local_tool", "1.0", "local");
    const res = await fetch(`${srv.baseUrl}/api/tool-cache/stats`);
    const data = await res.json();
    expect(data.count).toBe(2);
    expect(data.bySource).toEqual({ api: 1, local: 1 });
    expect(data.totalBytes).toBeGreaterThan(0);
    expect(data.oldest).toBeTruthy();
    expect(data.newest).toBeTruthy();
  });
});

describe("GET /api/tool-cache/{key}", () => {
  it("returns raw payload + decodable=true for valid entries", async () => {
    await seedTool("abc123", "fastqc", "0.74+galaxy0");
    const res = await fetch(`${srv.baseUrl}/api/tool-cache/abc123`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.decodable).toBe(true);
    expect((data.contents as { id: string }).id).toBe("fastqc");
  });

  it("returns 404 for missing key", async () => {
    const res = await fetch(`${srv.baseUrl}/api/tool-cache/no-such-key`);
    expect(res.status).toBe(404);
  });

  it("returns 200 + decodable=false for corrupted payload", async () => {
    await seedTool("k1", "fastqc", "0.74+galaxy0");
    fs.writeFileSync(path.join(cacheDir, "k1.json"), JSON.stringify({ broken: true }));
    const res = await fetch(`${srv.baseUrl}/api/tool-cache/k1`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.decodable).toBe(false);
  });
});

describe("DELETE /api/tool-cache/{key}", () => {
  it("removes the entry", async () => {
    await seedTool("k1", "fastqc", "0.74+galaxy0");
    const res = await fetch(`${srv.baseUrl}/api/tool-cache/k1`, { method: "DELETE" });
    expect(res.status).toBe(200);
    expect((await res.json()).removed).toBe(true);
    expect(await srv.state.cache.listCached()).toEqual([]);
  });

  it("returns 404 when missing", async () => {
    const res = await fetch(`${srv.baseUrl}/api/tool-cache/missing`, { method: "DELETE" });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/tool-cache (clear)", () => {
  it("clears everything when no prefix given", async () => {
    await seedTool("k1", "fastqc", "0.74+galaxy0");
    await seedTool("k2", "samtools", "1.15.1");
    const res = await fetch(`${srv.baseUrl}/api/tool-cache`, { method: "DELETE" });
    const data = await res.json();
    expect(data.removed).toBe(2);
    expect(await srv.state.cache.listCached()).toEqual([]);
  });

  it("filters by tool-id prefix", async () => {
    await seedTool("k1", "fastqc", "0.74+galaxy0");
    await seedTool("k2", "fastqc_screen", "1.0");
    await seedTool("k3", "samtools", "1.15.1");
    const res = await fetch(`${srv.baseUrl}/api/tool-cache?prefix=fastqc`, { method: "DELETE" });
    expect((await res.json()).removed).toBe(2);
    const remaining = await srv.state.cache.listCached();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].tool_id).toBe("samtools");
  });

  it("strips trailing * from prefix", async () => {
    await seedTool("k1", "fastqc", "0.74+galaxy0");
    await seedTool("k2", "samtools", "1.15.1");
    const res = await fetch(`${srv.baseUrl}/api/tool-cache?prefix=fastqc*`, { method: "DELETE" });
    expect((await res.json()).removed).toBe(1);
  });
});

describe("POST /api/tool-cache/refetch", () => {
  it("400s without toolId", async () => {
    const res = await fetch(`${srv.baseUrl}/api/tool-cache/refetch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("re-fetches via infoService (force=true even when cached)", async () => {
    const coords = srv.state.cache.resolveToolCoordinates("fastqc", "0.74+galaxy0");
    const realKey = await cacheKey(coords.toolshedUrl, coords.trsToolId, coords.version!);
    await seedTool(realKey, "fastqc", "0.74+galaxy0", "api");
    const decoded = sampleToolJson as unknown as ParsedTool;
    const spy = vi.spyOn(srv.state.infoService, "getToolInfo").mockResolvedValue(decoded);
    const res = await fetch(`${srv.baseUrl}/api/tool-cache/refetch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toolId: "fastqc", toolVersion: "0.74+galaxy0" }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.fetched).toBe(true);
    expect(data.alreadyCached).toBe(true);
    expect(typeof data.cacheKey).toBe("string");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("502s when infoService can't fetch", async () => {
    const spy = vi.spyOn(srv.state.infoService, "getToolInfo").mockResolvedValue(null);
    const res = await fetch(`${srv.baseUrl}/api/tool-cache/refetch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toolId: "no_such_tool" }),
    });
    expect(res.status).toBe(502);
    spy.mockRestore();
  });
});

describe("POST /api/tool-cache/add", () => {
  it("populates a new entry", async () => {
    const decoded = sampleToolJson as unknown as ParsedTool;
    const spy = vi.spyOn(srv.state.infoService, "getToolInfo").mockResolvedValue(decoded);
    const res = await fetch(`${srv.baseUrl}/api/tool-cache/add`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toolId: "fastqc", toolVersion: "0.74+galaxy0" }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.alreadyCached).toBe(false);
    expect(typeof data.cacheKey).toBe("string");
    spy.mockRestore();
  });

  it("short-circuits when entry already cached (no remote fetch)", async () => {
    const coords = srv.state.cache.resolveToolCoordinates("fastqc", "0.74+galaxy0");
    const realKey = await cacheKey(coords.toolshedUrl, coords.trsToolId, coords.version!);
    await seedTool(realKey, "fastqc", "0.74+galaxy0", "api");
    const spy = vi.spyOn(srv.state.infoService, "getToolInfo");
    const res = await fetch(`${srv.baseUrl}/api/tool-cache/add`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toolId: "fastqc", toolVersion: "0.74+galaxy0" }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.alreadyCached).toBe(true);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
