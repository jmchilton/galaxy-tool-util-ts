import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import { snapshotDatatypesMapper } from "@galaxy-tool-util/workflow-graph/datatypes-snapshot";

import {
  checkTestsAgainstWorkflow,
  extractWorkflowInputs,
  extractWorkflowOutputs,
  type WorkflowShape,
} from "../src/test-format/cross-check/index.js";
import type { WorkflowOutput } from "../src/test-format/cross-check/types.js";

const WORKFLOW = parseYaml(`
class: GalaxyWorkflow
inputs:
  genome:
    type: data
    format: fasta
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

// What the connection graph would resolve; extractors leave outputs unresolved.
const RESOLVED: Record<string, Partial<WorkflowOutput>> = {
  bam_out: { kind: "dataset", format: "bam" },
  list_out: { kind: "collection", collectionType: "list" },
};

function shape(): WorkflowShape {
  return {
    inputs: extractWorkflowInputs(WORKFLOW),
    outputs: extractWorkflowOutputs(WORKFLOW).map((o) => ({ ...o, ...RESOLVED[o.name] })),
    inputMetadataOptions: { datatypes: snapshotDatatypesMapper() },
  };
}

function check(testsYaml: string) {
  return checkTestsAgainstWorkflow(parseYaml(testsYaml), shape()).map((d) => [
    d.path,
    d.keyword,
    d.severity ?? "error",
  ]);
}

const JOB = `
    genome: {class: File, path: g.fa, filetype: fasta}
    reads: {class: Collection, collection_type: "list:paired", elements: []}
`;

function job(reads: string): string {
  return `
    genome: {class: File, path: g.fa}
    reads: {class: Collection, collection_type: "${reads}", elements: []}
`;
}

describe("checkTestsAgainstWorkflow: inputs", () => {
  it("accepts matching kinds, collection types and formats", () => {
    expect(check(`- job:${JOB}  outputs: {}`)).toEqual([]);
  });

  it("errors on a File bound to a collection input", () => {
    expect(
      check(`
- job:
    genome: {class: File, path: g.fa}
    reads: {class: File, path: r.fq}
  outputs: {}
`),
    ).toEqual([["/0/job/reads/class", "workflow_input_kind", "error"]]);
  });

  it("errors on a collection type that neither matches nor maps over", () => {
    expect(check(`- job:${job("list")}  outputs: {}`)).toEqual([
      ["/0/job/reads/collection_type", "workflow_input_collection_type", "error"],
    ]);
  });

  it("accepts sample_sheet:paired for a list:paired input", () => {
    expect(check(`- job:${job("sample_sheet:paired")}  outputs: {}`)).toEqual([]);
  });

  it("warns on a filetype outside the declared format", () => {
    expect(
      check(`
- job:
    genome: {class: File, path: g.bam, filetype: bam}
    reads: {class: Collection, collection_type: "list:paired", elements: []}
  outputs: {}
`),
    ).toEqual([["/0/job/genome/filetype", "workflow_input_format", "warning"]]);
  });
});

describe("checkTestsAgainstWorkflow: outputs", () => {
  it("accepts assertions matching the resolved outputs; leaves unresolved ones alone", () => {
    expect(
      check(`
- job:${JOB}  outputs:
    bam_out: {ftype: bam}
    list_out: {class: Collection, collection_type: list, element_tests: {}}
    unresolved_out: {ftype: txt}
`),
    ).toEqual([]);
  });

  it("errors on kind, collection type and format mismatches", () => {
    expect(
      check(`
- job:${JOB}  outputs:
    bam_out: {class: Collection, element_tests: {}}
    list_out: {ftype: bam}
- job:${JOB}  outputs:
    bam_out: {ftype: sam}
    list_out: {class: Collection, collection_type: "list:paired"}
`),
    ).toEqual([
      ["/0/outputs/bam_out", "workflow_output_kind", "error"],
      ["/0/outputs/list_out", "workflow_output_kind", "error"],
      ["/1/outputs/bam_out/ftype", "workflow_output_datatype", "error"],
      ["/1/outputs/list_out/collection_type", "workflow_output_collection_type", "error"],
    ]);
  });

  it("treats element_tests without class as a collection assertion", () => {
    expect(check(`- job:${JOB}  outputs:\n    list_out: {element_tests: {}}\n`)).toEqual([]);
  });

  // Resolved output shapes assume the declared inputs.
  const COLLECTION_ON_GENOME = `
    genome: {class: Collection, collection_type: list, elements: []}
    reads: {class: Collection, collection_type: "list:paired", elements: []}
`;
  it.each([
    ["a collection on a data input", COLLECTION_ON_GENOME, "/0/job/genome/class"],
    ["a deeper collection", job("list:list:paired"), "/0/job/reads/collection_type"],
  ])("warns on %s and skips that test's output checks", (_, mappedJob, path) => {
    expect(
      check(`
- job:${mappedJob}  outputs:
    bam_out: {class: Collection, collection_type: list, element_tests: {}}
    list_out: {class: Collection, collection_type: "list:list", element_tests: {}}
- job:${JOB}  outputs:
    bam_out: {class: Collection, collection_type: list, element_tests: {}}
`),
    ).toEqual([
      [path, "workflow_input_collection_map_over", "warning"],
      ["/1/outputs/bam_out", "workflow_output_kind", "error"],
    ]);
  });

  it("skips output checks when the job's collection type is accepted but differs", () => {
    expect(
      check(`
- job:${job("sample_sheet:paired")}  outputs:
    list_out: {class: Collection, collection_type: "list:list", element_tests: {}}
`),
    ).toEqual([]);
  });
});
