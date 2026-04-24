import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { ToolFetchError, getToolRevisions } from "../../src/client/index.js";

const fixturesDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");

function loadJSON(path: string): unknown {
  return JSON.parse(readFileSync(resolve(fixturesDir, path), "utf8"));
}

const TOOLSHED = "https://toolshed.g2.bx.psu.edu";

function buildFastqcResponder(): (url: string) => Response {
  const repo = loadJSON("toolshed-revisions/fastqc-repo.json");
  const metadata = loadJSON("toolshed-revisions/fastqc-metadata.json");
  const ordered = loadJSON("toolshed-revisions/fastqc-ordered.json");
  return (url: string) => {
    if (url.includes("/api/repositories?") && url.includes("owner=devteam") && url.includes("name=fastqc")) {
      return new Response(JSON.stringify(repo), { status: 200 });
    }
    if (url.includes("get_ordered_installable_revisions")) {
      return new Response(JSON.stringify(ordered), { status: 200 });
    }
    if (url.includes("/metadata?")) {
      return new Response(JSON.stringify(metadata), { status: 200 });
    }
    return new Response("unexpected", { status: 500 });
  };
}

function spyFetcher(responder: (url: string) => Response): {
  fetcher: typeof fetch;
  calls: string[];
} {
  const calls: string[] = [];
  const fetcher: typeof fetch = async (input) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    calls.push(url);
    return responder(url);
  };
  return { fetcher, calls };
}

describe("getToolRevisions", () => {
  it("returns all revisions containing the tool, ordered oldest→newest", async () => {
    const { fetcher, calls } = spyFetcher(buildFastqcResponder());
    const matches = await getToolRevisions(TOOLSHED, {
      owner: "devteam",
      repo: "fastqc",
      toolId: "fastqc",
      fetcher,
    });

    expect(matches.length).toBeGreaterThan(1);
    // Should be sorted by order, ascending.
    for (let i = 1; i < matches.length; i++) {
      expect(matches[i].order).toBeGreaterThan(matches[i - 1].order);
    }
    expect(matches[matches.length - 1].toolVersion).toMatch(/^\d/);
    expect(matches.every((m) => /^[0-9a-f]+$/.test(m.changesetRevision))).toBe(true);

    // Three endpoints hit: repo lookup, metadata, ordered.
    expect(calls.some((u) => u.includes("/api/repositories?"))).toBe(true);
    expect(calls.some((u) => u.includes("/metadata?"))).toBe(true);
    expect(calls.some((u) => u.includes("get_ordered_installable_revisions"))).toBe(true);
  });

  it("filters to a specific version", async () => {
    const { fetcher } = spyFetcher(buildFastqcResponder());
    const all = await getToolRevisions(TOOLSHED, {
      owner: "devteam",
      repo: "fastqc",
      toolId: "fastqc",
      fetcher,
    });
    const pickVersion = all[all.length - 1].toolVersion;

    const { fetcher: f2 } = spyFetcher(buildFastqcResponder());
    const filtered = await getToolRevisions(TOOLSHED, {
      owner: "devteam",
      repo: "fastqc",
      toolId: "fastqc",
      version: pickVersion,
      fetcher: f2,
    });

    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.every((m) => m.toolVersion === pickVersion)).toBe(true);
  });

  it("returns [] when no revision publishes the given version", async () => {
    const { fetcher } = spyFetcher(buildFastqcResponder());
    const matches = await getToolRevisions(TOOLSHED, {
      owner: "devteam",
      repo: "fastqc",
      toolId: "fastqc",
      version: "999.999.999",
      fetcher,
    });
    expect(matches).toEqual([]);
  });

  it("returns [] when the repo listing is empty", async () => {
    const fetcher: typeof fetch = async () =>
      new Response(JSON.stringify([]), { status: 200 });
    const matches = await getToolRevisions(TOOLSHED, {
      owner: "ghost",
      repo: "nope",
      toolId: "whatever",
      fetcher,
    });
    expect(matches).toEqual([]);
  });

  it("returns [] when metadata contains no matching tool id", async () => {
    const repo = loadJSON("toolshed-revisions/fastqc-repo.json");
    const metadata = loadJSON("toolshed-revisions/fastqc-metadata.json");
    const ordered = loadJSON("toolshed-revisions/fastqc-ordered.json");
    const fetcher: typeof fetch = async (input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.includes("/api/repositories?")) return new Response(JSON.stringify(repo), { status: 200 });
      if (url.includes("get_ordered_installable_revisions"))
        return new Response(JSON.stringify(ordered), { status: 200 });
      return new Response(JSON.stringify(metadata), { status: 200 });
    };
    const matches = await getToolRevisions(TOOLSHED, {
      owner: "devteam",
      repo: "fastqc",
      toolId: "not_a_real_tool_id",
      fetcher,
    });
    expect(matches).toEqual([]);
  });

  it("throws ToolFetchError on HTTP failure", async () => {
    const fetcher: typeof fetch = async () => new Response("boom", { status: 500 });
    await expect(
      getToolRevisions(TOOLSHED, { owner: "devteam", repo: "fastqc", toolId: "fastqc", fetcher }),
    ).rejects.toBeInstanceOf(ToolFetchError);
  });
});
