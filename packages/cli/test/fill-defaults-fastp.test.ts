import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { copyFile, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as S from "effect/Schema";
import * as YAML from "yaml";
import { cacheKey } from "@galaxy-tool-util/core";
import { ParsedTool } from "@galaxy-tool-util/schema";
import { makeNodeToolCache } from "@galaxy-tool-util/core/node";

import { runFillDefaults } from "../src/commands/fill-defaults.js";
import { runValidateWorkflow } from "../src/commands/validate-workflow.js";
import { createCliTestContext, type CliTestContext } from "./helpers/cli-test-context.js";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const FASTP_ID = "toolshed.g2.bx.psu.edu/repos/iuc/fastp/fastp/1.4.0+galaxy0";

// Exact workflow and tool from galaxy-tool-util-ts#202.
describe("issue 202 fastp repro", () => {
  let ctx: CliTestContext;
  let wfPath: string;

  beforeEach(async () => {
    ctx = await createCliTestContext("fastp-202");
    const cache = makeNodeToolCache({ cacheDir: ctx.tmpDir });
    const tool = JSON.parse(readFileSync(join(fixtures, "fastp_1.4.0+galaxy0.json"), "utf-8"));
    const key = await cacheKey(
      "https://toolshed.g2.bx.psu.edu",
      "iuc~fastp~fastp",
      "1.4.0+galaxy0",
    );
    await cache.saveTool(
      key,
      S.decodeUnknownSync(ParsedTool)(tool),
      FASTP_ID,
      "1.4.0+galaxy0",
      "api",
    );
    wfPath = join(ctx.tmpDir, "wf.gxwf.yml");
    await copyFile(join(fixtures, "workflows", "issue-202-fastp.gxwf.yml"), wfPath);
  });
  afterEach(async () => {
    await ctx.cleanup();
  });

  const output = () =>
    [...ctx.logSpy.mock.calls, ...ctx.errSpy.mock.calls].map((c) => String(c[0])).join("\n");

  it.each(["effect", "json-schema"])(
    "validate --strict accepts sparse fastp state in %s mode without filling it",
    async (mode) => {
      const original = await readFile(wfPath, "utf-8");
      await runValidateWorkflow(wfPath, {
        cacheDir: ctx.tmpDir,
        offline: true,
        strict: true,
        mode,
      });
      expect(process.exitCode).toBe(0);
      expect(output()).toContain("tool_state: OK");
      expect(await readFile(wfPath, "utf-8")).toBe(original);
    },
  );

  it("fill-defaults output passes validate --strict", async () => {
    const outPath = join(ctx.tmpDir, "filled.gxwf.yml");
    await runFillDefaults(wfPath, { cacheDir: ctx.tmpDir, offline: true, output: outPath });
    const filled = YAML.parse(await readFile(outPath, "utf-8"));
    const state = filled.steps.fastp.state;
    expect(state.duplicated_reads.handling_options.eval_dups).toBe("--dont_eval_duplication");
    expect(state.read_mod_options.polyg_tail_trimming.trimming_select).toBe("");
    expect(state.read_mod_options.polyx_tail_trimming.polyx_trimming_select).toBe("");
    for (const selector of ["cut_front", "cut_tail", "cut_right"]) {
      expect(
        state.read_mod_options.cutting_by_quality_options[`${selector}_select`][selector],
      ).toBe("");
    }
    const original = YAML.parse(await readFile(wfPath, "utf-8"));
    expect(state.single_paired.single_paired_selector).toBe("paired_collection");
    expect(state.single_paired.paired_input).toEqual({ __class__: "ConnectedValue" });
    expect(filled.steps.fastp.in).toEqual(original.steps.fastp.in);
    expect(original.steps.fastp.state.duplicated_reads).toBeUndefined();
    process.exitCode = undefined;
    await runValidateWorkflow(outPath, { cacheDir: ctx.tmpDir, offline: true, strict: true });
    expect(process.exitCode).toBe(0);
  });
});
