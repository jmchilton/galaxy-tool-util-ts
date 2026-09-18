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
});
