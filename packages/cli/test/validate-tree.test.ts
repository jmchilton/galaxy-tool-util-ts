/**
 * Tests for `gxwf validate-tree`.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import * as YAML from "yaml";
import { runValidateTree } from "../src/commands/validate-tree.js";
import { createCliTestContext, type CliTestContext } from "./helpers/cli-test-context.js";
import { seedAllTools, SIMPLE_TOOL_ID } from "./helpers/fixtures.js";

let ctx: CliTestContext;

beforeEach(async () => {
  ctx = await createCliTestContext("vt-test");
});

afterEach(async () => {
  await ctx.cleanup();
});

function nativeWf(steps: Record<string, unknown> = {}): string {
  return JSON.stringify({
    a_galaxy_workflow: "true",
    "format-version": "0.1",
    steps,
  });
}

function format2Wf(steps: unknown[] = []): string {
  return YAML.stringify({ class: "GalaxyWorkflow", steps });
}

describe("validate-tree", () => {
  it("validates multiple native workflows", async () => {
    await seedAllTools(ctx.tmpDir);
    const wfDir = join(ctx.tmpDir, "wfs");
    await mkdir(wfDir);

    await writeFile(
      join(wfDir, "good.ga"),
      nativeWf({
        "0": {
          id: 0,
          type: "tool",
          tool_id: SIMPLE_TOOL_ID,
          tool_version: "1.0",
          tool_state: JSON.stringify({ input_text: "hi", num_lines: "5" }),
          input_connections: {},
        },
      }),
    );

    await writeFile(join(wfDir, "empty.ga"), nativeWf({}));

    await runValidateTree(wfDir, { cacheDir: ctx.tmpDir });
    expect(process.exitCode).toBe(0);
  });

  it("reports failures in --json mode with schema shape", async () => {
    await seedAllTools(ctx.tmpDir);
    const wfDir = join(ctx.tmpDir, "wfs");
    await mkdir(wfDir);

    // Workflow with invalid tool_state (missing required field)
    await writeFile(
      join(wfDir, "bad.ga"),
      nativeWf({
        "0": {
          id: 0,
          type: "tool",
          tool_id: SIMPLE_TOOL_ID,
          tool_version: "1.0",
          tool_state: JSON.stringify({ input_text: 42 }),
          input_connections: {},
        },
      }),
    );

    await runValidateTree(wfDir, { cacheDir: ctx.tmpDir, json: true });

    const output = ctx.logSpy.mock.calls.map((c) => c[0]).join("");
    const report = JSON.parse(output);
    expect(report.root).toBe(wfDir);
    // Schema shape: "workflows" key, not "results"
    expect(report.workflows).toHaveLength(1);
    expect(report.workflows[0].path).toBe("bad.ga");
    expect(report.workflows[0].category).toBe("(root)");
    expect(report.workflows[0].name).toBe("bad.ga");
    // categories grouping present
    expect(report.categories).toHaveLength(1);
    expect(report.categories[0].name).toBe("(root)");
    // snake_case summary
    expect(report.summary).toHaveProperty("ok");
    expect(report.summary).toHaveProperty("fail");
    expect(report.summary).toHaveProperty("skip");
  });

  it("discovers workflows in subdirectories with category grouping", async () => {
    const wfDir = join(ctx.tmpDir, "wfs");
    const sub = join(wfDir, "nested");
    await mkdir(sub, { recursive: true });

    await writeFile(join(wfDir, "root.ga"), nativeWf({}));
    await writeFile(join(sub, "deep.ga"), nativeWf({}));

    await runValidateTree(wfDir, { toolState: false, json: true });

    const output = ctx.logSpy.mock.calls.map((c) => c[0]).join("");
    const report = JSON.parse(output);
    expect(report.workflows).toHaveLength(2);
    // Two categories: "(root)" and "nested"
    expect(report.categories).toHaveLength(2);
    const catNames = report.categories.map((c: any) => c.name).sort();
    expect(catNames).toEqual(["(root)", "nested"]);
    // Each category has one workflow
    for (const cat of report.categories) {
      expect(cat.results).toHaveLength(1);
    }
  });

  it("handles format2 workflows", async () => {
    await seedAllTools(ctx.tmpDir);
    const wfDir = join(ctx.tmpDir, "wfs");
    await mkdir(wfDir);

    await writeFile(
      join(wfDir, "f2.gxwf.yml"),
      format2Wf([
        {
          tool_id: SIMPLE_TOOL_ID,
          tool_version: "1.0",
          state: { input_text: "hello", num_lines: 5 },
          in: [],
        },
      ]),
    );

    await runValidateTree(wfDir, { cacheDir: ctx.tmpDir });
    expect(process.exitCode).toBe(0);
  });

  it("skips tool state when --no-tool-state", async () => {
    const wfDir = join(ctx.tmpDir, "wfs");
    await mkdir(wfDir);
    await writeFile(join(wfDir, "wf.ga"), nativeWf({}));

    await runValidateTree(wfDir, { toolState: false, json: true });

    const output = ctx.logSpy.mock.calls.map((c) => c[0]).join("");
    const report = JSON.parse(output);
    expect(report.summary.ok).toBe(0);
    expect(report.summary.fail).toBe(0);
  });
});
