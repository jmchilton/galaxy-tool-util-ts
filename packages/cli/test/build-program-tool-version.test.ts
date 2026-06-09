/**
 * Regression guard: a subcommand option named `--version` is shadowed by
 * commander's program-level `--version` flag (it propagates to subcommands),
 * so the tool-version flag must be `--tool-version`. This verifies the flag
 * actually reaches the handler through a built program.
 */
import { describe, it, expect } from "vitest";
import { buildProgramFromSpec } from "../src/spec/build-program.js";
import type { ProgramSpec } from "../src/meta/spec-types.js";

const spec: ProgramSpec = {
  name: "demo",
  description: "test spec",
  version: "9.9.9",
  commands: [
    {
      name: "add",
      description: "add a tool",
      handler: "add",
      args: [{ raw: "<tool_id>", description: "Tool ID" }],
      options: [{ flags: "--tool-version <ver>", description: "Tool version" }],
    },
  ],
};

describe("--tool-version flag wiring", () => {
  it("passes --tool-version through to the handler", async () => {
    let captured: { toolId?: string; toolVersion?: string } = {};
    const handlers = {
      add: (toolId: string, opts: { toolVersion?: string }): void => {
        captured = { toolId, toolVersion: opts.toolVersion };
      },
    };
    const program = buildProgramFromSpec(spec, handlers);
    await program.parseAsync(["node", "demo", "add", "iuc/stringtie/x", "--tool-version", "3.0.3"]);
    expect(captured.toolId).toBe("iuc/stringtie/x");
    expect(captured.toolVersion).toBe("3.0.3");
  });
});
