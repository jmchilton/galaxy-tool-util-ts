import { describe, it, expect } from "vitest";
import * as S from "effect/Schema";
import { ParsedTool } from "../src/schema/parsed-tool.js";
import fastqcFixture from "../../core/test/fixtures/fastqc-parsed-tool.json" with { type: "json" };

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
