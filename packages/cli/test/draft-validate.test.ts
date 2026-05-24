import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { copyFile, readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { runDraftValidate } from "../src/commands/draft-validate.js";
import type { SingleDraftValidationReport } from "@galaxy-tool-util/schema";
import { createCliTestContext, type CliTestContext } from "./helpers/cli-test-context.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(__dirname, "fixtures/draft");

async function stagedFixture(ctx: CliTestContext, name: string): Promise<string> {
  const dest = join(ctx.tmpDir, name);
  await copyFile(join(FIXTURE_DIR, name), dest);
  return dest;
}

function joined(spy: ReturnType<typeof import("vitest").vi.spyOn>): string {
  return spy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
}

describe("draft-validate (text mode)", () => {
  let ctx: CliTestContext;

  beforeEach(async () => {
    ctx = await createCliTestContext("draft-validate");
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it("passes on synthetic-draft-tool-step (exit 0, clean summary, survey line)", async () => {
    const wfPath = await stagedFixture(ctx, "synthetic-draft-tool-step.gxwf.yml");
    await runDraftValidate(wfPath, {});

    const out = joined(ctx.logSpy);
    expect(out).toContain("draft valid");
    expect(out).toContain(wfPath);
    expect(out).not.toContain("Structure errors");
    expect(out).not.toContain("Topology errors");
    expect(out).not.toContain("Semantic errors");
    // Survey line: plural sentinels + paths (fixture has 6 across 2), singular step with _plan_*.
    expect(out).toMatch(
      /Survey: 6 TODO sentinels across 2 step paths; 1 step with _plan_\* fields/,
    );
    expect(process.exitCode).toBe(0);
  });

  it("survey line pluralizes correctly for zero/one/many", async () => {
    const wf = `class: GalaxyWorkflowDraft
inputs:
  reads:
    type: data
outputs: {}
steps:
  one:
    tool_id: cat1
    tool_version: "1.0.0"
    in:
      input1: reads
    out:
      - id: out
`;
    const wfPath = join(ctx.tmpDir, "no-todos.gxwf.yml");
    await writeFile(wfPath, wf);
    await runDraftValidate(wfPath, {});
    const out = joined(ctx.logSpy);
    expect(out).toMatch(
      /Survey: 0 TODO sentinels across 0 step paths; 0 steps with _plan_\* fields/,
    );
  });

  it("reports topology error (label: TODO) → exit 1, cites the path", async () => {
    const wf = `class: GalaxyWorkflowDraft
inputs:
  reads:
    type: data
outputs: {}
steps:
  TODO:
    tool_id: cat1
    tool_version: "1.0.0"
`;
    const wfPath = join(ctx.tmpDir, "bad-label.gxwf.yml");
    await writeFile(wfPath, wf);
    await runDraftValidate(wfPath, {});

    const out = joined(ctx.logSpy);
    expect(out).toContain("Topology errors");
    expect(out).toMatch(/step label cannot be a TODO sentinel/);
    expect(process.exitCode).toBe(1);
  });

  it("rejects a GalaxyWorkflow (non-draft class) with exit 2 + class-mismatch diagnostic", async () => {
    const wf = `class: GalaxyWorkflow
label: not a draft
inputs: []
outputs: []
steps: []
`;
    const wfPath = join(ctx.tmpDir, "not-a-draft.gxwf.yml");
    await writeFile(wfPath, wf);
    await runDraftValidate(wfPath, {});

    const out = joined(ctx.logSpy);
    expect(out).toContain("Structure errors");
    expect(out).toMatch(/class must be "GalaxyWorkflowDraft"/);
    expect(process.exitCode).toBe(2);
  });

  it("exits 2 on parse failure (malformed YAML)", async () => {
    const wfPath = join(ctx.tmpDir, "broken.gxwf.yml");
    await writeFile(wfPath, "class: GalaxyWorkflowDraft\nsteps: [unterminated\n");
    await runDraftValidate(wfPath, {});

    expect(process.exitCode).toBe(2);
  });

  it("rejects --format native on a draft file with exit 2", async () => {
    const wfPath = await stagedFixture(ctx, "synthetic-draft-tool-step.gxwf.yml");
    await runDraftValidate(wfPath, { format: "native" });

    const err = joined(ctx.errSpy);
    expect(err).toContain("draft-validate requires format2");
    expect(process.exitCode).toBe(2);
  });

  it("surfaces top-level _plan_* warning without failing (warnings allowed at exit 0)", async () => {
    const wfPath = await stagedFixture(ctx, "synthetic-draft-plan-top-level.gxwf.yml");
    await runDraftValidate(wfPath, {});

    const out = joined(ctx.logSpy);
    expect(out).toContain("Warnings");
    expect(out).toMatch(/top-level `_plan_context`/);
    expect(process.exitCode).toBe(0);
  });
});

describe("draft-validate (--json)", () => {
  let ctx: CliTestContext;

  beforeEach(async () => {
    ctx = await createCliTestContext("draft-validate-json");
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  function parseJson(): SingleDraftValidationReport {
    return JSON.parse(joined(ctx.logSpy)) as SingleDraftValidationReport;
  }

  it("emits a SingleDraftValidationReport for a clean draft", async () => {
    const wfPath = await stagedFixture(ctx, "synthetic-draft-tool-step.gxwf.yml");
    await runDraftValidate(wfPath, { json: true });

    const report = parseJson();
    expect(report.workflow).toBe(wfPath);
    expect(report.ok).toBe(true);
    expect(report.structure_errors).toEqual([]);
    expect(report.topology_errors).toEqual([]);
    expect(report.semantic_errors).toEqual([]);
    expect(report.warnings).toEqual([]);
    expect(report.survey.is_draft).toBe(true);
    expect(report.survey.todo_count).toBeGreaterThan(0);
    expect(process.exitCode).toBe(0);
  });

  it("includes diagnostics + path arrays for topology errors", async () => {
    const wf = `class: GalaxyWorkflowDraft
inputs:
  reads:
    type: data
outputs:
  final:
    outputSource: missing/out
steps:
  a:
    tool_id: cat1
    tool_version: "1.0.0"
    in:
      input1: missing/out
    out:
      - id: out
`;
    const wfPath = join(ctx.tmpDir, "dangling.gxwf.yml");
    await writeFile(wfPath, wf);
    await runDraftValidate(wfPath, { json: true });

    const report = parseJson();
    expect(report.ok).toBe(false);
    expect(report.topology_errors.length).toBeGreaterThan(0);
    for (const diag of report.topology_errors) {
      expect(Array.isArray(diag.path)).toBe(true);
      expect(typeof diag.message).toBe("string");
    }
    expect(process.exitCode).toBe(1);
  });

  it("produces byte-identical JSON across two runs (determinism, subworkflow fixture)", async () => {
    // Use the subworkflow fixture so survey/path serialization actually has
    // structure to stress (nested draft step + _plan_* fields under run:).
    const wfPath = await stagedFixture(ctx, "synthetic-draft-plan-subworkflow.gxwf.yml");

    await runDraftValidate(wfPath, { json: true });
    const first = joined(ctx.logSpy);

    ctx.logSpy.mockClear();
    await runDraftValidate(wfPath, { json: true });
    const second = joined(ctx.logSpy);

    expect(first).toBe(second);
    // Sanity: the subworkflow fixture has at least one _plan_* step path so we
    // know the determinism check is exercising survey serialization, not an
    // empty object.
    const report = JSON.parse(first) as SingleDraftValidationReport;
    expect(report.survey.plan_step_paths.length).toBeGreaterThan(0);
  });

  it("rejects --json + --report-html (stdout) with exit 2 and a clear message", async () => {
    const wfPath = await stagedFixture(ctx, "synthetic-draft-tool-step.gxwf.yml");
    await runDraftValidate(wfPath, { json: true, reportHtml: true });

    const err = joined(ctx.errSpy);
    expect(err).toMatch(/--json.*--report-html/);
    expect(err).toContain("stdout");
    expect(process.exitCode).toBe(2);
  });
});

describe("draft-validate (rendered reports)", () => {
  let ctx: CliTestContext;

  beforeEach(async () => {
    ctx = await createCliTestContext("draft-validate-reports");
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it("--report-html writes a self-contained HTML page", async () => {
    const wfPath = await stagedFixture(ctx, "synthetic-draft-tool-step.gxwf.yml");
    const htmlPath = join(ctx.tmpDir, "report.html");
    await runDraftValidate(wfPath, { reportHtml: htmlPath });

    const html = await readFile(htmlPath, "utf-8");
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("draft-validate");
    expect(html).toContain(wfPath);
    expect(process.exitCode).toBe(0);
  });

  it("--report-markdown writes a Markdown report rendered from the j2 template", async () => {
    const wfPath = await stagedFixture(ctx, "synthetic-draft-tool-step.gxwf.yml");
    const mdPath = join(ctx.tmpDir, "report.md");
    await runDraftValidate(wfPath, { reportMarkdown: mdPath });

    const md = await readFile(mdPath, "utf-8");
    expect(md).toContain("# Draft Workflow Validation Report");
    expect(md).toContain(wfPath);
    expect(md).toContain("Status: OK");
    expect(process.exitCode).toBe(0);
  });

  it("--report-markdown surfaces topology errors in the rendered output", async () => {
    const wf = `class: GalaxyWorkflowDraft
inputs:
  reads:
    type: data
outputs: {}
steps:
  TODO:
    tool_id: cat1
    tool_version: "1.0.0"
`;
    const wfPath = join(ctx.tmpDir, "bad.gxwf.yml");
    await writeFile(wfPath, wf);
    const mdPath = join(ctx.tmpDir, "report.md");
    await runDraftValidate(wfPath, { reportMarkdown: mdPath });

    const md = await readFile(mdPath, "utf-8");
    expect(md).toContain("Status: FAIL");
    expect(md).toContain("## Topology Errors");
    expect(md).toMatch(/step label cannot be a TODO sentinel/);
    expect(process.exitCode).toBe(1);
  });
});
