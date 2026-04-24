import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ToolFetchError,
  getLatestTRSToolVersion,
  getTRSToolVersions,
} from "../src/client/index.js";

const fixturesDir = resolve(dirname(fileURLToPath(import.meta.url)), "fixtures", "trs-versions");

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(resolve(fixturesDir, name), "utf8"));
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

const TOOLSHED = "https://toolshed.g2.bx.psu.edu";

describe("getTRSToolVersions", () => {
  it("decodes a live fixture and keeps every version", async () => {
    const fixture = loadFixture("fastqc.json") as unknown[];
    const result = await getTRSToolVersions(
      TOOLSHED,
      "devteam~fastqc~fastqc",
      mockFetchOk(fixture),
    );
    expect(result.length).toBe(fixture.length);
    expect(result.every((v) => typeof v.id === "string")).toBe(true);
    expect(result[0].descriptor_type).toContain("GALAXY");
  });

  it("URL-encodes the trsToolId", async () => {
    const fixture = loadFixture("fastqc.json");
    const { fetcher, calls } = mockFetchSpy(
      () => new Response(JSON.stringify(fixture), { status: 200 }),
    );
    await getTRSToolVersions(TOOLSHED, "owner~repo~tool id", fetcher);
    expect(calls[0]).toContain("/api/ga4gh/trs/v2/tools/");
    expect(calls[0]).toContain(encodeURIComponent("owner~repo~tool id"));
  });

  it("throws ToolFetchError on 500", async () => {
    await expect(
      getTRSToolVersions(TOOLSHED, "x~y~z", mockFetchStatus(500, "boom")),
    ).rejects.toThrow(ToolFetchError);
  });

  it("wraps network errors as ToolFetchError", async () => {
    await expect(
      getTRSToolVersions(TOOLSHED, "x~y~z", mockFetchThrows(new Error("offline"))),
    ).rejects.toBeInstanceOf(ToolFetchError);
  });

  it("rejects a non-array response", async () => {
    await expect(
      getTRSToolVersions(TOOLSHED, "x~y~z", mockFetchOk({ not: "an array" })),
    ).rejects.toThrow(/not an array/);
  });

  it("rejects entries with wrong shape", async () => {
    await expect(getTRSToolVersions(TOOLSHED, "x~y~z", mockFetchOk([{ id: 42 }]))).rejects.toThrow(
      /entries\[0\]\.id/,
    );
  });
});

describe("getLatestTRSToolVersion", () => {
  it("returns the last entry's id (Tool Shed returns oldest-first)", async () => {
    const fixture = loadFixture("fastqc.json") as Array<{ id: string }>;
    const latest = await getLatestTRSToolVersion(
      TOOLSHED,
      "devteam~fastqc~fastqc",
      mockFetchOk(fixture),
    );
    expect(latest).toBe(fixture[fixture.length - 1].id);
  });

  it("returns null when there are no versions", async () => {
    const latest = await getLatestTRSToolVersion(TOOLSHED, "x~y~z", mockFetchOk([]));
    expect(latest).toBeNull();
  });
});
