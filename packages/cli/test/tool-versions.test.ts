import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runToolVersions, toTrsToolId } from "../src/commands/tool-versions.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("toTrsToolId", () => {
  it("passes TRS form through", () => {
    expect(toTrsToolId("devteam~fastqc~fastqc")).toBe("devteam~fastqc~fastqc");
  });
  it("converts pretty form", () => {
    expect(toTrsToolId("devteam/fastqc/fastqc")).toBe("devteam~fastqc~fastqc");
  });
  it("rejects malformed input", () => {
    expect(() => toTrsToolId("just-a-string")).toThrow(/Invalid tool id/);
    expect(() => toTrsToolId("owner/repo")).toThrow(/Invalid tool id/);
  });
});

describe("gxwf tool-versions", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;
  let originalFetch: typeof fetch;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    originalFetch = globalThis.fetch;
    process.exitCode = undefined;
  });

  afterEach(() => {
    logSpy.mockRestore();
    errSpy.mockRestore();
    globalThis.fetch = originalFetch;
    process.exitCode = undefined;
  });

  it("emits versions newest last in JSON (Tool Shed returns oldest-first)", async () => {
    globalThis.fetch = (async () =>
      jsonResponse([
        { id: "1.0.0", name: null, url: "", descriptor_type: ["GALAXY"], author: [] },
        { id: "1.1.0", name: null, url: "", descriptor_type: ["GALAXY"], author: [] },
      ])) as typeof fetch;
    await runToolVersions("devteam/fastqc/fastqc", { json: true });
    expect(process.exitCode).toBeUndefined();
    const envelope = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(envelope.trsToolId).toBe("devteam~fastqc~fastqc");
    expect(envelope.versions).toEqual(["1.0.0", "1.1.0"]);
  });

  it("--latest prints only the latest version", async () => {
    globalThis.fetch = (async () =>
      jsonResponse([
        { id: "1.0.0", name: null, url: "", descriptor_type: ["GALAXY"], author: [] },
        { id: "1.1.0", name: null, url: "", descriptor_type: ["GALAXY"], author: [] },
      ])) as typeof fetch;
    await runToolVersions("devteam~fastqc~fastqc", { latest: true });
    expect(process.exitCode).toBeUndefined();
    expect(logSpy).toHaveBeenCalledWith("1.1.0");
  });

  it("exits 2 on empty version list", async () => {
    globalThis.fetch = (async () => jsonResponse([])) as typeof fetch;
    await runToolVersions("owner~repo~tool", { json: true });
    expect(process.exitCode).toBe(2);
    const envelope = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(envelope.versions).toEqual([]);
  });

  it("exits 3 on ToolFetchError", async () => {
    globalThis.fetch = (async () => new Response("boom", { status: 500 })) as typeof fetch;
    await runToolVersions("owner~repo~tool", { json: true });
    expect(process.exitCode).toBe(3);
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("TRS request failed"));
  });

  it("exits 1 on malformed tool id", async () => {
    await runToolVersions("not-a-valid-id", { json: true });
    expect(process.exitCode).toBe(1);
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("Invalid tool id"));
  });
});
