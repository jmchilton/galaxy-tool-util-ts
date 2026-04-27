import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { describe, it, expect } from "vitest";

import { loadConnectionFixtures } from "./helpers/load-connection-fixtures.js";
import { loadParsedToolCache } from "./helpers/parsed-tool-cache.js";
import { dictVerifyEach } from "./helpers/dict-verify-each.js";

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), "fixtures/connection_workflows");
const PARSED_TOOLS_DIR = join(FIXTURES_DIR, "parsed_tools");

describe("connection_workflows fixture corpus", () => {
  it("loads all .gxwf.yml fixtures", () => {
    const fixtures = loadConnectionFixtures(FIXTURES_DIR);
    expect(fixtures.length).toBeGreaterThan(0);
    for (const f of fixtures) {
      expect(f.workflow.class).toBe("GalaxyWorkflow");
    }
  });

  it("pairs ok_/fail_ fixtures with their sidecars when present", () => {
    const fixtures = loadConnectionFixtures(FIXTURES_DIR);
    const withSidecars = fixtures.filter((f) => f.expected !== null);
    expect(withSidecars.length).toBeGreaterThan(0);
    for (const f of withSidecars) {
      expect(Array.isArray(f.expected)).toBe(true);
      for (const entry of f.expected!) {
        expect(Array.isArray(entry.target)).toBe(true);
        expect(entry.target.length).toBeGreaterThan(0);
      }
    }
  });

  it("decodes every synced ParsedTool JSON via Effect Schema", () => {
    const cache = loadParsedToolCache(PARSED_TOOLS_DIR);
    expect(cache.size).toBeGreaterThan(0);
    for (const [id, tool] of cache) {
      expect(tool.id).toBe(id);
      expect(tool.name).toBeTruthy();
    }
  });

  it("references only tool_ids present in the parsed-tool cache", () => {
    const fixtures = loadConnectionFixtures(FIXTURES_DIR);
    const cache = loadParsedToolCache(PARSED_TOOLS_DIR);
    for (const f of fixtures) {
      const steps = (f.workflow.steps ?? {}) as Record<string, { tool_id?: string }>;
      const iterable = Array.isArray(steps) ? steps : Object.values(steps);
      for (const step of iterable) {
        if (step?.tool_id) {
          expect(cache.has(step.tool_id), `${f.stem}: missing ${step.tool_id}`).toBe(true);
        }
      }
    }
  });
});

describe("dictVerifyEach", () => {
  it("walks nested targets and asserts equality", () => {
    const report = { valid: true, step_results: [{ map_over: "list" }] };
    dictVerifyEach(report, [
      { target: ["valid"], value: true },
      { target: ["step_results", 0, "map_over"], value: "list" },
    ]);
  });

  it("throws when expectation fails", () => {
    expect(() => dictVerifyEach({ valid: false }, [{ target: ["valid"], value: true }])).toThrow();
  });
});
