import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ToolInfoService } from "../src/tool-info.js";
import fastqcFixture from "./fixtures/fastqc-parsed-tool.json" with { type: "json" };

function mockFetch(responseBody: unknown, status = 200): typeof fetch {
  return async () =>
    new Response(JSON.stringify(responseBody), {
      status,
      headers: { "Content-Type": "application/json" },
    });
}

describe("ToolInfoService", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "toolinfo-test-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true });
  });

  it("fetches from API and caches on miss", async () => {
    let fetchCount = 0;
    const countingFetch: typeof fetch = async (...args) => {
      fetchCount++;
      return mockFetch(fastqcFixture)(...args);
    };
    const service = new ToolInfoService({
      cacheDir: tmpDir,
      fetcher: countingFetch,
    });
    const toolId =
      "toolshed.g2.bx.psu.edu/repos/devteam/fastqc/fastqc/0.74+galaxy0";

    // First call → API fetch
    const result = await service.getToolInfo(toolId);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("FastQC");
    expect(fetchCount).toBe(1);

    // Second call → cache hit (no additional fetch)
    const cached = await service.getToolInfo(toolId);
    expect(cached).not.toBeNull();
    expect(cached!.name).toBe("FastQC");
    expect(fetchCount).toBe(1);
  });

  it("returns null when all sources fail", async () => {
    const service = new ToolInfoService({
      cacheDir: tmpDir,
      fetcher: mockFetch({}, 404),
    });
    const result = await service.getToolInfo("cat1", "1.0.0");
    expect(result).toBeNull();
  });

  it("falls through to Galaxy on ToolShed failure", async () => {
    let lastUrl = "";
    const selectiveFetch: typeof fetch = async (url, init) => {
      lastUrl = url as string;
      if ((url as string).includes("toolshed")) {
        return new Response("Not found", { status: 404 });
      }
      return mockFetch(fastqcFixture)(url, init);
    };
    const service = new ToolInfoService({
      cacheDir: tmpDir,
      galaxyUrl: "https://usegalaxy.org",
      fetcher: selectiveFetch,
    });
    const result = await service.getToolInfo("cat1", "1.0.0");
    expect(result).not.toBeNull();
    expect(lastUrl).toContain("usegalaxy.org");
  });

  it("addTool caches directly", async () => {
    const service = new ToolInfoService({
      cacheDir: tmpDir,
      fetcher: mockFetch({}, 500), // should not be called
    });
    const toolId =
      "toolshed.g2.bx.psu.edu/repos/devteam/fastqc/fastqc/0.74+galaxy0";
    const key = await service.addTool(
      toolId,
      "0.74+galaxy0",
      fastqcFixture as any,
      "local",
    );
    expect(key).toBeTruthy();

    const result = await service.getToolInfo(toolId);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("FastQC");
  });

  it("persists cache across service instances", async () => {
    const service1 = new ToolInfoService({
      cacheDir: tmpDir,
      fetcher: mockFetch(fastqcFixture),
    });
    const toolId =
      "toolshed.g2.bx.psu.edu/repos/devteam/fastqc/fastqc/0.74+galaxy0";
    await service1.getToolInfo(toolId);

    // New instance — should read from disk
    let fetchCount = 0;
    const service2 = new ToolInfoService({
      cacheDir: tmpDir,
      fetcher: async (...args) => {
        fetchCount++;
        return mockFetch(fastqcFixture)(...args);
      },
    });
    const result = await service2.getToolInfo(toolId);
    expect(result).not.toBeNull();
    expect(fetchCount).toBe(0);
  });

  it("throws when no version available", async () => {
    const service = new ToolInfoService({ cacheDir: tmpDir });
    await expect(
      service.getToolInfo(
        "toolshed.g2.bx.psu.edu/repos/devteam/fastqc/fastqc",
      ),
    ).rejects.toThrow("No version");
  });
});
