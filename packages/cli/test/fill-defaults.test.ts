import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import * as YAML from "yaml";

import { runFillDefaults } from "../src/commands/fill-defaults.js";
import { runValidateWorkflow } from "../src/commands/validate-workflow.js";
import { createCliTestContext, type CliTestContext } from "./helpers/cli-test-context.js";
import { seedAllTools, COMPOSE_TOOL_ID } from "./helpers/fixtures.js";

const condWorkflow = (state: Record<string, unknown>) => ({
  class: "GalaxyWorkflow",
  inputs: { text: "string" },
  outputs: {},
  steps: {
    compose: {
      tool_id: COMPOSE_TOOL_ID,
      tool_version: "1.0",
      in: { "param_type|component_value": "text" },
      state,
    },
  },
});

const allOutput = (ctx: CliTestContext) =>
  [...ctx.logSpy.mock.calls, ...ctx.errSpy.mock.calls].map((c) => String(c[0])).join("\n");

describe("conditional completeness", () => {
  let ctx: CliTestContext;

  beforeEach(async () => {
    ctx = await createCliTestContext("fill-defaults");
    await seedAllTools(ctx.tmpDir);
  });
  afterEach(async () => {
    await ctx.cleanup();
  });

  async function writeWf(state: Record<string, unknown>): Promise<string> {
    const wfPath = join(ctx.tmpDir, "wf.gxwf.yml");
    await writeFile(wfPath, YAML.stringify(condWorkflow(state)));
    return wfPath;
  }

  it("validate --strict-state rejects a conditional missing its test parameter", async () => {
    const wfPath = await writeWf({ param_type: {} });
    await runValidateWorkflow(wfPath, { cacheDir: ctx.tmpDir, offline: true, strictState: true });
    expect(process.exitCode).toBe(1);
    expect(allOutput(ctx)).toContain(
      "param_type: missing conditional test parameter 'select_param_type'",
    );
  });

  it("validate --mode json-schema --strict-state rejects a missing test parameter", async () => {
    const wfPath = await writeWf({ param_type: {} });
    await runValidateWorkflow(wfPath, {
      cacheDir: ctx.tmpDir,
      mode: "json-schema",
      strictState: true,
    });
    expect(process.exitCode).toBe(1);
    expect(allOutput(ctx)).toContain("missing conditional test parameter 'select_param_type'");
  });

  it("validate without --strict-state still accepts partial state", async () => {
    const wfPath = await writeWf({ param_type: {} });
    await runValidateWorkflow(wfPath, { cacheDir: ctx.tmpDir, offline: true });
    expect(process.exitCode).toBe(0);
  });

  it("fill-defaults output passes validate --strict-state and keeps connections", async () => {
    const wfPath = await writeWf({});
    const outPath = join(ctx.tmpDir, "filled.gxwf.yml");
    await runFillDefaults(wfPath, { cacheDir: ctx.tmpDir, offline: true, output: outPath });
    const filled = YAML.parse(await readFile(outPath, "utf-8"));
    expect(filled.steps.compose.state).toEqual({ param_type: { select_param_type: "text" } });
    expect(filled.steps.compose.in).toEqual({ "param_type|component_value": "text" });

    process.exitCode = undefined;
    await runValidateWorkflow(outPath, { cacheDir: ctx.tmpDir, offline: true, strictState: true });
    expect(process.exitCode).toBe(0);
  });
});
