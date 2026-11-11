import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as YAML from "yaml";

import { diffWorkflows, type WorkflowDiff } from "@galaxy-tool-util/schema";
import { runDiff } from "../src/commands/diff.js";
import { createCliTestContext, type CliTestContext } from "./helpers/cli-test-context.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKFLOWS = join(__dirname, "../../schema/test/fixtures/workflows");
const BASE = join(WORKFLOWS, "format2/diff/synthetic-diff-base.gxwf.yml");
const REMOVED_STEP = join(WORKFLOWS, "format2/diff/synthetic-diff-removed-step.gxwf.yml");
const DRAFT_BEFORE = join(WORKFLOWS, "format2/diff/synthetic-diff-draft-before.gxwf.yml");
const DRAFT_AFTER = join(WORKFLOWS, "format2/diff/synthetic-diff-draft-after.gxwf.yml");

function joinedLog(ctx: CliTestContext): string {
  return ctx.logSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
}

async function loadYaml(path: string): Promise<unknown> {
  return YAML.parse(await readFile(path, "utf-8"));
}

describe("gxwf diff", () => {
  let ctx: CliTestContext;

  beforeEach(async () => {
    ctx = await createCliTestContext("diff");
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it("prints 'No differences.' for identical workflows", async () => {
    await runDiff(BASE, BASE, {});
    expect(joinedLog(ctx)).toBe("No differences.");
    expect(process.exitCode).toBe(0);
  });

  it("prints a removed step and the rewire as text", async () => {
    await runDiff(BASE, REMOVED_STEP, {});
    const out = joinedLog(ctx);
    expect(out).toContain(
      "Step removed: trim (trim reads) [trimmer 1.0]\n    upstream: min_quality, reads\n    downstream: filter\n",
    );
    expect(out).toContain("    - trim/out_file1 -> filter/input\n    + reads -> filter/input\n");
    expect(out.endsWith("AFTER inputs feeding no step: min_quality")).toBe(true);
    expect(process.exitCode).toBe(0);
  });

  it("--json prints the diffWorkflows result", async () => {
    await runDiff(DRAFT_BEFORE, DRAFT_AFTER, { json: true });
    const payload = JSON.parse(joinedLog(ctx)) as WorkflowDiff;
    expect(payload).toEqual(
      diffWorkflows(await loadYaml(DRAFT_BEFORE), await loadYaml(DRAFT_AFTER)),
    );
    expect(payload.has_changes).toBe(true);
    expect(Object.keys(payload.steps.removed)).toEqual(["chr_filter"]);
  });

  it.each([
    [BASE, 0],
    [REMOVED_STEP, 1],
  ])("--exit-code against %s exits %i", async (after, expected) => {
    await runDiff(BASE, after, { exitCode: true });
    expect(process.exitCode).toBe(expected);
  });

  it("rejects a native workflow with exit 2", async () => {
    await runDiff(join(WORKFLOWS, "native/real-unicycler-assembly.ga"), BASE, {});
    expect(ctx.errSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n")).toContain(
      "native",
    );
    expect(ctx.logSpy).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(2);
  });

  it("exits 2 when a workflow file cannot be read", async () => {
    const missing = join(ctx.tmpDir, "missing.gxwf.yml");
    await runDiff(missing, BASE, {});
    expect(ctx.errSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n")).toContain(
      `Failed to read ${missing}`,
    );
    expect(ctx.logSpy).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(2);
  });
});
