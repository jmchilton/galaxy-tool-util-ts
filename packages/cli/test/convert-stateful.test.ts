import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import * as YAML from "yaml";

import { runConvert } from "../src/commands/convert.js";
import { runConvertTree } from "../src/commands/convert-tree.js";
import { createCliTestContext, type CliTestContext } from "./helpers/cli-test-context.js";
import { seedAllTools, SIMPLE_TOOL_ID } from "./helpers/fixtures.js";

/**
 * Native workflow using the seeded `simple_tool` (gx_text + gx_integer).
 * `num_lines` is stored as the string `"10"` — stateful conversion should
 * coerce it to the number `10` in format2 output.
 */
function buildNativeWorkflow(): Record<string, unknown> {
  return {
    a_galaxy_workflow: "true",
    "format-version": "0.1",
    name: "Stateful Convert Test",
    steps: {
      "0": {
        id: 0,
        type: "tool",
        label: "Simple Step",
        tool_id: SIMPLE_TOOL_ID,
        tool_version: "1.0",
        tool_state: JSON.stringify({
          input_text: "hello",
          num_lines: "10",
          __page__: 0,
          __rerun_remap_job_id__: null,
        }),
        input_connections: {},
      },
    },
  };
}

function getStepState(converted: Record<string, unknown>): Record<string, unknown> {
  const steps = converted.steps as Array<Record<string, unknown>>;
  expect(Array.isArray(steps)).toBe(true);
  const step = steps[0];
  return (step.state ?? step.tool_state) as Record<string, unknown>;
}

describe("gxwf convert --stateful", () => {
  let ctx: CliTestContext;

  beforeEach(async () => {
    ctx = await createCliTestContext("convert-stateful-test");
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it("coerces scalar types and strips stale keys with seeded cache", async () => {
    await seedAllTools(ctx.tmpDir);
    const wfPath = join(ctx.tmpDir, "native.ga");
    await writeFile(wfPath, JSON.stringify(buildNativeWorkflow()));

    await runConvert(wfPath, { stateful: true, cacheDir: ctx.tmpDir });

    const output = ctx.stdoutSpy.mock.calls.map((c) => c[0]).join("");
    const converted = YAML.parse(output);
    const state = getStepState(converted);

    // gx_integer coerced string → number
    expect(state.num_lines).toBe(10);
    // gx_text passthrough
    expect(state.input_text).toBe("hello");
    // Stale bookkeeping keys stripped
    expect(state.__page__).toBeUndefined();
    expect(state.__rerun_remap_job_id__).toBeUndefined();
    // Clean conversion — exit code 0
    expect(process.exitCode).toBeFalsy();
  });

  it("schema-free mode preserves tool_state as-is (baseline for comparison)", async () => {
    const wfPath = join(ctx.tmpDir, "native.ga");
    await writeFile(wfPath, JSON.stringify(buildNativeWorkflow()));

    await runConvert(wfPath, {});

    const output = ctx.stdoutSpy.mock.calls.map((c) => c[0]).join("");
    const converted = YAML.parse(output);
    const state = getStepState(converted);

    // Without stateful, num_lines stays as a string
    expect(state.num_lines).toBe("10");
  });

  it("falls back gracefully when tool cache is empty", async () => {
    // Point at an empty tmp dir — no tools seeded
    const wfPath = join(ctx.tmpDir, "native.ga");
    await writeFile(wfPath, JSON.stringify(buildNativeWorkflow()));

    await runConvert(wfPath, { stateful: true, cacheDir: ctx.tmpDir });

    const errors = ctx.errSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(errors).toContain("fell back");
    // Reporter tags the failure class
    expect(errors).toContain("unknown_tool");
    expect(errors).toContain("fallback breakdown:");
    // Exit code 1 when any step fell back
    expect(process.exitCode).toBe(1);
  });

  it("reports precheck failure class when tool_state has ${...} interpolation", async () => {
    await seedAllTools(ctx.tmpDir);
    const wfPath = join(ctx.tmpDir, "native.ga");
    // Replace num_lines with a replacement-param reference
    const wf = buildNativeWorkflow();
    const steps = wf.steps as Record<string, Record<string, unknown>>;
    steps["0"].tool_state = JSON.stringify({
      input_text: "hello",
      num_lines: "${threshold}",
    });
    await writeFile(wfPath, JSON.stringify(wf));

    await runConvert(wfPath, { stateful: true, cacheDir: ctx.tmpDir });

    const errors = ctx.errSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(errors).toContain("[precheck]");
    expect(errors).toContain("replacement");
    expect(process.exitCode).toBe(1);
  });
});

describe("gxwf convert-tree --stateful", () => {
  let ctx: CliTestContext;

  beforeEach(async () => {
    ctx = await createCliTestContext("convert-tree-stateful-test");
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it("processes all files and aggregates stateful status", async () => {
    await seedAllTools(ctx.tmpDir);
    const srcDir = join(ctx.tmpDir, "wfs");
    const outDir = join(ctx.tmpDir, "out");
    const { mkdir } = await import("node:fs/promises");
    await mkdir(srcDir, { recursive: true });

    await writeFile(join(srcDir, "a.ga"), JSON.stringify(buildNativeWorkflow()));
    await writeFile(join(srcDir, "b.ga"), JSON.stringify(buildNativeWorkflow()));

    await runConvertTree(srcDir, {
      outputDir: outDir,
      stateful: true,
      cacheDir: ctx.tmpDir,
    });

    const logs = ctx.logSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(logs).toContain("[stateful 1/1]");
    expect(logs).toContain("Stateful: 0 step(s) fell back");
    expect(process.exitCode).toBeFalsy();

    // Verify output file has coerced state
    const { readFile } = await import("node:fs/promises");
    const outPath = join(outDir, "a.gxwf.yml");
    const raw = await readFile(outPath, "utf-8");
    const converted = YAML.parse(raw);
    const state = getStepState(converted);
    expect(state.num_lines).toBe(10);
  });
});
