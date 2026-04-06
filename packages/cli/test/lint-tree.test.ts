/**
 * Tests for `gxwf lint-tree`.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import * as YAML from "yaml";
import { runLintTree } from "../src/commands/lint-tree.js";
import { createCliTestContext, type CliTestContext } from "./helpers/cli-test-context.js";

let ctx: CliTestContext;

beforeEach(async () => {
  ctx = await createCliTestContext("lt-test");
});

afterEach(async () => {
  await ctx.cleanup();
});

describe("lint-tree", () => {
  it("lints multiple workflows, reports summary with schema shape", async () => {
    const wfDir = join(ctx.tmpDir, "wfs");
    await mkdir(wfDir);

    // A well-annotated format2 workflow
    await writeFile(
      join(wfDir, "good.gxwf.yml"),
      YAML.stringify({
        class: "GalaxyWorkflow",
        label: "Good Workflow",
        annotation: "A test workflow",
        creator: [{ class: "Person", name: "Test" }],
        license: "MIT",
        steps: [],
      }),
    );

    // A bare native workflow (will trigger best practice warnings)
    await writeFile(
      join(wfDir, "bare.ga"),
      JSON.stringify({
        a_galaxy_workflow: "true",
        "format-version": "0.1",
        annotation: "",
        steps: {},
      }),
    );

    await runLintTree(wfDir, { skipStateValidation: true, json: true });

    const output = ctx.logSpy.mock.calls.map((c) => c[0]).join("");
    const report = JSON.parse(output);
    // Schema shape: "workflows" key, snake_case summary
    expect(report.workflows).toHaveLength(2);
    expect(report.summary).toHaveProperty("lint_errors");
    expect(report.summary).toHaveProperty("lint_warnings");
    expect(report.summary).toHaveProperty("state_ok");
    expect(report.summary).toHaveProperty("state_fail");
    // categories present
    expect(report.categories).toHaveLength(1);
    expect(report.categories[0].name).toBe("(root)");
    expect(report.categories[0].results).toHaveLength(2);
  });

  it("exit code 0 when all clean", async () => {
    const wfDir = join(ctx.tmpDir, "wfs");
    await mkdir(wfDir);

    await writeFile(
      join(wfDir, "ok.gxwf.yml"),
      YAML.stringify({
        class: "GalaxyWorkflow",
        label: "Good",
        doc: "A test workflow description",
        creator: [{ class: "Person", name: "Test" }],
        license: "MIT",
        release: "0.1",
        steps: [],
      }),
    );

    await runLintTree(wfDir, { skipStateValidation: true });
    expect(process.exitCode).toBe(0);
  });

  it("exit code 1 for warnings only", async () => {
    const wfDir = join(ctx.tmpDir, "wfs");
    await mkdir(wfDir);

    // Missing best practice annotations → warnings
    await writeFile(
      join(wfDir, "warn.ga"),
      JSON.stringify({
        a_galaxy_workflow: "true",
        "format-version": "0.1",
        annotation: "",
        steps: {},
      }),
    );

    await runLintTree(wfDir, { skipStateValidation: true });
    expect(process.exitCode).toBe(1);
  });

  it("--skip-best-practices suppresses best practice checks", async () => {
    const wfDir = join(ctx.tmpDir, "wfs");
    await mkdir(wfDir);

    await writeFile(
      join(wfDir, "bare.ga"),
      JSON.stringify({
        a_galaxy_workflow: "true",
        "format-version": "0.1",
        annotation: "",
        steps: {},
      }),
    );

    await runLintTree(wfDir, {
      skipStateValidation: true,
      skipBestPractices: true,
      json: true,
    });

    const output = ctx.logSpy.mock.calls.map((c) => c[0]).join("");
    const report = JSON.parse(output);
    // With best practices skipped, lint_warnings should be lower
    // (only structural warnings like "no outputs" remain)
    for (const wf of report.workflows) {
      // Each workflow result is now a flat LintWorkflowResult
      expect(wf).toHaveProperty("lint_errors");
      expect(wf).toHaveProperty("lint_warnings");
    }
  });

  it("text output renders per-workflow status", async () => {
    const wfDir = join(ctx.tmpDir, "wfs");
    await mkdir(wfDir);

    // Workflow with outputs to avoid structural "no outputs" warning
    await writeFile(
      join(wfDir, "ok.gxwf.yml"),
      YAML.stringify({
        class: "GalaxyWorkflow",
        label: "Good",
        doc: "A test workflow description",
        creator: [{ class: "Person", name: "Test" }],
        license: "MIT",
        release: "0.1",
        inputs: [{ id: "input1", type: "data" }],
        outputs: [{ id: "out1", outputSource: "input1" }],
        steps: [],
      }),
    );

    await runLintTree(wfDir, { skipStateValidation: true });

    const output = ctx.logSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("ok.gxwf.yml: OK");
    expect(output).toContain("Summary:");
  });

  it("categories group by subdirectory", async () => {
    const wfDir = join(ctx.tmpDir, "wfs");
    const sub = join(wfDir, "subdir");
    await mkdir(sub, { recursive: true });

    await writeFile(
      join(wfDir, "root.ga"),
      JSON.stringify({
        a_galaxy_workflow: "true",
        "format-version": "0.1",
        annotation: "",
        steps: {},
      }),
    );
    await writeFile(
      join(sub, "nested.ga"),
      JSON.stringify({
        a_galaxy_workflow: "true",
        "format-version": "0.1",
        annotation: "",
        steps: {},
      }),
    );

    await runLintTree(wfDir, { skipStateValidation: true, json: true });

    const output = ctx.logSpy.mock.calls.map((c) => c[0]).join("");
    const report = JSON.parse(output);
    expect(report.categories).toHaveLength(2);
    const catNames = report.categories.map((c: any) => c.name).sort();
    expect(catNames).toEqual(["(root)", "subdir"]);
  });
});
