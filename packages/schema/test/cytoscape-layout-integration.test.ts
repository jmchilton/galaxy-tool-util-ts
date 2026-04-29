/**
 * Integration of `--layout` through the cytoscape builder. These tests assert
 * three invariants:
 *  - default (`preset`) emit is byte-identical to the no-`layout` call (Python parity).
 *  - `topological` overwrites positions per the layering spec and emits a layout hint.
 *  - hint-only layouts drop `position` and emit a layout hint for the renderer.
 */

import { describe, expect, it } from "vitest";

import { cytoscapeElements } from "../src/index.js";

const WORKFLOW = {
  class: "GalaxyWorkflow",
  inputs: [{ id: "input_a", type: "data" }],
  steps: [
    {
      id: "tool_a",
      label: "tool_a",
      tool_id: "cat1",
      in: [{ id: "in", source: "input_a" }],
    },
    {
      id: "tool_b",
      label: "tool_b",
      tool_id: "cat1",
      in: [{ id: "in", source: "tool_a/output" }],
    },
  ],
};

describe("cytoscapeElements layout option", () => {
  it("default emit equals layout=preset (Python parity)", () => {
    const a = cytoscapeElements(WORKFLOW);
    const b = cytoscapeElements(WORKFLOW, { layout: "preset" });
    expect(a).toEqual(b);
    expect(a.layout).toBeUndefined();
  });

  it("topological overwrites coordinates and sets layout hint", () => {
    const els = cytoscapeElements(WORKFLOW, { layout: "topological" });
    expect(els.layout).toEqual({ name: "topological" });
    const byId = new Map(els.nodes.map((n) => [n.data.id, n.position]));
    expect(byId.get("input_a")).toEqual({ x: 0, y: 0 });
    expect(byId.get("tool_a")).toEqual({ x: 220, y: 0 });
    expect(byId.get("tool_b")).toEqual({ x: 440, y: 0 });
  });

  it("hint-only layouts (dagre) drop positions and set layout hint", () => {
    const els = cytoscapeElements(WORKFLOW, { layout: "dagre" });
    expect(els.layout).toEqual({ name: "dagre" });
    for (const node of els.nodes) {
      expect(node.position).toBeUndefined();
    }
  });
});
