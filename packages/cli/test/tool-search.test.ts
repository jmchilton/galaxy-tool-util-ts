import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { Console } from "node:console";
import { Writable } from "node:stream";

import { runToolSearch } from "../src/commands/tool-search.js";

const fixturesDir = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../search/test/fixtures/toolshed-search",
);

function loadFixture(name: string): string {
  return readFileSync(resolve(fixturesDir, name), "utf8");
}

function fixtureResponse(name: string): Response {
  return new Response(loadFixture(name), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

class MemoryWritable extends Writable {
  output = "";

  override _write(
    chunk: Buffer | string,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    this.output += chunk.toString();
    callback();
  }
}

describe("gxwf tool-search", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;
  let debugSpy: ReturnType<typeof vi.spyOn>;
  let infoSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let stdout: MemoryWritable;
  let stderr: MemoryWritable;
  let originalFetch: typeof fetch;

  beforeEach(() => {
    stdout = new MemoryWritable();
    stderr = new MemoryWritable();
    const testConsole = new Console({ stdout, stderr });
    logSpy = vi.spyOn(console, "log").mockImplementation((...args) => testConsole.log(...args));
    errSpy = vi.spyOn(console, "error").mockImplementation((...args) => testConsole.error(...args));
    debugSpy = vi
      .spyOn(console, "debug")
      .mockImplementation((...args) => testConsole.debug(...args));
    infoSpy = vi.spyOn(console, "info").mockImplementation((...args) => testConsole.info(...args));
    warnSpy = vi.spyOn(console, "warn").mockImplementation((...args) => testConsole.warn(...args));
    originalFetch = globalThis.fetch;
    process.exitCode = undefined;
  });

  afterEach(() => {
    logSpy.mockRestore();
    errSpy.mockRestore();
    debugSpy.mockRestore();
    infoSpy.mockRestore();
    warnSpy.mockRestore();
    globalThis.fetch = originalFetch;
    process.exitCode = undefined;
  });

  it("emits JSON envelope with hits on success", async () => {
    globalThis.fetch = (async () => fixtureResponse("fastqc-page1.json")) as typeof fetch;
    await runToolSearch("fastqc", { json: true, maxResults: 3 });
    expect(process.exitCode).toBeUndefined();
    const parsed = JSON.parse(stdout.output);
    expect(parsed.query).toBe("fastqc");
    expect(parsed.hits).toHaveLength(3);
    expect(parsed.hits[0].toolId).toBe("fastqc");
    expect(parsed.hits[0].trsToolId).toBe("devteam~fastqc~fastqc");
  });

  it("prints a human table when --json is absent", async () => {
    globalThis.fetch = (async () => fixtureResponse("fastqc-page1.json")) as typeof fetch;
    await runToolSearch("fastqc", { maxResults: 3 });
    expect(process.exitCode).toBeUndefined();
    const output = stdout.output;
    expect(output).toContain("score");
    expect(output).toContain("devteam/fastqc");
    expect(output).toContain("FastQC");
  });

  it("exits 2 when there are no hits", async () => {
    globalThis.fetch = (async () => fixtureResponse("empty.json")) as typeof fetch;
    await runToolSearch("nothingmatches", { json: true });
    expect(process.exitCode).toBe(2);
    const parsed = JSON.parse(stdout.output);
    expect(parsed.hits).toEqual([]);
  });

  it("--owner filters hits client-side", async () => {
    globalThis.fetch = (async () => fixtureResponse("fastqc-page1.json")) as typeof fetch;
    await runToolSearch("fastqc", { json: true, owner: "devteam", maxResults: 10 });
    const parsed = JSON.parse(stdout.output);
    expect(
      parsed.hits.every((h: { repoOwnerUsername: string }) => h.repoOwnerUsername === "devteam"),
    ).toBe(true);
    expect(parsed.hits.length).toBeGreaterThan(0);
  });

  it("--match-name drops hits where the query is not a tool-name token", async () => {
    globalThis.fetch = (async () => fixtureResponse("fastqc-page1.json")) as typeof fetch;
    await runToolSearch("fastqc", { json: true, matchName: true, maxResults: 10 });
    const parsed = JSON.parse(stdout.output);
    for (const hit of parsed.hits) {
      expect(hit.toolName.toLowerCase()).toContain("fastqc");
    }
  });

  it("--page is forwarded to the server as the starting page", async () => {
    let observedUrl = "";
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      observedUrl =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      return fixtureResponse("empty.json");
    }) as typeof fetch;
    await runToolSearch("fastqc", { json: true, page: 3 });
    expect(new URL(observedUrl).searchParams.get("page")).toBe("3");
    expect(JSON.parse(stdout.output).hits).toEqual([]);
  });

  it("--enrich attempts ParsedTool resolution and tolerates per-hit failures", async () => {
    const cacheDir = await mkdtemp(join(tmpdir(), "gxwf-enrich-"));
    try {
      const calls: string[] = [];
      globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url =
          typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        calls.push(url);
        if (url.includes("/api/tools?")) return fixtureResponse("fastqc-page1.json");
        return new Response("not found", { status: 404 });
      }) as typeof fetch;

      await runToolSearch("fastqc", { json: true, enrich: true, maxResults: 2, cacheDir });

      expect(process.exitCode).toBeUndefined();
      const parsed = JSON.parse(stdout.output);
      expect(parsed.hits).toHaveLength(2);
      // Enrichment was attempted (extra non-search HTTP calls were issued).
      expect(calls.some((u) => !u.includes("/api/tools?"))).toBe(true);
      // Failed enrichment leaves parsedTool unset.
      for (const hit of parsed.hits) {
        expect(hit.parsedTool).toBeUndefined();
      }
      expect(stderr.output).toContain("TRS latest-version lookup failed");
      expect(stdout.output).not.toContain("TRS latest-version lookup failed");
      expect(debugSpy).not.toHaveBeenCalled();
    } finally {
      await rm(cacheDir, { recursive: true, force: true });
    }
  });

  it("exits 3 on ToolFetchError", async () => {
    globalThis.fetch = (async () => new Response("boom", { status: 500 })) as typeof fetch;
    await runToolSearch("fastqc", { json: true });
    expect(process.exitCode).toBe(3);
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("Tool Shed search failed"));
  });
});
