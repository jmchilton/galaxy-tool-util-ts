/**
 * Contents API + workflow tests — port of Python's tests/test_contents.py.
 *
 * Uses a real HTTP server on a random port (fetch against 127.0.0.1).
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { AddressInfo } from "node:net";

import { createApp } from "../src/app.js";
import { resolveSafePath, HttpError } from "../src/contents.js";

// ── Test helpers ─────────────────────────────────────────────────────

interface TestServer {
  baseUrl: string;
  close: () => Promise<void>;
}

async function startTestServer(directory: string): Promise<TestServer> {
  const { server, ready } = createApp(directory);
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
let srv: TestServer;

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gxwf-test-"));
  srv = await startTestServer(tmpDir);
});

afterEach(async () => {
  await srv.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── Read tests ───────────────────────────────────────────────────────

describe("read", () => {
  it("returns empty root directory", async () => {
    const res = await fetch(`${srv.baseUrl}/api/contents`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.type).toBe("directory");
    expect(data.path).toBe("");
    expect(data.content).toEqual([]);
  });

  it("lists directory with files and subdirs", async () => {
    fs.writeFileSync(path.join(tmpDir, "a.txt"), "hello");
    fs.writeFileSync(path.join(tmpDir, "b.txt"), "world");
    fs.mkdirSync(path.join(tmpDir, "sub"));
    fs.writeFileSync(path.join(tmpDir, "sub", "nested.txt"), "nested");

    const res = await fetch(`${srv.baseUrl}/api/contents`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.type).toBe("directory");
    const names: string[] = data.content.map((c: { name: string }) => c.name).sort();
    expect(names).toEqual(["a.txt", "b.txt", "sub"]);
    const subEntry = data.content.find((c: { name: string }) => c.name === "sub");
    expect(subEntry.type).toBe("directory");
    expect(subEntry.content).toBeNull();
  });

  it("reads text file content", async () => {
    fs.writeFileSync(path.join(tmpDir, "hello.txt"), "greetings");
    const res = await fetch(`${srv.baseUrl}/api/contents/hello.txt`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.type).toBe("file");
    expect(data.format).toBe("text");
    expect(data.content).toBe("greetings");
    expect(data.size).toBe(Buffer.byteLength("greetings"));
  });

  it("reads binary file as base64", async () => {
    const raw = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe]);
    fs.writeFileSync(path.join(tmpDir, "blob.bin"), raw);
    const res = await fetch(`${srv.baseUrl}/api/contents/blob.bin`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.format).toBe("base64");
    expect(Buffer.from(data.content, "base64")).toEqual(raw);
  });

  it("omits body when content=0", async () => {
    fs.writeFileSync(path.join(tmpDir, "x.txt"), "body text");
    const res = await fetch(`${srv.baseUrl}/api/contents/x.txt?content=0`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.content).toBeNull();
    expect(data.size).toBe(Buffer.byteLength("body text"));
  });

  it("returns 404 for missing file", async () => {
    const res = await fetch(`${srv.baseUrl}/api/contents/does_not_exist.txt`);
    expect(res.status).toBe(404);
  });

  it("returns format=base64 when forced via query param", async () => {
    fs.writeFileSync(path.join(tmpDir, "hello.txt"), "greetings");
    const res = await fetch(`${srv.baseUrl}/api/contents/hello.txt?format=base64`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.format).toBe("base64");
    expect(Buffer.from(data.content, "base64").toString("utf-8")).toBe("greetings");
  });

  it("returns 400 for format=text on binary file", async () => {
    fs.writeFileSync(path.join(tmpDir, "blob.bin"), Buffer.from([0x00, 0x01, 0xff]));
    const res = await fetch(`${srv.baseUrl}/api/contents/blob.bin?format=text`);
    expect(res.status).toBe(400);
  });

  it("returns 400 for unknown format override", async () => {
    fs.writeFileSync(path.join(tmpDir, "f.txt"), "x");
    const res = await fetch(`${srv.baseUrl}/api/contents/f.txt?format=json`);
    expect(res.status).toBe(400);
  });
});

// ── Path safety tests (function level — URLs normalize ..) ───────────

describe("path safety (resolveSafePath)", () => {
  it("rejects path traversal above root", () => {
    expect(() => resolveSafePath(tmpDir, "../outside")).toThrow(HttpError);
    expect(() => resolveSafePath(tmpDir, "sub/../../outside")).toThrow(HttpError);
  });

  it("rejects absolute paths", () => {
    expect(() => resolveSafePath(tmpDir, "/etc/passwd")).toThrow(HttpError);
    const err = (() => {
      try {
        resolveSafePath(tmpDir, "/etc/passwd");
      } catch (e) {
        return e as HttpError;
      }
    })();
    expect(err?.status).toBe(400);
  });

  it("rejects ignored component in path", async () => {
    fs.mkdirSync(path.join(tmpDir, ".git"));
    fs.writeFileSync(path.join(tmpDir, ".git", "config"), "x");
    const res = await fetch(`${srv.baseUrl}/api/contents/.git/config`);
    expect(res.status).toBe(403);
  });

  it("hides ignored entries from directory listing", async () => {
    fs.writeFileSync(path.join(tmpDir, "keep.txt"), "k");
    fs.mkdirSync(path.join(tmpDir, "__pycache__"));
    fs.writeFileSync(path.join(tmpDir, "__pycache__", "x.pyc"), "");
    fs.mkdirSync(path.join(tmpDir, "node_modules"));
    fs.writeFileSync(path.join(tmpDir, "node_modules", "pkg.js"), "");

    const res = await fetch(`${srv.baseUrl}/api/contents`);
    const names: string[] = (await res.json()).content.map((c: { name: string }) => c.name);
    expect(names).toContain("keep.txt");
    expect(names).not.toContain("__pycache__");
    expect(names).not.toContain("node_modules");
  });

  it("blocks symlink escape", async () => {
    const outside = path.join(os.tmpdir(), `gxwf-outside-${Date.now()}`);
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, "secret.txt"), "leak");
    fs.symlinkSync(outside, path.join(tmpDir, "link"));
    try {
      const res = await fetch(`${srv.baseUrl}/api/contents/link/secret.txt`);
      expect(res.status).toBe(403);
    } finally {
      fs.rmSync(outside, { recursive: true });
    }
  });
});

// ── Write tests ───────────────────────────────────────────────────────

describe("write (PUT)", () => {
  it("creates a new file", async () => {
    const body = {
      name: "new.txt",
      path: "new.txt",
      type: "file",
      writable: true,
      created: "2026-01-01T00:00:00Z",
      last_modified: "2026-01-01T00:00:00Z",
      format: "text",
      content: "hello world",
    };
    const res = await fetch(`${srv.baseUrl}/api/contents/new.txt`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    expect(res.status).toBe(200);
    expect(fs.readFileSync(path.join(tmpDir, "new.txt"), "utf-8")).toBe("hello world");
    const data = await res.json();
    expect(data.content).toBeNull();
    expect(data.type).toBe("file");
  });

  it("overwrites existing file", async () => {
    fs.writeFileSync(path.join(tmpDir, "f.txt"), "old");
    const body = {
      name: "f.txt",
      path: "f.txt",
      type: "file",
      writable: true,
      created: "2026-01-01T00:00:00Z",
      last_modified: "2026-01-01T00:00:00Z",
      format: "text",
      content: "new",
    };
    const res = await fetch(`${srv.baseUrl}/api/contents/f.txt`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    expect(res.status).toBe(200);
    expect(fs.readFileSync(path.join(tmpDir, "f.txt"), "utf-8")).toBe("new");
  });

  it("creates parent directories", async () => {
    const body = {
      name: "deep.txt",
      path: "a/b/c/deep.txt",
      type: "file",
      writable: true,
      created: "2026-01-01T00:00:00Z",
      last_modified: "2026-01-01T00:00:00Z",
      format: "text",
      content: "x",
    };
    const res = await fetch(`${srv.baseUrl}/api/contents/a/b/c/deep.txt`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    expect(res.status).toBe(200);
    expect(fs.readFileSync(path.join(tmpDir, "a", "b", "c", "deep.txt"), "utf-8")).toBe("x");
  });

  it("creates a directory", async () => {
    const body = {
      name: "newdir",
      path: "newdir",
      type: "directory",
      writable: true,
      created: "2026-01-01T00:00:00Z",
      last_modified: "2026-01-01T00:00:00Z",
    };
    const res = await fetch(`${srv.baseUrl}/api/contents/newdir`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    expect(res.status).toBe(200);
    expect(fs.statSync(path.join(tmpDir, "newdir")).isDirectory()).toBe(true);
  });

  it("writes binary content via base64", async () => {
    const raw = Buffer.from([0x00, 0xff, 0x10]);
    const body = {
      name: "blob.bin",
      path: "blob.bin",
      type: "file",
      writable: true,
      created: "2026-01-01T00:00:00Z",
      last_modified: "2026-01-01T00:00:00Z",
      format: "base64",
      content: raw.toString("base64"),
    };
    const res = await fetch(`${srv.baseUrl}/api/contents/blob.bin`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    expect(res.status).toBe(200);
    expect(fs.readFileSync(path.join(tmpDir, "blob.bin"))).toEqual(raw);
  });

  it("returns 409 when If-Unmodified-Since is stale", async () => {
    fs.writeFileSync(path.join(tmpDir, "f.txt"), "original");
    const body = {
      name: "f.txt",
      path: "f.txt",
      type: "file",
      writable: true,
      created: "2026-01-01T00:00:00Z",
      last_modified: "2026-01-01T00:00:00Z",
      format: "text",
      content: "new",
    };
    const res = await fetch(`${srv.baseUrl}/api/contents/f.txt`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "If-Unmodified-Since": "Sat, 01 Jan 2000 00:00:00 GMT",
      },
      body: JSON.stringify(body),
    });
    expect(res.status).toBe(409);
    expect(fs.readFileSync(path.join(tmpDir, "f.txt"), "utf-8")).toBe("original");
  });

  it("writes when If-Unmodified-Since is in the future", async () => {
    fs.writeFileSync(path.join(tmpDir, "f.txt"), "original");
    const body = {
      name: "f.txt",
      path: "f.txt",
      type: "file",
      writable: true,
      created: "2026-01-01T00:00:00Z",
      last_modified: "2026-01-01T00:00:00Z",
      format: "text",
      content: "new",
    };
    const res = await fetch(`${srv.baseUrl}/api/contents/f.txt`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "If-Unmodified-Since": "Sun, 01 Jan 2099 00:00:00 GMT",
      },
      body: JSON.stringify(body),
    });
    expect(res.status).toBe(200);
    expect(fs.readFileSync(path.join(tmpDir, "f.txt"), "utf-8")).toBe("new");
  });

  it("returns 400 for invalid If-Unmodified-Since", async () => {
    const body = {
      name: "f.txt",
      path: "f.txt",
      type: "file",
      writable: true,
      created: "2026-01-01T00:00:00Z",
      last_modified: "2026-01-01T00:00:00Z",
      format: "text",
      content: "x",
    };
    const res = await fetch(`${srv.baseUrl}/api/contents/f.txt`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "If-Unmodified-Since": "not a date",
      },
      body: JSON.stringify(body),
    });
    expect(res.status).toBe(400);
  });

  it("overwrites without header (no conflict check)", async () => {
    fs.writeFileSync(path.join(tmpDir, "f.txt"), "original");
    const body = {
      name: "f.txt",
      path: "f.txt",
      type: "file",
      writable: true,
      created: "2026-01-01T00:00:00Z",
      last_modified: "2026-01-01T00:00:00Z",
      format: "text",
      content: "new",
    };
    const res = await fetch(`${srv.baseUrl}/api/contents/f.txt`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    expect(res.status).toBe(200);
    expect(fs.readFileSync(path.join(tmpDir, "f.txt"), "utf-8")).toBe("new");
  });
});

// ── Delete tests ──────────────────────────────────────────────────────

describe("delete (DELETE)", () => {
  it("deletes a file", async () => {
    fs.writeFileSync(path.join(tmpDir, "gone.txt"), "x");
    const res = await fetch(`${srv.baseUrl}/api/contents/gone.txt`, { method: "DELETE" });
    expect(res.status).toBe(204);
    expect(fs.existsSync(path.join(tmpDir, "gone.txt"))).toBe(false);
  });

  it("deletes a directory recursively", async () => {
    fs.mkdirSync(path.join(tmpDir, "d"));
    fs.writeFileSync(path.join(tmpDir, "d", "f.txt"), "x");
    const res = await fetch(`${srv.baseUrl}/api/contents/d`, { method: "DELETE" });
    expect(res.status).toBe(204);
    expect(fs.existsSync(path.join(tmpDir, "d"))).toBe(false);
  });

  it("returns 404 for missing file", async () => {
    const res = await fetch(`${srv.baseUrl}/api/contents/nope.txt`, { method: "DELETE" });
    expect(res.status).toBe(404);
  });

  it("forbids deleting root", async () => {
    const res = await fetch(`${srv.baseUrl}/api/contents/`, { method: "DELETE" });
    expect([403, 404, 405]).toContain(res.status);
  });
});

// ── Rename tests ──────────────────────────────────────────────────────

describe("rename (PATCH)", () => {
  it("renames a file", async () => {
    fs.writeFileSync(path.join(tmpDir, "old.txt"), "content");
    const res = await fetch(`${srv.baseUrl}/api/contents/old.txt`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "new.txt" }),
    });
    expect(res.status).toBe(200);
    expect(fs.existsSync(path.join(tmpDir, "old.txt"))).toBe(false);
    expect(fs.readFileSync(path.join(tmpDir, "new.txt"), "utf-8")).toBe("content");
    expect((await res.json()).path).toBe("new.txt");
  });

  it("renames into a subdirectory (creating parent)", async () => {
    fs.writeFileSync(path.join(tmpDir, "f.txt"), "x");
    const res = await fetch(`${srv.baseUrl}/api/contents/f.txt`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "sub/f.txt" }),
    });
    expect(res.status).toBe(200);
    expect(fs.readFileSync(path.join(tmpDir, "sub", "f.txt"), "utf-8")).toBe("x");
  });

  it("returns 409 when destination exists", async () => {
    fs.writeFileSync(path.join(tmpDir, "a.txt"), "1");
    fs.writeFileSync(path.join(tmpDir, "b.txt"), "2");
    const res = await fetch(`${srv.baseUrl}/api/contents/a.txt`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "b.txt" }),
    });
    expect(res.status).toBe(409);
  });
});

// ── Create untitled tests ─────────────────────────────────────────────

describe("create untitled (POST)", () => {
  it("creates untitled file at root", async () => {
    const res = await fetch(`${srv.baseUrl}/api/contents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "file" }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.name).toBe("untitled");
    expect(data.type).toBe("file");
    expect(fs.existsSync(path.join(tmpDir, "untitled"))).toBe(true);
  });

  it("creates untitled file with extension", async () => {
    const res = await fetch(`${srv.baseUrl}/api/contents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "file", ext: ".ga" }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).name).toBe("untitled.ga");
    expect(fs.existsSync(path.join(tmpDir, "untitled.ga"))).toBe(true);
  });

  it("creates untitled file with extension (no leading dot)", async () => {
    const res = await fetch(`${srv.baseUrl}/api/contents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "file", ext: "txt" }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).name).toBe("untitled.txt");
  });

  it("increments suffix on collision", async () => {
    fs.writeFileSync(path.join(tmpDir, "untitled.ga"), "existing");
    let res = await fetch(`${srv.baseUrl}/api/contents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "file", ext: ".ga" }),
    });
    expect((await res.json()).name).toBe("untitled1.ga");

    fs.writeFileSync(path.join(tmpDir, "untitled1.ga"), "also existing");
    res = await fetch(`${srv.baseUrl}/api/contents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "file", ext: ".ga" }),
    });
    expect((await res.json()).name).toBe("untitled2.ga");
  });

  it("creates untitled directory", async () => {
    const res = await fetch(`${srv.baseUrl}/api/contents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "directory" }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.name).toBe("Untitled Folder");
    expect(data.type).toBe("directory");
    expect(fs.statSync(path.join(tmpDir, "Untitled Folder")).isDirectory()).toBe(true);
  });

  it("increments directory name on collision", async () => {
    fs.mkdirSync(path.join(tmpDir, "Untitled Folder"));
    const res = await fetch(`${srv.baseUrl}/api/contents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "directory" }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).name).toBe("Untitled Folder 1");
  });

  it("creates untitled in subdirectory", async () => {
    fs.mkdirSync(path.join(tmpDir, "sub"));
    const res = await fetch(`${srv.baseUrl}/api/contents/sub`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "file", ext: ".txt" }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).path).toBe("sub/untitled.txt");
    expect(fs.existsSync(path.join(tmpDir, "sub", "untitled.txt"))).toBe(true);
  });

  it("returns 404 for missing parent directory", async () => {
    const res = await fetch(`${srv.baseUrl}/api/contents/does_not_exist`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "file" }),
    });
    expect(res.status).toBe(404);
  });
});

// ── Checkpoint tests ──────────────────────────────────────────────────

describe("checkpoints", () => {
  it("creates a checkpoint and stores file contents", async () => {
    fs.writeFileSync(path.join(tmpDir, "f.txt"), "original");
    const res = await fetch(`${srv.baseUrl}/api/contents/f.txt/checkpoints`, {
      method: "POST",
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.id).toBe("checkpoint");
    expect(data.last_modified).toBeTruthy();
    expect(fs.readFileSync(path.join(tmpDir, ".checkpoints", "f.txt", "checkpoint"), "utf-8")).toBe(
      "original",
    );
  });

  it("returns 404 when creating checkpoint for missing file", async () => {
    const res = await fetch(`${srv.baseUrl}/api/contents/nope.txt/checkpoints`, {
      method: "POST",
    });
    expect(res.status).toBe(404);
  });

  it("lists empty checkpoints", async () => {
    fs.writeFileSync(path.join(tmpDir, "f.txt"), "x");
    const res = await fetch(`${srv.baseUrl}/api/contents/f.txt/checkpoints`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("lists checkpoints after creating one", async () => {
    fs.writeFileSync(path.join(tmpDir, "f.txt"), "x");
    await fetch(`${srv.baseUrl}/api/contents/f.txt/checkpoints`, { method: "POST" });
    const res = await fetch(`${srv.baseUrl}/api/contents/f.txt/checkpoints`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe("checkpoint");
  });

  it("restores a checkpoint", async () => {
    fs.writeFileSync(path.join(tmpDir, "f.txt"), "original");
    await fetch(`${srv.baseUrl}/api/contents/f.txt/checkpoints`, { method: "POST" });
    fs.writeFileSync(path.join(tmpDir, "f.txt"), "edited");
    const res = await fetch(`${srv.baseUrl}/api/contents/f.txt/checkpoints/checkpoint`, {
      method: "POST",
    });
    expect(res.status).toBe(204);
    expect(fs.readFileSync(path.join(tmpDir, "f.txt"), "utf-8")).toBe("original");
  });

  it("returns 404 for missing checkpoint on restore", async () => {
    fs.writeFileSync(path.join(tmpDir, "f.txt"), "x");
    const res = await fetch(`${srv.baseUrl}/api/contents/f.txt/checkpoints/nope`, {
      method: "POST",
    });
    expect(res.status).toBe(404);
  });

  it("deletes a checkpoint", async () => {
    fs.writeFileSync(path.join(tmpDir, "f.txt"), "x");
    await fetch(`${srv.baseUrl}/api/contents/f.txt/checkpoints`, { method: "POST" });
    const res = await fetch(`${srv.baseUrl}/api/contents/f.txt/checkpoints/checkpoint`, {
      method: "DELETE",
    });
    expect(res.status).toBe(204);
    expect(await (await fetch(`${srv.baseUrl}/api/contents/f.txt/checkpoints`)).json()).toEqual([]);
    expect(fs.existsSync(path.join(tmpDir, ".checkpoints", "f.txt"))).toBe(false);
  });

  it("returns 404 for missing checkpoint on delete", async () => {
    fs.writeFileSync(path.join(tmpDir, "f.txt"), "x");
    const res = await fetch(`${srv.baseUrl}/api/contents/f.txt/checkpoints/nope`, {
      method: "DELETE",
    });
    expect(res.status).toBe(404);
  });

  it("hides .checkpoints dir from root listing", async () => {
    fs.writeFileSync(path.join(tmpDir, "f.txt"), "x");
    await fetch(`${srv.baseUrl}/api/contents/f.txt/checkpoints`, { method: "POST" });
    const names: string[] = (await (await fetch(`${srv.baseUrl}/api/contents`)).json()).content.map(
      (c: { name: string }) => c.name,
    );
    expect(names).toContain("f.txt");
    expect(names).not.toContain(".checkpoints");
  });

  it("forbids accessing .checkpoints via contents API", async () => {
    fs.writeFileSync(path.join(tmpDir, "f.txt"), "x");
    await fetch(`${srv.baseUrl}/api/contents/f.txt/checkpoints`, { method: "POST" });
    const res = await fetch(`${srv.baseUrl}/api/contents/.checkpoints/f.txt/checkpoint`);
    expect(res.status).toBe(403);
  });

  it("returns 404 for creating checkpoint on a directory", async () => {
    fs.mkdirSync(path.join(tmpDir, "d"));
    const res = await fetch(`${srv.baseUrl}/api/contents/d/checkpoints`, { method: "POST" });
    expect(res.status).toBe(404);
  });

  it("cascades checkpoint deletion when file is deleted", async () => {
    fs.writeFileSync(path.join(tmpDir, "f.txt"), "x");
    await fetch(`${srv.baseUrl}/api/contents/f.txt/checkpoints`, { method: "POST" });
    expect(fs.existsSync(path.join(tmpDir, ".checkpoints", "f.txt", "checkpoint"))).toBe(true);
    const res = await fetch(`${srv.baseUrl}/api/contents/f.txt`, { method: "DELETE" });
    expect(res.status).toBe(204);
    expect(fs.existsSync(path.join(tmpDir, ".checkpoints", "f.txt"))).toBe(false);
  });

  it("cascades checkpoint rename when file is renamed", async () => {
    fs.writeFileSync(path.join(tmpDir, "old.txt"), "x");
    await fetch(`${srv.baseUrl}/api/contents/old.txt/checkpoints`, { method: "POST" });
    const res = await fetch(`${srv.baseUrl}/api/contents/old.txt`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "new.txt" }),
    });
    expect(res.status).toBe(200);
    expect(fs.existsSync(path.join(tmpDir, ".checkpoints", "old.txt"))).toBe(false);
    expect(
      fs.readFileSync(path.join(tmpDir, ".checkpoints", "new.txt", "checkpoint"), "utf-8"),
    ).toBe("x");
    const cpRes = await fetch(`${srv.baseUrl}/api/contents/new.txt/checkpoints`);
    expect(await cpRes.json()).toHaveLength(1);
  });

  it("cascades checkpoint deletion when directory is deleted", async () => {
    fs.mkdirSync(path.join(tmpDir, "sub"));
    fs.writeFileSync(path.join(tmpDir, "sub", "f.txt"), "x");
    await fetch(`${srv.baseUrl}/api/contents/sub/f.txt/checkpoints`, { method: "POST" });
    expect(fs.existsSync(path.join(tmpDir, ".checkpoints", "sub", "f.txt", "checkpoint"))).toBe(
      true,
    );
    const res = await fetch(`${srv.baseUrl}/api/contents/sub`, { method: "DELETE" });
    expect(res.status).toBe(204);
    expect(fs.existsSync(path.join(tmpDir, ".checkpoints", "sub"))).toBe(false);
  });
});

// ── Workflow discovery + auto-refresh tests ──────────────────────────
// Port of the 3 deferred workflow tests from Python's test_contents.py.

const VALID_GA = '{"a_galaxy_workflow": "true", "steps": {}}';
const VALID_GXWF = "class: GalaxyWorkflow\nsteps: []\n";

describe("workflow discovery", () => {
  it("GET /workflows returns empty list for empty directory", async () => {
    const res = await fetch(`${srv.baseUrl}/workflows`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { directory: string; workflows: unknown[] };
    expect(data.workflows).toEqual([]);
  });

  it("GET /workflows lists pre-existing .ga files after refresh", async () => {
    fs.writeFileSync(path.join(tmpDir, "wf.ga"), VALID_GA);
    const refreshRes = await fetch(`${srv.baseUrl}/workflows/refresh`, { method: "POST" });
    expect(refreshRes.status).toBe(200);
    const data = (await refreshRes.json()) as { workflows: { relative_path: string }[] };
    const paths = data.workflows.map((w) => w.relative_path);
    expect(paths).toContain("wf.ga");
  });

  it("GET /workflows lists .gxwf.yml files", async () => {
    fs.writeFileSync(path.join(tmpDir, "wf.gxwf.yml"), VALID_GXWF);
    const res = await fetch(`${srv.baseUrl}/workflows/refresh`, { method: "POST" });
    const data = (await res.json()) as { workflows: { relative_path: string; format: string }[] };
    const found = data.workflows.find((w) => w.relative_path === "wf.gxwf.yml");
    expect(found).toBeDefined();
    expect(found?.format).toBe("format2");
  });

  it("category is first parent directory, empty for root-level", async () => {
    fs.mkdirSync(path.join(tmpDir, "cat"));
    fs.writeFileSync(path.join(tmpDir, "cat", "wf.ga"), VALID_GA);
    fs.writeFileSync(path.join(tmpDir, "root.ga"), VALID_GA);
    const res = await fetch(`${srv.baseUrl}/workflows/refresh`, { method: "POST" });
    const data = (await res.json()) as {
      workflows: { relative_path: string; category: string }[];
    };
    const sub = data.workflows.find((w) => w.relative_path === "cat/wf.ga");
    const root = data.workflows.find((w) => w.relative_path === "root.ga");
    expect(sub?.category).toBe("cat");
    expect(root?.category).toBe("");
  });

  // ── Deferred from Phase 1: auto-refresh on contents mutations ──────

  it("auto-refresh on workflow write: PUT /api/contents creates discoverable .ga", async () => {
    const body = {
      name: "wf.ga",
      path: "wf.ga",
      type: "file",
      writable: true,
      created: "2026-01-01T00:00:00Z",
      last_modified: "2026-01-01T00:00:00Z",
      format: "text",
      content: VALID_GA,
    };
    const putRes = await fetch(`${srv.baseUrl}/api/contents/wf.ga`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    expect(putRes.status).toBe(200);

    const wfRes = await fetch(`${srv.baseUrl}/workflows`);
    const data = (await wfRes.json()) as { workflows: { relative_path: string }[] };
    expect(data.workflows.map((w) => w.relative_path)).toContain("wf.ga");
  });

  it("auto-refresh on workflow delete: DELETE /api/contents removes .ga from list", async () => {
    fs.writeFileSync(path.join(tmpDir, "wf.ga"), VALID_GA);
    // Seed the cache via refresh
    await fetch(`${srv.baseUrl}/workflows/refresh`, { method: "POST" });
    const before = (await (await fetch(`${srv.baseUrl}/workflows`)).json()) as {
      workflows: { relative_path: string }[];
    };
    expect(before.workflows.map((w) => w.relative_path)).toContain("wf.ga");

    const delRes = await fetch(`${srv.baseUrl}/api/contents/wf.ga`, { method: "DELETE" });
    expect(delRes.status).toBe(204);

    const after = (await (await fetch(`${srv.baseUrl}/workflows`)).json()) as {
      workflows: { relative_path: string }[];
    };
    expect(after.workflows.map((w) => w.relative_path)).not.toContain("wf.ga");
  });

  it("POST /api/contents (create untitled .ga) refreshes workflows without error", async () => {
    const res = await fetch(`${srv.baseUrl}/api/contents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "file", ext: ".ga" }),
    });
    expect(res.status).toBe(200);
    // Newly created empty .ga isn't a valid workflow, but the refresh hook
    // should still run without error and /workflows should be callable.
    const wfRes = await fetch(`${srv.baseUrl}/workflows`);
    expect(wfRes.status).toBe(200);
  });
});

// ── Workflow operation route tests ───────────────────────────────────

describe("workflow operations", () => {
  it("GET /workflows/{path}/validate returns 404 for unknown workflow", async () => {
    const res = await fetch(`${srv.baseUrl}/workflows/nonexistent.ga/validate`);
    expect(res.status).toBe(404);
  });

  it("GET /workflows/{path}/clean returns SingleCleanReport for valid .ga", async () => {
    fs.writeFileSync(path.join(tmpDir, "wf.ga"), VALID_GA);
    const res = await fetch(`${srv.baseUrl}/workflows/wf.ga/clean`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      workflow: string;
      results: unknown[];
      total_removed: number;
      steps_with_removals: number;
    };
    expect(typeof data.workflow).toBe("string");
    expect(Array.isArray(data.results)).toBe(true);
    expect(typeof data.total_removed).toBe("number");
  });

  it("GET /workflows/{path}/validate returns SingleValidationReport", async () => {
    fs.writeFileSync(path.join(tmpDir, "wf.ga"), VALID_GA);
    const res = await fetch(`${srv.baseUrl}/workflows/wf.ga/validate`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      workflow: string;
      results: unknown[];
      structure_errors: unknown[];
    };
    expect(typeof data.workflow).toBe("string");
    expect(Array.isArray(data.results)).toBe(true);
    expect(Array.isArray(data.structure_errors)).toBe(true);
  });

  it("GET /workflows/{path}/lint returns SingleLintReport", async () => {
    fs.writeFileSync(path.join(tmpDir, "wf.ga"), VALID_GA);
    const res = await fetch(`${srv.baseUrl}/workflows/wf.ga/lint`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      workflow: string;
      lint_errors: number;
      lint_warnings: number;
    };
    expect(typeof data.workflow).toBe("string");
    expect(typeof data.lint_errors).toBe("number");
  });

  it("GET /api/schemas/structural returns JSON Schema for format2", async () => {
    const res = await fetch(`${srv.baseUrl}/api/schemas/structural?format=format2`);
    expect(res.status).toBe(200);
    const schema = (await res.json()) as Record<string, unknown>;
    expect(typeof schema).toBe("object");
    expect("$schema" in schema || "$defs" in schema || "properties" in schema).toBe(true);
  });

  it("GET /api/schemas/structural returns JSON Schema for native", async () => {
    const res = await fetch(`${srv.baseUrl}/api/schemas/structural?format=native`);
    expect(res.status).toBe(200);
    const schema = (await res.json()) as Record<string, unknown>;
    expect(typeof schema).toBe("object");
  });

  it("GET /api/schemas/structural with unknown format returns 400", async () => {
    const res = await fetch(`${srv.baseUrl}/api/schemas/structural?format=bogus`);
    expect(res.status).toBe(400);
  });
});

describe("--output-schema flag", () => {
  it("outputs valid OpenAPI 3.1 JSON and exits", async () => {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execFileAsync = promisify(execFile);
    const binPath = new URL("../src/bin/gxwf-web.ts", import.meta.url).pathname;
    // Run via tsx so we don't need a pre-built dist
    const { stdout } = await execFileAsync("npx", ["tsx", binPath, "--output-schema"], {
      timeout: 10000,
    });
    const spec = JSON.parse(stdout) as Record<string, unknown>;
    expect(spec.openapi).toBe("3.1.0");
    expect(typeof spec.paths).toBe("object");
    expect(typeof spec.components).toBe("object");
  });
});
