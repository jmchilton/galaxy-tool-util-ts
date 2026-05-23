/**
 * Smoke tests for `parseInlineTool` — the TS port of Galaxy's
 * `parse_tool(YamlToolSource(repr))`. Validates the produced `ParsedTool`
 * against the Effect schema (the same shape `/api/tools/:id/parsed` returns)
 * and spot-checks the input/output translation.
 */
import { describe, it, expect } from "vitest";
import * as S from "effect/Schema";

import { parseInlineTool } from "../src/user-tool-parse/index.js";
import { ParsedTool } from "../src/schema/parsed-tool.js";
import type {
  ConditionalParameterModel,
  DataParameterModel,
  DataCollectionParameterModel,
} from "../src/schema/bundle-types.js";

const MIN_TOOL = {
  class: "GalaxyUserTool",
  id: "mytool",
  name: "My Tool",
  version: "0.1.0",
  container: "quay.io/biocontainers/python:3.13",
  shell_command: "echo hi",
  inputs: [],
  outputs: [],
};

function repr(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...structuredClone(MIN_TOOL), ...overrides };
}

describe("parseInlineTool", () => {
  it("produces a ParsedTool that validates against the schema", () => {
    const parsed = parseInlineTool(repr());
    expect(() => S.decodeUnknownSync(ParsedTool)(parsed)).not.toThrow();
    expect(parsed.id).toBe("mytool");
    expect(parsed.name).toBe("My Tool");
    expect(parsed.version).toBe("0.1.0");
    expect(parsed.profile).toBe("24.2");
  });

  it("rejects non-GalaxyUserTool inputs", () => {
    expect(() => parseInlineTool(repr({ class: "GalaxyTool" }))).toThrow(/GalaxyUserTool/);
  });

  it("translates gx_data input with extensions and multiple", () => {
    const parsed = parseInlineTool(
      repr({
        inputs: [{ type: "data", name: "in1", format: "fasta", multiple: true, optional: true }],
      }),
    );
    expect(parsed.inputs).toHaveLength(1);
    const p = parsed.inputs[0] as DataParameterModel;
    expect(p.parameter_type).toBe("gx_data");
    expect(p.multiple).toBe(true);
    expect(p.optional).toBe(true);
    expect(p.extensions).toEqual(["fasta"]);
  });

  it("translates gx_data_collection input with collection_type", () => {
    const parsed = parseInlineTool(
      repr({
        inputs: [{ type: "data_collection", name: "c", collection_type: "list", format: "txt" }],
      }),
    );
    const p = parsed.inputs[0] as DataCollectionParameterModel;
    expect(p.parameter_type).toBe("gx_data_collection");
    expect(p.collection_type).toBe("list");
    expect(p.extensions).toEqual(["txt"]);
  });

  it("translates a conditional with whens and is_default_when on the default branch", () => {
    const parsed = parseInlineTool(
      repr({
        inputs: [
          {
            type: "conditional",
            name: "mode",
            test_parameter: {
              type: "select",
              name: "kind",
              options: [{ value: "a", selected: true }, { value: "b" }],
            },
            whens: [
              { discriminator: "a", parameters: [{ type: "integer", name: "x" }] },
              { discriminator: "b", parameters: [{ type: "text", name: "y" }] },
            ],
          },
        ],
      }),
    );
    const cond = parsed.inputs[0] as ConditionalParameterModel;
    expect(cond.parameter_type).toBe("gx_conditional");
    expect(cond.whens).toHaveLength(2);
    const aBranch = cond.whens.find((w) => w.discriminator === "a");
    const bBranch = cond.whens.find((w) => w.discriminator === "b");
    expect(aBranch?.is_default_when).toBe(true);
    expect(bBranch?.is_default_when).toBe(false);
  });

  it("translates output data with format/format_source", () => {
    const parsed = parseInlineTool(
      repr({
        outputs: [
          {
            type: "data",
            name: "out1",
            format: "bam",
            format_source: "in1",
            from_work_dir: "out.bam",
          },
        ],
      }),
    );
    expect(parsed.outputs).toHaveLength(1);
    const o = parsed.outputs[0];
    expect(o.type).toBe("data");
    if (o.type !== "data") throw new Error("expected data");
    expect(o.format).toBe("bam");
    expect(o.format_source).toBe("in1");
    expect(o.from_work_dir).toBe("out.bam");
  });

  it("translates output collection structure (collection_type, type_source, structured_like)", () => {
    const parsedTyped = parseInlineTool(
      repr({ outputs: [{ type: "collection", name: "c", collection_type: "list" }] }),
    );
    const typed = parsedTyped.outputs[0];
    if (typed.type !== "collection") throw new Error("expected collection");
    expect(typed.structure.collection_type).toBe("list");

    const parsedSrc = parseInlineTool(
      repr({ outputs: [{ type: "collection", name: "c", type_source: "in1" }] }),
    );
    const fromSrc = parsedSrc.outputs[0];
    if (fromSrc.type !== "collection") throw new Error("expected collection");
    expect(fromSrc.structure.collection_type_source).toBe("in1");

    const parsedLike = parseInlineTool(
      repr({ outputs: [{ type: "collection", name: "c", structured_like: "in1" }] }),
    );
    const like = parsedLike.outputs[0];
    if (like.type !== "collection") throw new Error("expected collection");
    expect(like.structure.structured_like).toBe("in1");
  });

  it("translates string help to markdown HelpContent", () => {
    const parsed = parseInlineTool(repr({ help: "hello" }));
    expect(parsed.help).toEqual({ format: "markdown", content: "hello" });
  });

  it("preserves citations, license, xrefs, edam metadata", () => {
    const parsed = parseInlineTool(
      repr({
        citations: [{ type: "doi", content: "10.1/x" }],
        license: "MIT",
        xrefs: [{ value: "abc", type: "bio.tools" }, { value: "no-type" }],
        edam_operations: ["operation_0004"],
        edam_topics: ["topic_3047"],
      }),
    );
    expect(parsed.citations).toEqual([{ type: "doi", content: "10.1/x" }]);
    expect(parsed.license).toBe("MIT");
    expect(parsed.xrefs).toEqual([{ value: "abc", type: "bio.tools" }]);
    expect(parsed.edam_operations).toEqual(["operation_0004"]);
    expect(parsed.edam_topics).toEqual(["topic_3047"]);
  });

  it("expands the named __default__ discover_datasets pattern", () => {
    const parsed = parseInlineTool(
      repr({
        outputs: [
          {
            type: "data",
            name: "o",
            discover_datasets: [{ pattern: "__default__", visible: true, format: "txt" }],
          },
        ],
      }),
    );
    const o = parsed.outputs[0];
    if (o.type !== "data") throw new Error("expected data");
    const dd = o.discover_datasets;
    if (!dd || dd[0]?.discover_via !== "pattern") throw new Error("expected pattern collector");
    expect(dd[0].pattern).toContain("primary_DATASET_ID_");
    expect(dd[0].visible).toBe(true);
    expect(dd[0].format).toBe("txt");
  });
});
