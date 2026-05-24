import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { copyFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { runDraftNextStep } from "../src/commands/draft-next-step.js";
import type { NextStepResult } from "@galaxy-tool-util/schema";
import { createCliTestContext, type CliTestContext } from "./helpers/cli-test-context.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(__dirname, "fixtures/draft");

async function stagedFixture(ctx: CliTestContext, name: string): Promise<string> {
  const dest = join(ctx.tmpDir, name);
  await copyFile(join(FIXTURE_DIR, name), dest);
  return dest;
}

function joinedLog(ctx: CliTestContext): string {
  return ctx.logSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
}

function joinedStdout(ctx: CliTestContext): string {
  return ctx.stdoutSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("");
}

function joinedErr(ctx: CliTestContext): string {
  return ctx.errSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
}

describe("draft-next-step (json output)", () => {
  let ctx: CliTestContext;

  beforeEach(async () => {
    ctx = await createCliTestContext("draft-next-step");
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it("returns the draft step + work[] for synthetic-draft-tool-step (exit 0)", async () => {
    const wfPath = await stagedFixture(ctx, "synthetic-draft-tool-step.gxwf.yml");
    await runDraftNextStep(wfPath, {});

    const result = JSON.parse(joinedLog(ctx)) as NextStepResult;
    expect(result.draft).toBe(true);
    if (!result.draft) throw new Error("expected draft: true");
    expect(result.step).toEqual(["fastp"]);
    expect(result.work.length).toBeGreaterThan(0);
    expect(process.exitCode).toBe(0);
  });

  it("returns { draft: false } for a non-draft GalaxyWorkflow document (exit 0)", async () => {
    const wf = `class: GalaxyWorkflow
label: not a draft
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
    await runDraftNextStep(wfPath, {});

    const result = JSON.parse(joinedLog(ctx)) as NextStepResult;
    expect(result).toEqual({ draft: false });
    expect(process.exitCode).toBe(0);
  });

  it("returns { draft: false } for a fully-concrete draft (no TODOs, no _plan_*)", async () => {
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
    const wfPath = join(ctx.tmpDir, "no-work-draft.gxwf.yml");
    await writeFile(wfPath, wf);
    await runDraftNextStep(wfPath, {});

    const result = JSON.parse(joinedLog(ctx)) as NextStepResult;
    expect(result).toEqual({ draft: false });
    expect(process.exitCode).toBe(0);
  });

  it("descends into draft subworkflow when the outer step is concrete", async () => {
    const wf = `class: GalaxyWorkflowDraft
inputs:
  reads:
    type: data
outputs:
  out:
    outputSource: outer/output
steps:
  outer:
    type: subworkflow
    label: outer
    in:
      reads: reads
    out:
      - id: output
    run:
      class: GalaxyWorkflowDraft
      inputs:
        reads:
          type: data
      outputs:
        output:
          outputSource: inner_step/out
      steps:
        inner_step:
          tool_id: TODO
          tool_version: TODO
          in:
            input1: reads
          out:
            - id: out
`;
    const wfPath = join(ctx.tmpDir, "nested-draft.gxwf.yml");
    await writeFile(wfPath, wf);
    await runDraftNextStep(wfPath, {});

    const result = JSON.parse(joinedLog(ctx)) as NextStepResult;
    expect(result.draft).toBe(true);
    if (!result.draft) throw new Error("expected draft: true");
    expect(result.step).toEqual(["outer", "inner_step"]);
    expect(process.exitCode).toBe(0);
  });

  it("alphabetical tie-break for two level-0 steps", async () => {
    const wf = `class: GalaxyWorkflowDraft
inputs:
  reads:
    type: data
outputs: {}
steps:
  zebra:
    tool_id: TODO
    tool_version: "1.0.0"
    in:
      input1: reads
    out:
      - id: out
  apple:
    tool_id: TODO
    tool_version: "1.0.0"
    in:
      input1: reads
    out:
      - id: out
`;
    const wfPath = join(ctx.tmpDir, "tiebreak.gxwf.yml");
    await writeFile(wfPath, wf);
    await runDraftNextStep(wfPath, {});

    const result = JSON.parse(joinedLog(ctx)) as NextStepResult;
    expect(result.draft).toBe(true);
    if (!result.draft) throw new Error("expected draft: true");
    expect(result.step).toEqual(["apple"]);
  });

  it("rejects native input with exit 2", async () => {
    const wf = JSON.stringify({
      a_galaxy_workflow: true,
      format_version: "0.1",
      name: "concrete",
      steps: {},
    });
    const wfPath = join(ctx.tmpDir, "native.ga");
    await writeFile(wfPath, wf);
    await runDraftNextStep(wfPath, {});

    expect(joinedErr(ctx)).toContain("draft-next-step requires format2");
    expect(process.exitCode).toBe(2);
  });

  it("rejects --format native explicitly with exit 2", async () => {
    const wfPath = await stagedFixture(ctx, "synthetic-draft-tool-step.gxwf.yml");
    await runDraftNextStep(wfPath, { format: "native" });

    expect(joinedErr(ctx)).toContain("draft-next-step requires format2");
    expect(process.exitCode).toBe(2);
  });

  it("exits 2 on malformed YAML", async () => {
    const wfPath = join(ctx.tmpDir, "broken.gxwf.yml");
    await writeFile(wfPath, "class: GalaxyWorkflowDraft\nsteps: [unterminated\n");
    await runDraftNextStep(wfPath, {});

    expect(process.exitCode).toBe(2);
  });

  it("is byte-identical across two runs (idempotence)", async () => {
    const wfPath = await stagedFixture(ctx, "synthetic-draft-tool-step.gxwf.yml");

    await runDraftNextStep(wfPath, {});
    const first = joinedLog(ctx);

    ctx.logSpy.mockClear();
    await runDraftNextStep(wfPath, {});
    const second = joinedLog(ctx);

    expect(first).toBe(second);
  });
});

describe("draft-next-step (markdown output)", () => {
  let ctx: CliTestContext;

  beforeEach(async () => {
    ctx = await createCliTestContext("draft-next-step-md");
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it("--output-format markdown renders a checklist", async () => {
    const wfPath = await stagedFixture(ctx, "synthetic-draft-tool-step.gxwf.yml");
    await runDraftNextStep(wfPath, { outputFormat: "markdown" });

    const md = joinedStdout(ctx);
    expect(md).toMatch(/## Next step: `fastp`/);
    expect(md).toContain("- [ ] ");
    expect(process.exitCode).toBe(0);
  });

  it("--output-format markdown reports no remaining work on a non-draft", async () => {
    const wf = `class: GalaxyWorkflow
inputs: {}
outputs: {}
steps: {}
`;
    const wfPath = join(ctx.tmpDir, "concrete.gxwf.yml");
    await writeFile(wfPath, wf);
    await runDraftNextStep(wfPath, { outputFormat: "markdown" });

    expect(joinedStdout(ctx)).toContain("_No remaining draft work._");
    expect(process.exitCode).toBe(0);
  });

  it("rejects unknown --output-format with exit 2", async () => {
    const wfPath = await stagedFixture(ctx, "synthetic-draft-tool-step.gxwf.yml");
    await runDraftNextStep(wfPath, { outputFormat: "xml" });

    expect(joinedErr(ctx)).toMatch(/unknown --output-format: xml/);
    expect(process.exitCode).toBe(2);
  });
});
