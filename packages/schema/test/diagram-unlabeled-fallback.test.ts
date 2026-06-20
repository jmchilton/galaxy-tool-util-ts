import { describe, expect, it } from "vitest";

import { cytoscapeElements, workflowToMermaid } from "../src/index.js";

// Native (.ga) workflow with a single unlabeled tool step. After native→format2
// conversion the step's `id` becomes `_unlabeled_step_<n>`, so the diagram
// builders must fall through to `tool:<tool_id>` rather than emitting that
// synthetic id as the visible label.
const NATIVE_UNLABELED = {
  a_galaxy_workflow: "true",
  format_version: "0.1",
  name: "wf",
  steps: {
    "0": {
      id: 0,
      annotation: "",
      label: null,
      type: "data_input",
      tool_id: null,
      tool_state: '{"name": "Input"}',
      inputs: [],
      outputs: [],
      input_connections: {},
      position: { left: 0, top: 0 },
    },
    "1": {
      id: 1,
      annotation: "",
      label: null,
      type: "tool",
      tool_id: "toolshed.g2.bx.psu.edu/repos/devteam/cat1/cat1/1.0.0",
      tool_version: "1.0.0",
      tool_state: "{}",
      inputs: [],
      outputs: [],
      input_connections: {
        input1: { id: 0, output_name: "output" },
      },
      position: { left: 200, top: 0 },
    },
  },
};

describe("diagram unlabeled-step fallback", () => {
  it("mermaid: unlabeled tool step renders as tool:<tool_id>, not _unlabeled_step_*", () => {
    const diagram = workflowToMermaid(NATIVE_UNLABELED);
    expect(diagram).not.toContain("_unlabeled_step_");
    expect(diagram).toContain("tool:devteam/cat1/cat1/1.0.0");
  });

  it("cytoscape: unlabeled tool step node label is tool:<tool_id>, not _unlabeled_step_*", () => {
    const els = cytoscapeElements(NATIVE_UNLABELED);
    const toolNode = els.nodes.find((n) => n.classes.includes("runnable"));
    expect(toolNode).toBeDefined();
    expect(toolNode!.data.label).not.toMatch(/^_unlabeled_step_/);
    expect(toolNode!.data.label).toBe("tool:devteam/cat1/cat1/1.0.0");
  });
});

// A format2 step references an upstream step by its dict `id` (`upstream/out`)
// even when that upstream carries a distinct human `label:`. The builders key
// nodes by render identity (`label || id`), so source resolution must fold the
// `id` reference back to that identity — otherwise the step→step edge is
// silently dropped and the downstream node renders orphaned.
const FORMAT2_LABELED_REF = {
  class: "GalaxyWorkflow",
  inputs: { in_file: { type: "data" } },
  outputs: {},
  steps: {
    upstream: {
      label: "Upstream Tool With Label",
      tool_id: "toolshed.g2.bx.psu.edu/repos/iuc/up/up/1.0",
      tool_version: "1.0",
      in: { input: "in_file" },
      out: [{ id: "out" }],
    },
    downstream: {
      label: "Downstream Tool With Label",
      tool_id: "toolshed.g2.bx.psu.edu/repos/iuc/down/down/1.0",
      tool_version: "1.0",
      in: { data: "upstream/out" },
      out: [{ id: "result" }],
    },
  },
};

describe("diagram source resolution by step id", () => {
  it("mermaid: edge to a labeled step referenced by its dict id is rendered", () => {
    const diagram = workflowToMermaid(FORMAT2_LABELED_REF);
    // upstream → downstream is step_0 → step_1 (inputs are not steps here).
    expect(diagram).toContain("step_0 --> step_1");
  });

  it("cytoscape: edge to a labeled step referenced by its dict id targets real nodes", () => {
    const els = cytoscapeElements(FORMAT2_LABELED_REF);
    const nodeIds = new Set(els.nodes.map((n) => n.data.id));
    const edge = els.edges.find(
      (e) => e.data.target === "Downstream Tool With Label" && e.data.input === "data",
    );
    expect(edge).toBeDefined();
    // Source resolves to the upstream node's render identity, not the raw `id`.
    expect(edge!.data.source).toBe("Upstream Tool With Label");
    // No dangling endpoints — both ends are real nodes.
    expect(nodeIds.has(edge!.data.source)).toBe(true);
    expect(nodeIds.has(edge!.data.target as string)).toBe(true);
  });
});
