import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as S from "effect/Schema";
import * as YAML from "yaml";

import { ToolCache, cacheKey, ParsedTool } from "@galaxy-tool-util/core";
import { runLint } from "../src/commands/lint.js";

const simpleTool = {
  id: "simple_tool",
  version: "1.0",
  name: "Simple Tool",
  description: null,
  inputs: [
    {
      name: "input_text",
      parameter_type: "gx_text",
      type: "text",
      hidden: false,
      label: "Input",
      help: null,
      argument: null,
      is_dynamic: false,
      optional: false,
      area: false,
      value: "default",
      default_options: [],
      validators: [],
    },
  ],
  outputs: [],
  citations: [],
  license: null,
  profile: null,
  edam_operations: [],
  edam_topics: [],
  xrefs: [],
};

const SIMPLE_TOOL_ID = "toolshed.g2.bx.psu.edu/repos/test/simple/simple_tool";

async function seedTools(cacheDir: string) {
  const cache = new ToolCache({ cacheDir });
  const key = cacheKey("https://toolshed.g2.bx.psu.edu", "test~simple~simple_tool", "1.0");
  await cache.saveTool(
    key,
    S.decodeUnknownSync(ParsedTool)(simpleTool),
    SIMPLE_TOOL_ID,
    "1.0",
    "api",
  );
}

describe("gxwf lint", () => {
  let tmpDir: string;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "lint-test-"));
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    process.exitCode = undefined;
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true });
    logSpy.mockRestore();
    errSpy.mockRestore();
    warnSpy.mockRestore();
    process.exitCode = undefined;
  });

  it("lints well-formed native workflow with cached tools", async () => {
    await seedTools(tmpDir);
    const workflow = {
      a_galaxy_workflow: "true",
      "format-version": "0.1",
      steps: {
        "0": {
          id: 0,
          type: "tool",
          label: "Simple Step",
          tool_id: SIMPLE_TOOL_ID,
          tool_version: "1.0",
          tool_state: JSON.stringify({ input_text: "hello" }),
          input_connections: {},
          workflow_outputs: [{ label: "out1", output_name: "output" }],
        },
      },
    };
    const wfPath = join(tmpDir, "good.ga");
    await writeFile(wfPath, JSON.stringify(workflow));
    await runLint(wfPath, { cacheDir: tmpDir });

    const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("Structural lint: OK");
    expect(output).toContain("tool_state: OK");
  });

  it("reports best practice warnings for missing annotations", async () => {
    const workflow = {
      class: "GalaxyWorkflow",
      steps: [
        {
          tool_id: "builtin_tool",
          state: {},
          in: [],
          out: [],
        },
      ],
    };
    const wfPath = join(tmpDir, "noannotation.gxwf.yml");
    await writeFile(wfPath, YAML.stringify(workflow));
    await runLint(wfPath, { skipStateValidation: true });

    const warnings = warnSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(warnings).toContain("not annotated");
    expect(warnings).toContain("creator");
    expect(warnings).toContain("license");
    // Exit code 1 for warnings only
    expect(process.exitCode).toBe(1);
  });

  it("reports structural lint errors for broken output sources", async () => {
    const workflow = {
      class: "GalaxyWorkflow",
      inputs: [],
      outputs: [{ id: "bad_out", outputSource: "nonexistent_step/output" }],
      steps: [],
    };
    const wfPath = join(tmpDir, "badoutput.gxwf.yml");
    await writeFile(wfPath, YAML.stringify(workflow));
    await runLint(wfPath, { skipStateValidation: true, skipBestPractices: true });

    const errors = errSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(errors).toContain("nonexistent_step");
    expect(process.exitCode).toBe(2);
  });

  it("--skip-best-practices suppresses those warnings", async () => {
    const workflow = {
      class: "GalaxyWorkflow",
      steps: [
        {
          tool_id: "builtin_tool",
          state: {},
          in: [],
          out: [],
        },
      ],
    };
    const wfPath = join(tmpDir, "skip-bp.gxwf.yml");
    await writeFile(wfPath, YAML.stringify(workflow));
    await runLint(wfPath, { skipBestPractices: true, skipStateValidation: true });

    const warnings = warnSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(warnings).not.toContain("not annotated");
    expect(warnings).not.toContain("creator");
  });

  it("--skip-state-validation suppresses state checks", async () => {
    await seedTools(tmpDir);
    const workflow = {
      a_galaxy_workflow: "true",
      "format-version": "0.1",
      steps: {
        "0": {
          id: 0,
          type: "tool",
          label: "Step",
          tool_id: SIMPLE_TOOL_ID,
          tool_version: "1.0",
          tool_state: JSON.stringify({ input_text: { bad: true } }),
          input_connections: {},
          workflow_outputs: [{ label: "out", output_name: "output" }],
        },
      },
    };
    const wfPath = join(tmpDir, "skip-state.ga");
    await writeFile(wfPath, JSON.stringify(workflow));
    await runLint(wfPath, { cacheDir: tmpDir, skipStateValidation: true });

    const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("skipped");
    expect(output).not.toContain("tool_state errors");
  });

  it("both skip flags = structural-only lint", async () => {
    const workflow = {
      a_galaxy_workflow: "true",
      "format-version": "0.1",
      steps: {
        "0": {
          id: 0,
          type: "tool",
          tool_id: "some_tool",
          workflow_outputs: [{ label: "out", output_name: "output" }],
        },
      },
    };
    const wfPath = join(tmpDir, "structural-only.ga");
    await writeFile(wfPath, JSON.stringify(workflow));
    await runLint(wfPath, { skipBestPractices: true, skipStateValidation: true });

    const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("Structural lint: OK");
  });

  it("reports state validation errors for invalid tool_state", async () => {
    await seedTools(tmpDir);
    const workflow = {
      a_galaxy_workflow: "true",
      "format-version": "0.1",
      steps: {
        "0": {
          id: 0,
          type: "tool",
          label: "Bad State",
          tool_id: SIMPLE_TOOL_ID,
          tool_version: "1.0",
          tool_state: JSON.stringify({ input_text: { bad: true } }),
          input_connections: {},
          workflow_outputs: [{ label: "out", output_name: "output" }],
        },
      },
    };
    const wfPath = join(tmpDir, "bad-state.ga");
    await writeFile(wfPath, JSON.stringify(workflow));
    await runLint(wfPath, { cacheDir: tmpDir });

    const errors = errSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(errors).toContain("tool_state errors");
    expect(process.exitCode).toBe(2);
  });

  it("empty tool cache = graceful degradation", async () => {
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
          workflow_outputs: [{ label: "out", output_name: "output" }],
        },
      },
    };
    const wfPath = join(tmpDir, "empty-cache.ga");
    await writeFile(wfPath, JSON.stringify(workflow));
    await runLint(wfPath, { cacheDir: tmpDir });

    const warnings = warnSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(warnings).toContain("empty");
  });

  it("--json outputs structured report", async () => {
    const workflow = {
      a_galaxy_workflow: "true",
      "format-version": "0.1",
      steps: {
        "0": {
          id: 0,
          type: "tool",
          tool_id: "some_tool",
          workflow_outputs: [{ label: "out", output_name: "output" }],
        },
      },
    };
    const wfPath = join(tmpDir, "json-out.ga");
    await writeFile(wfPath, JSON.stringify(workflow));
    await runLint(wfPath, { skipStateValidation: true, json: true });

    const output = logSpy.mock.calls[0][0];
    const report = JSON.parse(output);
    expect(report).toHaveProperty("structural");
    expect(report).toHaveProperty("bestPractices");
    expect(report).toHaveProperty("exitCode");
  });
});
