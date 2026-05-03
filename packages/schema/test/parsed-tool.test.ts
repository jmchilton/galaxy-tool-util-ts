import { describe, it, expect } from "vitest";
import * as S from "effect/Schema";
import Ajv2020Import from "ajv/dist/2020.js";
import { ParsedTool, parsedToolSchema } from "../src/schema/parsed-tool.js";
import fastqcFixture from "../../core/test/fixtures/fastqc-parsed-tool.json" with { type: "json" };

const Ajv2020 = Ajv2020Import as unknown as typeof Ajv2020Import.default;

describe("ParsedTool", () => {
  it("decodes a real ToolShed fastqc response", () => {
    const result = S.decodeUnknownSync(ParsedTool)(fastqcFixture);
    expect(result.id).toBe("fastqc");
    expect(result.name).toBe("FastQC");
    expect(result.version).toBe("0.74+galaxy0");
    expect(result.inputs).toHaveLength(7);
    expect(result.outputs).toHaveLength(2);
    expect(result.citations).toHaveLength(1);
    expect(result.citations[0].type).toBe("bibtex");
    expect(result.xrefs).toHaveLength(1);
    expect(result.xrefs[0].type).toBe("bio.tools");
    expect(result.help?.format).toBe("restructuredtext");
    expect(result.license).toBeNull();
    expect(result.profile).toBe("16.01");
    expect(result.edam_operations).toEqual([]);
    expect(result.edam_topics).toEqual([]);
  });

  it("decodes FastQC data outputs with typed fields", () => {
    const result = S.decodeUnknownSync(ParsedTool)(fastqcFixture);
    const output = result.outputs[0];
    if (!output || output.type !== "data") {
      throw new Error("expected first FastQC output to be a data output");
    }

    expect(output.name).toBe("html_file");
    expect(output.format).toBe("html");
    expect(output.from_work_dir).toBe("output.html");
    expect(output.discover_datasets).toHaveLength(1);

    const discovery = output.discover_datasets?.[0];
    if (!discovery || discovery.discover_via !== "pattern") {
      throw new Error("expected FastQC output discovery by pattern");
    }
    expect(discovery.pattern).toContain("primary_DATASET_ID");
    expect(discovery.sort_key).toBe("filename");
  });

  it("decodes collection and simple scalar outputs", () => {
    const tool = {
      id: "output_shapes",
      version: null,
      name: "Output Shapes",
      description: null,
      inputs: [],
      outputs: [
        {
          name: "summary",
          label: null,
          hidden: false,
          type: "text",
        },
        {
          name: "count",
          label: null,
          hidden: false,
          type: "integer",
        },
        {
          name: "scores",
          label: "scores",
          hidden: false,
          type: "collection",
          structure: {
            collection_type: "list",
            collection_type_source: null,
            collection_type_from_rules: null,
            structured_like: null,
            discover_datasets: [
              {
                discover_via: "tool_provided_metadata",
                format: "txt",
                visible: true,
                assign_primary_output: false,
                directory: null,
                recurse: false,
                match_relative_path: false,
              },
            ],
          },
        },
      ],
      citations: [],
      license: null,
      profile: null,
      edam_operations: [],
      edam_topics: [],
      xrefs: [],
    };

    const result = S.decodeUnknownSync(ParsedTool)(tool);
    expect(result.outputs.map((output) => output.type)).toEqual(["text", "integer", "collection"]);

    const collection = result.outputs[2];
    if (!collection || collection.type !== "collection") {
      throw new Error("expected third output to be a collection output");
    }
    expect(collection.structure.collection_type).toBe("list");
    expect(collection.structure.discover_datasets?.[0]?.discover_via).toBe("tool_provided_metadata");
  });

  it("exports a JSON Schema that validates FastQC parsed tool fixtures", () => {
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    const validate = ajv.compile(parsedToolSchema as object);

    expect(validate(fastqcFixture), JSON.stringify(validate.errors)).toBe(true);
    expect(JSON.stringify(parsedToolSchema)).toContain("from_work_dir");
    expect(JSON.stringify(parsedToolSchema)).toContain("tool_provided_metadata");
  });

  it("exports a JSON Schema with typed output requirements", () => {
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    const validate = ajv.compile(parsedToolSchema as object);
    const invalid = {
      ...fastqcFixture,
      outputs: [{ name: "bad", label: null, hidden: false, type: "data" }],
    };

    expect(validate(invalid)).toBe(false);
  });

  it("rejects missing required fields", () => {
    expect(() => S.decodeUnknownSync(ParsedTool)({})).toThrow();
    expect(() => S.decodeUnknownSync(ParsedTool)({ id: "x" })).toThrow();
  });

  it("accepts minimal valid shape", () => {
    const minimal = {
      id: "test_tool",
      version: null,
      name: "Test",
      description: null,
      inputs: [],
      outputs: [],
      citations: [],
      license: null,
      profile: null,
      edam_operations: [],
      edam_topics: [],
      xrefs: [],
    };
    const result = S.decodeUnknownSync(ParsedTool)(minimal);
    expect(result.id).toBe("test_tool");
    expect(result.help).toBeUndefined();
  });

  it("accepts help as null", () => {
    const withNullHelp = {
      id: "test",
      version: "1.0",
      name: "Test",
      description: "desc",
      inputs: [],
      outputs: [],
      citations: [],
      license: null,
      profile: null,
      edam_operations: [],
      edam_topics: [],
      xrefs: [],
      help: null,
    };
    const result = S.decodeUnknownSync(ParsedTool)(withNullHelp);
    expect(result.help).toBeNull();
  });
});
