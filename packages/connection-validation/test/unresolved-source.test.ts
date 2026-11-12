/* galaxy-tool-util-ts#229: a source that resolves to no step is reported, not skipped. */

import { describe, it, expect } from "vitest";

import { validateConnectionsReport } from "../src/report-builder.js";
import type { GetToolInfo } from "../src/get-tool-info.js";

const noTools: GetToolInfo = { getToolInfo: () => undefined };

const labelShadowsId = {
  class: "GalaxyWorkflow",
  inputs: { reads: { type: "data" } },
  outputs: { out: { outputSource: "second/out_file1" } },
  steps: {
    first: { label: "First concatenation", tool_id: "cat1", in: { input1: "reads" } },
    second: { tool_id: "cat1", in: { input1: "first/out_file1" } },
  },
};

describe("validateConnectionsReport with an unresolvable source", () => {
  it("is invalid and says which label the source should use", () => {
    const report = validateConnectionsReport(labelShadowsId, noTools);
    expect(report.valid).toBe(false);
    expect(report.summary).toEqual({ ok: 0, invalid: 1, skip: 0 });
    expect(report.step_results[0]?.errors).toEqual([
      "Cannot resolve 'first/out_file1': step 'first' has the label 'First concatenation', " +
        "and sources resolve by label. Reference it as 'First concatenation/out_file1', " +
        "or set its label to 'first'",
    ]);
  });
});
