import { describe, expect, it } from "vitest";

import { XmlToolSource, xmlToolSourceFromStringNoImports } from "../src/index.js";

/**
 * Unit tests for the metadata-reading half of XmlToolSource — the port of the
 * `parse_*` accessors on galaxy.tool_util.parser.xml.XmlToolSource that don't
 * depend on the input-parameter tree. Mirrors the smoke-test style of the YAML
 * path (schema/test/user-tool-parse.test.ts).
 */

function source(xml: string): XmlToolSource {
  return xmlToolSourceFromStringNoImports(xml);
}

describe("XmlToolSource metadata", () => {
  it("reads id, version, name, tool_type, license attributes", () => {
    const s = source(
      `<tool id="cat1" name="Concatenate" version="1.0.0" tool_type="data_source" license="MIT"/>`,
    );
    expect(s.parseId()).toBe("cat1");
    expect(s.parseVersion()).toBe("1.0.0");
    expect(s.parseName()).toBe("Concatenate");
    expect(s.parseToolType()).toBe("data_source");
    expect(s.parseLicense()).toBe("MIT");
  });

  it("returns null for absent optional attributes", () => {
    const s = source(`<tool id="x"/>`);
    expect(s.parseVersion()).toBeNull();
    expect(s.parseToolType()).toBeNull();
    expect(s.parseLicense()).toBeNull();
  });

  it("falls back to id when name is missing or empty", () => {
    // Absent and empty-string name both fall through to id (Python `name or id`);
    // pins the `||` (not `??`) truthiness choice in parseName.
    expect(source(`<tool id="only_id"/>`).parseName()).toBe("only_id");
    expect(source(`<tool id="only_id" name=""/>`).parseName()).toBe("only_id");
  });

  it("defaults profile to 16.01 (XML classic default)", () => {
    expect(source(`<tool id="x"/>`).parseProfile()).toBe("16.01");
    expect(source(`<tool id="x" profile="23.0"/>`).parseProfile()).toBe("23.0");
    // A present-but-empty attribute is preserved (Python `dict.get` only
    // defaults on absent keys); pins the `??` (not `||`) choice in parseProfile.
    expect(source(`<tool id="x" profile=""/>`).parseProfile()).toBe("");
  });

  it("parses description from a child element with newlines collapsed", () => {
    const s = source(`<tool id="x"><description>a tool that
      concatenates</description></tool>`);
    expect(s.parseDescription()).toBe("a tool that      concatenates");
  });

  it("prefers a description attribute over the child element", () => {
    const s = source(
      `<tool id="x" description="attr wins"><description>child</description></tool>`,
    );
    expect(s.parseDescription()).toBe("attr wins");
  });

  it("returns empty string when no description is present", () => {
    expect(source(`<tool id="x"/>`).parseDescription()).toBe("");
  });

  it("parses edam operations and topics", () => {
    const s = source(
      `<tool id="x">
         <edam_operations>
           <edam_operation>operation_0004</edam_operation>
           <edam_operation>operation_0324</edam_operation>
         </edam_operations>
         <edam_topics><edam_topic>topic_3047</edam_topic></edam_topics>
       </tool>`,
    );
    expect(s.parseEdamOperations()).toEqual(["operation_0004", "operation_0324"]);
    expect(s.parseEdamTopics()).toEqual(["topic_3047"]);
  });

  it("returns empty edam lists when the containers are absent", () => {
    const s = source(`<tool id="x"/>`);
    expect(s.parseEdamOperations()).toEqual([]);
    expect(s.parseEdamTopics()).toEqual([]);
  });

  it("parses xrefs, trimming text and skipping entries without a type", () => {
    const s = source(
      `<tool id="x">
         <xrefs>
           <xref type="bio.tools">  bwa  </xref>
           <xref>no-type-skipped</xref>
           <xref type="empty-text-skipped"></xref>
         </xrefs>
       </tool>`,
    );
    expect(s.parseXrefs()).toEqual([{ value: "bwa", type: "bio.tools" }]);
  });

  it("parses citations, trimming content and skipping non-citation / empty children", () => {
    const s = source(
      `<tool id="x">
         <citations>
           <citation type="doi">  10.1/x  </citation>
           <citation type="bibtex">@article{y}</citation>
           <citation type="doi"></citation>
           <note>ignored</note>
         </citations>
       </tool>`,
    );
    expect(s.parseCitations()).toEqual([
      { type: "doi", content: "10.1/x" },
      { type: "bibtex", content: "@article{y}" },
    ]);
  });

  it("returns empty citations/xrefs when the containers are absent", () => {
    const s = source(`<tool id="x"/>`);
    expect(s.parseCitations()).toEqual([]);
    expect(s.parseXrefs()).toEqual([]);
  });

  it("parses help with default restructuredtext format", () => {
    const s = source(`<tool id="x"><help>Some help</help></tool>`);
    expect(s.parseHelp()).toEqual({ format: "restructuredtext", content: "Some help" });
  });

  it("honors an explicit help format and returns null when help is absent", () => {
    const s = source(`<tool id="x"><help format="markdown">**help**</help></tool>`);
    expect(s.parseHelp()).toEqual({ format: "markdown", content: "**help**" });
    expect(source(`<tool id="x"/>`).parseHelp()).toBeNull();
  });

  it("parses the command text or null", () => {
    expect(source(`<tool id="x"><command>echo hi</command></tool>`).parseCommand()).toBe("echo hi");
    expect(source(`<tool id="x"/>`).parseCommand()).toBeNull();
  });

  it("exposes the xml language tag", () => {
    expect(XmlToolSource.language).toBe("xml");
  });

  it("reads metadata off a macro-expanded tree", () => {
    // <expand> pulls the description in from a macro; the reader sees the result.
    const s = source(
      `<tool id="x">
         <macros>
           <xml name="desc"><description>expanded desc</description></xml>
         </macros>
         <expand macro="desc"/>
       </tool>`,
    );
    expect(s.parseDescription()).toBe("expanded desc");
  });
});
