/**
 * Static file serving tests — verifies gxwf-web serves gxwf-ui dist
 * when a uiDir is configured, with SPA fallback and correct MIME types.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { AddressInfo } from "node:net";

import { createApp } from "../src/app.js";

// ── Test helpers ─────────────────────────────────────────────────────

interface TestServer {
  baseUrl: string;
  close: () => Promise<void>;
}

async function startTestServer(
  directory: string,
  uiDir?: string,
  extraConnectSrc?: string[],
): Promise<TestServer> {
  const { server, ready } = createApp(directory, { uiDir, extraConnectSrc });
  await ready;
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as AddressInfo;
      resolve({
        baseUrl: `http://127.0.0.1:${addr.port}`,
        close: () =>
          new Promise<void>((res, rej) => server.close((err) => (err ? rej(err) : res()))),
      });
    });
  });
}

let tmpDir: string;
let uiDir: string;
let srv: TestServer;

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gxwf-static-"));
  uiDir = path.join(tmpDir, "ui");
  fs.mkdirSync(uiDir);
  fs.mkdirSync(path.join(uiDir, "assets"));
  fs.writeFileSync(
    path.join(uiDir, "index.html"),
    "<!DOCTYPE html><html><body id='app'>app</body></html>",
  );
  fs.writeFileSync(path.join(uiDir, "assets", "app.js"), "console.log('hello');");
  fs.writeFileSync(path.join(uiDir, "assets", "style.css"), "body { color: red; }");
  fs.writeFileSync(path.join(uiDir, "favicon.ico"), "ico");

  srv = await startTestServer(tmpDir, uiDir);
});

afterEach(async () => {
  await srv.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── Tests ────────────────────────────────────────────────────────────

describe("static file serving", () => {
  it("serves index.html at root /", async () => {
    const res = await fetch(`${srv.baseUrl}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const body = await res.text();
    expect(body).toContain("app");
  });

  it("serves JS assets with correct MIME type", async () => {
    const res = await fetch(`${srv.baseUrl}/assets/app.js`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/javascript");
    const body = await res.text();
    expect(body).toContain("hello");
  });

  it("serves CSS assets with correct MIME type", async () => {
    const res = await fetch(`${srv.baseUrl}/assets/style.css`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/css");
    const body = await res.text();
    expect(body).toContain("color");
  });

  it("serves favicon.ico with correct MIME type", async () => {
    const res = await fetch(`${srv.baseUrl}/favicon.ico`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("image/x-icon");
  });

  it("falls back to index.html for SPA routes", async () => {
    const res = await fetch(`${srv.baseUrl}/workflow/some/nested/path`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const body = await res.text();
    expect(body).toContain("app");
  });

  it("falls back to index.html for unknown asset extensions", async () => {
    const res = await fetch(`${srv.baseUrl}/nonexistent.foo`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
  });

  it("does not intercept /api/contents routes", async () => {
    const res = await fetch(`${srv.baseUrl}/api/contents`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    const data = await res.json();
    expect(data.type).toBe("directory");
  });

  it("does not intercept /workflows routes", async () => {
    const res = await fetch(`${srv.baseUrl}/workflows`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    const data = await res.json();
    expect(data).toHaveProperty("workflows");
  });

  it("rejects path traversal attempts", async () => {
    const res = await fetch(`${srv.baseUrl}/..%2F..%2Fetc%2Fpasswd`);
    expect(res.status).toBe(403);
  });

  it("sets a Monaco-compatible CSP header on static responses", async () => {
    const res = await fetch(`${srv.baseUrl}/`);
    const csp = res.headers.get("content-security-policy");
    expect(csp).not.toBeNull();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("'wasm-unsafe-eval'");
    expect(csp).toContain("worker-src 'self' blob:");
    expect(csp).toContain("frame-src 'self' blob:");
    expect(csp).not.toContain("https://open-vsx.org");
    expect(csp).toContain("https://toolshed.g2.bx.psu.edu");
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
  });

  it("appends extraConnectSrc origins to connect-src", async () => {
    const extra = await startTestServer(tmpDir, uiDir, [
      "https://proxy.example.org",
      "https://toolshed.example.org",
    ]);
    try {
      const res = await fetch(`${extra.baseUrl}/`);
      const csp = res.headers.get("content-security-policy") ?? "";
      expect(csp).toContain("https://proxy.example.org");
      expect(csp).toContain("https://toolshed.example.org");
    } finally {
      await extra.close();
    }
  });
});

describe("no uiDir configured", () => {
  it("unknown paths return 404 JSON", async () => {
    const bare = await startTestServer(tmpDir);
    try {
      const res = await fetch(`${bare.baseUrl}/`);
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data).toHaveProperty("detail");
    } finally {
      await bare.close();
    }
  });
});
