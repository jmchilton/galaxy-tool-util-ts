/**
 * Tests for `gxwf clean-tree`.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { runCleanTree } from "../src/commands/clean-tree.js";
import { createCliTestContext, type CliTestContext } from "./helpers/cli-test-context.js";

let ctx: CliTestContext;

beforeEach(async () => {
  ctx = await createCliTestContext("ct-test");
});

afterEach(async () => {
  await ctx.cleanup();
});

function nativeWfWithStaleKeys(): string {
  return JSON.stringify({
    a_galaxy_workflow: "true",
    "format-version": "0.1",
    steps: {
      "0": {
        id: 0,
        type: "tool",
        tool_id: "cat1",
        tool_version: "1.0",
        // tool_state with stale bookkeeping/runtime keys that cleanWorkflow strips
        tool_state: JSON.stringify({
          input1: "test",
          __page__: 0,
          __rerun_remap_job_id__: null,
          chromInfo: "/path/to/chrom",
        }),
        input_connections: {},
      },
    },
  });
}

function cleanNativeWf(): string {
  return JSON.stringify({
    a_galaxy_workflow: "true",
    "format-version": "0.1",
    steps: {},
  });
}

describe("clean-tree", () => {
  it("reports schema-shaped JSON with per-step results", async () => {
    const wfDir = join(ctx.tmpDir, "wfs");
    await mkdir(wfDir);

    await writeFile(join(wfDir, "dirty.ga"), nativeWfWithStaleKeys());
    await writeFile(join(wfDir, "clean.ga"), cleanNativeWf());

    await runCleanTree(wfDir, { json: true });

    const output = ctx.logSpy.mock.calls.map((c) => c[0]).join("");
    const report = JSON.parse(output);
    // Schema shape: "workflows" key
    expect(report.workflows).toHaveLength(2);
    // Summary uses schema fields
    expect(report.summary).toHaveProperty("affected");
    expect(report.summary).toHaveProperty("clean");
    expect(report.summary).toHaveProperty("total_keys");
    expect(report.summary.affected).toBeGreaterThanOrEqual(1);
    // categories present
    expect(report.categories).toHaveLength(1);
    expect(report.categories[0].name).toBe("(root)");
    // Dirty workflow has per-step clean results
    const dirty = report.workflows.find((w: any) => w.path === "dirty.ga");
    expect(dirty).toBeDefined();
    expect(dirty.total_removed).toBeGreaterThan(0);
    expect(dirty.results).toHaveLength(1);
    expect(dirty.results[0].removed_keys.length).toBeGreaterThan(0);
  });

  it("writes cleaned files to --output-dir mirroring tree", async () => {
    const wfDir = join(ctx.tmpDir, "wfs");
    const sub = join(wfDir, "nested");
    await mkdir(sub, { recursive: true });
    const outDir = join(ctx.tmpDir, "out");

    await writeFile(join(wfDir, "root.ga"), nativeWfWithStaleKeys());
    await writeFile(join(sub, "deep.ga"), nativeWfWithStaleKeys());

    await runCleanTree(wfDir, { outputDir: outDir });

    // Verify output files exist in mirrored structure
    const rootOut = await readFile(join(outDir, "root.ga"), "utf-8");
    expect(rootOut).toBeTruthy();
    const deepOut = await readFile(join(outDir, "nested", "deep.ga"), "utf-8");
    expect(deepOut).toBeTruthy();

    // cleanWorkflow decodes legacy JSON-encoded tool_state strings into objects
    // and strips stale bookkeeping keys — verify both behaviors
    const parsed = JSON.parse(rootOut);
    const step = parsed.steps?.["0"];
    if (step) {
      const state = step.tool_state;
      expect(state.input1).toBe("test");
      expect(state.__page__).toBeUndefined();
      expect(state.chromInfo).toBeUndefined();
    }
  });

  it("exit code 1 when workflows had stale keys", async () => {
    const wfDir = join(ctx.tmpDir, "wfs");
    await mkdir(wfDir);
    await writeFile(join(wfDir, "dirty.ga"), nativeWfWithStaleKeys());

    await runCleanTree(wfDir, {});
    expect(process.exitCode).toBe(1);
  });

  it("exit code 0 when no changes needed", async () => {
    const wfDir = join(ctx.tmpDir, "wfs");
    await mkdir(wfDir);
    await writeFile(join(wfDir, "clean.ga"), cleanNativeWf());

    await runCleanTree(wfDir, {});
    expect(process.exitCode).toBe(0);
  });

  it("text output shows per-file status", async () => {
    const wfDir = join(ctx.tmpDir, "wfs");
    await mkdir(wfDir);
    await writeFile(join(wfDir, "clean.ga"), cleanNativeWf());

    await runCleanTree(wfDir, {});

    const output = ctx.logSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("clean.ga: clean");
    expect(output).toContain("Summary:");
  });

  it("categories group nested directories", async () => {
    const wfDir = join(ctx.tmpDir, "wfs");
    const sub = join(wfDir, "nested");
    await mkdir(sub, { recursive: true });

    await writeFile(join(wfDir, "root.ga"), cleanNativeWf());
    await writeFile(join(sub, "deep.ga"), cleanNativeWf());

    await runCleanTree(wfDir, { json: true });

    const output = ctx.logSpy.mock.calls.map((c) => c[0]).join("");
    const report = JSON.parse(output);
    expect(report.categories).toHaveLength(2);
    const catNames = report.categories.map((c: any) => c.name).sort();
    expect(catNames).toEqual(["(root)", "nested"]);
  });
});
