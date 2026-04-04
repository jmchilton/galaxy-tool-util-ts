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
  it("lints multiple workflows, reports summary", async () => {
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
    expect(report.summary.total).toBe(2);
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
    // With best practices skipped, only structural warnings remain (e.g. "no outputs")
    // Best practice warnings (annotation, creator, license) should not appear
    const allResults = report.results.filter((r: any) => "report" in r);
    for (const r of allResults) {
      expect(r.report.bestPractices).toBeNull();
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
});
