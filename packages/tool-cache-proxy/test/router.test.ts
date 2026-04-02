import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import * as S from "effect/Schema";

import { ToolCache, cacheKey, ParsedTool } from "@galaxy-tool-util/core";
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
  const cache = new ToolCache({ cacheDir });
  const key = cacheKey("https://toolshed.g2.bx.psu.edu", trsId, version);
  const parsed = S.decodeUnknownSync(ParsedTool)(toolData);
  await cache.saveTool(key, parsed, trsId, version, "api");
}

function makeRequest(
  handler: (req: any, res: any) => Promise<void>,
  method: string,
  path: string,
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      await handler(req, res);
      // We need to read the response — but since we control the handler,
      // let's just close the server after response ends.
    });

    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as { port: number };
      fetch(`http://127.0.0.1:${addr.port}${path}`, { method })
        .then(async (res) => {
          const body = await res.json().catch(() => null);
          server.close();
          resolve({ status: res.status, body });
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

  it("GET /api/tools returns empty list", async () => {
    const handler = makeHandler();
    const { status, body } = await makeRequest(handler, "GET", "/api/tools");
    expect(status).toBe(200);
    expect(body).toEqual([]);
  });

  it("GET /api/tools returns cached entries", async () => {
    await seedTool(tmpDir, "devteam~fastqc~fastqc", "0.74+galaxy0", fastqcFixture);
    const handler = makeHandler();
    const { status, body } = await makeRequest(handler, "GET", "/api/tools");
    expect(status).toBe(200);
    expect(body).toHaveLength(1);
  });

  it("GET /api/tools/:trs_id/versions/:version returns cached tool", async () => {
    await seedTool(tmpDir, "devteam~fastqc~fastqc", "0.74+galaxy0", fastqcFixture);
    const handler = makeHandler();
    const { status, body } = await makeRequest(
      handler,
      "GET",
      "/api/tools/devteam~fastqc~fastqc/versions/0.74%2Bgalaxy0",
    );
    expect(status).toBe(200);
    expect(body.name).toBe("FastQC");
  });

  it("GET /api/tools/:trs_id/versions/:version returns 404 for missing tool", async () => {
    const handler = makeHandler();
    const { status } = await makeRequest(
      handler,
      "GET",
      "/api/tools/nonexistent~tool/versions/1.0",
    );
    expect(status).toBe(404);
  });

  it("GET /api/tools/:trs_id/versions/:version/schema returns JSON Schema", async () => {
    await seedTool(tmpDir, "test~simple~simple_tool", "1.0", simpleTool);
    const handler = makeHandler();
    const { status, body } = await makeRequest(
      handler,
      "GET",
      "/api/tools/test~simple~simple_tool/versions/1.0/schema?representation=workflow_step",
    );
    expect(status).toBe(200);
    expect(body).toHaveProperty("$schema");
  });

  it("GET /api/tools/.../schema returns 400 for unknown representation", async () => {
    await seedTool(tmpDir, "test~simple~simple_tool", "1.0", simpleTool);
    const handler = makeHandler();
    const { status, body } = await makeRequest(
      handler,
      "GET",
      "/api/tools/test~simple~simple_tool/versions/1.0/schema?representation=bogus",
    );
    expect(status).toBe(400);
    expect(body.error).toContain("Unknown representation");
  });

  it("DELETE /api/tools/cache clears the cache", async () => {
    await seedTool(tmpDir, "devteam~fastqc~fastqc", "0.74+galaxy0", fastqcFixture);
    const handler = makeHandler();
    const { status, body } = await makeRequest(handler, "DELETE", "/api/tools/cache");
    expect(status).toBe(200);
    expect(body.status).toBe("cleared");

    // Verify empty
    const { body: list } = await makeRequest(handler, "GET", "/api/tools");
    expect(list).toEqual([]);
  });

  it("OPTIONS returns CORS headers", async () => {
    const handler = makeHandler();
    const server = createServer(async (req, res) => {
      await handler(req, res);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const addr = server.address() as { port: number };
    const res = await fetch(`http://127.0.0.1:${addr.port}/api/tools`, {
      method: "OPTIONS",
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    server.close();
  });

  it("returns 404 for unknown routes", async () => {
    const handler = makeHandler();
    const { status } = await makeRequest(handler, "GET", "/unknown");
    expect(status).toBe(404);
  });

  it("schema endpoint generates JSON Schema for complex tools", async () => {
    await seedTool(tmpDir, "devteam~fastqc~fastqc", "0.74+galaxy0", fastqcFixture);
    const handler = makeHandler();
    const { status, body } = await makeRequest(
      handler,
      "GET",
      "/api/tools/devteam~fastqc~fastqc/versions/0.74%2Bgalaxy0/schema",
    );
    expect(status).toBe(200);
    expect(body).toHaveProperty("$schema");
  });

  it("schema endpoint returns 404 for uncached tool", async () => {
    const handler = makeHandler();
    const { status } = await makeRequest(
      handler,
      "GET",
      "/api/tools/nonexistent~tool/versions/1.0/schema",
    );
    expect(status).toBe(404);
  });
});
