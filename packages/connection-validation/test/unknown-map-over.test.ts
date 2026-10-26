// TS-only: a skipped edge leaves the step's map-over unknown, so downstream
// edges skip instead of failing (galaxy-tool-util-ts#204).

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { loadParsedToolCache } from "../../core/test/helpers/parsed-tool-cache.js";
import { validateConnectionsReport } from "../src/report-builder.js";
import type { GetToolInfo } from "../src/get-tool-info.js";

const PARSED_TOOLS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "core",
  "test",
  "fixtures",
  "connection_workflows",
  "parsed_tools",
);

const tools = loadParsedToolCache(PARSED_TOOLS_DIR);
// Collection output with no type, e.g. __APPLY_RULES__ without a rules mapping.
const pairTool = tools.get("collection_creates_pair")!;
const untypedCollectionTool = {
  ...pairTool,
  id: "untyped_collection_output",
  outputs: [{ ...pairTool.outputs[0], name: "output", collection_type: null }],
};
const getToolInfo: GetToolInfo = {
  getToolInfo: (id) => (id === "untyped_collection_output" ? untypedCollectionTool : tools.get(id)),
};

const REGROUP = {
  tool_id: "untyped_collection_output",
  in: { input1: "reads" },
};

function statuses(report: ReturnType<typeof validateConnectionsReport>) {
  return report.step_results.map((sr) => sr.connections.map((c) => c.status));
}

describe("unknown upstream map-over", () => {
  it("skips a collection consumer fed by a step with a skipped edge", () => {
    const report = validateConnectionsReport(
      {
        class: "GalaxyWorkflow",
        inputs: { reads: { type: "collection", collection_type: "list:paired" } },
        steps: {
          regroup: REGROUP,
          fastp: { tool_id: "collection_paired_test", in: { f1: "regroup/output" } },
          consume: { tool_id: "gx_data_collection_list", in: { parameter: "fastp/out1" } },
        },
      },
      getToolInfo,
    );
    expect(statuses(report)).toEqual([[], ["ok"], ["skip"], ["skip"]]);
    expect(report.summary).toEqual({ ok: 1, invalid: 0, skip: 2 });
    expect(report.valid).toBe(true);
  });

  it("propagates unknown map-over through steps that would otherwise validate", () => {
    const report = validateConnectionsReport(
      {
        class: "GalaxyWorkflow",
        inputs: { reads: { type: "collection", collection_type: "list:paired" } },
        steps: {
          regroup: REGROUP,
          fastp: { tool_id: "collection_paired_test", in: { f1: "regroup/output" } },
          passthrough: { tool_id: "gx_data", in: { parameter: "fastp/out1" } },
          consume: { tool_id: "gx_data_collection_list", in: { parameter: "passthrough/output" } },
        },
      },
      getToolInfo,
    );
    expect(statuses(report)).toEqual([[], ["ok"], ["skip"], ["skip"], ["skip"]]);
    expect(report.valid).toBe(true);
  });

  it("leaves map-over unknown when a known mapping sits beside a skipped edge", () => {
    const report = validateConnectionsReport(
      {
        class: "GalaxyWorkflow",
        inputs: {
          reads: { type: "collection", collection_type: "list:paired" },
          singles: { type: "collection", collection_type: "list" },
        },
        steps: {
          regroup: REGROUP,
          mixed: {
            tool_id: "collection_mixed_param",
            in: { f1: "regroup/output", f2: "singles" },
          },
          consume: { tool_id: "gx_data_collection_list", in: { parameter: "mixed/out1" } },
        },
      },
      getToolInfo,
    );
    const mixed = report.step_results[3];
    expect(mixed.connections.map((c) => [c.target_input, c.status])).toEqual([
      ["f1", "skip"],
      ["f2", "ok"],
    ]);
    expect(mixed.map_over).toBeNull();
    expect(report.step_results[4].connections.map((c) => c.status)).toEqual(["skip"]);
  });

  it("still reports incompatible known map-overs beside a skipped edge", () => {
    const report = validateConnectionsReport(
      {
        class: "GalaxyWorkflow",
        inputs: {
          reads: { type: "collection", collection_type: "list:paired" },
          singles: { type: "collection", collection_type: "list" },
          pair: { type: "collection", collection_type: "paired" },
        },
        steps: {
          regroup: REGROUP,
          conflicted: {
            tool_id: "output_format",
            in: { input_data_1: "singles", input_data_2: "pair", input_text: "regroup/output" },
          },
        },
      },
      getToolInfo,
    );
    const conflicted = report.step_results[4];
    expect(conflicted.connections.map((c) => [c.target_input, c.status])).toEqual([
      ["input_data_1", "ok"],
      ["input_data_2", "ok"],
      ["input_text", "skip"],
    ]);
    expect(conflicted.errors).toEqual(["Incompatible map-over types: list vs paired"]);
    expect(report.valid).toBe(false);
  });

  it("marks subworkflow outputs unknown when an edge into it is skipped", () => {
    const report = validateConnectionsReport(
      {
        class: "GalaxyWorkflow",
        inputs: { reads: { type: "collection", collection_type: "list:paired" } },
        steps: {
          regroup: REGROUP,
          inner_wf: {
            run: {
              class: "GalaxyWorkflow",
              inputs: { inner_in: { type: "collection", collection_type: "paired" } },
              outputs: { inner_out: { outputSource: "inner_fastp/out1" } },
              steps: {
                inner_fastp: { tool_id: "collection_paired_test", in: { f1: "inner_in" } },
              },
            },
            in: { inner_in: "regroup/output" },
          },
          consume: { tool_id: "gx_data_collection_list", in: { parameter: "inner_wf/inner_out" } },
        },
      },
      getToolInfo,
    );
    const consume = report.step_results[3].connections[0];
    expect(consume.status).toBe("skip");
    expect(consume.errors).toEqual(["Cannot determine output type for 'inner_out' on step 2"]);
  });
});
