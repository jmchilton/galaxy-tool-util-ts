import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { runLint } from "../src/commands/lint.js";
import { createCliTestContext, type CliTestContext } from "./helpers/cli-test-context.js";
import { seedAllTools, SIMPLE_TOOL_ID } from "./helpers/fixtures.js";

describe("lint --strict-encoding", () => {
  let ctx: CliTestContext;
  beforeEach(async () => {
    ctx = await createCliTestContext("strict-lint-enc");
  });
  afterEach(async () => {
    await ctx.cleanup();
  });

  it("reports encoding error for JSON-string tool_state", async () => {
    await seedAllTools(ctx.tmpDir);
    const workflow = {
      a_galaxy_workflow: "true",
      "format-version": "0.1",
      steps: {
        "0": {
          id: 0,
          type: "tool",
          tool_id: SIMPLE_TOOL_ID,
          tool_version: "1.0",
          tool_state: JSON.stringify({ input_text: "hello" }),
          input_connections: {},
        },
      },
    };
    const wfPath = join(ctx.tmpDir, "legacy.ga");
    await writeFile(wfPath, JSON.stringify(workflow));
    await runLint(wfPath, { cacheDir: ctx.tmpDir, strictEncoding: true });

    expect(process.exitCode).toBe(2);
    const errors = ctx.errSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(errors).toContain("Encoding errors");
  });
});

describe("lint --strict-structure", () => {
  let ctx: CliTestContext;
  beforeEach(async () => {
    ctx = await createCliTestContext("strict-lint-struct");
  });
  afterEach(async () => {
    await ctx.cleanup();
  });

  it("reports structure error for extra keys", async () => {
    const workflow = {
      a_galaxy_workflow: "true",
      "format-version": "0.1",
      steps: {},
      bogus_key: "bad",
    };
    const wfPath = join(ctx.tmpDir, "extra.ga");
    await writeFile(wfPath, JSON.stringify(workflow));
    await runLint(wfPath, {
      cacheDir: ctx.tmpDir,
      strictStructure: true,
      skipStateValidation: true,
    });

    expect(process.exitCode).toBe(2);
    const errors = ctx.errSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(errors).toContain("Structure errors");
  });
});

describe("lint --strict-state", () => {
  let ctx: CliTestContext;
  beforeEach(async () => {
    ctx = await createCliTestContext("strict-lint-state");
  });
  afterEach(async () => {
    await ctx.cleanup();
  });

  it("promotes skipped steps to errors", async () => {
    // Seed some tools so cache isn't empty (lint skips state validation on empty cache)
    await seedAllTools(ctx.tmpDir);
    const workflow = {
      a_galaxy_workflow: "true",
      "format-version": "0.1",
      steps: {
        "0": {
          id: 0,
          type: "tool",
          tool_id: "toolshed.g2.bx.psu.edu/repos/nobody/fake/fake_tool",
          tool_version: "1.0",
          tool_state: {},
          input_connections: {},
        },
      },
    };
    const wfPath = join(ctx.tmpDir, "missing.ga");
    await writeFile(wfPath, JSON.stringify(workflow));
    await runLint(wfPath, { cacheDir: ctx.tmpDir, strictState: true });

    expect(process.exitCode).toBe(2);
  });
});
