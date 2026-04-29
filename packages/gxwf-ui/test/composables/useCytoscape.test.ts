import { describe, expect, it } from "vitest";

import type { CytoscapeElements, CytoscapeNode } from "@galaxy-tool-util/schema";
import { pickRuntimeLayout } from "../../src/composables/useCytoscape";

function n(id: string, position?: { x: number; y: number }): CytoscapeNode {
  return {
    group: "nodes",
    data: { id, label: id, doc: null, tool_id: null, step_type: "input", repo_link: null },
    classes: [],
    position,
  };
}

function elements(nodes: CytoscapeNode[]): CytoscapeElements {
  return { nodes, edges: [] };
}

describe("pickRuntimeLayout", () => {
  it("returns dagre when no nodes have positions", () => {
    expect(pickRuntimeLayout(elements([n("a"), n("b")]))).toBe("dagre");
  });

  it("returns dagre when all positions match the (10*i, 10*i) Python fallback", () => {
    expect(
      pickRuntimeLayout(
        elements([n("a", { x: 0, y: 0 }), n("b", { x: 10, y: 10 }), n("c", { x: 20, y: 20 })]),
      ),
    ).toBe("dagre");
  });

  it("returns preset when at least one node has a real position", () => {
    expect(
      pickRuntimeLayout(elements([n("a", { x: 100, y: 50 }), n("b", { x: 250, y: 80 })])),
    ).toBe("preset");
  });
});
