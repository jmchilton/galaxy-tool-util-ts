/**
 * `ok: false` must be explainable from the top level of the report. Tool-state
 * and connection failures used to sit only under `concrete.tool_state.results[]`
 * and `concrete.connection_report`, so a consumer reading the arrays named
 * `*_errors` saw nothing wrong. The two reports also number one step differently,
 * so entries name the step by label, which both reports now carry.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import * as S from "effect/Schema";
import * as YAML from "yaml";

import { cacheKey } from "@galaxy-tool-util/core";
import { makeNodeToolCache } from "@galaxy-tool-util/core/node";
import {
  ParsedTool,
  toNative,
  type SingleDraftValidationReport,
  type SingleValidationReport,
} from "@galaxy-tool-util/schema";

import { runDraftValidate, type DraftValidateOptions } from "../src/commands/draft-validate.js";
import { runValidateWorkflow } from "../src/commands/validate-workflow.js";
import { createCliTestContext, type CliTestContext } from "./helpers/cli-test-context.js";
import { seedAllTools, DATA_TOOL_ID } from "./helpers/fixtures.js";

const COLLECTION_TOOL_ID = "toolshed.g2.bx.psu.edu/repos/test/coll/coll_tool";
const UNKNOWN_KEY_ERROR = 'No parameter definition matching connection key "not_a_param"';

const collectionInputTool = {
  id: "coll_tool",
  version: "1.0",
  name: "Collection Tool",
  description: null,
  inputs: [
    {
      name: "input_list",
      parameter_type: "gx_data_collection",
      type: "data_collection",
      hidden: false,
      label: "Input list",
      help: null,
      argument: null,
      is_dynamic: false,
      optional: false,
      collection_type: "list",
      extensions: ["data"],
      value: null,
    },
  ],
  outputs: [],
  citations: [],
  license: null,
  profile: null,
  edam_operations: [],
  edam_topics: [],
  xrefs: [],
};

async function seedCollectionTool(cacheDir: string): Promise<void> {
  const cache = makeNodeToolCache({ cacheDir });
  const key = await cacheKey("https://toolshed.g2.bx.psu.edu", "test~coll~coll_tool", "1.0");
  await cache.saveTool(
    key,
    S.decodeUnknownSync(ParsedTool)(collectionInputTool),
    COLLECTION_TOOL_ID,
    "1.0",
    "api",
  );
}

function dataStep(connections: Record<string, string> = { input_file: "reads" }) {
  return {
    tool_id: DATA_TOOL_ID,
    tool_version: "1.0",
    in: connections,
    out: [{ id: "output" }],
    state: { threshold: 0.5 },
  };
}

function draft(steps: unknown, inputs: unknown = { reads: { type: "data" } }) {
  return { class: "GalaxyWorkflowDraft", inputs, outputs: {}, steps };
}

const BAD_KEY = { input_file: "reads", not_a_param: "reads" };

function inlineSubworkflow(innerLabel: string | null) {
  const inner = dataStep({ input_file: "sub_reads", not_a_param: "sub_reads" });
  return {
    run: {
      class: "GalaxyWorkflow",
      inputs: { sub_reads: { type: "data" } },
      outputs: {},
      steps: innerLabel === null ? [inner] : { [innerLabel]: inner },
    },
    in: { sub_reads: "reads" },
    out: [],
  };
}

describe("draft-validate --concrete: concrete_errors", () => {
  let ctx: CliTestContext;

  beforeEach(async () => {
    ctx = await createCliTestContext("concrete-errors");
    await seedAllTools(ctx.tmpDir);
    await seedCollectionTool(ctx.tmpDir);
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  async function draftValidate(
    doc: unknown,
    opts: DraftValidateOptions = {},
  ): Promise<SingleDraftValidationReport> {
    const path = join(ctx.tmpDir, "wf.gxwf.yml");
    await writeFile(path, YAML.stringify(doc));
    await runDraftValidate(path, { json: true, concrete: true, cacheDir: ctx.tmpDir, ...opts });
    const out = ctx.logSpy.mock.calls
      .map((c) => c[0])
      .find((s) => typeof s === "string" && s.startsWith("{"));
    expect(out).toBeDefined();
    return JSON.parse(out as string) as SingleDraftValidationReport;
  }

  it("collects a tool-state failure and leaves the existing report fields alone", async () => {
    const report = await draftValidate(draft({ cat: dataStep(BAD_KEY) }));

    expect(report.concrete_errors).toEqual([
      { check: "tool_state", label: "cat", tool_id: DATA_TOOL_ID, message: UNKNOWN_KEY_ERROR },
    ]);
    expect(report.ok).toBe(false);
    expect(report.summary).toBe("1 error");
    expect(report.concrete?.tool_state?.results[0].errors).toEqual([UNKNOWN_KEY_ERROR]);
    expect(process.exitCode).toBe(1);
  });

  it("is empty on a clean concrete pass", async () => {
    const report = await draftValidate(draft({ cat: dataStep() }));

    expect(report.concrete?.ok).toBe(true);
    expect(report.concrete_errors).toEqual([]);
    expect(process.exitCode).toBe(0);
  });

  it("is absent without --concrete", async () => {
    const report = await draftValidate(draft({ cat: dataStep(BAD_KEY) }), { concrete: false });

    expect(report).not.toHaveProperty("concrete_errors");
  });

  it("names a step inside an inline subworkflow by its label path", async () => {
    const report = await draftValidate(draft({ nested: inlineSubworkflow("inner_cat") }));

    expect(report.concrete_errors).toEqual([
      {
        check: "tool_state",
        label: "nested/inner_cat",
        tool_id: DATA_TOOL_ID,
        message: UNKNOWN_KEY_ERROR,
      },
    ]);
  });

  it("nulls the label when the step or an ancestor is unlabelled", async () => {
    const report = await draftValidate(
      draft([dataStep(BAD_KEY), inlineSubworkflow(null), inlineSubworkflow("inner_cat")]),
    );

    expect(report.concrete_errors?.map((e) => e.label)).toEqual([null, null, null]);
  });

  it("names a list-form step by its id, as connection_report does", async () => {
    const report = await draftValidate(draft([{ id: "cat", ...dataStep(BAD_KEY) }]), {
      connections: true,
    });

    expect(report.concrete?.tool_state?.results[0].label).toBe("cat");
    expect(report.concrete?.connection_report?.step_results.at(-1)?.label).toBe("cat");
    expect(report.concrete_errors?.[0].label).toBe("cat");
  });

  it("reports the one step under the same label in tool_state and connection_report", async () => {
    const report = await draftValidate(draft({ cat: dataStep(BAD_KEY) }), { connections: true });

    const toolState = report.concrete?.tool_state?.results[0];
    const connection = report.concrete?.connection_report?.step_results.find(
      (r) => r.tool_id === DATA_TOOL_ID,
    );
    expect(toolState?.step).not.toEqual(connection?.step);
    expect(toolState?.label).toBe("cat");
    expect(connection?.label).toBe("cat");
  });

  it("collects skipped steps under --strict-state", async () => {
    const report = await draftValidate(
      draft({
        cat: { tool_id: "cat1", tool_version: "1.0.0", in: { input1: "reads" }, out: [] },
      }),
      { strictState: true, offline: true },
    );

    expect(report.concrete?.strict_state_errors).toHaveLength(1);
    expect(report.concrete_errors).toHaveLength(1);
    expect(report.concrete_errors?.[0]).toMatchObject({
      check: "strict_state",
      label: "cat",
      tool_id: "cat1",
    });
    expect(report.concrete_errors?.[0].message).toContain("skip_tool_not_found");
  });

  it("leaves skipped steps out without --strict-state", async () => {
    const report = await draftValidate(
      draft({
        cat: { tool_id: "cat1", tool_version: "1.0.0", in: { input1: "reads" }, out: [] },
      }),
      { offline: true },
    );

    expect(report.concrete?.ok).toBe(true);
    expect(report.concrete_errors).toEqual([]);
  });

  it("collects invalid connections, naming the input they feed", async () => {
    const report = await draftValidate(
      draft({
        collect: {
          tool_id: COLLECTION_TOOL_ID,
          tool_version: "1.0",
          in: { input_list: "reads" },
          out: [],
          state: {},
        },
      }),
      { connections: true, toolState: false },
    );

    expect(report.concrete?.connection_report?.valid).toBe(false);
    expect(report.concrete_errors).toHaveLength(1);
    expect(report.concrete_errors?.[0]).toMatchObject({
      check: "connections",
      label: "collect",
      tool_id: COLLECTION_TOOL_ID,
    });
    expect(report.concrete_errors?.[0].message).toMatch(/^input_list: Incompatible types/);
  });

  it("leaves skip connections out: they carry errors but do not fail the report", async () => {
    const report = await draftValidate(draft({ cat: dataStep(BAD_KEY) }), {
      connections: true,
      toolState: false,
    });

    const skips = report.concrete?.connection_report?.step_results
      .flatMap((r) => r.connections)
      .filter((c) => c.status === "skip");
    expect(skips?.length).toBeGreaterThan(0);
    expect(skips?.[0].errors.length).toBeGreaterThan(0);
    expect(report.concrete?.connection_report?.valid).toBe(true);
    expect(report.concrete_errors).toEqual([]);
  });
});

describe("gxwf validate --json: step labels", () => {
  let ctx: CliTestContext;

  beforeEach(async () => {
    ctx = await createCliTestContext("step-labels");
    await seedAllTools(ctx.tmpDir);
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  async function validate(
    doc: unknown,
    opts: { mode: "effect" | "json-schema"; native?: boolean },
  ): Promise<SingleValidationReport> {
    const path = join(ctx.tmpDir, opts.native ? "wf.ga" : "wf.gxwf.yml");
    await writeFile(path, opts.native ? JSON.stringify(doc) : YAML.stringify(doc));
    await runValidateWorkflow(path, { cacheDir: ctx.tmpDir, json: true, mode: opts.mode });
    const out = ctx.logSpy.mock.calls
      .map((c) => c[0])
      .find((s) => typeof s === "string" && s.startsWith("{"));
    expect(out).toBeDefined();
    return JSON.parse(out as string) as SingleValidationReport;
  }

  const workflow = {
    class: "GalaxyWorkflow",
    inputs: { reads: { type: "data" } },
    outputs: {},
    steps: { cat: dataStep(), nested: inlineSubworkflow("inner_cat") },
  };

  it.each(["effect", "json-schema"] as const)("labels format2 steps (%s)", async (mode) => {
    const report = await validate(workflow, { mode });

    expect(report.results.map((r) => [r.step, r.label])).toEqual([
      ["0", "cat"],
      ["1.0", "nested/inner_cat"],
    ]);
  });

  it.each(["effect", "json-schema"] as const)("labels native steps (%s)", async (mode) => {
    const report = await validate(toNative(workflow), { mode, native: true });

    expect(report.results.map((r) => r.label)).toEqual(["cat", "nested/inner_cat"]);
  });

  it.each(["effect", "json-schema"] as const)("omits an absent label (%s)", async (mode) => {
    const report = await validate({ ...workflow, steps: [dataStep()] }, { mode });

    expect(report.results[0]).not.toHaveProperty("label");
  });
});
