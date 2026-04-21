import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import {
  extractWorkflowInputs,
  extractWorkflowOutputs,
} from "../src/test-format/cross-check/index.js";

const FIXTURES = join(
  fileURLToPath(new URL(".", import.meta.url)),
  "fixtures",
  "test-format",
  "workflows",
);

function load(path: string): Record<string, unknown> {
  const raw = readFileSync(join(FIXTURES, path), "utf-8");
  if (path.endsWith(".ga") || path.endsWith(".json")) return JSON.parse(raw);
  return parseYaml(raw);
}

describe("format2 extractor (basic.gxwf.yml)", () => {
  const wf = load("basic.gxwf.yml");

  it("extracts three declared inputs with names + types", () => {
    const inputs = extractWorkflowInputs(wf, "format2");
    expect(inputs.map((i) => i.name)).toEqual(["input_file", "threshold", "description"]);
    expect(inputs.find((i) => i.name === "input_file")?.type).toBe("File");
    expect(inputs.find((i) => i.name === "threshold")?.type).toBe("int");
    expect(inputs.find((i) => i.name === "description")?.type).toBe("string");
  });

  it("captures default and optional flags", () => {
    const inputs = extractWorkflowInputs(wf, "format2");
    const threshold = inputs.find((i) => i.name === "threshold")!;
    expect(threshold.default).toBe(5);
    expect(threshold.optional).toBe(true);
    const inputFile = inputs.find((i) => i.name === "input_file")!;
    expect(inputFile.optional).toBeFalsy();
  });

  it("captures doc strings", () => {
    const inputs = extractWorkflowInputs(wf, "format2");
    expect(inputs.find((i) => i.name === "input_file")?.doc).toBe("required input dataset");
  });

  it("extracts output names in declaration order", () => {
    const outputs = extractWorkflowOutputs(wf, "format2");
    expect(outputs.map((o) => o.name)).toEqual(["result", "summary"]);
  });
});

describe("native extractor (basic.ga)", () => {
  const wf = load("basic.ga");

  it("extracts inputs from data_input + parameter_input steps", () => {
    const inputs = extractWorkflowInputs(wf, "native");
    expect(inputs.map((i) => i.name).sort()).toEqual(["description", "input_file", "threshold"]);
  });

  it("maps data_input → 'data', parameter_input type from tool_state", () => {
    const inputs = extractWorkflowInputs(wf, "native");
    expect(inputs.find((i) => i.name === "input_file")?.type).toBe("data");
    expect(inputs.find((i) => i.name === "threshold")?.type).toBe("integer");
    expect(inputs.find((i) => i.name === "description")?.type).toBe("text");
  });

  it("captures default + optional from tool_state", () => {
    const inputs = extractWorkflowInputs(wf, "native");
    const threshold = inputs.find((i) => i.name === "threshold")!;
    expect(threshold.optional).toBe(true);
    expect(threshold.default).toBe(5);
    expect(inputs.find((i) => i.name === "input_file")?.optional).toBe(false);
  });

  it("extracts outputs from workflow_outputs with uuids", () => {
    const outputs = extractWorkflowOutputs(wf, "native");
    expect(outputs.map((o) => o.name).sort()).toEqual(["result", "summary"]);
    expect(outputs.find((o) => o.name === "result")?.uuid).toBe(
      "11111111-1111-1111-1111-111111111111",
    );
  });
});

describe("format2 shorthand (name: File)", () => {
  const wf = load("shorthand.gxwf.yml");

  it("parses bare-string shorthand entries", () => {
    const inputs = extractWorkflowInputs(wf, "format2");
    expect(inputs).toEqual([
      { name: "bare_file", type: "File" },
      { name: "bare_int", type: "int" },
    ]);
  });
});

describe("format auto-detect via resolveFormat", () => {
  it("auto-detects format2 when format arg omitted", () => {
    const wf = load("basic.gxwf.yml");
    expect(extractWorkflowInputs(wf).length).toBe(3);
  });
  it("auto-detects native when format arg omitted", () => {
    const wf = load("basic.ga");
    expect(extractWorkflowInputs(wf).length).toBe(3);
  });
});
