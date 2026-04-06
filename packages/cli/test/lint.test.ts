import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import * as YAML from "yaml";

import { runLint } from "../src/commands/lint.js";
import type { SingleLintReport } from "@galaxy-tool-util/schema";
import { createCliTestContext, type CliTestContext } from "./helpers/cli-test-context.js";
import { seedSimpleTool, seedAllTools, SIMPLE_TOOL_ID, COND_TOOL_ID } from "./helpers/fixtures.js";

describe("gxwf lint", () => {
  let ctx: CliTestContext;

  beforeEach(async () => {
    ctx = await createCliTestContext("lint-test");
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it("lints well-formed native workflow with cached tools", async () => {
    await seedSimpleTool(ctx.tmpDir);
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
          tool_state: JSON.stringify({ input_text: "hello" }),
          input_connections: {},
          workflow_outputs: [{ label: "out1", output_name: "output" }],
        },
      },
    };
    const wfPath = join(ctx.tmpDir, "good.ga");
    await writeFile(wfPath, JSON.stringify(workflow));
    await runLint(wfPath, { cacheDir: ctx.tmpDir });

    const output = ctx.logSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("Structural lint: OK");
    expect(output).toContain("tool_state: OK");
  });

  it("reports best practice warnings for missing annotations", async () => {
    const workflow = {
      class: "GalaxyWorkflow",
      steps: [
        {
          tool_id: "builtin_tool",
          state: {},
          in: [],
          out: [],
        },
      ],
    };
    const wfPath = join(ctx.tmpDir, "noannotation.gxwf.yml");
    await writeFile(wfPath, YAML.stringify(workflow));
    await runLint(wfPath, { skipStateValidation: true });

    const warnings = ctx.warnSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(warnings).toContain("not annotated");
    expect(warnings).toContain("creator");
    expect(warnings).toContain("license");
    // Exit code 1 for warnings only
    expect(process.exitCode).toBe(1);
  });

  it("reports structural lint errors for broken output sources", async () => {
    const workflow = {
      class: "GalaxyWorkflow",
      inputs: [],
      outputs: [{ id: "bad_out", outputSource: "nonexistent_step/output" }],
      steps: [],
    };
    const wfPath = join(ctx.tmpDir, "badoutput.gxwf.yml");
    await writeFile(wfPath, YAML.stringify(workflow));
    await runLint(wfPath, { skipStateValidation: true, skipBestPractices: true });

    const errors = ctx.errSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(errors).toContain("nonexistent_step");
    expect(process.exitCode).toBe(2);
  });

  it("--skip-best-practices suppresses those warnings", async () => {
    const workflow = {
      class: "GalaxyWorkflow",
      steps: [
        {
          tool_id: "builtin_tool",
          state: {},
          in: [],
          out: [],
        },
      ],
    };
    const wfPath = join(ctx.tmpDir, "skip-bp.gxwf.yml");
    await writeFile(wfPath, YAML.stringify(workflow));
    await runLint(wfPath, { skipBestPractices: true, skipStateValidation: true });

    const warnings = ctx.warnSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(warnings).not.toContain("not annotated");
    expect(warnings).not.toContain("creator");
  });

  it("--skip-state-validation suppresses state checks", async () => {
    await seedSimpleTool(ctx.tmpDir);
    const workflow = {
      a_galaxy_workflow: "true",
      "format-version": "0.1",
      steps: {
        "0": {
          id: 0,
          type: "tool",
          label: "Step",
          tool_id: SIMPLE_TOOL_ID,
          tool_version: "1.0",
          tool_state: JSON.stringify({ input_text: { bad: true } }),
          input_connections: {},
          workflow_outputs: [{ label: "out", output_name: "output" }],
        },
      },
    };
    const wfPath = join(ctx.tmpDir, "skip-state.ga");
    await writeFile(wfPath, JSON.stringify(workflow));
    await runLint(wfPath, { cacheDir: ctx.tmpDir, skipStateValidation: true });

    const output = ctx.logSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("skipped");
    expect(output).not.toContain("tool_state errors");
  });

  it("both skip flags = structural-only lint", async () => {
    const workflow = {
      a_galaxy_workflow: "true",
      "format-version": "0.1",
      steps: {
        "0": {
          id: 0,
          type: "tool",
          tool_id: "some_tool",
          workflow_outputs: [{ label: "out", output_name: "output" }],
        },
      },
    };
    const wfPath = join(ctx.tmpDir, "structural-only.ga");
    await writeFile(wfPath, JSON.stringify(workflow));
    await runLint(wfPath, { skipBestPractices: true, skipStateValidation: true });

    const output = ctx.logSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("Structural lint: OK");
  });

  it("reports state validation errors for invalid tool_state", async () => {
    await seedSimpleTool(ctx.tmpDir);
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
          tool_state: JSON.stringify({ input_text: { bad: true } }),
          input_connections: {},
          workflow_outputs: [{ label: "out", output_name: "output" }],
        },
      },
    };
    const wfPath = join(ctx.tmpDir, "bad-state.ga");
    await writeFile(wfPath, JSON.stringify(workflow));
    await runLint(wfPath, { cacheDir: ctx.tmpDir });

    const errors = ctx.errSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(errors).toContain("tool_state errors");
    expect(process.exitCode).toBe(2);
  });

  it("empty tool cache = graceful degradation", async () => {
    const workflow = {
      a_galaxy_workflow: "true",
      "format-version": "0.1",
      steps: {
        "0": {
          id: 0,
          type: "tool",
          tool_id: SIMPLE_TOOL_ID,
          tool_version: "1.0",
          tool_state: JSON.stringify({ input_text: "hello" }),
          input_connections: {},
          workflow_outputs: [{ label: "out", output_name: "output" }],
        },
      },
    };
    const wfPath = join(ctx.tmpDir, "empty-cache.ga");
    await writeFile(wfPath, JSON.stringify(workflow));
    await runLint(wfPath, { cacheDir: ctx.tmpDir });

    const warnings = ctx.warnSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(warnings).toContain("empty");
  });

  it("--json outputs SingleLintReport shape", async () => {
    const workflow = {
      a_galaxy_workflow: "true",
      "format-version": "0.1",
      steps: {
        "0": {
          id: 0,
          type: "tool",
          tool_id: "some_tool",
          workflow_outputs: [{ label: "out", output_name: "output" }],
        },
      },
    };
    const wfPath = join(ctx.tmpDir, "json-out.ga");
    await writeFile(wfPath, JSON.stringify(workflow));
    await runLint(wfPath, { skipStateValidation: true, json: true });

    const output = ctx.logSpy.mock.calls[0][0];
    const report: SingleLintReport = JSON.parse(output);
    expect(report.workflow).toBe(wfPath);
    expect(report.lint_errors).toBeTypeOf("number");
    expect(report.lint_warnings).toBeTypeOf("number");
    expect(report.results).toEqual([]);
    expect(report.structure_errors).toEqual([]);
    expect(report.encoding_errors).toEqual([]);
    expect(report.summary).toHaveProperty("lint_errors");
    expect(report.summary).toHaveProperty("lint_warnings");
    expect(report.summary).toHaveProperty("state_ok");
    expect(report.summary).toHaveProperty("state_fail");
    expect(report.summary).toHaveProperty("state_skip");
  });

  it("--json includes state validation results", async () => {
    await seedSimpleTool(ctx.tmpDir);
    const workflow = {
      a_galaxy_workflow: "true",
      "format-version": "0.1",
      steps: {
        "0": {
          id: 0,
          type: "tool",
          label: "Good",
          tool_id: SIMPLE_TOOL_ID,
          tool_version: "1.0",
          tool_state: JSON.stringify({ input_text: "hello" }),
          input_connections: {},
          workflow_outputs: [{ label: "out", output_name: "output" }],
        },
      },
    };
    const wfPath = join(ctx.tmpDir, "json-state.ga");
    await writeFile(wfPath, JSON.stringify(workflow));
    await runLint(wfPath, { cacheDir: ctx.tmpDir, json: true });

    const output = ctx.logSpy.mock.calls[0][0];
    const report: SingleLintReport = JSON.parse(output);
    expect(report.results).toHaveLength(1);
    expect(report.results[0].status).toBe("ok");
    expect(report.summary.state_ok).toBe(1);
  });

  it("--json includes structure_errors for malformed workflow", async () => {
    // Workflow missing required "format-version" but is detected as native via .ga extension
    const workflow = { a_galaxy_workflow: "true", steps: {} };
    const wfPath = join(ctx.tmpDir, "malformed.ga");
    await writeFile(wfPath, JSON.stringify(workflow));
    await runLint(wfPath, { skipStateValidation: true, json: true });

    const output = ctx.logSpy.mock.calls[0][0];
    const report: SingleLintReport = JSON.parse(output);
    expect(report.structure_errors.length).toBeGreaterThan(0);
  });

  it("--json includes encoding_errors for legacy-encoded tool_state", async () => {
    await seedAllTools(ctx.tmpDir);
    const workflow = {
      a_galaxy_workflow: "true",
      "format-version": "0.1",
      steps: {
        "0": {
          id: 0,
          type: "tool",
          tool_id: COND_TOOL_ID,
          tool_version: "1.0",
          // Legacy encoding: conditional "mode" is a JSON string instead of an object
          tool_state: JSON.stringify({ mode: '{"selector": false}' }),
          input_connections: {},
          workflow_outputs: [{ label: "out", output_name: "output" }],
        },
      },
    };
    const wfPath = join(ctx.tmpDir, "legacy-lint.ga");
    await writeFile(wfPath, JSON.stringify(workflow));
    await runLint(wfPath, { cacheDir: ctx.tmpDir, json: true });

    const output = ctx.logSpy.mock.calls[0][0];
    const report: SingleLintReport = JSON.parse(output);
    expect(report.encoding_errors.length).toBeGreaterThan(0);
    expect(report.encoding_errors[0]).toContain("legacy parameter encoding");
    expect(report.encoding_errors[0]).toContain("mode");
  });
});
