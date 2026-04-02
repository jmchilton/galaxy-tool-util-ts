import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as S from "effect/Schema";

import { ToolCache, cacheKey, ParsedTool } from "@galaxy-tool-util/core";
import * as YAML from "yaml";
import { runValidateWorkflow } from "../src/commands/validate-workflow.js";

// A simple tool with text + integer params (no data inputs)
const simpleTool = {
  id: "simple_tool",
  version: "1.0",
  name: "Simple Tool",
  description: null,
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

// A tool with a data input (for connection testing)
const dataInputTool = {
  id: "data_tool",
  version: "1.0",
  name: "Data Tool",
  description: null,
  inputs: [
    {
      name: "input_file",
      parameter_type: "gx_data",
      type: "data",
      hidden: false,
      label: "Input",
      help: null,
      argument: null,
      is_dynamic: false,
      optional: false,
      multiple: false,
      extensions: ["data"],
    },
    {
      name: "threshold",
      parameter_type: "gx_float",
      type: "float",
      hidden: false,
      label: "Threshold",
      help: null,
      argument: null,
      is_dynamic: false,
      optional: true,
      value: 0.5,
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

const SIMPLE_TOOL_ID = "toolshed.g2.bx.psu.edu/repos/test/simple/simple_tool";
const DATA_TOOL_ID = "toolshed.g2.bx.psu.edu/repos/test/data/data_tool";

async function seedTools(cacheDir: string) {
  const cache = new ToolCache({ cacheDir });
  const simpleKey = cacheKey("https://toolshed.g2.bx.psu.edu", "test~simple~simple_tool", "1.0");
  await cache.saveTool(simpleKey, S.decodeUnknownSync(ParsedTool)(simpleTool), SIMPLE_TOOL_ID, "1.0", "api");
  const dataKey = cacheKey("https://toolshed.g2.bx.psu.edu", "test~data~data_tool", "1.0");
  await cache.saveTool(dataKey, S.decodeUnknownSync(ParsedTool)(dataInputTool), DATA_TOOL_ID, "1.0", "api");
}

describe("validate-workflow (connection-aware)", () => {
  let tmpDir: string;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "vw-test-"));
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    process.exitCode = undefined;
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true });
    logSpy.mockRestore();
    errSpy.mockRestore();
    warnSpy.mockRestore();
    process.exitCode = undefined;
  });

  describe("native workflows", () => {
    it("validates native workflow with connections (workflow_step_native)", async () => {
      await seedTools(tmpDir);
      // Native workflow: step 0 = input, step 1 = data_tool with connection
      const workflow = {
        a_galaxy_workflow: "true",
        "format-version": "0.1",
        steps: {
          "0": {
            id: 0,
            type: "data_input",
            label: "Input Dataset",
            tool_id: null,
            tool_state: "{}",
          },
          "1": {
            id: 1,
            type: "tool",
            label: "Run Data Tool",
            tool_id: DATA_TOOL_ID,
            tool_version: "1.0",
            tool_state: JSON.stringify({ threshold: "0.8" }),
            input_connections: {
              input_file: { id: 0, output_name: "output" },
            },
          },
        },
      };
      const wfPath = join(tmpDir, "test.ga");
      await writeFile(wfPath, JSON.stringify(workflow));
      await runValidateWorkflow(wfPath, { cacheDir: tmpDir });

      const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
      expect(output).toContain("tool_state: OK");
      expect(process.exitCode).toBe(0);
    });

    it("validates native workflow without connections (simple params)", async () => {
      await seedTools(tmpDir);
      const workflow = {
        a_galaxy_workflow: "true",
        "format-version": "0.1",
        steps: {
          "0": {
            id: 0,
            type: "tool",
            label: "Simple Step",
            tool_id: SIMPLE_TOOL_ID,
            tool_version: "1.0",
            tool_state: JSON.stringify({ input_text: "hello", num_lines: "5" }),
            input_connections: {},
          },
        },
      };
      const wfPath = join(tmpDir, "simple.ga");
      await writeFile(wfPath, JSON.stringify(workflow));
      await runValidateWorkflow(wfPath, { cacheDir: tmpDir });

      const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
      expect(output).toContain("tool_state: OK");
      expect(process.exitCode).toBe(0);
    });

    it("handles subworkflows recursively", async () => {
      await seedTools(tmpDir);
      const workflow = {
        a_galaxy_workflow: "true",
        "format-version": "0.1",
        steps: {
          "0": {
            id: 0,
            type: "subworkflow",
            label: "Sub",
            tool_id: null,
            subworkflow: {
              class: "NativeGalaxyWorkflow",
              a_galaxy_workflow: "true",
              "format-version": "0.1",
              steps: {
                "0": {
                  id: 0,
                  type: "tool",
                  label: "Inner Simple",
                  tool_id: SIMPLE_TOOL_ID,
                  tool_version: "1.0",
                  tool_state: JSON.stringify({ input_text: "sub", num_lines: "3" }),
                  input_connections: {},
                },
              },
            },
          },
        },
      };
      const wfPath = join(tmpDir, "sub.ga");
      await writeFile(wfPath, JSON.stringify(workflow));
      await runValidateWorkflow(wfPath, { cacheDir: tmpDir });

      const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
      expect(output).toContain("tool_state: OK");
      expect(process.exitCode).toBe(0);
    });
  });

  describe("format2 workflows", () => {
    it("validates format2 workflow with connections (two-level)", async () => {
      await seedTools(tmpDir);
      const workflow = {
        class: "GalaxyWorkflow",
        label: "Test Format2",
        inputs: [{ id: "input_ds", type: "data" }],
        outputs: [],
        steps: [
          {
            id: "step1",
            tool_id: DATA_TOOL_ID,
            tool_version: "1.0",
            state: { threshold: 0.9 },
            in: [{ id: "input_file", source: "input_ds/output" }],
            out: [],
          },
        ],
      };
      const wfPath = join(tmpDir, "test.gxwf.yml");
      await writeFile(wfPath, YAML.stringify(workflow));
      await runValidateWorkflow(wfPath, { cacheDir: tmpDir });

      const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
      expect(output).toContain("tool_state: OK");
      expect(process.exitCode).toBe(0);
    });

    it("validates format2 workflow with no connections", async () => {
      await seedTools(tmpDir);
      const workflow = {
        class: "GalaxyWorkflow",
        label: "No Connections",
        inputs: [],
        outputs: [],
        steps: [
          {
            id: "step1",
            tool_id: SIMPLE_TOOL_ID,
            tool_version: "1.0",
            state: { input_text: "value", num_lines: 42 },
            in: [],
            out: [],
          },
        ],
      };
      const wfPath = join(tmpDir, "simple.gxwf.yml");
      await writeFile(wfPath, YAML.stringify(workflow));
      await runValidateWorkflow(wfPath, { cacheDir: tmpDir });

      const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
      expect(output).toContain("tool_state: OK");
      expect(process.exitCode).toBe(0);
    });

    it("validates format2 with $link syntax (stripped from state, added to in)", async () => {
      await seedTools(tmpDir);
      // $link in state should be stripped during normalization
      // and a corresponding in entry generated for connection injection
      const workflow = {
        class: "GalaxyWorkflow",
        label: "Link Syntax",
        inputs: [{ id: "input_ds", type: "data" }],
        outputs: [],
        steps: [
          {
            id: "step1",
            tool_id: DATA_TOOL_ID,
            tool_version: "1.0",
            state: {
              threshold: 0.5,
              input_file: { $link: "input_ds/output" },
            },
            in: [],
            out: [],
          },
        ],
      };
      const wfPath = join(tmpDir, "link.gxwf.yml");
      await writeFile(wfPath, YAML.stringify(workflow));
      await runValidateWorkflow(wfPath, { cacheDir: tmpDir });

      const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
      const _errors = errSpy.mock.calls.map((c) => c[0]).join("\n");
      expect(output).toContain("tool_state: OK");
      expect(process.exitCode).toBe(0);
    });

    it("handles inline subworkflows", async () => {
      await seedTools(tmpDir);
      const workflow = {
        class: "GalaxyWorkflow",
        label: "Sub",
        inputs: [],
        outputs: [],
        steps: [
          {
            id: "sub_step",
            run: {
              class: "GalaxyWorkflow",
              label: "Inner",
              inputs: [],
              outputs: [],
              steps: [
                {
                  id: "inner",
                  tool_id: SIMPLE_TOOL_ID,
                  tool_version: "1.0",
                  state: { input_text: "inner", num_lines: 1 },
                  in: [],
                  out: [],
                },
              ],
            },
            in: [],
            out: [],
          },
        ],
      };
      const wfPath = join(tmpDir, "sub.gxwf.yml");
      await writeFile(wfPath, YAML.stringify(workflow));
      await runValidateWorkflow(wfPath, { cacheDir: tmpDir });

      const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
      expect(output).toContain("tool_state: OK");
      expect(process.exitCode).toBe(0);
    });
  });

  describe("skip and error cases", () => {
    it("skips steps with uncached tools", async () => {
      const workflow = {
        a_galaxy_workflow: "true",
        "format-version": "0.1",
        steps: {
          "0": {
            id: 0,
            type: "tool",
            label: "Unknown",
            tool_id: "toolshed.g2.bx.psu.edu/repos/nobody/fake/fake_tool",
            tool_version: "1.0",
            tool_state: "{}",
            input_connections: {},
          },
        },
      };
      const wfPath = join(tmpDir, "missing.ga");
      await writeFile(wfPath, JSON.stringify(workflow));
      await runValidateWorkflow(wfPath, { cacheDir: tmpDir });

      const output = warnSpy.mock.calls.map((c) => c[0]).join("\n");
      expect(output).toContain("skipped");
    });

    it("reports validation failure for bad tool_state", async () => {
      await seedTools(tmpDir);
      const workflow = {
        a_galaxy_workflow: "true",
        "format-version": "0.1",
        steps: {
          "0": {
            id: 0,
            type: "tool",
            label: "Bad State",
            tool_id: SIMPLE_TOOL_ID,
            tool_version: "1.0",
            // num_lines should be a number, not an object
            tool_state: JSON.stringify({ input_text: "ok", num_lines: { bad: true } }),
            input_connections: {},
          },
        },
      };
      const wfPath = join(tmpDir, "bad.ga");
      await writeFile(wfPath, JSON.stringify(workflow));
      await runValidateWorkflow(wfPath, { cacheDir: tmpDir });

      const errors = errSpy.mock.calls.map((c) => c[0]).join("\n");
      expect(errors).toContain("tool_state errors");
      expect(process.exitCode).toBe(1);
    });

    it("skips native steps with replacement parameters", async () => {
      await seedTools(tmpDir);
      const workflow = {
        a_galaxy_workflow: "true",
        "format-version": "0.1",
        steps: {
          "0": {
            id: 0,
            type: "tool",
            label: "Replacement",
            tool_id: SIMPLE_TOOL_ID,
            tool_version: "1.0",
            // ${num_lines} is a replacement param in an integer field → skip
            tool_state: JSON.stringify({ input_text: "ok", num_lines: "${num_lines}" }),
            input_connections: {},
          },
        },
      };
      const wfPath = join(tmpDir, "replacement.ga");
      await writeFile(wfPath, JSON.stringify(workflow));
      await runValidateWorkflow(wfPath, { cacheDir: tmpDir });

      const output = warnSpy.mock.calls.map((c) => c[0]).join("\n");
      expect(output).toContain("skipped");
      expect(output).toContain("replacement");
      expect(process.exitCode).toBe(0);
    });

    it("skips tool state validation when --no-tool-state", async () => {
      const workflow = {
        a_galaxy_workflow: "true",
        "format-version": "0.1",
        steps: {},
      };
      const wfPath = join(tmpDir, "notool.ga");
      await writeFile(wfPath, JSON.stringify(workflow));
      await runValidateWorkflow(wfPath, { cacheDir: tmpDir, toolState: false });

      const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
      expect(output).toContain("Structural validation: OK");
      expect(process.exitCode).toBe(0);
    });
  });
});

