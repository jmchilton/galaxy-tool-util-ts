import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { copyFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as S from "effect/Schema";
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

  const output = () => ctx.errSpy.mock.calls.map((c) => String(c[0])).join("\n");

  it("validate --strict rejects the partial fastp state", async () => {
    await runValidateWorkflow(wfPath, { cacheDir: ctx.tmpDir, offline: true, strict: true });
    expect(process.exitCode).toBe(1);
    expect(output()).toContain(
      "duplicated_reads|handling_options: missing conditional test parameter 'eval_dups'",
    );
  });

  it("fill-defaults output passes validate --strict", async () => {
    const outPath = join(ctx.tmpDir, "filled.gxwf.yml");
    await runFillDefaults(wfPath, { cacheDir: ctx.tmpDir, offline: true, output: outPath });
    process.exitCode = undefined;
    await runValidateWorkflow(outPath, { cacheDir: ctx.tmpDir, offline: true, strict: true });
    expect(process.exitCode).toBe(0);
  });
});
