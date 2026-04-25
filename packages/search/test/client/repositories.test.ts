import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { ToolFetchError, buildRepoQuery, searchRepositories } from "../../src/client/index.js";

const fixturesDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");

function loadJSON(path: string): unknown {
  return JSON.parse(readFileSync(resolve(fixturesDir, path), "utf8"));
}

function mockFetchOk(body: unknown, status = 200): typeof fetch {
  return async () => new Response(JSON.stringify(body), { status });
}

function mockFetchSpy(responder: (url: string) => Response): {
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

const TOOLSHED = "https://toolshed.g2.bx.psu.edu";

describe("buildRepoQuery", () => {
  it("returns the bare query when no filters are supplied", () => {
    expect(buildRepoQuery("fastqc")).toBe("fastqc");
  });

  it("appends owner: keyword", () => {
    expect(buildRepoQuery("fastqc", { owner: "devteam" })).toBe("fastqc owner:devteam");
  });

  it("quotes categories with whitespace", () => {
    expect(buildRepoQuery("fastqc", { category: "fastq manipulation" })).toBe(
      'fastqc category:"fastq manipulation"',
    );
  });

  it("does not quote single-token categories", () => {
    expect(buildRepoQuery("fastqc", { category: "alignment" })).toBe("fastqc category:alignment");
  });

  it("combines owner and category", () => {
    expect(buildRepoQuery("x", { owner: "devteam", category: "alignment" })).toBe(
      "x owner:devteam category:alignment",
    );
  });
});

describe("searchRepositories", () => {
  it("returns normalized repo hits", async () => {
    const fixture = loadJSON("toolshed-repo-search/fastqc-page1.json");
    const result = await searchRepositories(TOOLSHED, "fastqc", {
      pageSize: 3,
      fetcher: mockFetchOk(fixture),
    });
    expect(result.hits).toHaveLength(3);
    expect(result.hits[0].repository.name).toBe("fastqc");
    expect(result.hits[0].repository.repo_owner_username).toBe("devteam");
    expect(result.hits[0].repository.times_downloaded).toBeGreaterThan(0);
    expect(typeof result.hits[0].repository.approved).toBe("boolean");
  });

  it("encodes owner: into q= when --owner is set", async () => {
    const { fetcher, calls } = mockFetchSpy(
      () =>
        new Response(JSON.stringify(loadJSON("toolshed-repo-search/fastqc-owner-devteam.json")), {
          status: 200,
        }),
    );
    await searchRepositories(TOOLSHED, "fastqc", { owner: "devteam", fetcher });
    const url = new URL(calls[0]);
    expect(url.searchParams.get("q")).toBe("fastqc owner:devteam");
  });

  it("treats empty results as zero hits", async () => {
    const fixture = loadJSON("toolshed-repo-search/empty.json");
    const result = await searchRepositories(TOOLSHED, "zzzz", {
      fetcher: mockFetchOk(fixture),
    });
    expect(result.hits).toEqual([]);
    expect(result.total_results).toBe(0);
  });

  it("throws ToolFetchError on 500", async () => {
    await expect(
      searchRepositories(TOOLSHED, "x", {
        fetcher: async () => new Response("boom", { status: 500 }),
      }),
    ).rejects.toThrow(ToolFetchError);
  });
});
