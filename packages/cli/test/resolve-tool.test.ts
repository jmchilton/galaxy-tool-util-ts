import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { makeNodeToolCache, makeNodeToolInfoService } from "@galaxy-tool-util/core/node";
import { isResolveError, resolveTool } from "../src/commands/resolve-tool.js";
import { textOnlyTool } from "./helpers/fixtures.js";

const TOOL_ID = "toolshed.g2.bx.psu.edu/repos/test/fetched/fetched_tool";

function toolResponse(): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(textOnlyTool), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })) as typeof fetch;
}

describe("resolveTool", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "resolve-tool-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true });
  });

  it("returns a not_cached error (fetchAttempted=false) when no service is supplied", async () => {
    const cache = makeNodeToolCache({ cacheDir: tmpDir });
    const result = await resolveTool(cache, TOOL_ID, "1.0");
    expect(isResolveError(result)).toBe(true);
    if (isResolveError(result)) {
      expect(result.kind).toBe("not_cached");
      if (result.kind === "not_cached") expect(result.fetchAttempted).toBe(false);
    }
  });

  it("fetches the tool on a cache miss when a service is supplied", async () => {
    let calls = 0;
    const service = makeNodeToolInfoService({
      cacheDir: tmpDir,
      fetcher: (async (...args) => {
        calls++;
        return toolResponse()(...args);
      }) as typeof fetch,
    });

    const result = await resolveTool(service.cache, TOOL_ID, "1.0", service);
    expect(isResolveError(result)).toBe(false);
    if (!isResolveError(result)) {
      expect(result.tool.name).toBe("Simple Tool");
      // The returned key must be the authoritative one the tool was cached
      // under — loadable straight back, not a re-derived guess.
      const roundTrip = await service.cache.loadCached(result.key);
      expect(roundTrip?.name).toBe("Simple Tool");
    }
    expect(calls).toBe(1);

    // Second resolve hits the now-warm cache — no extra fetch.
    const again = await resolveTool(service.cache, TOOL_ID, "1.0", service);
    expect(isResolveError(again)).toBe(false);
    expect(calls).toBe(1);
  });

  it("reports fetchAttempted=true when a supplied service cannot fetch the tool", async () => {
    const service = makeNodeToolInfoService({
      cacheDir: tmpDir,
      fetcher: (async () => new Response("nope", { status: 404 })) as typeof fetch,
    });

    const result = await resolveTool(service.cache, TOOL_ID, "1.0", service);
    expect(isResolveError(result)).toBe(true);
    if (isResolveError(result) && result.kind === "not_cached") {
      expect(result.fetchAttempted).toBe(true);
    }
  });

  describe("stock/built-in tools", () => {
    const STOCK_ID = "Show beginning1";

    function jsonResponse(body: unknown): Response {
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    /** Shed that only knows `Show beginning1` at version 1.0.2. */
    function stockShedFetcher(): typeof fetch {
      return (async (input: RequestInfo | URL) => {
        const url = String(input);
        // TRS versions listing → newest last.
        if (url.includes("/api/ga4gh/trs/v2/tools/") && url.endsWith("/versions")) {
          return jsonResponse([
            { id: "1.0.2", name: null, url: "", descriptor_type: ["GALAXY"], author: [] },
          ]);
        }
        // Concrete-version fetch — only 1.0.2 exists.
        if (url.includes("/versions/1.0.2")) {
          return jsonResponse({ ...textOnlyTool, id: STOCK_ID, version: "1.0.2" });
        }
        return new Response("nope", { status: 404 });
      }) as typeof fetch;
    }

    it("flags a hallucinated stock pin as stock_version_mismatch", async () => {
      const service = makeNodeToolInfoService({ cacheDir: tmpDir, fetcher: stockShedFetcher() });
      const result = await resolveTool(service.cache, STOCK_ID, "1.0.0", service);
      expect(isResolveError(result)).toBe(true);
      if (isResolveError(result)) {
        expect(result.kind).toBe("stock_version_mismatch");
        if (result.kind === "stock_version_mismatch") {
          expect(result.pinnedVersion).toBe("1.0.0");
          expect(result.resolvedVersion).toBe("1.0.2");
        }
      }
    });

    it("resolves a correctly pinned stock version", async () => {
      const service = makeNodeToolInfoService({ cacheDir: tmpDir, fetcher: stockShedFetcher() });
      const result = await resolveTool(service.cache, STOCK_ID, "1.0.2", service);
      expect(isResolveError(result)).toBe(false);
      if (!isResolveError(result)) expect(result.tool.version).toBe("1.0.2");
    });

    it("skips (not_cached) a stock tool the shed can't resolve at all", async () => {
      const service = makeNodeToolInfoService({
        cacheDir: tmpDir,
        fetcher: (async () => new Response("nope", { status: 404 })) as typeof fetch,
      });
      const result = await resolveTool(service.cache, STOCK_ID, "1.0.0", service);
      expect(isResolveError(result)).toBe(true);
      if (isResolveError(result)) expect(result.kind).toBe("not_cached");
    });

    it("does not flag a shed (owner/repo) tool with a bad version as a stock mismatch", async () => {
      const service = makeNodeToolInfoService({ cacheDir: tmpDir, fetcher: stockShedFetcher() });
      const result = await resolveTool(service.cache, TOOL_ID, "9.9.9", service);
      expect(isResolveError(result)).toBe(true);
      if (isResolveError(result)) expect(result.kind).toBe("not_cached");
    });
  });
});
