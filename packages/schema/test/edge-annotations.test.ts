import { describe, expect, it } from "vitest";

import {
  cytoscapeElements,
  edgeAnnotationKey,
  workflowToMermaid,
  type EdgeAnnotation,
} from "../src/index.js";

const WORKFLOW = {
  class: "GalaxyWorkflow",
  inputs: [{ id: "list_in", type: "collection", collection_type: "list" }],
  steps: [
    {
      id: "tool_a",
      label: "tool_a",
      tool_id: "cat1",
      in: [{ id: "input1", source: "list_in" }],
    },
    {
      id: "tool_b",
      label: "tool_b",
      tool_id: "summarize",
      in: [{ id: "files", source: "tool_a/out_file" }],
    },
  ],
};

function fixture(): Map<string, EdgeAnnotation> {
  const map = new Map<string, EdgeAnnotation>();
  map.set(edgeAnnotationKey("list_in", "output", "tool_a", "input1"), {
    sourceStep: "list_in",
    sourceOutput: "output",
    targetStep: "tool_a",
    targetInput: "input1",
    mapDepth: 1,
    reduction: false,
    mapping: "list",
    status: "ok",
  });
  map.set(edgeAnnotationKey("tool_a", "out_file", "tool_b", "files"), {
    sourceStep: "tool_a",
    sourceOutput: "out_file",
    targetStep: "tool_b",
    targetInput: "files",
    mapDepth: 0,
    reduction: true,
    mapping: null,
    status: "ok",
  });
  return map;
}

describe("workflowToMermaid edge annotations", () => {
  it("emits styled edges + linkStyle block when annotations are passed", () => {
    const diagram = workflowToMermaid(WORKFLOW, { edgeAnnotations: fixture() });
    expect(diagram).toContain('==>|"list"|');
    expect(diagram).toContain("-. ");
    expect(diagram).toContain("reduce");
    expect(diagram).toMatch(/linkStyle 0 stroke:#5a8/);
    expect(diagram).toMatch(/linkStyle 1 stroke:#a55/);
  });

  it("falls back to plain edges without annotations", () => {
    const diagram = workflowToMermaid(WORKFLOW);
    expect(diagram).not.toContain("==>");
    expect(diagram).not.toContain("linkStyle");
    expect(diagram).toContain(" --> ");
  });
});

describe("cytoscapeElements edge annotations", () => {
  it("attaches map_depth/reduction/mapping + classes when annotated", () => {
    const els = cytoscapeElements(WORKFLOW, { edgeAnnotations: fixture() });
    const mapEdge = els.edges.find((e) => e.data.target === "tool_a");
    const reductionEdge = els.edges.find((e) => e.data.target === "tool_b");
    expect(mapEdge?.data.map_depth).toBe(1);
    expect(mapEdge?.data.mapping).toBe("list");
    expect(mapEdge?.classes).toContain("mapover_1");
    expect(reductionEdge?.data.reduction).toBe(true);
    expect(reductionEdge?.classes).toContain("reduction");
  });

  it("omits annotation fields when no map is passed (Python parity)", () => {
    const els = cytoscapeElements(WORKFLOW);
    for (const e of els.edges) {
      expect(e.data.map_depth).toBeUndefined();
      expect(e.data.reduction).toBeUndefined();
      expect(e.data.mapping).toBeUndefined();
      expect(e.classes).toBeUndefined();
    }
  });
});
