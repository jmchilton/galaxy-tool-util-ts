import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import * as YAML from "yaml";

import { runValidateWorkflow } from "../src/commands/validate-workflow.js";
import type { SingleValidationReport } from "@galaxy-tool-util/schema";
import { createCliTestContext, type CliTestContext } from "./helpers/cli-test-context.js";
import { seedAllTools, DATA_TOOL_ID } from "./helpers/fixtures.js";

// Native workflow with one data input feeding two data tools (chain).
const chainWorkflow = {
  a_galaxy_workflow: "true",
  "format-version": "0.1",
  steps: {
    "0": { id: 0, type: "data_input", label: "in", tool_id: null, tool_state: "{}" },
    "1": {
      id: 1,
      type: "tool",
      label: "t1",
      tool_id: DATA_TOOL_ID,
      tool_version: "1.0",
      tool_state: "{}",
      input_connections: { input_file: [{ id: 0, output_name: "output" }] },
    },
  },
};

describe("gxwf validate --connections", () => {
  let ctx: CliTestContext;

  beforeEach(async () => {
    ctx = await createCliTestContext("vw-connections");
    await seedAllTools(ctx.tmpDir);
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it("attaches connection_report when --connections is set", async () => {
    const path = join(ctx.tmpDir, "wf.ga");
    await writeFile(path, JSON.stringify(chainWorkflow));

    await runValidateWorkflow(path, {
      cacheDir: ctx.tmpDir,
      json: true,
      connections: true,
    });

    const jsonOutput = ctx.logSpy.mock.calls
      .map((c) => c[0])
      .find((s) => typeof s === "string" && s.startsWith("{"));
    expect(jsonOutput).toBeDefined();
    const report = JSON.parse(jsonOutput as string) as SingleValidationReport;
    expect(report.connection_report).not.toBeNull();
    expect(report.connection_report!.valid).toBe(true);
    expect(report.connection_report!.summary.ok).toBeGreaterThan(0);
  });

  it("leaves connection_report null when --connections is not set", async () => {
    const path = join(ctx.tmpDir, "wf.ga");
    await writeFile(path, JSON.stringify(chainWorkflow));

    await runValidateWorkflow(path, {
      cacheDir: ctx.tmpDir,
      json: true,
    });

    const jsonOutput = ctx.logSpy.mock.calls
      .map((c) => c[0])
      .find((s) => typeof s === "string" && s.startsWith("{"));
    expect(jsonOutput).toBeDefined();
    const report = JSON.parse(jsonOutput as string) as SingleValidationReport;
    expect(report.connection_report).toBeNull();
  });
});

// YAML import retained to mirror sibling tests; future format2 fixture coverage may use it.
void YAML;
