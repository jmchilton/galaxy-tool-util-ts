import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as YAML from "yaml";

import { runClean } from "../src/commands/clean.js";

describe("gxwf clean", () => {
  let tmpDir: string;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "clean-test-"));
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    process.exitCode = undefined;
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true });
    logSpy.mockRestore();
    errSpy.mockRestore();
    stdoutSpy.mockRestore();
    process.exitCode = undefined;
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
    const wfPath = join(tmpDir, "stale.ga");
    await writeFile(wfPath, JSON.stringify(workflow));
    await runClean(wfPath, {});

    const output = stdoutSpy.mock.calls.map((c) => c[0]).join("");
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
    const wfPath = join(tmpDir, "encoded.ga");
    await writeFile(wfPath, JSON.stringify(workflow));
    await runClean(wfPath, {});

    const output = stdoutSpy.mock.calls.map((c) => c[0]).join("");
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
    const wfPath = join(tmpDir, "test.gxwf.yml");
    await writeFile(wfPath, YAML.stringify(workflow));
    await runClean(wfPath, {});

    const output = stdoutSpy.mock.calls.map((c) => c[0]).join("");
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
    const wfPath = join(tmpDir, "out.ga");
    const outPath = join(tmpDir, "cleaned.ga");
    await writeFile(wfPath, JSON.stringify(workflow));
    await runClean(wfPath, { output: outPath });

    const raw = await readFile(outPath, "utf-8");
    const cleaned = JSON.parse(raw);
    expect(cleaned.steps["0"].tool_state).not.toHaveProperty("__page__");
    expect(logSpy.mock.calls[0][0]).toContain("cleaned.ga");
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
    const wfPath = join(tmpDir, "diff.ga");
    await writeFile(wfPath, JSON.stringify(workflow));
    await runClean(wfPath, { diff: true });

    const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
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
    const wfPath = join(tmpDir, "clean.ga");
    await writeFile(wfPath, JSON.stringify(workflow));
    await runClean(wfPath, { diff: true });

    const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("No changes");
  });
});
