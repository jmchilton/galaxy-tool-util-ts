import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import type { ToolSource } from "@galaxy-tool-util/core";
import { ToolInfoService } from "@galaxy-tool-util/core";
import type { CacheStorage } from "@galaxy-tool-util/core";
import type { ParsedTool } from "@galaxy-tool-util/schema";

import { ToolSearchService } from "../src/tool-search.js";

const fixturesDir = resolve(dirname(fileURLToPath(import.meta.url)), "fixtures");

function loadJSON(path: string): unknown {
  return JSON.parse(readFileSync(resolve(fixturesDir, path), "utf8"));
}

class MemoryStorage implements CacheStorage {
  private data = new Map<string, unknown>();
  async load(key: string): Promise<unknown | null> {
    return this.data.get(key) ?? null;
  }
  async save(key: string, value: unknown): Promise<void> {
    this.data.set(key, value);
  }
  async delete(key: string): Promise<void> {
    this.data.delete(key);
  }
  async clear(): Promise<void> {
    this.data.clear();
  }
  async keys(): Promise<string[]> {
    return Array.from(this.data.keys());
  }
}

function makeHit(
  id: string,
  owner: string,
  repo: string,
  score: number,
  extra: Record<string, unknown> = {},
): unknown {
  return {
    tool: {
      id,
      name: id.toUpperCase(),
      description: `desc-${id}`,
      repo_name: repo,
      repo_owner_username: owner,
      ...extra,
    },
    matched_terms: { name: id },
    score,
  };
}

function makePageResponse(
  hostname: string,
  hits: unknown[],
  page: number,
  pageSize: number,
): Response {
  return new Response(
    JSON.stringify({
      total_results: String(hits.length),
      page: String(page),
      page_size: String(pageSize),
      hostname,
      hits,
    }),
    { status: 200 },
  );
}

function searchUrlMatches(url: string, toolshed: string): boolean {
  return url.startsWith(toolshed) && url.includes("/api/tools?");
}

describe("ToolSearchService", () => {
  const PRIMARY: ToolSource = { type: "toolshed", url: "https://primary.shed" };
  const MIRROR: ToolSource = { type: "toolshed", url: "https://mirror.shed" };

  function makeInfo(fetcher: typeof fetch): ToolInfoService {
    return new ToolInfoService({
      storage: new MemoryStorage(),
      sources: [PRIMARY, MIRROR],
      fetcher,
    });
  }

  it("fans out across sources and sorts hits by descending score", async () => {
    const fetcher: typeof fetch = async (input) => {
      const url = typeof input === "string" ? input : (input as URL).toString();
      if (searchUrlMatches(url, PRIMARY.url)) {
        return makePageResponse(PRIMARY.url, [makeHit("a", "o1", "r1", 5)], 1, 20);
      }
      if (searchUrlMatches(url, MIRROR.url)) {
        return makePageResponse(MIRROR.url, [makeHit("b", "o2", "r2", 9)], 1, 20);
      }
      throw new Error(`unexpected url: ${url}`);
    };
    const svc = new ToolSearchService({
      sources: [PRIMARY, MIRROR],
      info: makeInfo(fetcher),
      fetcher,
    });
    const hits = await svc.searchTools("q");
    expect(hits.map((h) => h.toolId)).toEqual(["b", "a"]);
    expect(hits[0].source.url).toBe(MIRROR.url);
    expect(hits[1].source.url).toBe(PRIMARY.url);
  });

  it("collapses same-(owner,repo,toolId) hits across mirrors, keeping the first source", async () => {
    const fetcher: typeof fetch = async (input) => {
      const url = typeof input === "string" ? input : (input as URL).toString();
      if (searchUrlMatches(url, PRIMARY.url)) {
        return makePageResponse(PRIMARY.url, [makeHit("x", "o", "r", 3)], 1, 20);
      }
      if (searchUrlMatches(url, MIRROR.url)) {
        return makePageResponse(MIRROR.url, [makeHit("x", "o", "r", 99)], 1, 20);
      }
      throw new Error(`unexpected url: ${url}`);
    };
    const svc = new ToolSearchService({
      sources: [PRIMARY, MIRROR],
      info: makeInfo(fetcher),
      fetcher,
    });
    const hits = await svc.searchTools("q");
    expect(hits).toHaveLength(1);
    expect(hits[0].source.url).toBe(PRIMARY.url);
    expect(hits[0].score).toBe(3);
  });

  it("keeps hits distinct when owner or repo differ", async () => {
    const fetcher: typeof fetch = async (input) => {
      const url = typeof input === "string" ? input : (input as URL).toString();
      if (searchUrlMatches(url, PRIMARY.url)) {
        return makePageResponse(
          PRIMARY.url,
          [makeHit("fastqc", "devteam", "fastqc", 5), makeHit("fastqc", "iuc", "fastqc", 4)],
          1,
          20,
        );
      }
      throw new Error(`unexpected url: ${url}`);
    };
    const svc = new ToolSearchService({
      sources: [PRIMARY],
      info: makeInfo(fetcher),
      fetcher,
    });
    const hits = await svc.searchTools("fastqc");
    expect(hits).toHaveLength(2);
    expect(hits.map((h) => h.repoOwnerUsername).sort()).toEqual(["devteam", "iuc"]);
  });

  it("derives trsToolId and fullToolId", async () => {
    const fetcher: typeof fetch = async () =>
      makePageResponse(PRIMARY.url, [makeHit("fastqc", "devteam", "fastqc", 1)], 1, 20);
    const svc = new ToolSearchService({
      sources: [PRIMARY],
      info: makeInfo(fetcher),
      fetcher,
    });
    const [hit] = await svc.searchTools("q");
    expect(hit.trsToolId).toBe("devteam~fastqc~fastqc");
    expect(hit.fullToolId).toBe("primary.shed/repos/devteam/fastqc/fastqc");
  });

  it("includes version in fullToolId when the hit supplies one", async () => {
    const fetcher: typeof fetch = async () =>
      makePageResponse(
        PRIMARY.url,
        [
          makeHit("fastqc", "devteam", "fastqc", 1, {
            version: "0.74+galaxy0",
            changeset_revision: "abc123",
          }),
        ],
        1,
        20,
      );
    const svc = new ToolSearchService({
      sources: [PRIMARY],
      info: makeInfo(fetcher),
      fetcher,
    });
    const [hit] = await svc.searchTools("q");
    expect(hit.version).toBe("0.74+galaxy0");
    expect(hit.changesetRevision).toBe("abc123");
    expect(hit.fullToolId).toBe("primary.shed/repos/devteam/fastqc/fastqc/0.74+galaxy0");
  });

  it("respects maxResults after dedup", async () => {
    const hits = Array.from({ length: 5 }, (_, i) => makeHit(`t${i}`, "o", `r${i}`, 10 - i));
    const fetcher: typeof fetch = async () => makePageResponse(PRIMARY.url, hits, 1, 5);
    const svc = new ToolSearchService({
      sources: [PRIMARY],
      info: makeInfo(fetcher),
      fetcher,
    });
    const out = await svc.searchTools("q", { pageSize: 5, maxResults: 3 });
    expect(out).toHaveLength(3);
    expect(out.map((h) => h.toolId)).toEqual(["t0", "t1", "t2"]);
  });

  it("paginates when one page doesn't fill maxResults", async () => {
    let pagesFetched = 0;
    const fetcher: typeof fetch = async (input) => {
      pagesFetched++;
      const url = new URL(typeof input === "string" ? input : (input as URL).toString());
      const page = Number(url.searchParams.get("page") ?? "1");
      const pageSize = Number(url.searchParams.get("page_size") ?? "10");
      const hits = Array.from({ length: pageSize }, (_, i) =>
        makeHit(`t${page}-${i}`, "o", `r${page}-${i}`, 100 - page * pageSize - i),
      );
      // Last page: return fewer than pageSize to stop iteration.
      const final = page >= 3;
      return makePageResponse(PRIMARY.url, final ? hits.slice(0, 2) : hits, page, pageSize);
    };
    const svc = new ToolSearchService({
      sources: [PRIMARY],
      info: makeInfo(fetcher),
      fetcher,
    });
    const out = await svc.searchTools("q", { pageSize: 3, maxResults: 6 });
    expect(out).toHaveLength(6);
    expect(pagesFetched).toBe(2);
  });

  it("tolerates a failing source without failing the whole search", async () => {
    const fetcher: typeof fetch = async (input) => {
      const url = typeof input === "string" ? input : (input as URL).toString();
      if (searchUrlMatches(url, PRIMARY.url)) {
        return new Response("boom", { status: 500 });
      }
      if (searchUrlMatches(url, MIRROR.url)) {
        return makePageResponse(MIRROR.url, [makeHit("b", "o", "r", 1)], 1, 20);
      }
      throw new Error(`unexpected url: ${url}`);
    };
    const svc = new ToolSearchService({
      sources: [PRIMARY, MIRROR],
      info: makeInfo(fetcher),
      fetcher,
    });
    const hits = await svc.searchTools("q");
    expect(hits.map((h) => h.toolId)).toEqual(["b"]);
  });

  it("ignores non-toolshed sources", async () => {
    const GALAXY: ToolSource = { type: "galaxy", url: "https://usegalaxy.org" };
    let calls = 0;
    const fetcher: typeof fetch = async (input) => {
      calls++;
      const url = typeof input === "string" ? input : (input as URL).toString();
      expect(url.startsWith(PRIMARY.url)).toBe(true);
      return makePageResponse(PRIMARY.url, [makeHit("a", "o", "r", 1)], 1, 20);
    };
    const svc = new ToolSearchService({
      sources: [PRIMARY, GALAXY],
      info: makeInfo(fetcher),
      fetcher,
    });
    await svc.searchTools("q");
    expect(calls).toBe(1);
  });

  it("enriches hits with ParsedTool when enrich: true", async () => {
    const fastqc = loadJSON("fastqc-parsed-tool.json");
    const fetcher: typeof fetch = async (input) => {
      const url = typeof input === "string" ? input : (input as URL).toString();
      if (url.includes("/api/tools?")) {
        return makePageResponse(
          PRIMARY.url,
          [
            makeHit("fastqc", "devteam", "fastqc", 9, {
              version: "0.74+galaxy0",
            }),
          ],
          1,
          20,
        );
      }
      if (url.includes("/api/tools/devteam~fastqc~fastqc/versions/0.74+galaxy0")) {
        return new Response(JSON.stringify(fastqc), { status: 200 });
      }
      throw new Error(`unexpected url: ${url}`);
    };
    const svc = new ToolSearchService({
      sources: [PRIMARY],
      info: makeInfo(fetcher),
      fetcher,
    });
    const [hit] = await svc.searchTools("fastqc", { enrich: true });
    expect(hit.parsedTool).toBeDefined();
    expect((hit.parsedTool as ParsedTool).name).toBe("FastQC");
  });

  it("getToolVersions returns ids from TRS", async () => {
    const fixture = [
      { id: "1.0", name: null, url: "u", descriptor_type: ["GALAXY"], author: [] },
      { id: "2.0", name: null, url: "u", descriptor_type: ["GALAXY"], author: [] },
    ];
    const fetcher: typeof fetch = async () =>
      new Response(JSON.stringify(fixture), { status: 200 });
    const svc = new ToolSearchService({
      sources: [PRIMARY],
      info: makeInfo(fetcher),
      fetcher,
    });
    expect(await svc.getToolVersions(PRIMARY.url, "o~r~t")).toEqual(["1.0", "2.0"]);
  });

  it("getLatestVersionForToolId returns null for an empty list", async () => {
    const fetcher: typeof fetch = async () => new Response("[]", { status: 200 });
    const svc = new ToolSearchService({
      sources: [PRIMARY],
      info: makeInfo(fetcher),
      fetcher,
    });
    expect(await svc.getLatestVersionForToolId(PRIMARY.url, "o~r~t")).toBeNull();
  });
});
