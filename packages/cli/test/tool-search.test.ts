import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

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

describe("gxwf tool-search", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;
  let originalFetch: typeof fetch;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    originalFetch = globalThis.fetch;
    process.exitCode = undefined;
  });

  afterEach(() => {
    logSpy.mockRestore();
    errSpy.mockRestore();
    globalThis.fetch = originalFetch;
    process.exitCode = undefined;
  });

  it("emits JSON envelope with hits on success", async () => {
    globalThis.fetch = (async () => fixtureResponse("fastqc-page1.json")) as typeof fetch;
    await runToolSearch("fastqc", { json: true, maxResults: 3 });
    expect(process.exitCode).toBeUndefined();
    const output = logSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(output);
    expect(parsed.query).toBe("fastqc");
    expect(parsed.hits).toHaveLength(3);
    expect(parsed.hits[0].toolId).toBe("fastqc");
    expect(parsed.hits[0].trsToolId).toBe("devteam~fastqc~fastqc");
  });

  it("prints a human table when --json is absent", async () => {
    globalThis.fetch = (async () => fixtureResponse("fastqc-page1.json")) as typeof fetch;
    await runToolSearch("fastqc", { maxResults: 3 });
    expect(process.exitCode).toBeUndefined();
    const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("score");
    expect(output).toContain("devteam/fastqc");
    expect(output).toContain("FastQC");
  });

  it("exits 2 when there are no hits", async () => {
    globalThis.fetch = (async () => fixtureResponse("empty.json")) as typeof fetch;
    await runToolSearch("nothingmatches", { json: true });
    expect(process.exitCode).toBe(2);
    const output = logSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(output);
    expect(parsed.hits).toEqual([]);
  });

  it("exits 3 on ToolFetchError", async () => {
    globalThis.fetch = (async () => new Response("boom", { status: 500 })) as typeof fetch;
    await runToolSearch("fastqc", { json: true });
    expect(process.exitCode).toBe(3);
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("Tool Shed search failed"));
  });
});
