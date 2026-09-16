import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as S from "effect/Schema";
import { ParsedTool } from "@galaxy-tool-util/schema";
import { makeNodeToolInfoService } from "../src/cache/node.js";
import { cacheKey } from "../src/cache/cache-key.js";
import {
  fetchToolSourceFromGalaxy,
  fetchToolSourceFromToolShed,
} from "../src/client/tool-source.js";
import { dispatchCacheRoute, getToolSource } from "../src/cache-http/index.js";
import fastqcFixture from "./fixtures/fastqc-parsed-tool.json" with { type: "json" };

const id = "toolshed.g2.bx.psu.edu/repos/devteam/fastqc/fastqc/0.74+galaxy0";
const version = "0.74+galaxy0";
const xml = '<tool id="fastqc"><help>Résumé\n"quoted"</help></tool>\n';
const document = { contents: xml, language: "xml", macrosExpanded: true } as const;
const response = () => new Response(xml, { headers: { language: "xml" } });
let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "source-test-"));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe("tool source", () => {
  it("fetches source independently, persists raw text and metadata, and serves offline after restart", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => response());
    const service = makeNodeToolInfoService({ cacheDir: directory, fetcher });
    expect(await service.fetchToolSource(id)).toEqual(document);
    expect(await service.fetchToolSource("devteam~fastqc~fastqc", version)).toEqual(document);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe(
      `https://toolshed.g2.bx.psu.edu/api/tools/devteam~fastqc~fastqc/versions/0.74%2Bgalaxy0/tool_source`,
    );
    const key = await cacheKey("https://toolshed.g2.bx.psu.edu", "devteam~fastqc~fastqc", version);
    expect(await readFile(join(directory, `${key}.source`), "utf-8")).toBe(xml);
    const offlineFetch = vi.fn<typeof fetch>(async () => {
      throw new Error("offline");
    });
    const offline = makeNodeToolInfoService({ cacheDir: directory, fetcher: offlineFetch });
    expect(await offline.fetchToolSource(id)).toEqual(document);
    expect(offlineFetch).not.toHaveBeenCalled();
    expect(await offline.cache.clearCache("toolshed.g2.bx.psu.edu/repos/devteam")).toBe(1);
    expect(await offline.cache.loadToolSource(key)).toBeNull();
    expect(await readdir(directory)).toEqual(["index.json"]);
  });

  it("falls back from Tool Shed to Galaxy and translates short TRS IDs to Galaxy IDs", async () => {
    const fetcher = vi.fn<typeof fetch>(async (url) =>
      String(url).startsWith("https://shed")
        ? new Response("not found", { status: 404 })
        : new Response("class: GalaxyTool\n", { headers: { language: "yaml" } }),
    );
    const service = makeNodeToolInfoService({
      cacheDir: directory,
      fetcher,
      onDiagnostic: () => {},
      sources: [
        { type: "toolshed", url: "https://shed" },
        { type: "galaxy", url: "https://galaxy" },
      ],
    });
    expect(await service.fetchToolSource("devteam~fastqc~fastqc", version)).toEqual({
      contents: "class: GalaxyTool\n",
      language: "yaml",
      macrosExpanded: false,
    });
    expect(fetcher.mock.calls[1][0]).toBe(
      `https://galaxy/api/tools/${encodeURIComponent(id.slice(0, id.lastIndexOf("/")))}/raw_tool_source?tool_version=0.74%2Bgalaxy0`,
    );
  });

  it("encodes path and query values, preserves YAML, and defaults missing language to text", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response("raw\n"));
    expect(await fetchToolSourceFromToolShed("https://shed/", "a/b", "1/2+3", fetcher)).toEqual({
      contents: "raw\n",
      language: "text",
      macrosExpanded: false,
    });
    expect(fetcher.mock.calls[0][0]).toBe(
      "https://shed/api/tools/a%2Fb/versions/1%2F2%2B3/tool_source",
    );
    await fetchToolSourceFromGalaxy("https://galaxy/", "a/b", "1+2", fetcher);
    expect(fetcher.mock.calls[1][0]).toBe(
      "https://galaxy/api/tools/a%2Fb/raw_tool_source?tool_version=1%2B2",
    );
  });

  it("keeps stock source under the _default_ key and uses cached concrete version", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => response());
    const service = makeNodeToolInfoService({
      cacheDir: directory,
      fetcher,
      sources: [{ type: "galaxy", url: "https://galaxy" }],
    });
    const key = await service.addTool(
      "cat1",
      "_default_",
      S.decodeUnknownSync(ParsedTool)({
        ...fastqcFixture,
        version: "1.2.3",
      }),
    );
    await service.fetchToolSource("cat1");
    expect(fetcher.mock.calls[0][0]).toBe(
      "https://galaxy/api/tools/cat1/raw_tool_source?tool_version=1.2.3",
    );
    expect(await service.cache.loadToolSource(key)).toEqual(document);
  });

  it("refetch invalidates source-only entries and regular deletion removes both sidecars", async () => {
    const fetcher = vi.fn<typeof fetch>(async (url) =>
      String(url).endsWith("/tool_source")
        ? response()
        : new Response(JSON.stringify(fastqcFixture)),
    );
    const service = makeNodeToolInfoService({ cacheDir: directory, fetcher });
    await service.fetchToolSource(id);
    const result = await service.refetch(id, version, { force: true });
    expect(await service.cache.loadToolSource(result.cacheKey)).toBeNull();
    await service.fetchToolSource(id);
    expect(await service.cache.removeCached(result.cacheKey)).toBe(true);
    expect(await service.cache.loadToolSource(result.cacheKey)).toBeNull();
    expect(await readdir(directory)).toEqual(["index.json"]);
  });

  it("forced refetch without a version pin invalidates the resolved source", async () => {
    const fetcher = vi.fn<typeof fetch>(async (url) => {
      if (String(url).includes("/api/ga4gh/"))
        return new Response(
          JSON.stringify([
            {
              id: version,
              name: null,
              url: "https://shed",
              descriptor_type: ["GALAXY"],
              author: [],
            },
          ]),
        );
      return String(url).endsWith("/tool_source")
        ? response()
        : new Response(JSON.stringify(fastqcFixture));
    });
    const service = makeNodeToolInfoService({ cacheDir: directory, fetcher });
    await service.fetchToolSource(id);
    const result = await service.refetch(id.slice(0, id.lastIndexOf("/")), null, { force: true });
    expect(await service.cache.loadToolSource(result.cacheKey)).toBeNull();
  });

  it("returns bytes and format headers, including UTF-8 source without JSON quoting", async () => {
    const service = makeNodeToolInfoService({
      cacheDir: directory,
      fetcher: async () => response(),
    });
    const result = await dispatchCacheRoute(
      { handler: "getToolSource", toolId: id, toolVersion: version },
      { service, baseUrl: "" },
      async () => {
        throw new Error("unexpected body");
      },
    );
    expect(result.kind).toBe("bytes");
    if (result.kind !== "bytes") throw new Error("expected source bytes");
    expect(new TextDecoder().decode(result.body)).toBe(xml);
    expect(result.headers).toMatchObject({
      language: "xml",
      "X-Tool-Source-Macros-Expanded": "true",
      "Content-Type": "text/plain; charset=utf-8",
    });
  });

  it("distinguishes missing source from upstream failures and does not cache errors", async () => {
    for (const [remoteStatus, status] of [
      [404, 404],
      [403, 502],
      [500, 502],
    ]) {
      const service = makeNodeToolInfoService({
        cacheDir: directory,
        onDiagnostic: () => {},
        fetcher: async () => new Response("failed", { status: remoteStatus }),
      });
      await expect(getToolSource({ service, baseUrl: "" }, id, version)).rejects.toMatchObject({
        status,
      });
      expect(await service.cache.listCached()).toEqual([]);
    }
  });

  it("recovers from corrupt source metadata by fetching again", async () => {
    const service = makeNodeToolInfoService({
      cacheDir: directory,
      fetcher: async () => response(),
    });
    await service.fetchToolSource(id);
    const [entry] = await service.cache.listCached();
    await writeFile(join(directory, `${entry.cache_key}.source.json`), "broken");
    const fetcher = vi.fn<typeof fetch>(async () => response());
    const restarted = makeNodeToolInfoService({ cacheDir: directory, fetcher });
    expect(await restarted.fetchToolSource(id)).toEqual(document);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
