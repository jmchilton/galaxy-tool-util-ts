/* galaxy-tool-util-ts#229: a source that resolves to no step is reported, not skipped. */

import { describe, it, expect } from "vitest";

import { buildWorkflowGraph } from "../src/graph-builder.js";
import { validateConnectionsReport } from "../src/report-builder.js";
import type { GetToolInfo } from "../src/get-tool-info.js";

const noTools: GetToolInfo = { getToolInfo: () => undefined };

const MESSAGE =
  "Cannot resolve 'first/out_file1': step 'first' has the label 'First concatenation', " +
  "and sources resolve by label. Reference it as 'First concatenation/out_file1', " +
  "or set its label to 'first'";

function labelShadowsId(): Record<string, unknown> {
  return {
    class: "GalaxyWorkflow",
    inputs: { reads: { type: "data" } },
    outputs: { out: { outputSource: "second/out_file1" } },
    steps: {
      first: { label: "First concatenation", tool_id: "cat1", in: { input1: "reads" } },
      second: { tool_id: "cat1", in: { input1: "first/out_file1" } },
    },
  };
}

describe("unresolvable sources in connection validation", () => {
  it("makes the workflow invalid, with the error on the step holding the source", () => {
    const report = validateConnectionsReport(labelShadowsId(), noTools);
    expect(report.valid).toBe(false);
    const second = report.step_results.find((sr) => sr.label === "second");
    expect(second?.errors).toEqual([`input 'input1': ${MESSAGE}`]);
  });

  it("names the subworkflow for a source inside one", () => {
    const parent = {
      class: "GalaxyWorkflow",
      inputs: { outer: { type: "data" } },
      outputs: {},
      steps: { nested: { run: labelShadowsId(), in: { reads: "outer" } } },
    };
    const report = validateConnectionsReport(parent, noTools);
    expect(report.valid).toBe(false);
    const nested = report.step_results.find((sr) => sr.label === "nested");
    expect(nested?.errors).toEqual([
      `In subworkflow 'nested', step 'second': input 'input1': ${MESSAGE}`,
    ]);
  });

  it("still builds a graph for visualizers, without the unresolvable edge", () => {
    const graph = buildWorkflowGraph(labelShadowsId(), noTools);
    expect(Object.keys(graph.steps)).toHaveLength(3);
    expect(graph.unresolvedSources?.map((u) => u.source)).toEqual(["first/out_file1"]);
  });
});
