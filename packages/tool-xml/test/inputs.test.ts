import { describe, expect, it } from "vitest";
import type {
  ToolParameterModel,
  IntegerParameterModel,
  BooleanParameterModel,
  DataParameterModel,
  DataColumnParameterModel,
  DataCollectionParameterModel,
  SelectParameterModel,
  TextParameterModel,
  DrillDownParameterModel,
  RepeatParameterModel,
  SectionParameterModel,
  ConditionalParameterModel,
} from "@galaxy-tool-util/schema";

import { xmlToolSourceFromStringNoImports } from "../src/index.js";

/**
 * Unit tests for the XML-backed input source (XmlInputSource / XmlPageSource)
 * feeding the shared parameter-model factory. This first slice covers leaf
 * <param> types (plus a repeat smoke test), asserting the XML-specific field
 * extraction; the shared factory's model shapes are covered on the dict side.
 */

function inputs(inner: string, attrs = `id="x" profile="23.0"`): ToolParameterModel[] {
  const src = xmlToolSourceFromStringNoImports(`<tool ${attrs}><inputs>${inner}</inputs></tool>`);
  return src.parseInputs();
}

describe("XmlInputSource — leaf params", () => {
  it("returns [] when there is no <inputs> element", () => {
    const src = xmlToolSourceFromStringNoImports(`<tool id="x" profile="23.0"/>`);
    expect(src.parseInputs()).toEqual([]);
  });

  it("parses an integer param with value/min/max", () => {
    const [p] = inputs(`<param name="n" type="integer" value="5" min="1" max="10"/>`);
    const model = p as IntegerParameterModel;
    expect(model.parameter_type).toBe("gx_integer");
    expect(model.name).toBe("n");
    expect(model.value).toBe(5);
    expect(model.min).toBe(1);
    expect(model.max).toBe(10);
    expect(model.optional).toBe(false);
  });

  it("derives name from argument (strip dashes, dash → underscore)", () => {
    const [p] = inputs(`<param argument="--my-flag" type="integer" value="1"/>`);
    expect(p.name).toBe("my_flag");
  });

  it("reads label/help attributes, empty stays null", () => {
    const [p] = inputs(`<param name="n" type="integer" value="1" label="Count" help="how many"/>`);
    expect(p.label).toBe("Count");
    expect(p.help).toBe("how many");
    const [q] = inputs(`<param name="m" type="integer" value="1"/>`);
    expect(q.label).toBeNull();
    expect(q.help).toBeNull();
  });

  it("parses a boolean param with checked/truevalue/falsevalue", () => {
    const [p] = inputs(
      `<param name="b" type="boolean" checked="true" truevalue="--on" falsevalue=""/>`,
    );
    const model = p as BooleanParameterModel;
    expect(model.parameter_type).toBe("gx_boolean");
    expect(model.value).toBe(true);
    expect(model.truevalue).toBe("--on");
    expect(model.falsevalue).toBe("");
  });

  it("parses a text param, inferring optional from missing value", () => {
    const [p] = inputs(`<param name="t" type="text"/>`);
    const model = p as TextParameterModel;
    expect(model.parameter_type).toBe("gx_text");
    expect(model.optional).toBe(true);
    expect(model.value).toBeNull();
  });

  it("parses a data param with comma-separated format → extensions", () => {
    const [p] = inputs(`<param name="i" type="data" format="fasta,FASTQ" multiple="true"/>`);
    const model = p as DataParameterModel;
    expect(model.parameter_type).toBe("gx_data");
    expect(model.extensions).toEqual(["fasta", "fastq"]);
    expect(model.multiple).toBe(true);
  });

  it("parses select static options, deduplicating by value (last wins)", () => {
    const [p] = inputs(
      `<param name="s" type="select" multiple="true">` +
        `<option value="a">A</option>` +
        `<option value="b">B</option>` +
        `<option value="a" selected="true">A2</option>` +
        `</param>`,
    );
    const model = p as SelectParameterModel;
    expect(model.parameter_type).toBe("gx_select");
    expect(model.multiple).toBe(true);
    expect(model.options).toEqual([
      { label: "A2", value: "a", selected: true },
      { label: "B", value: "b", selected: false },
    ]);
  });

  it("falls back option label to value when text is empty", () => {
    const [p] = inputs(`<param name="s" type="select"><option value="a"/></param>`);
    const model = p as SelectParameterModel;
    expect(model.options).toEqual([{ label: "a", value: "a", selected: false }]);
  });

  it("nulls options for a dynamic select (<options from_data_table>)", () => {
    const [p] = inputs(`<param name="s" type="select"><options from_data_table="idx"/></param>`);
    expect((p as SelectParameterModel).options).toBeNull();
  });

  it("nulls options for a dynamic select (dynamic_options code attr)", () => {
    const [p] = inputs(`<param name="s" type="select" dynamic_options="get_opts()"/>`);
    expect((p as SelectParameterModel).options).toBeNull();
  });

  it("parses integer validators, keeping only in_range", () => {
    const [p] = inputs(
      `<param name="n" type="integer" value="5">` +
        `<validator type="in_range" min="1" max="10" exclude_min="true"/>` +
        `<validator type="length" min="1"/>` +
        `</param>`,
    );
    const model = p as IntegerParameterModel;
    expect(model.validators).toEqual([
      {
        type: "in_range",
        min: 1,
        max: 10,
        exclude_min: true,
        exclude_max: false,
        negate: false,
        message: null,
      },
    ]);
  });

  it("parses text regex/length validators from element text and attrs", () => {
    const [p] = inputs(
      `<param name="t" type="text" value="x">` +
        `<validator type="regex">[a-z]+</validator>` +
        `<validator type="length" min="2" max="8"/>` +
        `</param>`,
    );
    const model = p as TextParameterModel;
    expect(model.validators).toEqual([
      { type: "regex", expression: "[a-z]+", negate: false },
      { type: "length", min: 2, max: 8, negate: false },
    ]);
  });

  it("honors data_column force_select as the inverse of optional", () => {
    const [p] = inputs(
      `<param name="c" type="data_column" data_ref="i" force_select="false" value="1"/>`,
    );
    const model = p as DataColumnParameterModel;
    expect(model.parameter_type).toBe("gx_data_column");
    expect(model.optional).toBe(true);
    expect(model.value).toBe(1);
    expect(model.data_ref).toBe("i");
  });

  it("parses drill_down static options recursively", () => {
    const [p] = inputs(
      `<param name="d" type="drill_down" hierarchy="recurse">` +
        `<options>` +
        `<option name="Top" value="top">` +
        `<option name="Child" value="child" selected="true"/>` +
        `</option>` +
        `</options>` +
        `</param>`,
    );
    const model = p as DrillDownParameterModel;
    expect(model.parameter_type).toBe("gx_drill_down");
    expect(model.hierarchy).toBe("recurse");
    expect(model.options).toEqual([
      {
        value: "top",
        name: "Top",
        selected: false,
        options: [{ value: "child", name: "Child", selected: true, options: [] }],
      },
    ]);
  });

  it("nulls options for a dynamic drill_down (dynamic_options code attr)", () => {
    const [p] = inputs(`<param name="d" type="drill_down" dynamic_options="get_dd()"/>`);
    expect((p as DrillDownParameterModel).options).toBeNull();
  });
});

describe("XmlPageSource — repeat container", () => {
  it("recurses nested params inside a repeat", () => {
    const [p] = inputs(
      `<repeat name="r" title="Rep" min="1" max="3">` +
        `<param name="inner" type="integer" value="2"/>` +
        `</repeat>`,
    );
    const model = p as RepeatParameterModel;
    expect(model.parameter_type).toBe("gx_repeat");
    expect(model.name).toBe("r");
    expect(model.min).toBe(1);
    expect(model.max).toBe(3);
    expect(model.parameters).toHaveLength(1);
    expect(model.parameters[0].name).toBe("inner");
  });
});

describe("XmlInputSource — conditional container", () => {
  it("maps boolean <when> values through truevalue/falsevalue", () => {
    const [p] = inputs(
      `<conditional name="c">` +
        `<param name="flag" type="boolean" checked="true" truevalue="--flag" falsevalue="off"/>` +
        `<when value="--flag"><param name="x" type="integer" value="1"/></when>` +
        `<when value="off"><param name="y" type="integer" value="2"/></when>` +
        `</conditional>`,
    );
    const model = p as ConditionalParameterModel;
    expect(model.parameter_type).toBe("gx_conditional");
    expect(model.test_parameter.parameter_type).toBe("gx_boolean");
    expect(model.whens.map((w) => [w.discriminator, w.is_default_when])).toEqual([
      [true, true],
      [false, false],
    ]);
    expect(model.whens[0].parameters[0].name).toBe("x");
    expect(model.whens[1].parameters[0].name).toBe("y");
  });

  it("uses select option values as discriminators, selected → default", () => {
    const [p] = inputs(
      `<conditional name="s">` +
        `<param name="mode" type="select">` +
        `<option value="a" selected="true">A</option><option value="b">B</option>` +
        `</param>` +
        `<when value="a"><param name="x" type="integer" value="1"/></when>` +
        `<when value="b"><param name="y" type="integer" value="2"/></when>` +
        `</conditional>`,
    );
    const model = p as ConditionalParameterModel;
    expect(model.test_parameter.parameter_type).toBe("gx_select");
    expect(model.whens.map((w) => [w.discriminator, w.is_default_when])).toEqual([
      ["a", true],
      ["b", false],
    ]);
  });
});

describe("XmlInputSource — section container", () => {
  it("dispatches <section> to a section model and recurses", () => {
    const [p] = inputs(
      `<section name="adv" title="Advanced">` +
        `<param name="z" type="integer" value="3"/>` +
        `</section>`,
    );
    const model = p as SectionParameterModel;
    expect(model.parameter_type).toBe("gx_section");
    expect(model.name).toBe("adv");
    expect(model.parameters).toHaveLength(1);
    expect(model.parameters[0].name).toBe("z");
  });
});

describe("XmlInputSource — data_collection defaults", () => {
  it("builds a nested Collection default from <default>/<element>/<collection>", () => {
    const [p] = inputs(
      `<param name="coll" type="data_collection" collection_type="list">` +
        `<default collection_type="list">` +
        `<element name="e1" location="http://x/1.txt"/>` +
        `<element name="e2">` +
        `<collection collection_type="list">` +
        `<element name="inner" location="http://x/2.txt"/>` +
        `</collection>` +
        `</element>` +
        `</default>` +
        `</param>`,
    );
    const model = p as DataCollectionParameterModel;
    expect(model.parameter_type).toBe("gx_data_collection");
    expect(model.collection_type).toBe("list");
    expect(model.value).toEqual({
      class: "Collection",
      name: "coll",
      collection_type: "list",
      elements: [
        { class: "File", location: "http://x/1.txt", identifier: "e1" },
        {
          class: "Collection",
          identifier: "e2",
          collection_type: "list",
          elements: [{ class: "File", location: "http://x/2.txt", identifier: "inner" }],
        },
      ],
    });
  });

  it("leaves value null when there is no <default>", () => {
    const [p] = inputs(`<param name="c" type="data_collection" collection_type="list"/>`);
    expect((p as DataCollectionParameterModel).value).toBeNull();
  });
});
