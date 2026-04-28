/**
 * Read-surface routes (search, TRS, parsed tool, parameter schemas, tool_source).
 * Wires up a real HTTP server against a temp cache dir; shared handlers are
 * already unit-tested in @galaxy-tool-util/core, so this file just verifies
 * the gxwf-web router wires the routes correctly.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { AddressInfo } from "node:net";
import type { ParsedTool } from "@galaxy-tool-util/schema";
import { cacheKey } from "@galaxy-tool-util/core";

import { createApp } from "../src/app.js";
import type { AppState } from "../src/app.js";

interface TestServer {
  baseUrl: string;
  state: AppState;
  close: () => Promise<void>;
}

const sampleToolJson = {
  id: "fastqc",
  version: "0.74+galaxy0",
  name: "FastQC",
  description: "Read Quality reports",
  inputs: [],
  outputs: [],
  citations: [],
  license: null,
  profile: "16.01",
  edam_operations: [],
  edam_topics: [],
  xrefs: [],
};

async function startTestServer(directory: string, cacheDir: string): Promise<TestServer> {
  const { server, state, ready } = createApp(directory, { cacheDir });
  await ready;
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as AddressInfo;
      resolve({
        baseUrl: `http://127.0.0.1:${addr.port}`,
        state,
        close: () =>
          new Promise<void>((res, rej) => server.close((err) => (err ? rej(err) : res()))),
      });
    });
  });
}

let tmpDir: string;
let cacheDir: string;
let srv: TestServer;

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gxwf-rs-"));
  cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "gxwf-rs-cache-"));
  srv = await startTestServer(tmpDir, cacheDir);
});

afterEach(async () => {
  await srv.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.rmSync(cacheDir, { recursive: true, force: true });
});

async function seedTool(toolId: string, version: string): Promise<void> {
  const coords = srv.state.cache.resolveToolCoordinates(toolId, version);
  const key = await cacheKey(coords.toolshedUrl, coords.trsToolId, version);
  await srv.state.cache.saveTool(
    key,
    sampleToolJson as unknown as ParsedTool,
    coords.readableId,
    version,
    "api",
    `https://example.test/api/tools/${coords.trsToolId}/versions/${version}`,
  );
}

const TRS_ID = "devteam~fastqc~fastqc";
const READABLE_ID = "toolshed.g2.bx.psu.edu/repos/devteam/fastqc/fastqc";

describe("GET /api/tools (search)", () => {
  it("returns empty results when nothing cached", async () => {
    const res = await fetch(`${srv.baseUrl}/api/tools`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.total).toBe(0);
  });

  it("matches by tool name substring", async () => {
    await seedTool(READABLE_ID, "0.74+galaxy0");
    const res = await fetch(`${srv.baseUrl}/api/tools?q=fastqc`);
    const data = await res.json();
    expect(data.total).toBe(1);
    expect(data.hits[0].toolId).toBe(TRS_ID);
  });
});

describe("GET /api/ga4gh/trs/v2/tools", () => {
  it("lists TRS-shaped tools", async () => {
    await seedTool(READABLE_ID, "0.74+galaxy0");
    const res = await fetch(`${srv.baseUrl}/api/ga4gh/trs/v2/tools`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe(TRS_ID);
    expect(data[0].toolclass.id).toBe("GalaxyTool");
  });

  it("/{id} returns one tool, 404 missing", async () => {
    await seedTool(READABLE_ID, "0.74+galaxy0");
    const ok = await fetch(`${srv.baseUrl}/api/ga4gh/trs/v2/tools/${TRS_ID}`);
    expect(ok.status).toBe(200);
    const miss = await fetch(`${srv.baseUrl}/api/ga4gh/trs/v2/tools/missing~x~y`);
    expect(miss.status).toBe(404);
  });

  it("/{id}/versions returns ToolVersion[]", async () => {
    await seedTool(READABLE_ID, "0.74+galaxy0");
    const res = await fetch(`${srv.baseUrl}/api/ga4gh/trs/v2/tools/${TRS_ID}/versions`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe("0.74+galaxy0");
  });
});

describe("GET /api/tools/{id}/versions/{ver}*", () => {
  it("returns ParsedTool", async () => {
    await seedTool(READABLE_ID, "0.74+galaxy0");
    const res = await fetch(
      `${srv.baseUrl}/api/tools/${TRS_ID}/versions/${encodeURIComponent("0.74+galaxy0")}`,
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.name).toBe("FastQC");
  });

  it.each([
    ["parameter_request_schema"],
    ["parameter_landing_request_schema"],
    ["parameter_test_case_xml_schema"],
  ])("...%s returns JSON Schema", async (tail) => {
    await seedTool(READABLE_ID, "0.74+galaxy0");
    const res = await fetch(
      `${srv.baseUrl}/api/tools/${TRS_ID}/versions/${encodeURIComponent("0.74+galaxy0")}/${tail}`,
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toBeTypeOf("object");
  });

  it("/tool_source returns 501", async () => {
    await seedTool(READABLE_ID, "0.74+galaxy0");
    const res = await fetch(
      `${srv.baseUrl}/api/tools/${TRS_ID}/versions/${encodeURIComponent("0.74+galaxy0")}/tool_source`,
    );
    expect(res.status).toBe(501);
  });
});
