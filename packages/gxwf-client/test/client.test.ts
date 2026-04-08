/**
 * Integration tests for gxwf-client — starts a real gxwf-web server on a
 * random port, exercises the typed client against it.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { AddressInfo } from "node:net";

import { createApp } from "@galaxy-tool-util/gxwf-web";
import { createGxwfClient } from "../src/index.js";
import type { GxwfClient } from "../src/index.js";

// ── Fixtures ──────────────────────────────────────────────────────────

const FIXTURES_DIR = path.resolve(
  import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname),
  "../../schema/test/fixtures/workflows/native",
);

// A minimal valid native workflow for basic smoke tests.
const MINIMAL_WORKFLOW = JSON.stringify({
  a_galaxy_workflow: "true",
  annotation: "",
  format_version: "0.1",
  name: "Test",
  steps: {},
  uuid: "00000000-0000-0000-0000-000000000000",
});

// ── Test helpers ──────────────────────────────────────────────────────

interface TestServer {
  baseUrl: string;
  client: GxwfClient;
  close: () => Promise<void>;
}

async function startTestServer(directory: string): Promise<TestServer> {
  const { server, ready } = createApp(directory);
  await ready;
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as AddressInfo;
      const baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve({
        baseUrl,
        client: createGxwfClient(baseUrl),
        close: () =>
          new Promise<void>((res, rej) => server.close((err) => (err ? rej(err) : res()))),
      });
    });
  });
}

let tmpDir: string;
let srv: TestServer;

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gxwf-client-test-"));
  srv = await startTestServer(tmpDir);
});

afterEach(async () => {
  await srv.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── Workflow list ─────────────────────────────────────────────────────

describe("GET /workflows", () => {
  it("returns empty index for empty directory", async () => {
    const { data, error } = await srv.client.GET("/workflows", {});
    expect(error).toBeUndefined();
    expect(data?.workflows).toEqual([]);
  });

  it("discovers a .ga workflow", async () => {
    // Write the file then refresh — the index is cached at server startup.
    fs.writeFileSync(path.join(tmpDir, "test.ga"), MINIMAL_WORKFLOW);
    const { data } = await srv.client.POST("/workflows/refresh", {});
    expect(data?.workflows).toHaveLength(1);
    expect(data?.workflows[0].relative_path).toBe("test.ga");
    expect(data?.workflows[0].format).toBe("native");
  });
});

// ── Workflow refresh ──────────────────────────────────────────────────

describe("POST /workflows/refresh", () => {
  it("re-discovers after adding a workflow", async () => {
    const { data: before } = await srv.client.GET("/workflows", {});
    expect(before?.workflows).toHaveLength(0);

    fs.writeFileSync(path.join(tmpDir, "new.ga"), MINIMAL_WORKFLOW);

    const { data: after } = await srv.client.POST("/workflows/refresh", {});
    expect(after?.workflows).toHaveLength(1);
    expect(after?.workflows[0].relative_path).toBe("new.ga");
  });
});

// ── Workflow operations ───────────────────────────────────────────────

describe("workflow operations", () => {
  beforeEach(() => {
    // Copy a simple fixture workflow into the temp directory.
    const src = path.join(FIXTURES_DIR, "synthetic-labeled-tool.ga");
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(tmpDir, "workflow.ga"));
    } else {
      fs.writeFileSync(path.join(tmpDir, "workflow.ga"), MINIMAL_WORKFLOW);
    }
  });

  it("GET /workflows/{workflow_path}/validate returns a SingleValidationReport", async () => {
    const { data, error } = await srv.client.GET("/workflows/{workflow_path}/validate", {
      params: { path: { workflow_path: "workflow.ga" } },
    });
    expect(error).toBeUndefined();
    expect(data).toHaveProperty("workflow");
    expect(data).toHaveProperty("results");
    expect(data).toHaveProperty("summary");
    expect(Array.isArray(data?.results)).toBe(true);
  });

  it("GET /workflows/{workflow_path}/lint returns a SingleLintReport", async () => {
    const { data, error } = await srv.client.GET("/workflows/{workflow_path}/lint", {
      params: { path: { workflow_path: "workflow.ga" } },
    });
    expect(error).toBeUndefined();
    expect(data).toHaveProperty("workflow");
    expect(data).toHaveProperty("lint_errors");
    expect(data).toHaveProperty("lint_warnings");
  });

  it("GET /workflows/{workflow_path}/clean returns a SingleCleanReport", async () => {
    const { data, error } = await srv.client.GET("/workflows/{workflow_path}/clean", {
      params: { path: { workflow_path: "workflow.ga" } },
    });
    expect(error).toBeUndefined();
    expect(data).toHaveProperty("workflow");
    expect(data).toHaveProperty("results");
  });

  it("GET /workflows/{workflow_path}/roundtrip returns a SingleRoundTripReport", async () => {
    const { data, error } = await srv.client.GET("/workflows/{workflow_path}/roundtrip", {
      params: { path: { workflow_path: "workflow.ga" } },
    });
    expect(error).toBeUndefined();
    expect(data).toHaveProperty("workflow");
    expect(data).toHaveProperty("result");
    expect(data?.result).toHaveProperty("workflow_path");
    expect(data?.result).toHaveProperty("ok");
    expect(data?.result).toHaveProperty("status");
  });
});

// ── 404 for unknown workflow ──────────────────────────────────────────

describe("error responses", () => {
  it("returns 404 for unknown workflow path", async () => {
    const { data, error } = await srv.client.GET("/workflows/{workflow_path}/validate", {
      params: { path: { workflow_path: "does_not_exist.ga" } },
    });
    expect(data).toBeUndefined();
    expect(error).toBeDefined();
  });
});
