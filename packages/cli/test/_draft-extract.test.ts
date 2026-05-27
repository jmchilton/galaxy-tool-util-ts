import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { copyFile, readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import * as S from "effect/Schema";

import { runDraftExtract } from "../src/commands/_draft-extract.js";
import { buildGxwfProgram } from "../src/programs/gxwf.js";
import type { SingleDraftExtractReport } from "@galaxy-tool-util/schema";
import { GalaxyWorkflowSchema } from "@galaxy-tool-util/schema";
import { createCliTestContext, type CliTestContext } from "./helpers/cli-test-context.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(__dirname, "../../schema/test/fixtures/workflows/format2/draft");

async function stagedFixture(ctx: CliTestContext, name: string): Promise<string> {
  const dest = join(ctx.tmpDir, name);
  await copyFile(join(FIXTURE_DIR, name), dest);
  return dest;
}

function joinedStdout(ctx: CliTestContext): string {
  return ctx.stdoutSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("");
}

function joinedLog(ctx: CliTestContext): string {
  return ctx.logSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
}

function joinedErr(ctx: CliTestContext): string {
  return ctx.errSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
}

describe("_draft-extract (happy path)", () => {
  let ctx: CliTestContext;

  beforeEach(async () => {
    ctx = await createCliTestContext("draft-extract");
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it("trims _plan_* + promotes class on a fully-concrete-but-still-draft fixture", async () => {
    // Draft document whose only "draft" content is planning context — the
    // step itself is concrete. Extract is a no-op; strip removes the
    // _plan_*; promote flips the class.
    const wf = `class: GalaxyWorkflowDraft
inputs:
  reads:
    type: data
outputs:
  out:
    outputSource: cat/out_file1
steps:
  cat:
    tool_id: cat1
    tool_version: "1.0.0"
    label: cat
    in:
      input1: reads
    out:
      - id: out_file1
    _plan_context: planning notes that should be stripped
`;
    const wfPath = join(ctx.tmpDir, "concrete-draft.gxwf.yml");
    await writeFile(wfPath, wf);
    await runDraftExtract(wfPath, {});

    const out = joinedStdout(ctx);
    expect(out).toContain("class: GalaxyWorkflow");
    expect(out).not.toContain("_plan_context");
    expect(out).not.toContain("GalaxyWorkflowDraft");
    expect(process.exitCode).toBe(0);
  });

  it("cascade case: drops the drafty step + the cascaded step + the dangling output", async () => {
    const wf = `class: GalaxyWorkflowDraft
inputs:
  reads:
    type: data
outputs:
  final:
    outputSource: downstream/o
steps:
  drafty:
    tool_id: TODO
    tool_version: "1.0.0"
    in:
      input1: reads
    out:
      - id: o
  downstream:
    tool_id: cat1
    tool_version: "1.0.0"
    in:
      input1: drafty/o
    out:
      - id: o
`;
    const wfPath = join(ctx.tmpDir, "cascade.gxwf.yml");
    await writeFile(wfPath, wf);
    const reportPath = join(ctx.tmpDir, "report.json");
    await runDraftExtract(wfPath, { reportJson: reportPath });

    const out = joinedStdout(ctx);
    const trimmed = parseYaml(out) as { steps?: Record<string, unknown> };
    expect(Object.keys(trimmed.steps ?? {})).toHaveLength(0);

    const report = JSON.parse(await readFile(reportPath, "utf-8")) as SingleDraftExtractReport;
    const reasons = report.dropped_steps.map((d) => d.reason.kind);
    expect(reasons).toContain("step_has_todo");
    expect(reasons).toContain("cascade");
    expect(report.dropped_outputs.map((d) => d.label)).toContain("final");
    expect(process.exitCode).toBe(0);
  });

  it("B test-9 cross-check: promoted output decodes against GalaxyWorkflowSchema", async () => {
    const wf = `class: GalaxyWorkflowDraft
inputs:
  reads:
    type: data
outputs:
  out:
    outputSource: cat/out_file1
steps:
  cat:
    tool_id: cat1
    tool_version: "1.0.0"
    label: cat
    in:
      input1: reads
    out:
      - id: out_file1
`;
    const wfPath = join(ctx.tmpDir, "ready.gxwf.yml");
    await writeFile(wfPath, wf);
    const outPath = join(ctx.tmpDir, "out.gxwf.yml");
    await runDraftExtract(wfPath, { output: outPath });

    const written = await readFile(outPath, "utf-8");
    const decoded = parseYaml(written) as Record<string, unknown>;
    expect(decoded.class).toBe("GalaxyWorkflow");
    // Must validate against the concrete-workflow schema — that's the
    // promise the class flip makes.
    expect(() => S.decodeUnknownSync(GalaxyWorkflowSchema)(decoded)).not.toThrow();
    expect(process.exitCode).toBe(0);
  });

  it("empty extract: every step drafty → empty steps, draft class preserved, exit 0", async () => {
    const wf = `class: GalaxyWorkflowDraft
inputs:
  reads:
    type: data
outputs: {}
steps:
  a:
    tool_id: TODO
    tool_version: "1.0.0"
    in:
      input1: reads
  b:
    tool_id: TODO
    tool_version: "1.0.0"
    in:
      input1: reads
`;
    const wfPath = join(ctx.tmpDir, "all-drafty.gxwf.yml");
    await writeFile(wfPath, wf);
    const reportPath = join(ctx.tmpDir, "report.json");
    await runDraftExtract(wfPath, { reportJson: reportPath });

    const out = joinedStdout(ctx);
    const trimmed = parseYaml(out) as { class: string; steps?: Record<string, unknown> };
    // Workflow ends up with no steps — promote fires (zero TODOs, zero _plan_*).
    expect(trimmed.class).toBe("GalaxyWorkflow");
    expect(Object.keys(trimmed.steps ?? {})).toHaveLength(0);

    const report = JSON.parse(await readFile(reportPath, "utf-8")) as SingleDraftExtractReport;
    expect(report.dropped_steps.length).toBe(2);
    expect(process.exitCode).toBe(0);
  });

  it("--report-json writes a valid SingleDraftExtractReport to file", async () => {
    const wfPath = await stagedFixture(ctx, "synthetic-draft-tool-step.gxwf.yml");
    const reportPath = join(ctx.tmpDir, "report.json");
    const outPath = join(ctx.tmpDir, "out.gxwf.yml");
    await runDraftExtract(wfPath, { output: outPath, reportJson: reportPath });

    const text = await readFile(reportPath, "utf-8");
    const report = JSON.parse(text) as SingleDraftExtractReport;
    expect(report.workflow).toBe(wfPath);
    expect(report.output).toBe(outPath);
    expect(Array.isArray(report.dropped_steps)).toBe(true);
    expect(Array.isArray(report.dropped_outputs)).toBe(true);
    expect(Array.isArray(report.rewritten_step_inputs)).toBe(true);
    expect(Array.isArray(report.promoted_paths)).toBe(true);
    expect(typeof report.summary).toBe("string");
  });

  it("-o writes the trimmed workflow to a file (stdout silent)", async () => {
    const wfPath = await stagedFixture(ctx, "synthetic-draft-tool-step.gxwf.yml");
    const outPath = join(ctx.tmpDir, "trimmed.gxwf.yml");
    await runDraftExtract(wfPath, { output: outPath });

    const written = await readFile(outPath, "utf-8");
    expect(written).toContain("class:");
    // stdout shouldn't get the workflow content too
    expect(joinedStdout(ctx)).not.toContain("class:");
    expect(joinedLog(ctx)).toContain(outPath); // writeWorkflowOutput prints "<label> written to <path>"
  });

  it("native input is rejected with exit 2", async () => {
    const wf = JSON.stringify({
      a_galaxy_workflow: true,
      format_version: "0.1",
      steps: {},
    });
    const wfPath = join(ctx.tmpDir, "native.ga");
    await writeFile(wfPath, wf);
    await runDraftExtract(wfPath, {});

    expect(joinedErr(ctx)).toContain("_draft-extract requires format2");
    expect(process.exitCode).toBe(2);
  });

  it("malformed YAML exits 2", async () => {
    const wfPath = join(ctx.tmpDir, "broken.gxwf.yml");
    await writeFile(wfPath, "class: GalaxyWorkflowDraft\nsteps: [unterminated\n");
    await runDraftExtract(wfPath, {});
    expect(process.exitCode).toBe(2);
  });
});

describe("_draft-extract (stdout-sink collision)", () => {
  let ctx: CliTestContext;

  beforeEach(async () => {
    ctx = await createCliTestContext("draft-extract-collision");
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it("rejects no -o + --report-json with no filename → exit 2, no artifacts on stdout", async () => {
    const wfPath = await stagedFixture(ctx, "synthetic-draft-tool-step.gxwf.yml");
    await runDraftExtract(wfPath, { reportJson: true });

    expect(joinedErr(ctx)).toMatch(/cannot write .*workflow output.*--report-json.*stdout/);
    expect(joinedStdout(ctx)).toBe(""); // workflow was never written
    expect(process.exitCode).toBe(2);
  });

  it("rejects no -o + --report-json '-' → exit 2", async () => {
    const wfPath = await stagedFixture(ctx, "synthetic-draft-tool-step.gxwf.yml");
    await runDraftExtract(wfPath, { reportJson: "-" });

    expect(joinedErr(ctx)).toMatch(/cannot write.*stdout/);
    expect(process.exitCode).toBe(2);
  });

  it("accepts -o file + --report-json to stdout", async () => {
    const wfPath = await stagedFixture(ctx, "synthetic-draft-tool-step.gxwf.yml");
    const outPath = join(ctx.tmpDir, "out.gxwf.yml");
    await runDraftExtract(wfPath, { output: outPath, reportJson: true });

    expect(joinedErr(ctx)).toBe("");
    expect(joinedLog(ctx)).toContain('"workflow":'); // report-json went to stdout via console.log
    expect(process.exitCode).toBe(0);
  });

  it("accepts no -o + --report-json file", async () => {
    const wfPath = await stagedFixture(ctx, "synthetic-draft-tool-step.gxwf.yml");
    const reportPath = join(ctx.tmpDir, "report.json");
    await runDraftExtract(wfPath, { reportJson: reportPath });

    expect(joinedErr(ctx)).toBe("");
    expect(joinedStdout(ctx)).toContain("class:");
    expect(process.exitCode).toBe(0);
  });
});

describe("_draft-extract (hidden command)", () => {
  it("does not appear in `gxwf --help`", () => {
    const program = buildGxwfProgram();
    const help = program.helpInformation();
    expect(help).not.toContain("_draft-extract");
    // sanity — other commands still show up
    expect(help).toContain("draft-validate");
  });
});
