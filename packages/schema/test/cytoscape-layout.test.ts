/**
 * Hard-coded coordinate assertions for the topological layout. These doubles
 * as the cross-language parity contract — the gxformat2 port must produce
 * identical (x, y) values for the same fixtures.
 *
 * Spec: docs/architecture/cytoscape-layout.md
 */

import { describe, it, expect } from "vitest";
import {
  COL_STRIDE,
  ROW_STRIDE,
  topologicalPositions,
  type CytoscapeEdge,
  type CytoscapeElements,
  type CytoscapeNode,
} from "../src/index.js";

function n(id: string): CytoscapeNode {
  return {
    group: "nodes",
    data: { id, label: id, doc: null, tool_id: null, step_type: "input", repo_link: null },
    classes: [],
  };
}

function e(source: string, target: string): CytoscapeEdge {
  return {
    group: "edges",
    data: { id: `${target}__in__from__${source}`, source, target, input: "in", output: null },
  };
}

function elements(nodes: CytoscapeNode[], edges: CytoscapeEdge[]): CytoscapeElements {
  return { nodes, edges };
}

function positions(els: CytoscapeElements): Record<string, [number, number]> {
  const out: Record<string, [number, number]> = {};
  for (const [id, p] of topologicalPositions(els)) out[id] = [p.x, p.y];
  return out;
}

describe("topologicalPositions", () => {
  it("uses the documented stride constants", () => {
    expect(COL_STRIDE).toBe(220);
    expect(ROW_STRIDE).toBe(100);
  });

  it("linear chain A → B → C", () => {
    const els = elements([n("A"), n("B"), n("C")], [e("A", "B"), e("B", "C")]);
    expect(positions(els)).toEqual({
      A: [0, 0],
      B: [220, 0],
      C: [440, 0],
    });
  });

  it("diamond A → {B, C} → D", () => {
    const els = elements(
      [n("A"), n("B"), n("C"), n("D")],
      [e("A", "B"), e("A", "C"), e("B", "D"), e("C", "D")],
    );
    expect(positions(els)).toEqual({
      A: [0, 0],
      B: [220, 0],
      C: [220, 100],
      D: [440, 0],
    });
  });

  it("fan-out A → B, A → C", () => {
    const els = elements([n("A"), n("B"), n("C")], [e("A", "B"), e("A", "C")]);
    expect(positions(els)).toEqual({
      A: [0, 0],
      B: [220, 0],
      C: [220, 100],
    });
  });

  it("fan-in A → C, B → C", () => {
    const els = elements([n("A"), n("B"), n("C")], [e("A", "C"), e("B", "C")]);
    expect(positions(els)).toEqual({
      A: [0, 0],
      B: [0, 100],
      C: [220, 0],
    });
  });

  it("disconnected components stack vertically", () => {
    // A → B and X → Y in declaration order [A, B, X, Y]. Roots A, X both
    // land in column 0 (rows 0, 1). B, Y both land in column 1 (rows 0, 1).
    const els = elements([n("A"), n("B"), n("X"), n("Y")], [e("A", "B"), e("X", "Y")]);
    expect(positions(els)).toEqual({
      A: [0, 0],
      B: [220, 0],
      X: [0, 100],
      Y: [220, 100],
    });
  });

  it("longest-path layering (not shortest-path)", () => {
    // A → B → D and A → D directly. D's column = max(B, A) + 1 = 2.
    const els = elements([n("A"), n("B"), n("D")], [e("A", "B"), e("A", "D"), e("B", "D")]);
    expect(positions(els)).toEqual({
      A: [0, 0],
      B: [220, 0],
      D: [440, 0],
    });
  });

  it("ignores edges referencing unknown nodes", () => {
    const els = elements([n("A"), n("B")], [e("A", "B"), e("ghost", "B")]);
    expect(positions(els)).toEqual({
      A: [0, 0],
      B: [220, 0],
    });
  });
});
