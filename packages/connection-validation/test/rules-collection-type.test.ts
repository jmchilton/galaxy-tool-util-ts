// Outputs declaring `collection_type_from_rules` take their type from the
// step's rules mapping, as Galaxy's editor and the Python port do.

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
// Shape of __APPLY_RULES__: an any-type collection input and a rules-typed output.
const listTool = tools.get("gx_data_collection_list")!;
const pairTool = tools.get("collection_creates_pair")!;
const applyRulesTool = {
  ...pairTool,
  id: "__APPLY_RULES__",
  inputs: [{ ...listTool.inputs[0], name: "input", collection_type: null }],
  outputs: [
    {
      ...pairTool.outputs[0],
      name: "output",
      collection_type: null,
      collection_type_from_rules: "rules",
    },
  ],
};
const getToolInfo: GetToolInfo = {
  getToolInfo: (id) => (id === "__APPLY_RULES__" ? applyRulesTool : tools.get(id)),
};

const IDENTIFIER_RULES = [
  { type: "add_column_metadata", value: "identifier0" },
  { type: "add_column_metadata", value: "identifier1" },
];

function workflow(rules: Record<string, unknown>) {
  return {
    class: "GalaxyWorkflow",
    inputs: { reads: { type: "collection", collection_type: "list:paired" } },
    steps: {
      regroup: {
        tool_id: "__APPLY_RULES__",
        in: { input: "reads" },
        state: { input: { __class__: "ConnectedValue" }, rules },
      },
      fastp: { tool_id: "collection_paired_test", in: { f1: "regroup/output" } },
      consume: { tool_id: "gx_data_collection_list", in: { parameter: "fastp/out1" } },
    },
  };
}

function statuses(report: ReturnType<typeof validateConnectionsReport>) {
  return report.step_results.map((sr) => sr.connections.map((c) => c.status));
}

describe("collection_type_from_rules outputs", () => {
  it("types a list:paired regroup so the paired consumer maps over list", () => {
    const report = validateConnectionsReport(
      workflow({
        rules: IDENTIFIER_RULES,
        mapping: [
          { type: "list_identifiers", columns: [0] },
          { type: "paired_identifier", columns: [1] },
        ],
      }),
      getToolInfo,
    );
    expect(statuses(report)).toEqual([[], ["ok"], ["ok"], ["ok"]]);
    expect(report.step_results[2]!.map_over).toBe("list");
    expect(report.valid).toBe(true);
  });

  it("reports a list:list regroup feeding a paired input as invalid", () => {
    const report = validateConnectionsReport(
      workflow({
        rules: IDENTIFIER_RULES,
        mapping: [{ type: "list_identifiers", columns: [0, 1] }],
      }),
      getToolInfo,
    );
    expect(statuses(report)[2]).toEqual(["invalid"]);
    expect(report.valid).toBe(false);
  });

  it("leaves the output unknown when the rules have no mapping", () => {
    const report = validateConnectionsReport(workflow({ rules: IDENTIFIER_RULES }), getToolInfo);
    expect(statuses(report)).toEqual([[], ["ok"], ["skip"], ["skip"]]);
    expect(report.valid).toBe(true);
  });
});
