import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import * as YAML from "yaml";

import { runClean } from "../src/commands/clean.js";
import type { SingleCleanReport } from "@galaxy-tool-util/schema";
import { createCliTestContext, type CliTestContext } from "./helpers/cli-test-context.js";

describe("gxwf clean", () => {
  let ctx: CliTestContext;

  beforeEach(async () => {
    ctx = await createCliTestContext("clean-test");
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it("strips stale keys from native workflow", async () => {
    const workflow = {
      a_galaxy_workflow: "true",
      "format-version": "0.1",
      steps: {
        "0": {
          id: 0,
          type: "tool",
          tool_id: "my_tool",
          tool_state: {
            input_text: "hello",
            __page__: 0,
            __rerun_remap_job_id__: null,
            chromInfo: "/path/to/chrom",
          },
        },
      },
    };
    const wfPath = join(ctx.tmpDir, "stale.ga");
    await writeFile(wfPath, JSON.stringify(workflow));
    await runClean(wfPath, {});

    const output = ctx.stdoutSpy.mock.calls.map((c) => c[0]).join("");
    const cleaned = JSON.parse(output);
    const state = cleaned.steps["0"].tool_state;
    expect(state.input_text).toBe("hello");
    expect(state).not.toHaveProperty("__page__");
    expect(state).not.toHaveProperty("__rerun_remap_job_id__");
    expect(state).not.toHaveProperty("chromInfo");
  });

  it("decodes JSON-encoded tool_state strings", async () => {
    const workflow = {
      a_galaxy_workflow: "true",
      "format-version": "0.1",
      steps: {
        "0": {
          id: 0,
          type: "tool",
          tool_id: "my_tool",
          tool_state: JSON.stringify({ input_text: "hello", num: "5" }),
        },
      },
    };
    const wfPath = join(ctx.tmpDir, "encoded.ga");
    await writeFile(wfPath, JSON.stringify(workflow));
    await runClean(wfPath, {});

    const output = ctx.stdoutSpy.mock.calls.map((c) => c[0]).join("");
    const cleaned = JSON.parse(output);
    expect(typeof cleaned.steps["0"].tool_state).toBe("object");
    expect(cleaned.steps["0"].tool_state.input_text).toBe("hello");
  });

  it("passes format2 workflows through unchanged", async () => {
    const workflow = {
      class: "GalaxyWorkflow",
      label: "Test",
      steps: [
        {
          tool_id: "my_tool",
          state: { input_text: "hello" },
          in: [],
          out: [],
        },
      ],
    };
    const wfPath = join(ctx.tmpDir, "test.gxwf.yml");
    await writeFile(wfPath, YAML.stringify(workflow));
    await runClean(wfPath, {});

    const output = ctx.stdoutSpy.mock.calls.map((c) => c[0]).join("");
    const cleaned = YAML.parse(output);
    expect(cleaned.class).toBe("GalaxyWorkflow");
    expect(cleaned.steps[0].state.input_text).toBe("hello");
  });

  it("writes to --output file", async () => {
    const workflow = {
      a_galaxy_workflow: "true",
      "format-version": "0.1",
      steps: {
        "0": {
          id: 0,
          type: "tool",
          tool_id: "my_tool",
          tool_state: { input_text: "hello", __page__: 0 },
        },
      },
    };
    const wfPath = join(ctx.tmpDir, "out.ga");
    const outPath = join(ctx.tmpDir, "cleaned.ga");
    await writeFile(wfPath, JSON.stringify(workflow));
    await runClean(wfPath, { output: outPath });

    const raw = await readFile(outPath, "utf-8");
    const cleaned = JSON.parse(raw);
    expect(cleaned.steps["0"].tool_state).not.toHaveProperty("__page__");
    expect(ctx.logSpy.mock.calls[0][0]).toContain("cleaned.ga");
  });

  it("shows diff with --diff flag", async () => {
    const workflow = {
      a_galaxy_workflow: "true",
      "format-version": "0.1",
      steps: {
        "0": {
          id: 0,
          type: "tool",
          tool_id: "my_tool",
          tool_state: { input_text: "hello", __page__: 0 },
        },
      },
    };
    const wfPath = join(ctx.tmpDir, "diff.ga");
    await writeFile(wfPath, JSON.stringify(workflow));
    await runClean(wfPath, { diff: true });

    const output = ctx.logSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("-");
    expect(output).toContain("+");
  });

  it("shows no changes with --diff on clean workflow", async () => {
    const workflow = {
      a_galaxy_workflow: "true",
      "format-version": "0.1",
      steps: {
        "0": {
          id: 0,
          type: "tool",
          tool_id: "my_tool",
          tool_state: { input_text: "hello" },
        },
      },
    };
    const wfPath = join(ctx.tmpDir, "clean.ga");
    await writeFile(wfPath, JSON.stringify(workflow));
    await runClean(wfPath, { diff: true });

    const output = ctx.logSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("No changes");
  });

  it("--json outputs SingleCleanReport with removed keys", async () => {
    const workflow = {
      a_galaxy_workflow: "true",
      "format-version": "0.1",
      steps: {
        "0": {
          id: 0,
          type: "tool",
          tool_id: "my_tool",
          tool_version: "1.0",
          tool_state: {
            input_text: "hello",
            __page__: 0,
            chromInfo: "/path",
          },
        },
      },
    };
    const wfPath = join(ctx.tmpDir, "json-clean.ga");
    await writeFile(wfPath, JSON.stringify(workflow));
    await runClean(wfPath, { json: true });

    const output = ctx.logSpy.mock.calls[0][0];
    const report: SingleCleanReport = JSON.parse(output);
    expect(report.workflow).toBe(wfPath);
    expect(report.results).toHaveLength(1);
    expect(report.results[0].tool_id).toBe("my_tool");
    expect(report.results[0].removed_keys).toContain("__page__");
    expect(report.results[0].removed_keys).toContain("chromInfo");
    expect(report.results[0].skipped).toBe(false);
    expect(report.results[0].display_label).toContain("my_tool");
    expect(report.total_removed).toBe(2);
    expect(report.steps_with_removals).toBe(1);
  });

  it("--json reports no removals for clean workflow", async () => {
    const workflow = {
      a_galaxy_workflow: "true",
      "format-version": "0.1",
      steps: {
        "0": {
          id: 0,
          type: "tool",
          tool_id: "my_tool",
          tool_state: { input_text: "hello" },
        },
      },
    };
    const wfPath = join(ctx.tmpDir, "json-noop.ga");
    await writeFile(wfPath, JSON.stringify(workflow));
    await runClean(wfPath, { json: true });

    const output = ctx.logSpy.mock.calls[0][0];
    const report: SingleCleanReport = JSON.parse(output);
    expect(report.total_removed).toBe(0);
    expect(report.steps_with_removals).toBe(0);
    expect(report.results[0].removed_keys).toEqual([]);
  });
});
