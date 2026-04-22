import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { ToolFetchError, iterateToolSearchPages, searchTools } from "../../src/client/index.js";

const fixturesDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");

function loadJSON(path: string): unknown {
  return JSON.parse(readFileSync(resolve(fixturesDir, path), "utf8"));
}

function mockFetchOk(body: unknown, status = 200): typeof fetch {
  return async () => new Response(JSON.stringify(body), { status });
}

function mockFetchStatus(status: number, body = ""): typeof fetch {
  return async () => new Response(body, { status });
}

function mockFetchThrows(err: Error): typeof fetch {
  return async () => {
    throw err;
  };
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

describe("searchTools", () => {
  const TOOLSHED = "https://toolshed.g2.bx.psu.edu";

  it("returns normalized results on 200", async () => {
    const fixture = loadJSON("toolshed-search/fastqc-page1.json");
    const result = await searchTools(TOOLSHED, "fastqc", {
      pageSize: 3,
      fetcher: mockFetchOk(fixture),
    });
    expect(result.total_results).toBe(32);
    expect(result.hits).toHaveLength(3);
    expect(result.hits[0].tool.id).toBe("fastqc");
  });

  it("encodes query and pagination in the URL", async () => {
    const { fetcher, calls } = mockFetchSpy(
      () => new Response(JSON.stringify(loadJSON("toolshed-search/empty.json")), { status: 200 }),
    );
    await searchTools(TOOLSHED, "my tool", { page: 2, pageSize: 5, fetcher });
    expect(calls).toHaveLength(1);
    const url = new URL(calls[0]);
    expect(url.pathname).toBe("/api/tools");
    expect(url.searchParams.get("q")).toBe("my tool");
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("page_size")).toBe("5");
  });

  it("does NOT wrap the query with wildcards (pass-through)", async () => {
    const { fetcher, calls } = mockFetchSpy(
      () => new Response(JSON.stringify(loadJSON("toolshed-search/empty.json")), { status: 200 }),
    );
    await searchTools(TOOLSHED, "fastqc", { fetcher });
    const url = new URL(calls[0]);
    expect(url.searchParams.get("q")).toBe("fastqc");
  });

  it("treats 404 as an empty page", async () => {
    const result = await searchTools(TOOLSHED, "x", {
      page: 9,
      pageSize: 10,
      fetcher: mockFetchStatus(404, "ObjectNotFound"),
    });
    expect(result.total_results).toBe(0);
    expect(result.hits).toEqual([]);
    expect(result.page).toBe(9);
    expect(result.page_size).toBe(10);
  });

  it("throws ToolFetchError on 500", async () => {
    await expect(
      searchTools(TOOLSHED, "x", { fetcher: mockFetchStatus(500, "boom") }),
    ).rejects.toThrow(ToolFetchError);
  });

  it("wraps network errors as ToolFetchError", async () => {
    await expect(
      searchTools(TOOLSHED, "x", { fetcher: mockFetchThrows(new Error("disconnected")) }),
    ).rejects.toMatchObject({
      _tag: "ToolFetchError",
      message: expect.stringMatching(/disconnected/),
    });
  });

  it("wraps a malformed response body as ToolFetchError", async () => {
    await expect(
      searchTools(TOOLSHED, "x", {
        fetcher: mockFetchOk({ not: "a search payload" }),
      }),
    ).rejects.toThrow(ToolFetchError);
  });

  it("wraps a timeout as ToolFetchError", async () => {
    const abortError = new DOMException("aborted", "TimeoutError");
    await expect(
      searchTools(TOOLSHED, "x", { fetcher: mockFetchThrows(abortError) }),
    ).rejects.toBeInstanceOf(ToolFetchError);
  });
});

describe("iterateToolSearchPages", () => {
  const TOOLSHED = "https://toolshed.g2.bx.psu.edu";

  function makePageResponder(pages: Array<{ hits: number }>): typeof fetch {
    return async (input) => {
      const url = new URL(typeof input === "string" ? input : (input as URL).toString());
      const page = Number(url.searchParams.get("page") ?? "1");
      const pageSize = Number(url.searchParams.get("page_size") ?? "10");
      const spec = pages[page - 1] ?? { hits: 0 };
      const hits = Array.from({ length: spec.hits }, (_, i) => ({
        tool: {
          id: `t${page}-${i}`,
          name: `T${page}-${i}`,
          description: null,
          repo_name: "r",
          repo_owner_username: "o",
        },
        matched_terms: {},
        score: 1,
      }));
      return new Response(
        JSON.stringify({
          total_results: String(pages.reduce((a, b) => a + b.hits, 0)),
          page: String(page),
          page_size: String(pageSize),
          hostname: TOOLSHED,
          hits,
        }),
        { status: 200 },
      );
    };
  }

  it("yields pages until the server returns fewer than pageSize hits", async () => {
    const fetcher = makePageResponder([{ hits: 10 }, { hits: 10 }, { hits: 3 }]);
    const pages = [];
    for await (const p of iterateToolSearchPages(TOOLSHED, "x", { pageSize: 10, fetcher })) {
      pages.push(p.hits.length);
    }
    expect(pages).toEqual([10, 10, 3]);
  });

  it("stops on an empty page", async () => {
    const fetcher = makePageResponder([{ hits: 5 }]);
    const pages = [];
    for await (const p of iterateToolSearchPages(TOOLSHED, "x", { pageSize: 10, fetcher })) {
      pages.push(p.hits.length);
    }
    expect(pages).toEqual([5]);
  });

  it("honors a caller-supplied starting page", async () => {
    const fetcher = makePageResponder([{ hits: 10 }, { hits: 10 }, { hits: 2 }]);
    const pages = [];
    for await (const p of iterateToolSearchPages(TOOLSHED, "x", {
      page: 2,
      pageSize: 10,
      fetcher,
    })) {
      pages.push({ page: p.page, count: p.hits.length });
    }
    expect(pages).toEqual([
      { page: 2, count: 10 },
      { page: 3, count: 2 },
    ]);
  });
});
