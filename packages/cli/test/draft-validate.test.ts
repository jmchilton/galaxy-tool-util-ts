import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { copyFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { runDraftValidate } from "../src/commands/draft-validate.js";
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

  it("passes on synthetic-draft-tool-step (exit 0, clean summary)", async () => {
    const wfPath = await stagedFixture(ctx, "synthetic-draft-tool-step.gxwf.yml");
    await runDraftValidate(wfPath, {});

    const out = joined(ctx.logSpy);
    expect(out).toContain("draft valid");
    expect(out).toContain(wfPath);
    expect(out).not.toContain("Structure errors");
    expect(out).not.toContain("Topology errors");
    expect(out).not.toContain("Semantic errors");
    expect(process.exitCode).toBe(0);
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
