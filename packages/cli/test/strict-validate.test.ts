import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import * as YAML from "yaml";

import { runValidateWorkflow } from "../src/commands/validate-workflow.js";
import { createCliTestContext, type CliTestContext } from "./helpers/cli-test-context.js";
import { seedAllTools, SIMPLE_TOOL_ID } from "./helpers/fixtures.js";

describe("validate --strict-encoding", () => {
  let ctx: CliTestContext;

  beforeEach(async () => {
    ctx = await createCliTestContext("strict-enc");
  });
  afterEach(async () => {
    await ctx.cleanup();
  });

  it("rejects native workflow with JSON-string tool_state", async () => {
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
          // tool_state as a JSON string = legacy encoding
          tool_state: JSON.stringify({ input_text: "hello", num_lines: "5" }),
          input_connections: {},
        },
      },
    };
    const wfPath = join(ctx.tmpDir, "legacy.ga");
    await writeFile(wfPath, JSON.stringify(workflow));
    await runValidateWorkflow(wfPath, { cacheDir: ctx.tmpDir, strictEncoding: true });

    expect(process.exitCode).toBe(2);
    const errors = ctx.errSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(errors).toContain("Encoding errors");
  });

  it("passes clean native workflow with dict tool_state", async () => {
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
          tool_state: { input_text: "hello", num_lines: 5 },
          input_connections: {},
        },
      },
    };
    const wfPath = join(ctx.tmpDir, "clean.ga");
    await writeFile(wfPath, JSON.stringify(workflow));
    await runValidateWorkflow(wfPath, { cacheDir: ctx.tmpDir, strictEncoding: true });

    expect(process.exitCode).toBe(0);
  });

  it("rejects format2 workflow using tool_state instead of state", async () => {
    await seedAllTools(ctx.tmpDir);
    const workflow = {
      class: "GalaxyWorkflow",
      inputs: [],
      outputs: [],
      steps: [
        {
          id: "step1",
          tool_id: SIMPLE_TOOL_ID,
          tool_version: "1.0",
          tool_state: { input_text: "hello", num_lines: 5 },
          in: [],
          out: [],
        },
      ],
    };
    const wfPath = join(ctx.tmpDir, "bad.gxwf.yml");
    await writeFile(wfPath, YAML.stringify(workflow));
    await runValidateWorkflow(wfPath, { cacheDir: ctx.tmpDir, strictEncoding: true });

    expect(process.exitCode).toBe(2);
  });
});

describe("validate --strict-structure", () => {
  let ctx: CliTestContext;

  beforeEach(async () => {
    ctx = await createCliTestContext("strict-struct");
  });
  afterEach(async () => {
    await ctx.cleanup();
  });

  it("rejects native workflow with extra root keys", async () => {
    const workflow = {
      a_galaxy_workflow: "true",
      "format-version": "0.1",
      steps: {},
      bogus_key: "should fail",
    };
    const wfPath = join(ctx.tmpDir, "extra.ga");
    await writeFile(wfPath, JSON.stringify(workflow));
    await runValidateWorkflow(wfPath, { cacheDir: ctx.tmpDir, strictStructure: true });

    expect(process.exitCode).toBe(2);
    const errors = ctx.errSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(errors).toContain("Structure errors");
  });

  it("passes clean native workflow", async () => {
    const workflow = {
      a_galaxy_workflow: "true",
      "format-version": "0.1",
      steps: {},
    };
    const wfPath = join(ctx.tmpDir, "clean.ga");
    await writeFile(wfPath, JSON.stringify(workflow));
    await runValidateWorkflow(wfPath, {
      cacheDir: ctx.tmpDir,
      strictStructure: true,
      toolState: false,
    });

    expect(process.exitCode).toBe(0);
  });
});

describe("validate --strict-state", () => {
  let ctx: CliTestContext;

  beforeEach(async () => {
    ctx = await createCliTestContext("strict-state");
  });
  afterEach(async () => {
    await ctx.cleanup();
  });

  it("promotes skipped (uncached tool) to failure", async () => {
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
    await runValidateWorkflow(wfPath, { cacheDir: ctx.tmpDir, strictState: true });

    expect(process.exitCode).toBe(2);
    const errors = ctx.errSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(errors).toContain("skipped steps not allowed");
  });

  it("passes when all steps validate ok", async () => {
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
          tool_state: { input_text: "hello", num_lines: 5 },
          input_connections: {},
        },
      },
    };
    const wfPath = join(ctx.tmpDir, "ok.ga");
    await writeFile(wfPath, JSON.stringify(workflow));
    await runValidateWorkflow(wfPath, { cacheDir: ctx.tmpDir, strictState: true });

    expect(process.exitCode).toBe(0);
  });
});

describe("validate --strict (all three)", () => {
  let ctx: CliTestContext;

  beforeEach(async () => {
    ctx = await createCliTestContext("strict-all");
  });
  afterEach(async () => {
    await ctx.cleanup();
  });

  it("clean workflow passes with --strict", async () => {
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
          tool_state: { input_text: "hello", num_lines: 5 },
          input_connections: {},
        },
      },
    };
    const wfPath = join(ctx.tmpDir, "clean.ga");
    await writeFile(wfPath, JSON.stringify(workflow));
    await runValidateWorkflow(wfPath, { cacheDir: ctx.tmpDir, strict: true });

    expect(process.exitCode).toBe(0);
  });

  it("encoding error caught with --strict", async () => {
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
    const wfPath = join(ctx.tmpDir, "bad.ga");
    await writeFile(wfPath, JSON.stringify(workflow));
    await runValidateWorkflow(wfPath, { cacheDir: ctx.tmpDir, strict: true });

    expect(process.exitCode).toBe(2);
  });
});
