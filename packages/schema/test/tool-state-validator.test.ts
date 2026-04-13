/**
 * Tests for ToolStateValidator — the high-level bridge that takes a tool ID,
 * fetches the definition via ToolInfoService, and returns ToolStateDiagnostic[].
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ToolInfoService, ParsedTool } from "@galaxy-tool-util/core";
import { makeNodeToolInfoService } from "@galaxy-tool-util/core/node";
import { ToolStateValidator } from "../src/tool-state-validator.js";
import type { IntegerParameterModel } from "../src/schema/bundle-types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "tool-state-validator-test-"));
}

function intParam(name: string, optional = false): IntegerParameterModel {
  return {
    name,
    parameter_type: "gx_integer",
    type: "integer",
    hidden: false,
    label: null,
    help: null,
    argument: null,
    is_dynamic: false,
    optional,
    value: 0,
    min: null,
    max: null,
    validators: [],
  };
}

function makeParsedTool(inputs: unknown[] = []): ParsedTool {
  return {
    id: "test_tool",
    version: "1.0",
    name: "Test Tool",
    description: null,
    inputs,
    outputs: [],
    citations: [],
    license: null,
    profile: null,
    edam_operations: [],
    edam_topics: [],
    xrefs: [],
  };
}

const TOOL_ID = "toolshed.g2.bx.psu.edu/repos/iuc/test/test_tool/1.0";
const TOOL_VERSION = "1.0";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ToolStateValidator", () => {
  let cacheDir: string;
  let toolInfo: ToolInfoService;
  let validator: ToolStateValidator;

  beforeEach(async () => {
    cacheDir = makeTempDir();
    toolInfo = makeNodeToolInfoService({ cacheDir });
    validator = new ToolStateValidator(toolInfo);
  });

  afterEach(() => {
    rmSync(cacheDir, { recursive: true, force: true });
  });

  describe("validateNativeStep", () => {
    it("returns empty array for unknown tool (not in cache, no sources)", async () => {
      const result = await validator.validateNativeStep(TOOL_ID, TOOL_VERSION, { count: 5 });
      expect(result).toEqual([]);
    });

    it("returns empty array for valid state against known tool", async () => {
      await toolInfo.addTool(TOOL_ID, TOOL_VERSION, makeParsedTool([intParam("count")]));
      const result = await validator.validateNativeStep(TOOL_ID, TOOL_VERSION, { count: 5 });
      expect(result).toEqual([]);
    });

    it("returns diagnostics for invalid state (wrong type)", async () => {
      await toolInfo.addTool(TOOL_ID, TOOL_VERSION, makeParsedTool([intParam("count")]));
      // pass a string where an integer is required
      const result = await validator.validateNativeStep(TOOL_ID, TOOL_VERSION, {
        count: "not-a-number",
      });
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].severity).toBe("error");
    });

    it("returns empty array for tool with no inputs (empty inputs array)", async () => {
      await toolInfo.addTool(TOOL_ID, TOOL_VERSION, makeParsedTool([]));
      const result = await validator.validateNativeStep(TOOL_ID, TOOL_VERSION, {
        anything: "goes",
      });
      expect(result).toEqual([]);
    });

    it("returns empty array when toolVersion is null and ID has no embedded version", async () => {
      // ID without version + null version → ToolInfoService throws → validator returns []
      const result = await validator.validateNativeStep(
        "toolshed.g2.bx.psu.edu/repos/iuc/test/test_tool",
        null,
        { count: 5 },
      );
      expect(result).toEqual([]);
    });
  });

  describe("validateFormat2Step", () => {
    it("returns empty array for unknown tool", async () => {
      const result = await validator.validateFormat2Step(TOOL_ID, TOOL_VERSION, { count: 5 });
      expect(result).toEqual([]);
    });

    it("returns empty array for valid format2 state", async () => {
      await toolInfo.addTool(TOOL_ID, TOOL_VERSION, makeParsedTool([intParam("count")]));
      const result = await validator.validateFormat2Step(TOOL_ID, TOOL_VERSION, { count: 5 });
      expect(result).toEqual([]);
    });

    it("returns diagnostics for invalid format2 state", async () => {
      await toolInfo.addTool(TOOL_ID, TOOL_VERSION, makeParsedTool([intParam("count")]));
      const result = await validator.validateFormat2Step(TOOL_ID, TOOL_VERSION, { count: "bad" });
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].severity).toBe("error");
    });

    it("does NOT report unknown keys (lenient mode)", async () => {
      await toolInfo.addTool(TOOL_ID, TOOL_VERSION, makeParsedTool([intParam("count")]));
      // unknown_key should be silently ignored
      const result = await validator.validateFormat2Step(TOOL_ID, TOOL_VERSION, {
        count: 5,
        unknown_key: "surplus",
      });
      expect(result).toEqual([]);
    });
  });

  describe("validateFormat2StepStrict", () => {
    it("returns empty array for unknown tool", async () => {
      const result = await validator.validateFormat2StepStrict(TOOL_ID, TOOL_VERSION, { count: 5 });
      expect(result).toEqual([]);
    });

    it("returns empty array for valid state with no extra keys", async () => {
      await toolInfo.addTool(TOOL_ID, TOOL_VERSION, makeParsedTool([intParam("count")]));
      const result = await validator.validateFormat2StepStrict(TOOL_ID, TOOL_VERSION, { count: 5 });
      expect(result).toEqual([]);
    });

    it("reports unknown key with a non-empty path", async () => {
      await toolInfo.addTool(TOOL_ID, TOOL_VERSION, makeParsedTool([intParam("count")]));
      const result = await validator.validateFormat2StepStrict(TOOL_ID, TOOL_VERSION, {
        count: 5,
        unknown_key: "surplus",
      });
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].severity).toBe("error");
      // path should identify the unknown key
      expect(result[0].path).toContain("unknown_key");
    });

    it("reports value type error with path to the offending param", async () => {
      await toolInfo.addTool(TOOL_ID, TOOL_VERSION, makeParsedTool([intParam("count")]));
      const result = await validator.validateFormat2StepStrict(TOOL_ID, TOOL_VERSION, {
        count: "not-a-number",
      });
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].severity).toBe("error");
      expect(result[0].path).toContain("count");
    });

    it("returns empty array for tool with no inputs", async () => {
      await toolInfo.addTool(TOOL_ID, TOOL_VERSION, makeParsedTool([]));
      // no inputs → schema cannot be built → no diagnostics
      const result = await validator.validateFormat2StepStrict(TOOL_ID, TOOL_VERSION, {
        any_key: "value",
      });
      expect(result).toEqual([]);
    });
  });
});
