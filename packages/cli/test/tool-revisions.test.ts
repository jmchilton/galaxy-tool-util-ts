import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { runToolRevisions } from "../src/commands/tool-revisions.js";

const fixturesDir = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../search/test/fixtures/toolshed-revisions",
);

function loadFixture(name: string): string {
  return readFileSync(resolve(fixturesDir, name), "utf8");
}

function fastqcFetcher(): typeof fetch {
  const repo = loadFixture("fastqc-repo.json");
  const metadata = loadFixture("fastqc-metadata.json");
  const ordered = loadFixture("fastqc-ordered.json");
  return (async (input: RequestInfo | URL) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.includes("/api/repositories?"))
      return new Response(repo, { status: 200, headers: { "Content-Type": "application/json" } });
    if (url.includes("get_ordered_installable_revisions"))
      return new Response(ordered, {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    if (url.includes("/metadata?"))
      return new Response(metadata, {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    return new Response("unexpected", { status: 500 });
  }) as typeof fetch;
}

describe("gxwf tool-revisions", () => {
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

  it("emits ordered revisions in JSON envelope", async () => {
    globalThis.fetch = fastqcFetcher();
    await runToolRevisions("devteam/fastqc/fastqc", { json: true });
    expect(process.exitCode).toBeUndefined();
    const envelope = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(envelope.trsToolId).toBe("devteam~fastqc~fastqc");
    expect(Array.isArray(envelope.revisions)).toBe(true);
    expect(envelope.revisions.length).toBeGreaterThan(1);
    expect(envelope.revisions[0].changesetRevision).toMatch(/^[0-9a-f]+$/);
  });

  it("--latest returns only the newest matching revision", async () => {
    globalThis.fetch = fastqcFetcher();
    await runToolRevisions("devteam~fastqc~fastqc", { latest: true, json: true });
    expect(process.exitCode).toBeUndefined();
    const envelope = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(envelope.revisions).toHaveLength(1);
  });

  it("--version filters and surfaces the filter in the envelope", async () => {
    globalThis.fetch = fastqcFetcher();
    // Round-trip: grab latest version first, then filter by it.
    await runToolRevisions("devteam~fastqc~fastqc", { json: true });
    const all = JSON.parse(logSpy.mock.calls[0][0] as string);
    const v: string = all.revisions[all.revisions.length - 1].toolVersion;

    logSpy.mockClear();
    globalThis.fetch = fastqcFetcher();
    await runToolRevisions("devteam~fastqc~fastqc", { toolVersion: v, json: true });
    const envelope = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(envelope.version).toBe(v);
    expect(envelope.revisions.every((r: { toolVersion: string }) => r.toolVersion === v)).toBe(
      true,
    );
  });

  it("exits 2 when no revision matches --version", async () => {
    globalThis.fetch = fastqcFetcher();
    await runToolRevisions("devteam~fastqc~fastqc", { toolVersion: "999.999.999", json: true });
    expect(process.exitCode).toBe(2);
    const envelope = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(envelope.revisions).toEqual([]);
  });

  it("exits 3 on ToolFetchError", async () => {
    globalThis.fetch = (async () => new Response("boom", { status: 500 })) as typeof fetch;
    await runToolRevisions("devteam~fastqc~fastqc", { json: true });
    expect(process.exitCode).toBe(3);
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("Tool Shed request failed"));
  });

  it("exits 1 on malformed tool id", async () => {
    await runToolRevisions("not-a-valid-id", { json: true });
    expect(process.exitCode).toBe(1);
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("Invalid tool id"));
  });

  it("prints a tab-separated table when --json is absent", async () => {
    globalThis.fetch = fastqcFetcher();
    await runToolRevisions("devteam/fastqc/fastqc", {});
    const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toMatch(/^[0-9a-f]+\t/m);
  });
});
