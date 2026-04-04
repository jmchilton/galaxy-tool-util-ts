/**
 * Tests for `gxwf convert-tree`.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFile, mkdir, readFile, access } from "node:fs/promises";
import { join } from "node:path";
import * as YAML from "yaml";
import { runConvertTree } from "../src/commands/convert-tree.js";
import { createCliTestContext, type CliTestContext } from "./helpers/cli-test-context.js";

let ctx: CliTestContext;

beforeEach(async () => {
  ctx = await createCliTestContext("cvt-test");
});

afterEach(async () => {
  await ctx.cleanup();
});

const NATIVE_WF = JSON.stringify({
  a_galaxy_workflow: "true",
  "format-version": "0.1",
  name: "Test Native",
  steps: {
    "0": {
      id: 0,
      type: "data_input",
      label: "Input",
      tool_id: null,
    },
  },
});

const FORMAT2_WF = YAML.stringify({
  class: "GalaxyWorkflow",
  label: "Test Format2",
  steps: [],
});

describe("convert-tree", () => {
  it("requires --output-dir", async () => {
    const wfDir = join(ctx.tmpDir, "wfs");
    await mkdir(wfDir);
    await writeFile(join(wfDir, "wf.ga"), NATIVE_WF);

    await runConvertTree(wfDir, {});

    const errOutput = ctx.errSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(errOutput).toContain("--output-dir is required");
    expect(process.exitCode).toBe(1);
  });

  it("converts native to format2", async () => {
    const wfDir = join(ctx.tmpDir, "wfs");
    await mkdir(wfDir);
    const outDir = join(ctx.tmpDir, "out");

    await writeFile(join(wfDir, "wf.ga"), NATIVE_WF);

    await runConvertTree(wfDir, { to: "format2", outputDir: outDir });

    // Output should be .gxwf.yml
    const outFile = join(outDir, "wf.gxwf.yml");
    const content = await readFile(outFile, "utf-8");
    const parsed = YAML.parse(content);
    expect(parsed.class).toBe("GalaxyWorkflow");
    expect(process.exitCode).toBe(0);
  });

  it("converts format2 to native", async () => {
    const wfDir = join(ctx.tmpDir, "wfs");
    await mkdir(wfDir);
    const outDir = join(ctx.tmpDir, "out");

    await writeFile(join(wfDir, "wf.gxwf.yml"), FORMAT2_WF);

    await runConvertTree(wfDir, { to: "native", outputDir: outDir });

    const outFile = join(outDir, "wf.ga");
    const content = await readFile(outFile, "utf-8");
    const parsed = JSON.parse(content);
    expect(parsed.a_galaxy_workflow).toBe("true");
  });

  it("mirrors subdirectory structure", async () => {
    const wfDir = join(ctx.tmpDir, "wfs");
    const sub = join(wfDir, "nested");
    await mkdir(sub, { recursive: true });
    const outDir = join(ctx.tmpDir, "out");

    await writeFile(join(sub, "deep.ga"), NATIVE_WF);

    await runConvertTree(wfDir, { to: "format2", outputDir: outDir });

    const outFile = join(outDir, "nested", "deep.gxwf.yml");
    await expect(access(outFile)).resolves.toBeUndefined();
  });

  it("--json outputs structured report", async () => {
    const wfDir = join(ctx.tmpDir, "wfs");
    await mkdir(wfDir);
    const outDir = join(ctx.tmpDir, "out");

    await writeFile(join(wfDir, "wf.ga"), NATIVE_WF);

    await runConvertTree(wfDir, { to: "format2", outputDir: outDir, reportJson: true });

    const output = ctx.logSpy.mock.calls.map((c) => c[0]).join("");
    const report = JSON.parse(output);
    expect(report.summary.total).toBe(1);
    expect(report.results[0].sourceFormat).toBe("native");
    expect(report.results[0].targetFormat).toBe("format2");
  });

  it("auto-infers target format (opposite of source)", async () => {
    const wfDir = join(ctx.tmpDir, "wfs");
    await mkdir(wfDir);
    const outDir = join(ctx.tmpDir, "out");

    await writeFile(join(wfDir, "wf.ga"), NATIVE_WF);
    await writeFile(join(wfDir, "wf.gxwf.yml"), FORMAT2_WF);

    await runConvertTree(wfDir, { outputDir: outDir, reportJson: true });

    const output = ctx.logSpy.mock.calls.map((c) => c[0]).join("");
    const report = JSON.parse(output);
    expect(report.summary.total).toBe(2);
    // native→format2 and format2→native
    const formats = report.results.map((r: any) => `${r.sourceFormat}→${r.targetFormat}`);
    expect(formats).toContain("native→format2");
    expect(formats).toContain("format2→native");
  });

  it("text output shows conversion direction", async () => {
    const wfDir = join(ctx.tmpDir, "wfs");
    await mkdir(wfDir);
    const outDir = join(ctx.tmpDir, "out");

    await writeFile(join(wfDir, "wf.ga"), NATIVE_WF);

    await runConvertTree(wfDir, { to: "format2", outputDir: outDir });

    const output = ctx.logSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("native → format2");
    expect(output).toContain("Summary:");
  });
});
