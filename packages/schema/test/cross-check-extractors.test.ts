import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { checkInputMetadata } from "../src/test-format/cross-check/check-input-metadata.js";
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

describe.each([
  {
    format: "format2" as const,
    workflow: {
      inputs: {
        reads: { type: "File", format: ["fasta", "fastqsanger"] },
        pairs: { type: "collection", collection_type: "list:paired" },
        samples: "collection",
        files: { type: ["data"] },
        unconstrained: { type: "collection", collection_type: null },
      },
    },
  },
  {
    format: "native" as const,
    workflow: {
      steps: {
        0: {
          type: "data_input",
          label: "reads",
          tool_state: JSON.stringify({ format: ["fasta", "fastqsanger"] }),
        },
        1: {
          type: "data_collection_input",
          label: "pairs",
          tool_state: JSON.stringify({ collection_type: "list:paired" }),
        },
        2: {
          type: "data_collection_input",
          label: "samples",
          tool_state: JSON.stringify({}),
        },
        3: {
          type: "data_input",
          label: "files",
          tool_state: JSON.stringify({ multiple: true }),
        },
        4: {
          type: "data_collection_input",
          label: "unconstrained",
          tool_state: JSON.stringify({ collection_type: null }),
        },
      },
    },
  },
])("$format input metadata", ({ format, workflow }) => {
  const inputs = extractWorkflowInputs(workflow, format);

  it("extracts data formats, declared shape, and default collection shape", () => {
    expect(inputs).toMatchObject([
      { name: "reads", formats: ["fasta", "fastqsanger"] },
      { name: "pairs", collectionType: "list:paired" },
      { name: "samples", collectionType: "list" },
      { name: "files", multiple: true },
      { name: "unconstrained" },
    ]);
    expect(inputs[4]!.collectionType).toBeUndefined();
  });

  it("warns on a collection mapped over a file input and reports a file passed to a collection input", () => {
    const reads = inputs[0]!;
    const pairs = inputs[1]!;
    expect(
      checkInputMetadata(reads, { class: "Collection", collection_type: "list" }, "/0/job/reads"),
    ).toMatchObject([
      {
        keyword: "workflow_input_collection_map_over",
        path: "/0/job/reads/class",
        severity: "warning",
      },
    ]);
    expect(
      checkInputMetadata(pairs, { class: "File", path: "reads.fasta" }, "/0/job/pairs"),
    ).toMatchObject([{ keyword: "workflow_input_kind", path: "/0/job/pairs/class" }]);
    expect(
      checkInputMetadata(inputs[3]!, [{ class: "File", path: "reads.fasta" }], "/0/job/files"),
    ).toEqual([]);
  });

  it("reports mismatched concrete collection shapes and accepts matching ones", () => {
    const pairs = inputs[1]!;
    expect(
      checkInputMetadata(pairs, { class: "Collection", collection_type: "list" }, "/0/job/pairs"),
    ).toMatchObject([
      { keyword: "workflow_input_collection_type", path: "/0/job/pairs/collection_type" },
    ]);
    expect(
      checkInputMetadata(
        pairs,
        { class: "Collection", collection_type: "list:paired" },
        "/0/job/pairs",
      ),
    ).toEqual([]);
  });

  it("warns on a collection that maps over a collection input", () => {
    const pairs = inputs[1]!;
    expect(
      checkInputMetadata(
        pairs,
        { class: "Collection", collection_type: "list:list:paired" },
        "/0/job/pairs",
      ),
    ).toMatchObject([
      {
        keyword: "workflow_input_collection_map_over",
        path: "/0/job/pairs/collection_type",
        severity: "warning",
      },
    ]);
  });

  it("uses Galaxy datatype knowledge when supplied and leaves unknown formats unchecked", () => {
    const reads = inputs[0]!;
    const value = { class: "File", path: "reads.bam", filetype: "bam" };
    const path = "/0/job/reads";
    expect(checkInputMetadata(reads, value, path)).toEqual([]);
    expect(
      checkInputMetadata(reads, value, path, { inputFormatAccepts: () => false }),
    ).toMatchObject([{ keyword: "workflow_input_format", path: "/0/job/reads/filetype" }]);
    expect(checkInputMetadata(reads, value, path, { inputFormatAccepts: () => undefined })).toEqual(
      [],
    );
  });
});
