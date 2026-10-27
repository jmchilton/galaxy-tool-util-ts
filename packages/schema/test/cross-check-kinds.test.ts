import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import { snapshotDatatypesMapper } from "@galaxy-tool-util/workflow-graph/datatypes-snapshot";

import {
  checkTestsAgainstWorkflow,
  extractWorkflowInputs,
  extractWorkflowOutputs,
  type WorkflowShape,
} from "../src/test-format/cross-check/index.js";

const FORMAT2 = parseYaml(`
class: GalaxyWorkflow
inputs:
  genome:
    type: data
    format: fasta
  proteins:
    type: File
    format: [fasta, fastq]
  reads:
    type: collection
    collection_type: list:paired
outputs:
  bam_out:
    outputSource: mapper/bam
  list_out:
    outputSource: mapper/list
  unresolved_out:
    outputSource: mapper/other
steps: {}
`) as Record<string, unknown>;

const NATIVE = {
  a_galaxy_workflow: "true",
  format_version: "0.1",
  steps: {
    "0": {
      id: 0,
      type: "data_input",
      label: "genome",
      tool_state: JSON.stringify({ format: ["fasta"], optional: false }),
      workflow_outputs: [],
    },
    "1": {
      id: 1,
      type: "data_collection_input",
      label: "reads",
      tool_state: JSON.stringify({ collection_type: "list:paired", optional: false }),
      workflow_outputs: [],
    },
  },
};

function shape(): WorkflowShape {
  const outputs = extractWorkflowOutputs(FORMAT2).map((o) => {
    if (o.name === "bam_out") return { ...o, collectionType: null };
    if (o.name === "list_out") return { ...o, collectionType: "list" };
    return o;
  });
  return { inputs: extractWorkflowInputs(FORMAT2), outputs };
}

function check(testsYaml: string, withDatatypes = true) {
  return checkTestsAgainstWorkflow(
    parseYaml(testsYaml),
    shape(),
    withDatatypes ? { datatypes: snapshotDatatypesMapper() } : {},
  );
}

function keywords(testsYaml: string, withDatatypes = true): string[] {
  return check(testsYaml, withDatatypes).map((d) => d.keyword);
}

const VALID_JOB = `
    genome: {class: File, path: g.fa, filetype: fasta}
    proteins: {class: File, path: p.fq, filetype: fastqsanger}
    reads:
      class: Collection
      collection_type: list:paired
      elements: []
`;

describe("cross-check input extraction", () => {
  it("keeps format and collection_type from format2 inputs", () => {
    const byName = Object.fromEntries(extractWorkflowInputs(FORMAT2).map((i) => [i.name, i]));
    expect(byName.genome!.format).toEqual(["fasta"]);
    expect(byName.proteins!.format).toEqual(["fasta", "fastq"]);
    expect(byName.reads!.collectionType).toBe("list:paired");
  });

  it("keeps format and collection_type from native inputs", () => {
    const byName = Object.fromEntries(extractWorkflowInputs(NATIVE).map((i) => [i.name, i]));
    expect(byName.genome!.format).toEqual(["fasta"]);
    expect(byName.reads!.collectionType).toBe("list:paired");
  });
});

describe("checkTestsAgainstWorkflow — input kinds", () => {
  it("accepts matching kinds, collection types and formats", () => {
    expect(check(`- job:${VALID_JOB}  outputs: {}`)).toEqual([]);
  });

  it("flags a Collection bound to a data input", () => {
    const d = check(`
- job:
    genome: {class: Collection, collection_type: list, elements: []}
    proteins: {class: File, path: p.fa}
    reads: {class: Collection, collection_type: "list:paired", elements: []}
  outputs: {}
`);
    expect(d).toEqual([
      expect.objectContaining({ keyword: "workflow_input_kind", path: "/0/job/genome" }),
    ]);
    expect(d[0]!.severity).toBeUndefined();
  });

  it("flags a File bound to a collection input", () => {
    const k = keywords(`
- job:
    genome: {class: File, path: g.fa}
    proteins: {class: File, path: p.fa}
    reads: {class: File, path: r.fq}
  outputs: {}
`);
    expect(k).toEqual(["workflow_input_kind"]);
  });

  it("flags a collection_type the input cannot accept", () => {
    const d = check(`
- job:
    genome: {class: File, path: g.fa}
    proteins: {class: File, path: p.fa}
    reads: {class: Collection, collection_type: list, elements: []}
  outputs: {}
`);
    expect(d.map((x) => x.keyword)).toEqual(["workflow_input_collection_type"]);
    expect(d[0]!.params).toMatchObject({ declared: "list:paired", actual: "list" });
  });

  it("accepts a sample_sheet:paired collection for a list:paired input", () => {
    const k = keywords(`
- job:
    genome: {class: File, path: g.fa}
    proteins: {class: File, path: p.fa}
    reads: {class: Collection, collection_type: "sample_sheet:paired", elements: []}
  outputs: {}
`);
    expect(k).toEqual([]);
  });

  it("warns when a deeper collection would map over the input", () => {
    const d = check(`
- job:
    genome: {class: File, path: g.fa}
    proteins: {class: File, path: p.fa}
    reads: {class: Collection, collection_type: "list:list:paired", elements: []}
  outputs: {}
`);
    expect(d.map((x) => [x.keyword, x.severity])).toEqual([
      ["workflow_input_collection_map_over", "warning"],
    ]);
  });

  it("warns when filetype is outside the declared format", () => {
    const d = check(`
- job:
    genome: {class: File, path: g.fa}
    proteins: {class: File, path: p.bam, filetype: bam}
    reads: {class: Collection, collection_type: "list:paired", elements: []}
  outputs: {}
`);
    expect(d.map((x) => [x.keyword, x.severity])).toEqual([["workflow_input_format", "warning"]]);
    expect(d[0]!.path).toBe("/0/job/proteins/filetype");
  });

  it("skips filetype checks without a datatypes mapper", () => {
    const k = keywords(
      `
- job:
    genome: {class: File, path: g.fa}
    proteins: {class: File, path: p.bam, filetype: bam}
    reads: {class: Collection, collection_type: "list:paired", elements: []}
  outputs: {}
`,
      false,
    );
    expect(k).toEqual([]);
  });
});

describe("checkTestsAgainstWorkflow — output kinds", () => {
  it("accepts assertions matching the resolved output kinds", () => {
    const k = keywords(`
- job:${VALID_JOB}  outputs:
    bam_out: {ftype: bam}
    list_out:
      class: Collection
      collection_type: list
      element_tests: {}
    unresolved_out: {class: Collection, element_tests: {}}
`);
    expect(k).toEqual([]);
  });

  it("flags a dataset assertion on a collection output", () => {
    const d = check(`
- job:${VALID_JOB}  outputs:
    list_out: {ftype: bam}
`);
    expect(d).toEqual([
      expect.objectContaining({ keyword: "workflow_output_kind", path: "/0/outputs/list_out" }),
    ]);
  });

  it("flags a collection assertion on a dataset output", () => {
    const k = keywords(`
- job:${VALID_JOB}  outputs:
    bam_out: {class: Collection, collection_type: list, element_tests: {}}
`);
    expect(k).toEqual(["workflow_output_kind"]);
  });

  it("flags a collection_type mismatch", () => {
    const d = check(`
- job:${VALID_JOB}  outputs:
    list_out: {class: Collection, collection_type: "list:paired", element_tests: {}}
`);
    expect(d.map((x) => x.keyword)).toEqual(["workflow_output_collection_type"]);
    expect(d[0]!.path).toBe("/0/outputs/list_out/collection_type");
  });
});
