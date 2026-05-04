import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import * as S from "effect/Schema";
import { cacheKey } from "@galaxy-tool-util/core";
import { makeNodeToolCache } from "@galaxy-tool-util/core/node";
import { ParsedTool } from "@galaxy-tool-util/schema";
import fastqcFixture from "../../core/test/fixtures/fastqc-parsed-tool.json" with { type: "json" };
import { buildToolSummaryManifest, runSummarize } from "../src/commands/summarize.js";
import { createCliTestContext, type CliTestContext } from "./helpers/cli-test-context.js";

const FASTQC_TOOL_ID = "toolshed.g2.bx.psu.edu/repos/devteam/fastqc/fastqc";
const FASTQC_VERSION = "0.74+galaxy0";

describe("galaxy-tool-cache summarize", () => {
  let ctx: CliTestContext;

  beforeEach(async () => {
    ctx = await createCliTestContext("summarize-test");
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  async function seedFastqc(): Promise<string> {
    const cache = makeNodeToolCache({ cacheDir: ctx.tmpDir });
    const key = await cacheKey(
      "https://toolshed.g2.bx.psu.edu",
      "devteam~fastqc~fastqc",
      FASTQC_VERSION,
    );
    const parsed = S.decodeUnknownSync(ParsedTool)(fastqcFixture);
    await cache.saveTool(
      key,
      parsed,
      FASTQC_TOOL_ID,
      FASTQC_VERSION,
      "api",
      `https://toolshed.g2.bx.psu.edu/api/tools/devteam~fastqc~fastqc/versions/${FASTQC_VERSION}`,
    );
    return key;
  }

  it("builds a deterministic manifest for a cached ParsedTool", async () => {
    const key = await seedFastqc();

    const manifest = await buildToolSummaryManifest(FASTQC_TOOL_ID, {
      version: FASTQC_VERSION,
      cacheDir: ctx.tmpDir,
    });

    expect(manifest).not.toBeNull();
    expect(manifest?.schema_version).toBe(1);
    expect(manifest?.source.kind).toBe("toolshed");
    expect(manifest?.parsed_tool.name).toBe("FastQC");
    expect(manifest?.input_schemas.workflow_step).not.toBeNull();
    expect(manifest?.input_schemas.workflow_step_linked).not.toBeNull();
    expect(manifest?.artifacts.parsed_tool_path).toContain(`${key}.json`);
  });

  it("writes JSON to stdout by default", async () => {
    await seedFastqc();

    await runSummarize(FASTQC_TOOL_ID, { version: FASTQC_VERSION, cacheDir: ctx.tmpDir });

    expect(process.exitCode).toBeUndefined();
    const output = ctx.stdoutSpy.mock.calls.map((c) => c[0]).join("");
    const manifest = JSON.parse(output);
    expect(manifest.tool_id).toBe("fastqc");
  });

  it("writes JSON to --output", async () => {
    await seedFastqc();
    const outPath = join(ctx.tmpDir, "summary.json");

    await runSummarize(FASTQC_TOOL_ID, {
      version: FASTQC_VERSION,
      cacheDir: ctx.tmpDir,
      output: outPath,
    });

    const manifest = JSON.parse(await readFile(outPath, "utf-8"));
    expect(manifest.parsed_tool.id).toBe("fastqc");
  });
});
