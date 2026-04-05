import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

import { runRoundtrip } from "../src/commands/roundtrip.js";
import { runRoundtripTree } from "../src/commands/roundtrip-tree.js";
import { createCliTestContext, type CliTestContext } from "./helpers/cli-test-context.js";
import { seedAllTools, SIMPLE_TOOL_ID } from "./helpers/fixtures.js";

function buildNativeWorkflow(toolState: Record<string, unknown>): Record<string, unknown> {
  return {
    a_galaxy_workflow: "true",
    "format-version": "0.1",
    name: "Roundtrip Test",
    steps: {
      "0": {
        id: 0,
        type: "tool",
        label: "Simple Step",
        tool_id: SIMPLE_TOOL_ID,
        tool_version: "1.0",
        tool_state: JSON.stringify(toolState),
        input_connections: {},
      },
    },
  };
}

describe("gxwf roundtrip", () => {
  let ctx: CliTestContext;

  beforeEach(async () => {
    ctx = await createCliTestContext("roundtrip-test");
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it("clean roundtrip exits 0 with seeded cache and already-typed state", async () => {
    await seedAllTools(ctx.tmpDir);
    const wfPath = join(ctx.tmpDir, "native.ga");
    await writeFile(
      wfPath,
      JSON.stringify(buildNativeWorkflow({ input_text: "hello", num_lines: 10 })),
    );

    await runRoundtrip(wfPath, { cacheDir: ctx.tmpDir });

    expect(process.exitCode).toBe(0);
  });

  it("string-typed int yields benign diff or clean roundtrip (exit 0 or 1)", async () => {
    await seedAllTools(ctx.tmpDir);
    const wfPath = join(ctx.tmpDir, "native.ga");
    // num_lines: "10" — forward coerces to 10, reverse leaves as 10.
    // Original "10" vs reimported 10 — scalarsEquivalent makes this clean.
    await writeFile(
      wfPath,
      JSON.stringify(buildNativeWorkflow({ input_text: "hello", num_lines: "10" })),
    );

    await runRoundtrip(wfPath, { cacheDir: ctx.tmpDir });

    // Clean (0) or benign-only (1), but never failure (2)
    expect([0, 1]).toContain(process.exitCode);
  });

  it("stale bookkeeping keys are pre-cleaned → clean roundtrip (exit 0)", async () => {
    // Tool-aware pre-clean mirrors Galaxy's
    // roundtrip_validate(clean_stale=True) default: undeclared keys are
    // stripped from the original before diffing, so bookkeeping residue
    // never produces a benign diff at the CLI level. Exit code reflects
    // the clean verdict.
    await seedAllTools(ctx.tmpDir);
    const wfPath = join(ctx.tmpDir, "native.ga");
    await writeFile(
      wfPath,
      JSON.stringify(
        buildNativeWorkflow({
          input_text: "hello",
          num_lines: 10,
          __page__: 0,
          __rerun_remap_job_id__: null,
        }),
      ),
    );

    await runRoundtrip(wfPath, { cacheDir: ctx.tmpDir });

    expect(process.exitCode).toBe(0);
    const logs = ctx.logSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(logs).toMatch(/1\/1 step\(s\) ok/);
  });

  it("empty cache → conversion failure (exit 2)", async () => {
    const wfPath = join(ctx.tmpDir, "native.ga");
    await writeFile(wfPath, JSON.stringify(buildNativeWorkflow({ input_text: "x", num_lines: 1 })));

    await runRoundtrip(wfPath, { cacheDir: ctx.tmpDir });

    expect(process.exitCode).toBe(2);
  });

  it("--brief suppresses per-diff lines but keeps the summary", async () => {
    await seedAllTools(ctx.tmpDir);
    const wfPath = join(ctx.tmpDir, "native.ga");
    await writeFile(
      wfPath,
      JSON.stringify(
        buildNativeWorkflow({
          input_text: "hello",
          num_lines: 10,
          __rerun_remap_job_id__: null,
        }),
      ),
    );

    await runRoundtrip(wfPath, { cacheDir: ctx.tmpDir, brief: true });

    const logs = ctx.logSpy.mock.calls.map((c) => c[0]).join("\n");
    // Summary line still present
    expect(logs).toMatch(/step\(s\) ok/);
    // Diff detail lines (the `[benign:...]` rows) suppressed
    expect(logs).not.toMatch(/\[benign:/);
    expect(logs).not.toMatch(/\[ERROR\]/);
  });

  it("--errors-only suppresses the per-step detail block on clean roundtrips", async () => {
    // Pre-clean strips bookkeeping residue so this workflow roundtrips
    // cleanly; --errors-only then has nothing to show per-step (no diffs
    // of any severity). Verifies the flag is idempotent on clean files.
    await seedAllTools(ctx.tmpDir);
    const wfPath = join(ctx.tmpDir, "native.ga");
    await writeFile(
      wfPath,
      JSON.stringify(
        buildNativeWorkflow({
          input_text: "hello",
          num_lines: 10,
          __rerun_remap_job_id__: null,
        }),
      ),
    );

    await runRoundtrip(wfPath, { cacheDir: ctx.tmpDir, errorsOnly: true });

    // Clean verdict after pre-clean.
    expect(process.exitCode).toBe(0);
    const logs = ctx.logSpy.mock.calls.map((c) => c[0]).join("\n");
    // No diff rows should be printed under any severity.
    expect(logs).not.toMatch(/\[benign:/);
    expect(logs).not.toMatch(/\[ERROR\]/);
  });

  it("rejects format2 source", async () => {
    const wfPath = join(ctx.tmpDir, "wf.gxwf.yml");
    await writeFile(
      wfPath,
      "class: GalaxyWorkflow\nlabel: wf\ninputs: []\noutputs: []\nsteps: []\n",
    );

    await runRoundtrip(wfPath, { cacheDir: ctx.tmpDir });

    expect(process.exitCode).toBe(2);
    const errors = ctx.errSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(errors).toContain("native");
  });
});

describe("gxwf roundtrip-tree", () => {
  let ctx: CliTestContext;

  beforeEach(async () => {
    ctx = await createCliTestContext("roundtrip-tree-test");
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it("aggregates per-file results", async () => {
    await seedAllTools(ctx.tmpDir);
    const srcDir = join(ctx.tmpDir, "wfs");
    await mkdir(srcDir, { recursive: true });

    await writeFile(
      join(srcDir, "a.ga"),
      JSON.stringify(buildNativeWorkflow({ input_text: "a", num_lines: 1 })),
    );
    await writeFile(
      join(srcDir, "b.ga"),
      JSON.stringify(
        buildNativeWorkflow({
          input_text: "b",
          num_lines: 2,
          __rerun_remap_job_id__: null,
        }),
      ),
    );

    await runRoundtripTree(srcDir, { cacheDir: ctx.tmpDir });

    const logs = ctx.logSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(logs).toMatch(/Summary: 2 file\(s\)/);
    // Both files clean after pre-clean (b.ga's bookkeeping stripped) → exit 0.
    expect(process.exitCode).toBe(0);
  });

  it("--brief prints only the aggregate summary", async () => {
    await seedAllTools(ctx.tmpDir);
    const srcDir = join(ctx.tmpDir, "wfs");
    await mkdir(srcDir, { recursive: true });
    await writeFile(
      join(srcDir, "a.ga"),
      JSON.stringify(buildNativeWorkflow({ input_text: "a", num_lines: 1 })),
    );
    await writeFile(
      join(srcDir, "b.ga"),
      JSON.stringify(
        buildNativeWorkflow({
          input_text: "b",
          num_lines: 2,
          __rerun_remap_job_id__: null,
        }),
      ),
    );

    await runRoundtripTree(srcDir, { cacheDir: ctx.tmpDir, brief: true });

    const logs = ctx.logSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(logs).toMatch(/Summary: 2 file\(s\)/);
    // Per-file lines (the "  a.ga: clean (...)" rows) suppressed.
    expect(logs).not.toMatch(/a\.ga: (clean|benign|FAIL)/);
    expect(logs).not.toMatch(/b\.ga: (clean|benign|FAIL)/);
  });
});
