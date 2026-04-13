import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as S from "effect/Schema";

import { cacheKey, ParsedTool } from "@galaxy-tool-util/core";
import { makeNodeToolCache } from "@galaxy-tool-util/core/node";
import { runAdd } from "../src/commands/add.js";
import { runList } from "../src/commands/list.js";
import { runInfo } from "../src/commands/info.js";
import { runClear } from "../src/commands/clear.js";
import { runSchema } from "../src/commands/schema.js";
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
    {
      name: "num_lines",
      parameter_type: "gx_integer",
      type: "integer",
      hidden: false,
      label: "Lines",
      help: null,
      argument: null,
      is_dynamic: false,
      optional: false,
      value: 10,
      min: null,
      max: null,
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

async function seedCache(cacheDir: string) {
  const cache = makeNodeToolCache({ cacheDir });
  const key = await cacheKey(
    "https://toolshed.g2.bx.psu.edu",
    "devteam~fastqc~fastqc",
    "0.74+galaxy0",
  );
  const parsed = S.decodeUnknownSync(ParsedTool)(fastqcFixture);
  await cache.saveTool(
    key,
    parsed,
    "toolshed.g2.bx.psu.edu/repos/devteam/fastqc/fastqc",
    "0.74+galaxy0",
    "api",
    "https://toolshed.g2.bx.psu.edu/api/tools/devteam~fastqc~fastqc/versions/0.74+galaxy0",
  );
  return key;
}

async function seedSimpleTool(cacheDir: string) {
  const cache = makeNodeToolCache({ cacheDir });
  const key = await cacheKey("https://toolshed.g2.bx.psu.edu", "test~simple~simple_tool", "1.0");
  const parsed = S.decodeUnknownSync(ParsedTool)(simpleTool);
  await cache.saveTool(
    key,
    parsed,
    "toolshed.g2.bx.psu.edu/repos/test/simple/simple_tool",
    "1.0",
    "api",
  );
  return key;
}

describe("CLI commands", () => {
  let tmpDir: string;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "cli-test-"));
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    process.exitCode = undefined;
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true });
    logSpy.mockRestore();
    errSpy.mockRestore();
    process.exitCode = undefined;
  });

  describe("add", () => {
    it("fetches and caches a tool", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = (async () =>
        new Response(JSON.stringify(fastqcFixture), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })) as typeof fetch;
      try {
        await runAdd("toolshed.g2.bx.psu.edu/repos/devteam/fastqc/fastqc/0.74+galaxy0", {
          cacheDir: tmpDir,
        });
        expect(process.exitCode).toBeUndefined();
        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("FastQC"));
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("reports failure when fetch fails", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = (async () => new Response("Not found", { status: 404 })) as typeof fetch;
      try {
        await runAdd("toolshed.g2.bx.psu.edu/repos/nonexistent/tool/id/1.0", { cacheDir: tmpDir });
        expect(process.exitCode).toBe(1);
        expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("Failed to fetch"));
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe("list", () => {
    it("shows empty cache message", async () => {
      await runList({ cacheDir: tmpDir });
      expect(logSpy).toHaveBeenCalledWith("Cache is empty.");
    });

    it("shows table with entries", async () => {
      await seedCache(tmpDir);
      await runList({ cacheDir: tmpDir });
      const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
      expect(output).toContain("devteam/fastqc/fastqc");
      expect(output).toContain("0.74+galaxy0");
    });

    it("shows JSON output", async () => {
      await seedCache(tmpDir);
      await runList({ cacheDir: tmpDir, json: true });
      const output = logSpy.mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].tool_version).toBe("0.74+galaxy0");
    });
  });

  describe("info", () => {
    it("shows tool metadata", async () => {
      await seedCache(tmpDir);
      await runInfo("toolshed.g2.bx.psu.edu/repos/devteam/fastqc/fastqc/0.74+galaxy0", {
        cacheDir: tmpDir,
      });
      const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
      expect(output).toContain("FastQC");
      expect(output).toContain("Inputs:");
    });

    it("errors on uncached tool", async () => {
      await runInfo("nonexistent/tool/id/1.0", { cacheDir: tmpDir });
      expect(process.exitCode).toBe(1);
    });
  });

  describe("clear", () => {
    it("clears all entries", async () => {
      await seedCache(tmpDir);
      await runClear(undefined, { cacheDir: tmpDir });
      const output = logSpy.mock.calls[0][0];
      expect(output).toContain("1");
    });

    it("clears matching prefix", async () => {
      await seedCache(tmpDir);
      await runClear("toolshed.g2.bx.psu.edu/repos/devteam", {
        cacheDir: tmpDir,
      });
      const output = logSpy.mock.calls[0][0];
      expect(output).toContain("1");
    });
  });

  describe("schema", () => {
    it("generates JSON Schema to stdout", async () => {
      await seedSimpleTool(tmpDir);
      await runSchema("toolshed.g2.bx.psu.edu/repos/test/simple/simple_tool/1.0", {
        cacheDir: tmpDir,
        representation: "workflow_step",
      });
      expect(process.exitCode).toBeUndefined();
      const output = logSpy.mock.calls[0][0];
      const schema = JSON.parse(output);
      expect(schema).toHaveProperty("$schema");
      expect(schema).toHaveProperty("properties");
    });

    it("writes JSON Schema to file", async () => {
      await seedSimpleTool(tmpDir);
      const outFile = join(tmpDir, "schema.json");
      await runSchema("toolshed.g2.bx.psu.edu/repos/test/simple/simple_tool/1.0", {
        cacheDir: tmpDir,
        output: outFile,
      });
      const raw = await readFile(outFile, "utf-8");
      const schema = JSON.parse(raw);
      expect(schema).toHaveProperty("$schema");
    });

    it("generates JSON Schema for complex tools", async () => {
      await seedCache(tmpDir);
      await runSchema("toolshed.g2.bx.psu.edu/repos/devteam/fastqc/fastqc/0.74+galaxy0", {
        cacheDir: tmpDir,
      });
      expect(process.exitCode).toBeUndefined();
      const output = logSpy.mock.calls[0][0];
      const schema = JSON.parse(output);
      expect(schema).toHaveProperty("$schema");
    });

    it("errors on unknown representation", async () => {
      await seedCache(tmpDir);
      await runSchema("toolshed.g2.bx.psu.edu/repos/devteam/fastqc/fastqc/0.74+galaxy0", {
        cacheDir: tmpDir,
        representation: "nonexistent",
      });
      expect(process.exitCode).toBe(1);
    });

    it("errors on uncached tool", async () => {
      await runSchema("nonexistent/tool/1.0", { cacheDir: tmpDir });
      expect(process.exitCode).toBe(1);
    });
  });
});
