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
});
