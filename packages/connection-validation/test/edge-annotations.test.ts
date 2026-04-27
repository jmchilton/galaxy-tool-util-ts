import { describe, expect, it } from "vitest";

import { buildEdgeAnnotations, edgeAnnotationKey } from "../src/edge-annotations.js";
import type { WorkflowConnectionResult } from "../src/types.js";

function buildResult(): WorkflowConnectionResult {
  return {
    valid: true,
    summary: { ok: 3, invalid: 0, skip: 0 },
    stepResults: [
      {
        stepId: "0",
        label: "input_list",
        stepType: "data_collection_input",
        connections: [],
        errors: [],
      },
      {
        stepId: "1",
        label: "tool_a",
        stepType: "tool",
        mapOver: "list",
        connections: [
          {
            sourceStep: "0",
            sourceOutput: "output",
            targetStep: "1",
            targetInput: "infile",
            status: "ok",
            mapping: "list",
            mapDepth: 1,
            reduction: false,
            errors: [],
          },
        ],
        errors: [],
      },
      {
        stepId: "2",
        label: "tool_b",
        stepType: "tool",
        connections: [
          {
            sourceStep: "1",
            sourceOutput: "out_file",
            targetStep: "2",
            targetInput: "files",
            status: "ok",
            mapping: null,
            mapDepth: 0,
            reduction: true,
            errors: [],
          },
        ],
        errors: [],
      },
    ],
  };
}

describe("buildEdgeAnnotations", () => {
  it("keys by source/target labels and surfaces depth + reduction", () => {
    const map = buildEdgeAnnotations(buildResult());
    const mapOverKey = edgeAnnotationKey("input_list", "output", "tool_a", "infile");
    const reductionKey = edgeAnnotationKey("tool_a", "out_file", "tool_b", "files");

    expect(map.get(mapOverKey)).toMatchObject({
      mapDepth: 1,
      reduction: false,
      mapping: "list",
      status: "ok",
    });
    expect(map.get(reductionKey)).toMatchObject({
      mapDepth: 0,
      reduction: true,
      mapping: null,
      status: "ok",
    });
  });

  it("falls back to stepId when label is absent", () => {
    const result = buildResult();
    result.stepResults[0].label = null;
    const map = buildEdgeAnnotations(result);
    expect(map.has(edgeAnnotationKey("0", "output", "tool_a", "infile"))).toBe(true);
  });
});
