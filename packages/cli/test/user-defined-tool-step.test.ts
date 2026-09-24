/**
 * A format2 step may embed a user-defined tool under `run:` (`class:
 * GalaxyUserTool`); natively the same definition travels as the step's
 * `tool_representation`. The fixture is Galaxy's
 * lib/galaxy_test/workflow/inline_user_defined_tool.gxwf.yml.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as YAML from "yaml";

import type { SingleDraftValidationReport, SingleValidationReport } from "@galaxy-tool-util/schema";
import { toNative } from "@galaxy-tool-util/schema";
import { runValidateWorkflow, validateFormat2Steps } from "../src/commands/validate-workflow.js";
import { runDraftValidate } from "../src/commands/draft-validate.js";
import { runDraftExtract } from "../src/commands/draft-extract.js";
import { createCliTestContext, type CliTestContext } from "./helpers/cli-test-context.js";

const FIXTURE = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures/workflows/inline-user-defined-tool.gxwf.yml",
);

async function userToolWorkflow(): Promise<Record<string, any>> {
  return YAML.parse(await readFile(FIXTURE, "utf-8"));
}

function jsonOutput(ctx: CliTestContext): unknown {
  const out = ctx.logSpy.mock.calls
    .map((c: unknown[]) => c[0])
    .find((s: unknown) => typeof s === "string" && s.startsWith("{"));
  expect(out).toBeDefined();
  return JSON.parse(out as string);
}

describe("gxwf validate: embedded GalaxyUserTool step", () => {
  let ctx: CliTestContext;

  beforeEach(async () => {
    ctx = await createCliTestContext("vw-user-tool");
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  async function validate(
    doc: unknown,
    opts: { mode?: "effect" | "json-schema"; native?: boolean } = {},
  ): Promise<SingleValidationReport> {
    const path = join(ctx.tmpDir, opts.native ? "wf.ga" : "wf.gxwf.yml");
    await writeFile(path, opts.native ? JSON.stringify(doc) : YAML.stringify(doc));
    await runValidateWorkflow(path, {
      cacheDir: ctx.tmpDir,
      offline: true,
      json: true,
      mode: opts.mode,
    });
    return jsonOutput(ctx) as SingleValidationReport;
  }

  it.each(["effect", "json-schema"] as const)(
    "validates tool state against the embedded definition (%s)",
    async (mode) => {
      const report = await validate(await userToolWorkflow(), { mode });

      expect(report.results).toEqual([
        { step: "0", tool_id: "cat_user_defined", version: "0.1", status: "ok", errors: [] },
      ]);
      expect(process.exitCode).toBe(0);
    },
  );

  it.each(["effect", "json-schema"] as const)(
    "validates the native tool_representation step (%s)",
    async (mode) => {
      const native = toNative(await userToolWorkflow());
      const report = await validate(native, { mode, native: true });

      expect(report.results).toEqual([
        { step: "1", tool_id: "cat_user_defined", version: "0.1", status: "ok", errors: [] },
      ]);
      expect(process.exitCode).toBe(0);
    },
  );

  it("enumerates the step without validating when tool state is disabled", async () => {
    const results = await validateFormat2Steps(await userToolWorkflow(), null);

    expect(results).toEqual([
      {
        step: "0",
        tool_id: "cat_user_defined",
        version: "0.1",
        status: "skip_no_tool_state",
        errors: ["tool state validation disabled"],
      },
    ]);
  });

  it("fails state that violates the embedded definition", async () => {
    const wf = await userToolWorkflow();
    wf.steps.udt_cat.run.inputs.push({ name: "lines", type: "integer" });
    wf.steps.udt_cat.state = { lines: "not a number" };
    const report = await validate(wf);

    expect(report.results[0].status).toBe("fail");
    expect(report.results[0].errors.join("\n")).toContain("lines");
    expect(process.exitCode).toBe(1);
  });

  it("fails a connection key the embedded definition has no input for", async () => {
    const wf = await userToolWorkflow();
    wf.steps.udt_cat.in = { not_an_input: "input1" };
    const report = await validate(wf);

    expect(report.results[0].status).toBe("fail");
    expect(report.results[0].errors).toContain(
      'No parameter definition matching connection key "not_an_input"',
    );
  });

  it("fails an embedded definition that does not parse", async () => {
    const wf = await userToolWorkflow();
    wf.steps.udt_cat.run.inputs[0].type = "not_a_parameter_type";
    const report = await validate(wf);

    expect(report.results[0].status).toBe("fail");
    expect(report.results[0].errors[0]).toMatch(
      /^embedded GalaxyUserTool definition could not be parsed: /,
    );
  });

  it("skips a native tool_representation that is not a GalaxyUserTool, and --strict-state rejects it", async () => {
    const native = toNative(await userToolWorkflow()) as Record<string, any>;
    native.steps["1"].tool_representation = {
      ...native.steps["1"].tool_representation,
      class: "GalaxyTool",
    };
    const report = await validate(native, { native: true });

    expect(report.results[0].status).toBe("skip_tool_not_found");
    expect(report.results[0].errors).toEqual([
      'embedded tool definition of class "GalaxyTool" is not validated (only GalaxyUserTool is supported)',
    ]);

    const path = join(ctx.tmpDir, "wf.ga");
    await runValidateWorkflow(path, { cacheDir: ctx.tmpDir, offline: true, strictState: true });
    expect(process.exitCode).toBe(2);
  });
});

describe("gxwf draft commands: embedded GalaxyUserTool step", () => {
  let ctx: CliTestContext;

  beforeEach(async () => {
    ctx = await createCliTestContext("draft-user-tool");
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  async function stageDraft(): Promise<string> {
    const wf = await userToolWorkflow();
    wf.class = "GalaxyWorkflowDraft";
    const path = join(ctx.tmpDir, "draft.gxwf.yml");
    await writeFile(path, YAML.stringify(wf));
    return path;
  }

  it("draft-validate --concrete resolves the output port and validates tool state", async () => {
    await runDraftValidate(await stageDraft(), {
      concrete: true,
      cacheDir: ctx.tmpDir,
      offline: true,
      json: true,
    });
    const report = jsonOutput(ctx) as SingleDraftValidationReport;

    expect(report.topology_errors).toEqual([]);
    expect(report.concrete?.tool_state?.summary).toMatchObject({ ok: 1, fail: 0 });
    expect(process.exitCode).toBe(0);
  });

  it("draft-extract keeps the workflow output sourced from the embedded tool", async () => {
    const out = join(ctx.tmpDir, "extracted.gxwf.yml");
    await runDraftExtract(await stageDraft(), { output: out });
    const extracted = YAML.parse(await readFile(out, "utf-8"));

    expect(extracted.outputs).toEqual({ wf_output: { outputSource: "udt_cat/output1" } });
  });
});
