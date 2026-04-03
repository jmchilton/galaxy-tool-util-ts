import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as YAML from "yaml";

import { runConvert } from "../src/commands/convert.js";

const nativeWorkflow = {
  a_galaxy_workflow: "true",
  "format-version": "0.1",
  name: "Test Native",
  steps: {
    "0": {
      id: 0,
      type: "data_input",
      label: "Input Dataset",
      tool_id: null,
    },
    "1": {
      id: 1,
      type: "tool",
      label: "Step 1",
      tool_id: "cat1",
      tool_version: "1.0",
      tool_state: JSON.stringify({ input1: null, queries: [] }),
      input_connections: {
        input1: { id: 0, output_name: "output" },
      },
    },
  },
};

const format2Workflow = {
  class: "GalaxyWorkflow",
  label: "Test Format2",
  inputs: [{ id: "input_ds", type: "data" }],
  outputs: [],
  steps: [
    {
      id: "step1",
      tool_id: "cat1",
      tool_version: "1.0",
      state: { queries: [] },
      in: [{ id: "input1", source: "input_ds/output" }],
      out: [],
    },
  ],
};

describe("gxwf convert", () => {
  let tmpDir: string;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "convert-test-"));
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

  it("converts native to format2", async () => {
    const wfPath = join(tmpDir, "test.ga");
    await writeFile(wfPath, JSON.stringify(nativeWorkflow));
    await runConvert(wfPath, {});

    const output = stdoutSpy.mock.calls.map((c) => c[0]).join("");
    const converted = YAML.parse(output);
    expect(converted.class).toBe("GalaxyWorkflow");
    expect(converted.steps).toBeDefined();
  });

  it("converts format2 to native", async () => {
    const wfPath = join(tmpDir, "test.gxwf.yml");
    await writeFile(wfPath, YAML.stringify(format2Workflow));
    await runConvert(wfPath, {});

    const output = stdoutSpy.mock.calls.map((c) => c[0]).join("");
    const converted = JSON.parse(output);
    expect(converted.a_galaxy_workflow).toBe("true");
    expect(converted.steps).toBeDefined();
  });

  it("round-trips native -> format2 -> native preserving key fields", async () => {
    // Native -> Format2
    const nativePath = join(tmpDir, "original.ga");
    await writeFile(nativePath, JSON.stringify(nativeWorkflow));
    await runConvert(nativePath, {});
    const f2Output = stdoutSpy.mock.calls.map((c) => c[0]).join("");
    stdoutSpy.mockClear();

    // Format2 -> Native
    const f2Path = join(tmpDir, "converted.gxwf.yml");
    await writeFile(f2Path, f2Output);
    await runConvert(f2Path, {});
    const nativeOutput = stdoutSpy.mock.calls.map((c) => c[0]).join("");
    const roundTripped = JSON.parse(nativeOutput);

    expect(roundTripped.a_galaxy_workflow).toBe("true");
    expect(Object.keys(roundTripped.steps).length).toBe(Object.keys(nativeWorkflow.steps).length);
  });

  it("--compact strips position data from format2 output", async () => {
    const wfPath = join(tmpDir, "compact.ga");
    await writeFile(wfPath, JSON.stringify(nativeWorkflow));
    await runConvert(wfPath, { compact: true });

    const output = stdoutSpy.mock.calls.map((c) => c[0]).join("");
    const converted = YAML.parse(output);
    // Steps should not have position
    if (converted.steps) {
      for (const step of Array.isArray(converted.steps)
        ? converted.steps
        : Object.values(converted.steps)) {
        expect((step as Record<string, unknown>).position).toBeUndefined();
      }
    }
  });

  it("auto-detects target format as opposite of source", async () => {
    // Native input -> should auto-target format2
    const wfPath = join(tmpDir, "auto.ga");
    await writeFile(wfPath, JSON.stringify(nativeWorkflow));
    await runConvert(wfPath, {});

    const output = stdoutSpy.mock.calls.map((c) => c[0]).join("");
    const converted = YAML.parse(output);
    expect(converted.class).toBe("GalaxyWorkflow");
  });

  it("errors when source and target are same format", async () => {
    const wfPath = join(tmpDir, "same.ga");
    await writeFile(wfPath, JSON.stringify(nativeWorkflow));
    await runConvert(wfPath, { to: "native" });

    const errors = errSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(errors).toContain("both native");
    expect(process.exitCode).toBe(1);
  });

  it("writes to --output file", async () => {
    const wfPath = join(tmpDir, "out.ga");
    const outPath = join(tmpDir, "converted.gxwf.yml");
    await writeFile(wfPath, JSON.stringify(nativeWorkflow));
    await runConvert(wfPath, { output: outPath });

    const raw = await readFile(outPath, "utf-8");
    const converted = YAML.parse(raw);
    expect(converted.class).toBe("GalaxyWorkflow");
    expect(logSpy.mock.calls[0][0]).toContain("converted.gxwf.yml");
  });
});
