import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import * as YAML from "yaml";

import { runPopulateWorkflow } from "../src/commands/populate-workflow.js";
import { createCliTestContext, type CliTestContext } from "./helpers/cli-test-context.js";
import { seedSimpleTool, SIMPLE_TOOL_ID } from "./helpers/fixtures.js";

describe("galaxy-tool-cache populate-workflow", () => {
  let ctx: CliTestContext;

  beforeEach(async () => {
    ctx = await createCliTestContext("populate-wf-test");
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it("reports no tool steps for input-only workflow", async () => {
    const workflow = {
      a_galaxy_workflow: "true",
      "format-version": "0.1",
      steps: {
        "0": { id: 0, type: "data_input", label: "Input", tool_id: null },
      },
    };
    const wfPath = join(ctx.tmpDir, "input-only.ga");
    await writeFile(wfPath, JSON.stringify(workflow));
    await runPopulateWorkflow(wfPath, { cacheDir: ctx.tmpDir });

    const output = ctx.logSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("No tool steps");
  });

  it("populates cache from native workflow with pre-cached tools", async () => {
    await seedSimpleTool(ctx.tmpDir);
    const workflow = {
      a_galaxy_workflow: "true",
      "format-version": "0.1",
      steps: {
        "0": {
          id: 0,
          type: "tool",
          tool_id: SIMPLE_TOOL_ID,
          tool_version: "1.0",
          tool_state: "{}",
          input_connections: {},
        },
      },
    };
    const wfPath = join(ctx.tmpDir, "native.ga");
    await writeFile(wfPath, JSON.stringify(workflow));
    await runPopulateWorkflow(wfPath, { cacheDir: ctx.tmpDir });

    const output = ctx.logSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("Cached:");
    expect(output).toContain("1/1");
  });

  it("populates cache from format2 workflow", async () => {
    await seedSimpleTool(ctx.tmpDir);
    const workflow = {
      class: "GalaxyWorkflow",
      steps: [
        {
          tool_id: SIMPLE_TOOL_ID,
          tool_version: "1.0",
          state: {},
          in: [],
          out: [],
        },
      ],
    };
    const wfPath = join(ctx.tmpDir, "format2.gxwf.yml");
    await writeFile(wfPath, YAML.stringify(workflow));
    await runPopulateWorkflow(wfPath, { cacheDir: ctx.tmpDir });

    const output = ctx.logSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("Cached:");
    expect(output).toContain("1/1");
  });

  it("reports failures for uncached tools", async () => {
    const workflow = {
      a_galaxy_workflow: "true",
      "format-version": "0.1",
      steps: {
        "0": {
          id: 0,
          type: "tool",
          tool_id: "toolshed.g2.bx.psu.edu/repos/nobody/fake/fake_tool",
          tool_version: "1.0",
          tool_state: "{}",
          input_connections: {},
        },
      },
    };
    const wfPath = join(ctx.tmpDir, "missing.ga");
    await writeFile(wfPath, JSON.stringify(workflow));

    // Mock fetch to return 404 so ToolInfoService fails
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response("Not found", { status: 404 })) as typeof fetch;
    try {
      await runPopulateWorkflow(wfPath, { cacheDir: ctx.tmpDir });
    } finally {
      globalThis.fetch = originalFetch;
    }

    const warnings = ctx.warnSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(warnings).toContain("Failed:");
    expect(process.exitCode).toBe(1);
  });
});
