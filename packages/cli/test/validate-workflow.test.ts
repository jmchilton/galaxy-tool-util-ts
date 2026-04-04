import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import * as YAML from "yaml";

import { runValidateWorkflow } from "../src/commands/validate-workflow.js";
import { createCliTestContext, type CliTestContext } from "./helpers/cli-test-context.js";
import { seedAllTools, SIMPLE_TOOL_ID, DATA_TOOL_ID } from "./helpers/fixtures.js";

describe("validate-workflow (connection-aware)", () => {
  let ctx: CliTestContext;

  beforeEach(async () => {
    ctx = await createCliTestContext("vw-test");
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  describe("native workflows", () => {
    it("validates native workflow with connections (workflow_step_native)", async () => {
      await seedAllTools(ctx.tmpDir);
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
      const wfPath = join(ctx.tmpDir, "test.ga");
      await writeFile(wfPath, JSON.stringify(workflow));
      await runValidateWorkflow(wfPath, { cacheDir: ctx.tmpDir });

      const output = ctx.logSpy.mock.calls.map((c) => c[0]).join("\n");
      expect(output).toContain("tool_state: OK");
      expect(process.exitCode).toBe(0);
    });

    it("validates native workflow without connections (simple params)", async () => {
      await seedAllTools(ctx.tmpDir);
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
      const wfPath = join(ctx.tmpDir, "simple.ga");
      await writeFile(wfPath, JSON.stringify(workflow));
      await runValidateWorkflow(wfPath, { cacheDir: ctx.tmpDir });

      const output = ctx.logSpy.mock.calls.map((c) => c[0]).join("\n");
      expect(output).toContain("tool_state: OK");
      expect(process.exitCode).toBe(0);
    });

    it("handles subworkflows recursively", async () => {
      await seedAllTools(ctx.tmpDir);
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
      const wfPath = join(ctx.tmpDir, "sub.ga");
      await writeFile(wfPath, JSON.stringify(workflow));
      await runValidateWorkflow(wfPath, { cacheDir: ctx.tmpDir });

      const output = ctx.logSpy.mock.calls.map((c) => c[0]).join("\n");
      expect(output).toContain("tool_state: OK");
      expect(process.exitCode).toBe(0);
    });
  });

  describe("format2 workflows", () => {
    it("validates format2 workflow with connections (two-level)", async () => {
      await seedAllTools(ctx.tmpDir);
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
      const wfPath = join(ctx.tmpDir, "test.gxwf.yml");
      await writeFile(wfPath, YAML.stringify(workflow));
      await runValidateWorkflow(wfPath, { cacheDir: ctx.tmpDir });

      const output = ctx.logSpy.mock.calls.map((c) => c[0]).join("\n");
      expect(output).toContain("tool_state: OK");
      expect(process.exitCode).toBe(0);
    });

    it("validates format2 workflow with no connections", async () => {
      await seedAllTools(ctx.tmpDir);
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
      const wfPath = join(ctx.tmpDir, "simple.gxwf.yml");
      await writeFile(wfPath, YAML.stringify(workflow));
      await runValidateWorkflow(wfPath, { cacheDir: ctx.tmpDir });

      const output = ctx.logSpy.mock.calls.map((c) => c[0]).join("\n");
      expect(output).toContain("tool_state: OK");
      expect(process.exitCode).toBe(0);
    });

    it("validates format2 with $link syntax (stripped from state, added to in)", async () => {
      await seedAllTools(ctx.tmpDir);
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
      const wfPath = join(ctx.tmpDir, "link.gxwf.yml");
      await writeFile(wfPath, YAML.stringify(workflow));
      await runValidateWorkflow(wfPath, { cacheDir: ctx.tmpDir });

      const output = ctx.logSpy.mock.calls.map((c) => c[0]).join("\n");
      const _errors = ctx.errSpy.mock.calls.map((c) => c[0]).join("\n");
      expect(output).toContain("tool_state: OK");
      expect(process.exitCode).toBe(0);
    });

    it("handles inline subworkflows", async () => {
      await seedAllTools(ctx.tmpDir);
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
      const wfPath = join(ctx.tmpDir, "sub.gxwf.yml");
      await writeFile(wfPath, YAML.stringify(workflow));
      await runValidateWorkflow(wfPath, { cacheDir: ctx.tmpDir });

      const output = ctx.logSpy.mock.calls.map((c) => c[0]).join("\n");
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
      const wfPath = join(ctx.tmpDir, "missing.ga");
      await writeFile(wfPath, JSON.stringify(workflow));
      await runValidateWorkflow(wfPath, { cacheDir: ctx.tmpDir });

      const output = ctx.warnSpy.mock.calls.map((c) => c[0]).join("\n");
      expect(output).toContain("skipped");
    });

    it("reports validation failure for bad tool_state", async () => {
      await seedAllTools(ctx.tmpDir);
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
      const wfPath = join(ctx.tmpDir, "bad.ga");
      await writeFile(wfPath, JSON.stringify(workflow));
      await runValidateWorkflow(wfPath, { cacheDir: ctx.tmpDir });

      const errors = ctx.errSpy.mock.calls.map((c) => c[0]).join("\n");
      expect(errors).toContain("tool_state errors");
      expect(process.exitCode).toBe(1);
    });

    it("skips native steps with replacement parameters", async () => {
      await seedAllTools(ctx.tmpDir);
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
      const wfPath = join(ctx.tmpDir, "replacement.ga");
      await writeFile(wfPath, JSON.stringify(workflow));
      await runValidateWorkflow(wfPath, { cacheDir: ctx.tmpDir });

      const output = ctx.warnSpy.mock.calls.map((c) => c[0]).join("\n");
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
      const wfPath = join(ctx.tmpDir, "notool.ga");
      await writeFile(wfPath, JSON.stringify(workflow));
      await runValidateWorkflow(wfPath, { cacheDir: ctx.tmpDir, toolState: false });

      const output = ctx.logSpy.mock.calls.map((c) => c[0]).join("\n");
      expect(output).toContain("Structural validation: OK");
      expect(process.exitCode).toBe(0);
    });
  });
});
