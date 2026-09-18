/**
 * An `in:` key that names no parameter of the pinned tool must fail whichever
 * state block the step carries. The `state` path reported it; the native
 * `tool_state` path made the same injectConnectionsIntoState call and dropped
 * the unmatched keys, so a stray connection validated green on every step that
 * carried tool_state — which, after `gxwf convert --to format2`, is all of them.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import * as YAML from "yaml";

import { runValidateWorkflow } from "../src/commands/validate-workflow.js";
import type { SingleValidationReport } from "@galaxy-tool-util/schema";
import { createCliTestContext, type CliTestContext } from "./helpers/cli-test-context.js";
import { seedAllTools, DATA_TOOL_ID } from "./helpers/fixtures.js";

function workflow(stateKey: "state" | "tool_state", connectionKey: string) {
  return {
    class: "GalaxyWorkflow",
    inputs: { reads: { type: "data" } },
    outputs: {},
    steps: {
      consume: {
        tool_id: DATA_TOOL_ID,
        tool_version: "1.0",
        in: { [connectionKey]: "reads" },
        out: [{ id: "output" }],
        [stateKey]: { input_file: { __class__: "ConnectedValue" }, threshold: 0.5 },
      },
    },
  };
}

describe("gxwf validate: connection keys vs the tool's parameters", () => {
  let ctx: CliTestContext;

  beforeEach(async () => {
    ctx = await createCliTestContext("vw-connection-keys");
    await seedAllTools(ctx.tmpDir);
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  async function validate(doc: unknown): Promise<SingleValidationReport> {
    const path = join(ctx.tmpDir, "wf.gxwf.yml");
    await writeFile(path, YAML.stringify(doc));
    await runValidateWorkflow(path, { cacheDir: ctx.tmpDir, json: true });
    const out = ctx.logSpy.mock.calls
      .map((c) => c[0])
      .find((s) => typeof s === "string" && s.startsWith("{"));
    expect(out).toBeDefined();
    return JSON.parse(out as string) as SingleValidationReport;
  }

  it("fails an unmatched connection key on a step carrying tool_state", async () => {
    const report = await validate(workflow("tool_state", "not_a_real_port"));

    expect(report.results[0].status).toBe("fail");
    expect(report.results[0].errors).toContain(
      'No parameter definition matching connection key "not_a_real_port"',
    );
  });

  it("fails an unmatched connection key on a step carrying state", async () => {
    const report = await validate(workflow("state", "not_a_real_port"));

    expect(report.results[0].status).toBe("fail");
    expect(report.results[0].errors).toContain(
      'No parameter definition matching connection key "not_a_real_port"',
    );
  });

  it("still passes a matching connection key under tool_state", async () => {
    const report = await validate(workflow("tool_state", "input_file"));

    expect(report.results[0].status).toBe("ok");
    expect(report.results[0].errors).toEqual([]);
  });
  it("does not flag the step-level `when` connection on a conditional native step", async () => {
    // Galaxy wires a conditional step's skip-if expression through
    // input_connections under `when`; it names no tool parameter. 136 steps
    // across 24 IWC workflows do this.
    const path = join(ctx.tmpDir, "wf.ga");
    await writeFile(
      path,
      JSON.stringify({
        a_galaxy_workflow: "true",
        "format-version": "0.1",
        steps: {
          "0": { id: 0, type: "data_input", label: "in", tool_id: null, tool_state: "{}" },
          "1": { id: 1, type: "parameter_input", label: "run_me", tool_id: null, tool_state: "{}" },
          "2": {
            id: 2,
            type: "tool",
            label: "conditional",
            tool_id: DATA_TOOL_ID,
            tool_version: "1.0",
            tool_state: JSON.stringify({ input_file: { __class__: "ConnectedValue" } }),
            when: "$(inputs.when)",
            input_connections: {
              input_file: [{ id: 0, output_name: "output" }],
              when: [{ id: 1, output_name: "output" }],
            },
          },
        },
      }),
    );

    await runValidateWorkflow(path, { cacheDir: ctx.tmpDir, json: true });
    const out = ctx.logSpy.mock.calls
      .map((c) => c[0])
      .find((s) => typeof s === "string" && s.startsWith("{"));
    const report = JSON.parse(out as string) as SingleValidationReport;

    expect(report.results.map((r) => r.status)).toEqual(["ok"]);
  });

  it("does not flag format2 inputs referenced by a `when:` expression", async () => {
    const report = await validate({
      class: "GalaxyWorkflow",
      inputs: { reads: { type: "data" }, run_me: { type: "boolean" } },
      outputs: {},
      steps: {
        consume: {
          tool_id: DATA_TOOL_ID,
          tool_version: "1.0",
          when: "$(inputs.should_run)",
          in: { input_file: "reads", should_run: "run_me" },
          out: [{ id: "output" }],
          tool_state: { input_file: { __class__: "ConnectedValue" }, threshold: 0.5 },
        },
      },
    });

    expect(report.results[0].status).toBe("ok");
  });
});
