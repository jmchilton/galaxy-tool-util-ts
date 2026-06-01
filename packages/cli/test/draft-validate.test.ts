import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { copyFile, readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { runDraftValidate } from "../src/commands/draft-validate.js";
import type { SingleDraftValidationReport } from "@galaxy-tool-util/schema";
import { createCliTestContext, type CliTestContext } from "./helpers/cli-test-context.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(__dirname, "../../schema/test/fixtures/workflows/format2/draft");

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

describe("draft-validate (--concrete)", () => {
  let ctx: CliTestContext;

  beforeEach(async () => {
    ctx = await createCliTestContext("draft-validate-concrete");
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it("promotes a fully-concrete draft and decodes against GalaxyWorkflowSchema (text)", async () => {
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
    const wfPath = join(ctx.tmpDir, "concrete-draft.gxwf.yml");
    await writeFile(wfPath, wf);
    await runDraftValidate(wfPath, { concrete: true });

    const out = joined(ctx.logSpy);
    expect(out).toContain("Concrete: OK");
    expect(process.exitCode).toBe(0);
  });

  it("drops drafty steps then concrete-decodes the trimmed remainder", async () => {
    // The TODO step is dropped during extract; the surviving `cat` step is
    // concrete. Promote flips the class and decode passes.
    const wf = `class: GalaxyWorkflowDraft
inputs:
  reads:
    type: data
outputs:
  out:
    outputSource: cat/out_file1
steps:
  drafty:
    tool_id: TODO_pick_tool
    tool_version: "1.0.0"
    in:
      input1: reads
    out:
      - id: out
  cat:
    tool_id: cat1
    tool_version: "1.0.0"
    in:
      input1: reads
    out:
      - id: out_file1
`;
    const wfPath = join(ctx.tmpDir, "partial-drafty.gxwf.yml");
    await writeFile(wfPath, wf);
    await runDraftValidate(wfPath, { json: true, concrete: true });

    const report = JSON.parse(joined(ctx.logSpy)) as SingleDraftValidationReport;
    expect(report.concrete?.class_after).toBe("GalaxyWorkflow");
    expect(report.concrete?.ok).toBe(true);
  });

  it("--concrete JSON report carries the concrete field", async () => {
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
    in:
      input1: reads
    out:
      - id: out_file1
`;
    const wfPath = join(ctx.tmpDir, "concrete.gxwf.yml");
    await writeFile(wfPath, wf);
    await runDraftValidate(wfPath, { json: true, concrete: true });

    const report = JSON.parse(joined(ctx.logSpy)) as SingleDraftValidationReport;
    expect(report.concrete).toBeDefined();
    expect(report.concrete?.class_after).toBe("GalaxyWorkflow");
    expect(report.concrete?.skipped_reason).toBeNull();
    expect(report.concrete?.structure_errors).toEqual([]);
    expect(report.concrete?.ok).toBe(true);
    expect(process.exitCode).toBe(0);
  });

  it("omits the concrete field when --concrete is not passed", async () => {
    const wfPath = await stagedFixture(ctx, "synthetic-draft-tool-step.gxwf.yml");
    await runDraftValidate(wfPath, { json: true });
    const report = JSON.parse(joined(ctx.logSpy)) as SingleDraftValidationReport;
    expect(report.concrete).toBeUndefined();
  });

  it("--no-tool-state omits the tool_state bucket from the concrete report", async () => {
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
    in:
      input1: reads
    out:
      - id: out_file1
`;
    const wfPath = join(ctx.tmpDir, "no-toolstate.gxwf.yml");
    await writeFile(wfPath, wf);
    await runDraftValidate(wfPath, { json: true, concrete: true, toolState: false });

    const report = JSON.parse(joined(ctx.logSpy)) as SingleDraftValidationReport;
    expect(report.concrete?.tool_state).toBeUndefined();
    expect(report.concrete?.ok).toBe(true);
    expect(process.exitCode).toBe(0);
  });

  it("default --concrete runs tool-state validation (skip when cache empty)", async () => {
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
    in:
      input1: reads
    out:
      - id: out_file1
`;
    const wfPath = join(ctx.tmpDir, "with-toolstate.gxwf.yml");
    await writeFile(wfPath, wf);
    // Point at an empty cache dir so we exercise the tool-state loop without
    // depending on a particular tool being cached locally.
    await runDraftValidate(wfPath, {
      json: true,
      concrete: true,
      cacheDir: join(ctx.tmpDir, "empty-cache"),
    });

    const report = JSON.parse(joined(ctx.logSpy)) as SingleDraftValidationReport;
    expect(report.concrete?.tool_state).toBeDefined();
    expect(report.concrete?.tool_state?.results.length).toBe(1);
    // Empty cache → skip_tool_not_found, not a fail. Exit code stays 0.
    expect(report.concrete?.tool_state?.summary.skip).toBe(1);
    expect(report.concrete?.tool_state?.summary.fail).toBe(0);
    expect(process.exitCode).toBe(0);
  });

  it("--strict-state escalates skipped tool-state steps to errors (exit 1)", async () => {
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
    in:
      input1: reads
    out:
      - id: out_file1
`;
    const wfPath = join(ctx.tmpDir, "strict-state.gxwf.yml");
    await writeFile(wfPath, wf);
    await runDraftValidate(wfPath, {
      json: true,
      concrete: true,
      strictState: true,
      cacheDir: join(ctx.tmpDir, "empty-cache"),
    });

    const report = JSON.parse(joined(ctx.logSpy)) as SingleDraftValidationReport;
    expect(report.concrete?.strict_state_errors?.length).toBeGreaterThan(0);
    expect(report.concrete?.ok).toBe(false);
    expect(process.exitCode).toBe(1);
  });

  it("--connections populates connection_report on the concrete subset", async () => {
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
    in:
      input1: reads
    out:
      - id: out_file1
`;
    const wfPath = join(ctx.tmpDir, "conn.gxwf.yml");
    await writeFile(wfPath, wf);
    await runDraftValidate(wfPath, {
      json: true,
      concrete: true,
      connections: true,
      cacheDir: join(ctx.tmpDir, "empty-cache"),
    });

    const report = JSON.parse(joined(ctx.logSpy)) as SingleDraftValidationReport;
    expect(report.concrete?.connection_report).toBeDefined();
  });

  it("warns when --strict-* is passed without --concrete and silently no-ops", async () => {
    const wfPath = await stagedFixture(ctx, "synthetic-draft-tool-step.gxwf.yml");
    await runDraftValidate(wfPath, { strictStructure: true });

    const err = joined(ctx.errSpy);
    expect(err).toMatch(/--strict\*.*only apply with --concrete/);
    expect(process.exitCode).toBe(0);
  });

  it("warns when --no-tool-state + --strict-state are combined under --concrete", async () => {
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
    in:
      input1: reads
    out:
      - id: out_file1
`;
    const wfPath = join(ctx.tmpDir, "ts-ss.gxwf.yml");
    await writeFile(wfPath, wf);
    await runDraftValidate(wfPath, { concrete: true, toolState: false, strictState: true });

    const err = joined(ctx.errSpy);
    expect(err).toMatch(/--strict-state.*no effect/);
  });

  it("skips concrete pass when draft has structure errors (does not mutate input)", async () => {
    // class: GalaxyWorkflow → draft-validate flags this as a structure error
    // and exits 2. The concrete pass must NOT run (it would early-return
    // extract.workflow === data and stripPlanFields would mutate the input).
    const wf = `class: GalaxyWorkflow
inputs: []
outputs: []
steps:
  s:
    tool_id: cat1
    tool_version: "1.0.0"
    _plan_context: must not be stripped
`;
    const wfPath = join(ctx.tmpDir, "non-draft.gxwf.yml");
    await writeFile(wfPath, wf);
    await runDraftValidate(wfPath, { json: true, concrete: true });

    const report = JSON.parse(joined(ctx.logSpy)) as SingleDraftValidationReport;
    expect(report.concrete).toBeUndefined();
    expect(process.exitCode).toBe(2);
  });

  it("--concrete + --report-markdown renders a Concrete Subset section", async () => {
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
    in:
      input1: reads
    out:
      - id: out_file1
`;
    const wfPath = join(ctx.tmpDir, "concrete.gxwf.yml");
    await writeFile(wfPath, wf);
    const mdPath = join(ctx.tmpDir, "report.md");
    await runDraftValidate(wfPath, { concrete: true, reportMarkdown: mdPath });

    const md = await readFile(mdPath, "utf-8");
    expect(md).toContain("## Concrete Subset Validation");
    expect(md).toContain("Class after extract: `GalaxyWorkflow`");
    expect(md).toContain("Status: OK");
    expect(process.exitCode).toBe(0);
  });
});
