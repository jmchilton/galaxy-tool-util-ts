import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runRepoSearch } from "../src/commands/repo-search.js";

const fixturesDir = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../search/test/fixtures/toolshed-repo-search",
);

function fixtureResponse(name: string): Response {
  return new Response(readFileSync(resolve(fixturesDir, name), "utf8"), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("gxwf repo-search", () => {
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

  it("emits JSON envelope with normalized hits", async () => {
    globalThis.fetch = (async () => fixtureResponse("fastqc-page1.json")) as typeof fetch;
    await runRepoSearch("fastqc", { json: true, maxResults: 3 });
    expect(process.exitCode).toBeUndefined();
    const parsed = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(parsed.query).toBe("fastqc");
    expect(parsed.filters).toEqual({});
    expect(parsed.hits).toHaveLength(3);
    expect(parsed.hits[0].repoName).toBe("fastqc");
    expect(parsed.hits[0].repoOwnerUsername).toBe("devteam");
    expect(Array.isArray(parsed.hits[0].categories)).toBe(true);
  });

  it("forwards owner: into the request and surfaces it under filters", async () => {
    let observedUrl = "";
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      observedUrl =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      return fixtureResponse("fastqc-owner-devteam.json");
    }) as typeof fetch;
    await runRepoSearch("fastqc", { json: true, owner: "devteam" });
    const url = new URL(observedUrl);
    expect(url.searchParams.get("q")).toBe("fastqc owner:devteam");
    const parsed = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(parsed.filters).toEqual({ owner: "devteam" });
  });

  it("exits 2 when no hits", async () => {
    globalThis.fetch = (async () => fixtureResponse("empty.json")) as typeof fetch;
    await runRepoSearch("zzzz", { json: true });
    expect(process.exitCode).toBe(2);
  });

  it("exits 3 on ToolFetchError", async () => {
    globalThis.fetch = (async () => new Response("boom", { status: 500 })) as typeof fetch;
    await runRepoSearch("fastqc", { json: true });
    expect(process.exitCode).toBe(3);
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("Tool Shed repo search failed"));
  });

  it("renders a human table when --json is absent", async () => {
    globalThis.fetch = (async () => fixtureResponse("fastqc-page1.json")) as typeof fetch;
    await runRepoSearch("fastqc", { maxResults: 3 });
    const out = logSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(out).toContain("downloads");
    expect(out).toContain("devteam/fastqc");
  });
});
