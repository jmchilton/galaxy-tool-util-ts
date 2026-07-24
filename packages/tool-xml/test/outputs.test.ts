import { describe, expect, it } from "vitest";
import * as S from "effect/Schema";
import { ToolOutput } from "@galaxy-tool-util/schema";
import type {
  ToolOutputCollection,
  ToolOutputDataset,
  FilePatternDatasetCollectionDescription,
} from "@galaxy-tool-util/schema";

import { xmlToolSourceFromStringNoImports } from "../src/index.js";

/**
 * Unit tests for XmlToolSource.parseOutputs — the port of
 * XmlToolSource.parse_outputs + output_objects.from_tool_source. Produces the
 * `ToolOutput` union; every produced output is validated against the Effect
 * schema (the shape /api/tools/:id/parsed serves).
 */

const DEFAULT_PATTERN =
  "primary_DATASET_ID_(?P<designation>[^_]+)_(?P<visible>[^_]+)_(?P<ext>[^_]+)(_(?P<dbkey>[^_]+))?";

type ToolOutputT = S.Schema.Type<typeof ToolOutput>;

function outputs(inner: string, attrs = `id="x" profile="23.0"`): ToolOutputT[] {
  const src = xmlToolSourceFromStringNoImports(`<tool ${attrs}><outputs>${inner}</outputs></tool>`);
  const result = src.parseOutputs();
  for (const o of result) expect(() => S.decodeUnknownSync(ToolOutput)(o)).not.toThrow();
  return result;
}

describe("XmlToolSource.parseOutputs", () => {
  it("returns [] when there is no <outputs> element", () => {
    const src = xmlToolSourceFromStringNoImports(`<tool id="x"/>`);
    expect(src.parseOutputs()).toEqual([]);
  });

  it("parses a data output with format/format_source/from_work_dir/hidden", () => {
    const [o] = outputs(
      `<data name="out1" format="bam" format_source="in1" from_work_dir="out.bam" hidden="true"/>`,
    );
    const d = o as ToolOutputDataset;
    expect(d.type).toBe("data");
    expect(d.name).toBe("out1");
    expect(d.format).toBe("bam");
    expect(d.format_source).toBe("in1");
    expect(d.from_work_dir).toBe("out.bam");
    expect(d.hidden).toBe(true);
    expect(d.label).toBeNull();
    // Non-legacy profile → no default collector.
    expect(d.discover_datasets).toEqual([]);
  });

  it("defaults format to 'data' and reads a <label> child element", () => {
    const [o] = outputs(`<data name="o"><label>My Output</label></data>`);
    const d = o as ToolOutputDataset;
    expect(d.format).toBe("data");
    expect(d.label).toBe("My Output");
  });

  it("maps auto_format to _sniff_ and rejects auto_format with an explicit format", () => {
    const [o] = outputs(`<data name="o" auto_format="true"/>`);
    expect((o as ToolOutputDataset).format).toBe("_sniff_");
    expect(() => outputs(`<data name="o" format="bam" auto_format="true"/>`)).toThrow(
      /auto_format is not supported/,
    );
  });

  it("parses expression outputs (integer/float/boolean/text)", () => {
    for (const t of ["integer", "float", "boolean", "text"] as const) {
      const [o] = outputs(`<output name="v" type="${t}"/>`);
      expect(o.type).toBe(t);
      expect(o.name).toBe("v");
    }
  });

  it("throws on an unknown expression output type", () => {
    expect(() => outputs(`<output name="v" type="mystery"/>`)).toThrow(/Unknown output type/);
  });

  it("parses a collection with type / type_source / structured_like; label defaults to ''", () => {
    const [typed] = outputs(`<collection name="c" type="list"/>`);
    expect((typed as ToolOutputCollection).structure.collection_type).toBe("list");
    // Collections default label to "" (xml_text default), unlike data's null.
    expect((typed as ToolOutputCollection).label).toBe("");

    const [src] = outputs(`<collection name="c" type_source="in1"/>`);
    expect((src as ToolOutputCollection).structure.collection_type_source).toBe("in1");

    const [like] = outputs(`<collection name="c" structured_like="in1"/>`);
    expect((like as ToolOutputCollection).structure.structured_like).toBe("in1");
  });

  it("parses discover_datasets on a collection, inheriting the collection format", () => {
    const [o] = outputs(
      `<collection name="c" type="list" format="fasta"><discover_datasets pattern="__name__" directory="out" visible="true"/></collection>`,
    );
    const dd = (o as ToolOutputCollection).structure.discover_datasets;
    expect(dd).toHaveLength(1);
    const first = dd![0] as FilePatternDatasetCollectionDescription;
    expect(first.discover_via).toBe("pattern");
    expect(first.pattern).toBe("(?P<name>.*)");
    expect(first.directory).toBe("out");
    expect(first.visible).toBe(true);
    expect(first.format).toBe("fasta");
  });

  it("parses a tool_provided_metadata discover_datasets descriptor", () => {
    const [o] = outputs(
      `<data name="o"><discover_datasets from_provided_metadata="true" visible="true"/></data>`,
    );
    const dd = (o as ToolOutputDataset).discover_datasets;
    expect(dd).toHaveLength(1);
    expect(dd![0].discover_via).toBe("tool_provided_metadata");
    expect(dd![0].visible).toBe(true);
  });

  it("parses discover_datasets on a data output, inheriting the data format", () => {
    const [o] = outputs(
      `<data name="o" format="txt"><discover_datasets pattern="__name__" visible="true"/></data>`,
    );
    const dd = (o as ToolOutputDataset).discover_datasets;
    expect(dd).not.toBeNull();
    const first = dd![0] as FilePatternDatasetCollectionDescription;
    expect(first.discover_via).toBe("pattern");
    expect(first.pattern).toBe("(?P<name>.*)");
    expect(first.visible).toBe(true);
    // format inherited from the <data format="txt"> when the block sets neither.
    expect(first.format).toBe("txt");
  });

  it("prefers a discover_datasets ext over format (ext-first, matching Galaxy)", () => {
    const [o] = outputs(`<data name="o"><discover_datasets ext="fasta" format="txt"/></data>`);
    const dd = (o as ToolOutputDataset).discover_datasets;
    expect((dd![0] as FilePatternDatasetCollectionDescription).format).toBe("fasta");
  });

  it("adds the default collector for legacy (16.01) data outputs with no discover_datasets", () => {
    const [o] = outputs(`<data name="o"/>`, `id="x" profile="16.01"`);
    const dd = (o as ToolOutputDataset).discover_datasets;
    expect(dd).toHaveLength(1);
    const first = dd![0] as FilePatternDatasetCollectionDescription;
    expect(first.discover_via).toBe("pattern");
    expect(first.pattern).toBe(DEFAULT_PATTERN);
  });

  it("orders collections before data outputs, then expression outputs", () => {
    // Document order is data, collection, expression — but Python emits
    // collections first, then data, then expression.
    const result = outputs(
      `<data name="d1"/><collection name="c1" type="list"/><output name="e1" type="integer"/>`,
    );
    expect(result.map((o) => o.name)).toEqual(["c1", "d1", "e1"]);
  });

  it("strips from_work_dir for pre-21.09 profiles but not after", () => {
    const [oldOut] = outputs(
      `<data name="o" from_work_dir="out.txt  "/>`,
      `id="x" profile="20.09"`,
    );
    expect((oldOut as ToolOutputDataset).from_work_dir).toBe("out.txt");
    const [newOut] = outputs(
      `<data name="o" from_work_dir="out.txt  "/>`,
      `id="x" profile="21.09"`,
    );
    expect((newOut as ToolOutputDataset).from_work_dir).toBe("out.txt  ");
  });
});
