import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { makeNodeToolInfoService } from "../src/cache/node.js";
import {
  HttpError,
  cacheToTrs,
  cacheToTrsOne,
  listCache,
  cacheStats,
  getCacheRaw,
  deleteCacheEntry,
  clearCache,
  searchTools,
  trsListTools,
  trsGetTool,
  trsListVersions,
  getParsedTool,
  getParameterSchema,
  getToolSource,
  type CacheIndexRecord,
  type HandlerCtx,
} from "../src/cache-http/index.js";
import fastqcFixture from "./fixtures/fastqc-parsed-tool.json" with { type: "json" };

const TOOL_ID = "toolshed.g2.bx.psu.edu/repos/devteam/fastqc/fastqc/0.74+galaxy0";

function mockFetch(body: unknown, status = 200): typeof fetch {
  return async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
}

async function makeCtx(tmpDir: string, baseUrl = "https://example.test"): Promise<HandlerCtx> {
  const service = makeNodeToolInfoService({
    cacheDir: tmpDir,
    fetcher: mockFetch(fastqcFixture),
  });
  // Populate one entry so handlers have something to walk.
  await service.getToolInfo(TOOL_ID);
  return { service, baseUrl };
}

describe("cacheToTrs", () => {
  const baseUrl = "https://srv.example";
  const sample: CacheIndexRecord[] = [
    {
      cache_key: "k1",
      tool_id: "devteam~fastqc~fastqc",
      tool_version: "0.74+galaxy0",
      source: "api",
      source_url: "",
      cached_at: "2026-01-01T00:00:00Z",
    },
    {
      cache_key: "k2",
      tool_id: "devteam~fastqc~fastqc",
      tool_version: "0.73+galaxy0",
      source: "api",
      source_url: "",
      cached_at: "2025-12-01T00:00:00Z",
    },
    {
      cache_key: "k3",
      tool_id: "iuc~multiqc~multiqc",
      tool_version: "1.11+galaxy1",
      source: "api",
      source_url: "",
      cached_at: "2026-02-01T00:00:00Z",
    },
  ];

  it("groups versions under one Tool per tool_id", () => {
    const tools = cacheToTrs(sample, baseUrl);
    expect(tools).toHaveLength(2);
    const fastqc = tools.find((t) => t.id === "devteam~fastqc~fastqc")!;
    expect(fastqc.versions).toHaveLength(2);
    expect(fastqc.organization).toBe("devteam");
    expect(fastqc.toolclass.id).toBe("GalaxyTool");
    expect(fastqc.url).toBe(
      `${baseUrl}/api/ga4gh/trs/v2/tools/${encodeURIComponent("devteam~fastqc~fastqc")}`,
    );
    const v074 = fastqc.versions.find((v) => v.id === "0.74+galaxy0")!;
    expect(v074.descriptor_type).toEqual(["GALAXY"]);
    expect(v074.url).toBe(
      `${baseUrl}/api/ga4gh/trs/v2/tools/${encodeURIComponent("devteam~fastqc~fastqc")}/versions/${encodeURIComponent("0.74+galaxy0")}`,
    );
  });

  it("returns empty array for empty input", () => {
    expect(cacheToTrs([], baseUrl)).toEqual([]);
  });

  it("falls back to tool_id for organization when no `~` separator", () => {
    const [tool] = cacheToTrs([{ ...sample[0], tool_id: "no-tilde-id" }], baseUrl);
    expect(tool.organization).toBe("no-tilde-id");
  });

  it("cacheToTrsOne picks one tool, returns null when missing", () => {
    expect(cacheToTrsOne(sample, "iuc~multiqc~multiqc", baseUrl)?.versions).toHaveLength(1);
    expect(cacheToTrsOne(sample, "missing~tool~id", baseUrl)).toBeNull();
  });
});

describe("HTTP handlers (admin)", () => {
  let tmpDir: string;
  let ctx: HandlerCtx;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "http-handlers-test-"));
    ctx = await makeCtx(tmpDir);
  });
  afterEach(async () => {
    await rm(tmpDir, { recursive: true });
  });

  it("listCache returns one entry + stats", async () => {
    const r = await listCache(ctx);
    expect(r.entries).toHaveLength(1);
    // Admin entries keep the readable (`shed/repos/owner/...`) tool_id.
    expect(r.entries[0].toolId).toContain("devteam/fastqc");
    expect(r.entries[0].refetchable).toBe(true);
    expect(r.entries[0].toolshedUrl).toContain("toolshed.g2.bx.psu.edu");
    expect(r.stats.count).toBe(1);
  });

  it("listCache decode=true probes payloads", async () => {
    const r = await listCache(ctx, { decode: true });
    expect(r.entries[0].decodable).toBe(true);
  });

  it("cacheStats matches list-derived count", async () => {
    const s = await cacheStats(ctx);
    expect(s.count).toBe(1);
  });

  it("getCacheRaw returns contents and 404s missing keys", async () => {
    const list = await listCache(ctx);
    const raw = await getCacheRaw(ctx, list.entries[0].cacheKey);
    expect(raw.decodable).toBe(true);
    await expect(getCacheRaw(ctx, "nope")).rejects.toBeInstanceOf(HttpError);
  });

  it("deleteCacheEntry 404s missing key, succeeds for present", async () => {
    const list = await listCache(ctx);
    await expect(deleteCacheEntry(ctx, "nope")).rejects.toMatchObject({ status: 404 });
    const r = await deleteCacheEntry(ctx, list.entries[0].cacheKey);
    expect(r.removed).toBe(true);
  });

  it("clearCache empties everything", async () => {
    const r = await clearCache(ctx);
    expect(r.removed).toBe(1);
    expect((await listCache(ctx)).entries).toHaveLength(0);
  });

  it("addTool/refetchTool reject empty toolId", async () => {
    const { addTool, refetchTool } = await import("../src/cache-http/index.js");
    await expect(addTool(ctx, { toolId: "" })).rejects.toMatchObject({ status: 400 });
    await expect(refetchTool(ctx, { toolId: "" })).rejects.toMatchObject({ status: 400 });
  });
});

describe("HTTP handlers (read)", () => {
  let tmpDir: string;
  let ctx: HandlerCtx;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "http-handlers-read-"));
    ctx = await makeCtx(tmpDir);
  });
  afterEach(async () => {
    await rm(tmpDir, { recursive: true });
  });

  it("searchTools matches by name + paginates", async () => {
    const all = await searchTools(ctx, {});
    expect(all.total).toBe(1);
    // Read surface emits TRS-form tool ids regardless of cache storage form.
    expect(all.hits[0].toolId).toBe("devteam~fastqc~fastqc");
    expect(all.hits[0].name).toBe("FastQC");
    const hit = await searchTools(ctx, { q: "fastqc" });
    expect(hit.total).toBe(1);
    const miss = await searchTools(ctx, { q: "nonexistent" });
    expect(miss.total).toBe(0);
  });

  it("trsListTools / trsGetTool / trsListVersions cover happy + 404", async () => {
    const tools = await trsListTools(ctx);
    expect(tools).toHaveLength(1);
    const tool = await trsGetTool(ctx, "devteam~fastqc~fastqc");
    expect(tool.versions[0].id).toBe("0.74+galaxy0");
    const versions = await trsListVersions(ctx, "devteam~fastqc~fastqc");
    expect(versions).toHaveLength(1);
    await expect(trsGetTool(ctx, "missing~x~y")).rejects.toMatchObject({ status: 404 });
  });

  it("getParsedTool returns ParsedTool from cache", async () => {
    const tool = (await getParsedTool(ctx, "devteam~fastqc~fastqc", "0.74+galaxy0")) as {
      name: string;
    };
    expect(tool.name).toBe("FastQC");
  });

  it("getParsedTool 404s when no source can satisfy the request", async () => {
    const fresh = await mkdtemp(join(tmpdir(), "http-handlers-miss-"));
    try {
      const failingFetch: typeof fetch = async () => new Response("nope", { status: 404 });
      const service = makeNodeToolInfoService({ cacheDir: fresh, fetcher: failingFetch });
      const missCtx: HandlerCtx = { service, baseUrl: "https://x" };
      await expect(getParsedTool(missCtx, "devteam~fastqc~fastqc", "9.9.9")).rejects.toMatchObject({
        status: 404,
      });
    } finally {
      await rm(fresh, { recursive: true });
    }
  });

  it("getParameterSchema serves request schema", async () => {
    const schema = (await getParameterSchema(
      ctx,
      "devteam~fastqc~fastqc",
      "0.74+galaxy0",
      "request",
    )) as Record<string, unknown>;
    expect(schema).toBeTypeOf("object");
  });

  it("getParameterSchema rejects unknown kind", async () => {
    await expect(
      getParameterSchema(ctx, "devteam~fastqc~fastqc", "0.74+galaxy0", "bogus" as never),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("getToolSource throws 501", () => {
    expect(() => getToolSource(ctx, "x", "y")).toThrow(HttpError);
  });
});
