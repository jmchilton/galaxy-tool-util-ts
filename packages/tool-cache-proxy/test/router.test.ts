import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import * as S from "effect/Schema";

import { cacheKey } from "@galaxy-tool-util/core";
import { ParsedTool } from "@galaxy-tool-util/schema";
import { makeNodeToolCache } from "@galaxy-tool-util/core/node";
import { createProxyContext, createRequestHandler } from "../src/router.js";
import { defaultConfig, type ServerConfig } from "../src/config.js";
import fastqcFixture from "../../core/test/fixtures/fastqc-parsed-tool.json" with { type: "json" };

const simpleTool = {
  id: "simple_tool",
  version: "1.0",
  name: "Simple Tool",
  description: "A tool with only simple params",
  inputs: [
    {
      name: "input_text",
      parameter_type: "gx_text",
      type: "text",
      hidden: false,
      label: "Input",
      help: null,
      argument: null,
      is_dynamic: false,
      optional: false,
      area: false,
      value: "default",
      default_options: [],
      validators: [],
    },
  ],
  outputs: [],
  citations: [],
  license: null,
  profile: null,
  edam_operations: [],
  edam_topics: [],
  xrefs: [],
};

async function seedTool(cacheDir: string, trsId: string, version: string, toolData: unknown) {
  const cache = makeNodeToolCache({ cacheDir });
  const key = await cacheKey("https://toolshed.g2.bx.psu.edu", trsId, version);
  const parsed = S.decodeUnknownSync(ParsedTool)(toolData);
  await cache.saveTool(key, parsed, trsId, version, "api");
  return key;
}

type Handler = (req: IncomingMessage, res: ServerResponse) => Promise<void>;

function makeRequest(
  handler: Handler,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      void handler(req, res);
    });
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as { port: number };
      const init: RequestInit = { method };
      if (body !== undefined) {
        init.body = JSON.stringify(body);
        init.headers = { "Content-Type": "application/json" };
      }
      fetch(`http://127.0.0.1:${addr.port}${path}`, init)
        .then(async (res) => {
          const text = await res.text();
          let parsed: unknown;
          try {
            parsed = text === "" ? null : JSON.parse(text);
          } catch {
            parsed = text;
          }
          server.close();
          resolve({ status: res.status, body: parsed });
        })
        .catch((err) => {
          server.close();
          reject(err);
        });
    });
  });
}

describe("Proxy Server", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "proxy-test-"));
  });
  afterEach(async () => {
    await rm(tmpDir, { recursive: true });
  });

  function makeHandler() {
    const config: ServerConfig = {
      ...defaultConfig(),
      "galaxy.workflows.toolCache": { directory: tmpDir },
    };
    const ctx = createProxyContext(config);
    return createRequestHandler(ctx);
  }

  // ── Read surface: search ────────────────────────────────────────────

  it("GET /api/tools returns empty search results", async () => {
    const { status, body } = await makeRequest(makeHandler(), "GET", "/api/tools");
    expect(status).toBe(200);
    expect(body.total).toBe(0);
    expect(body.hits).toEqual([]);
  });

  it("GET /api/tools?q= filters cached entries", async () => {
    await seedTool(tmpDir, "devteam~fastqc~fastqc", "0.74+galaxy0", fastqcFixture);
    const handler = makeHandler();
    const all = await makeRequest(handler, "GET", "/api/tools");
    expect(all.body.total).toBe(1);
    const hit = await makeRequest(handler, "GET", "/api/tools?q=fastqc");
    expect(hit.body.total).toBe(1);
    expect(hit.body.hits[0].toolId).toBe("devteam~fastqc~fastqc");
    const miss = await makeRequest(handler, "GET", "/api/tools?q=zzzzz");
    expect(miss.body.total).toBe(0);
  });

  // ── Read surface: TRS ───────────────────────────────────────────────

  it("GET /api/ga4gh/trs/v2/tools lists TRS-shaped tools", async () => {
    await seedTool(tmpDir, "devteam~fastqc~fastqc", "0.74+galaxy0", fastqcFixture);
    const { status, body } = await makeRequest(makeHandler(), "GET", "/api/ga4gh/trs/v2/tools");
    expect(status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe("devteam~fastqc~fastqc");
    expect(body[0].toolclass.id).toBe("GalaxyTool");
    expect(body[0].versions[0].descriptor_type).toEqual(["GALAXY"]);
    expect(body[0].url).toMatch(/\/api\/ga4gh\/trs\/v2\/tools\/devteam/);
  });

  it("GET /api/ga4gh/trs/v2/tools/{id} returns one tool, 404 missing", async () => {
    await seedTool(tmpDir, "devteam~fastqc~fastqc", "0.74+galaxy0", fastqcFixture);
    const handler = makeHandler();
    const ok = await makeRequest(handler, "GET", "/api/ga4gh/trs/v2/tools/devteam~fastqc~fastqc");
    expect(ok.status).toBe(200);
    expect(ok.body.id).toBe("devteam~fastqc~fastqc");
    const miss = await makeRequest(handler, "GET", "/api/ga4gh/trs/v2/tools/none~x~y");
    expect(miss.status).toBe(404);
  });

  it("GET /api/ga4gh/trs/v2/tools/{id}/versions returns ToolVersion[]", async () => {
    await seedTool(tmpDir, "devteam~fastqc~fastqc", "0.74+galaxy0", fastqcFixture);
    const { status, body } = await makeRequest(
      makeHandler(),
      "GET",
      "/api/ga4gh/trs/v2/tools/devteam~fastqc~fastqc/versions",
    );
    expect(status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe("0.74+galaxy0");
  });

  // ── Read surface: parsed tool + parameter schemas ───────────────────

  it("GET /api/tools/{id}/versions/{ver} returns ParsedTool", async () => {
    await seedTool(tmpDir, "devteam~fastqc~fastqc", "0.74+galaxy0", fastqcFixture);
    const { status, body } = await makeRequest(
      makeHandler(),
      "GET",
      "/api/tools/devteam~fastqc~fastqc/versions/0.74%2Bgalaxy0",
    );
    expect(status).toBe(200);
    expect(body.name).toBe("FastQC");
  });

  it.each([
    ["parameter_request_schema"],
    ["parameter_landing_request_schema"],
    ["parameter_test_case_xml_schema"],
  ])("GET .../%s returns JSON Schema", async (tail) => {
    await seedTool(tmpDir, "test~simple~simple_tool", "1.0", simpleTool);
    const { status, body } = await makeRequest(
      makeHandler(),
      "GET",
      `/api/tools/test~simple~simple_tool/versions/1.0/${tail}`,
    );
    expect(status).toBe(200);
    expect(body).toHaveProperty("$schema");
  });

  it("GET .../tool_source returns 501", async () => {
    await seedTool(tmpDir, "devteam~fastqc~fastqc", "0.74+galaxy0", fastqcFixture);
    const { status, body } = await makeRequest(
      makeHandler(),
      "GET",
      "/api/tools/devteam~fastqc~fastqc/versions/0.74%2Bgalaxy0/tool_source",
    );
    expect(status).toBe(501);
    expect(body.detail).toMatch(/tool_source/);
  });

  // ── Admin surface ───────────────────────────────────────────────────

  it("GET /api/tool-cache lists entries with stats", async () => {
    await seedTool(tmpDir, "devteam~fastqc~fastqc", "0.74+galaxy0", fastqcFixture);
    const { status, body } = await makeRequest(makeHandler(), "GET", "/api/tool-cache");
    expect(status).toBe(200);
    expect(body.entries).toHaveLength(1);
    expect(body.stats.count).toBe(1);
  });

  it("GET /api/tool-cache/stats matches list count", async () => {
    await seedTool(tmpDir, "devteam~fastqc~fastqc", "0.74+galaxy0", fastqcFixture);
    const { status, body } = await makeRequest(makeHandler(), "GET", "/api/tool-cache/stats");
    expect(status).toBe(200);
    expect(body.count).toBe(1);
  });

  it("DELETE /api/tool-cache/{key} removes a single entry, 404 if missing", async () => {
    const key = await seedTool(tmpDir, "devteam~fastqc~fastqc", "0.74+galaxy0", fastqcFixture);
    const handler = makeHandler();
    const miss = await makeRequest(handler, "DELETE", "/api/tool-cache/zzz");
    expect(miss.status).toBe(404);
    const ok = await makeRequest(handler, "DELETE", `/api/tool-cache/${encodeURIComponent(key)}`);
    expect(ok.status).toBe(200);
    expect(ok.body.removed).toBe(true);
  });

  it("DELETE /api/tool-cache?prefix= clears matching entries", async () => {
    await seedTool(tmpDir, "devteam~fastqc~fastqc", "0.74+galaxy0", fastqcFixture);
    await seedTool(tmpDir, "iuc~multiqc~multiqc", "1.0", simpleTool);
    const handler = makeHandler();
    const r = await makeRequest(handler, "DELETE", "/api/tool-cache?prefix=devteam");
    expect(r.status).toBe(200);
    expect(r.body.removed).toBe(1);
    const after = await makeRequest(handler, "GET", "/api/tool-cache");
    expect(after.body.entries).toHaveLength(1);
  });

  it("POST /api/tool-cache/refetch with empty toolId is 400", async () => {
    const { status } = await makeRequest(makeHandler(), "POST", "/api/tool-cache/refetch", {
      toolId: "",
    });
    expect(status).toBe(400);
  });

  it("POST /api/tool-cache/add with empty toolId is 400", async () => {
    const { status } = await makeRequest(makeHandler(), "POST", "/api/tool-cache/add", {
      toolId: "",
    });
    expect(status).toBe(400);
  });

  // ── Misc ────────────────────────────────────────────────────────────

  it("OPTIONS returns CORS headers", async () => {
    const handler = makeHandler();
    const server = createServer((req, res) => {
      void handler(req, res);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const addr = server.address() as { port: number };
    const res = await fetch(`http://127.0.0.1:${addr.port}/api/tools`, { method: "OPTIONS" });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    server.close();
  });

  it("returns 404 for unknown routes", async () => {
    const { status } = await makeRequest(makeHandler(), "GET", "/unknown");
    expect(status).toBe(404);
  });
});
