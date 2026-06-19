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

  it("merges planned-ness into a single linkStyle when an edge is both map-over and planned", () => {
    // A draft whose first step is planned (TODO tool) AND whose edge into it
    // also carries a map-over annotation. Mermaid allows one linkStyle per
    // index, so the dash must fold into the annotation's stroke/width — not
    // emit a second `linkStyle 0` line.
    const draft = {
      class: "GalaxyWorkflowDraft",
      inputs: [{ id: "list_in", type: "collection", collection_type: "list" }],
      steps: [
        {
          id: "tool_a",
          label: "tool_a",
          tool_id: "TODO",
          in: [{ id: "input1", source: "list_in" }],
        },
      ],
    };
    const annotations = new Map<string, EdgeAnnotation>();
    annotations.set(edgeAnnotationKey("list_in", "output", "tool_a", "input1"), {
      sourceStep: "list_in",
      sourceOutput: "output",
      targetStep: "tool_a",
      targetInput: "input1",
      mapDepth: 1,
      reduction: false,
      mapping: "list",
      status: "ok",
    });
    const diagram = workflowToMermaid(draft, { edgeAnnotations: annotations });
    // Annotation hue + width preserved; planned dash folded in; exactly one line.
    expect(diagram).toContain("linkStyle 0 stroke:#5a8,stroke-width:3px,stroke-dasharray:5 5");
    const linkStyleLines = diagram.split("\n").filter((l) => l.includes("linkStyle 0"));
    expect(linkStyleLines).toHaveLength(1);
    // The planned node is still classed.
    expect(diagram).toContain("class step_0 planned;");
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
