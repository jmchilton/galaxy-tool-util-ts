import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { describe, expect, it } from "vitest";

import { cytoscapeElements } from "../src/workflow/cytoscape.js";
import { resolveDraftOverlay } from "../src/workflow/draft-checks.js";
import { edgeAnnotationKey, type EdgeAnnotation } from "../src/workflow/edge-annotation.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(here, "fixtures", "workflows", "format2", "draft");

function loadFixture(name: string): unknown {
  return parseYaml(fs.readFileSync(path.join(fixturesDir, name), "utf-8"));
}

describe("cytoscapeElements draft overlay", () => {
  it("marks the planned step node by shared render identity, not the map key", () => {
    const raw = loadFixture("synthetic-draft-tool-step.gxwf.yml");
    const els = cytoscapeElements(raw, { draftOverlay: resolveDraftOverlay(raw) });

    // The step keys under map key "fastp" in detectDraft, but renders under its
    // explicit label. Looking up by "fastp" must miss; by the label must hit.
    expect(els.nodes.find((n) => n.data.id === "fastp")).toBeUndefined();
    const node = els.nodes.find((n) => n.data.id === "trim and QC paired reads");
    expect(node).toBeDefined();
    expect(node!.classes).toEqual(["type_tool", "runnable", "planned"]);
    expect(node!.data.planned).toBe(true);
    expect(node!.data.plan_reason?.todos).toContain("tool_id");
    expect(node!.data.plan_reason?.plan_fields._plan_state).toContain("Adapter trimming");
  });

  it("leaves the concrete input node unmarked", () => {
    const raw = loadFixture("synthetic-draft-tool-step.gxwf.yml");
    const els = cytoscapeElements(raw, { draftOverlay: resolveDraftOverlay(raw) });
    const input = els.nodes.find((n) => n.data.id === "reads")!;
    expect(input.classes).toEqual(["type_collection", "input"]);
    expect(input.data.planned).toBeUndefined();
    expect(input.data.plan_reason).toBeUndefined();
  });

  it("marks the edge into the planned step (target planned + TODO port)", () => {
    const raw = loadFixture("synthetic-draft-tool-step.gxwf.yml");
    const els = cytoscapeElements(raw, { draftOverlay: resolveDraftOverlay(raw) });
    const edge = els.edges.find((e) => e.data.target === "trim and QC paired reads")!;
    expect(edge.data.planned).toBe(true);
    expect(edge.classes).toEqual(["planned"]);
  });

  it("auto-detects a draft when no overlay is passed (parity with the CLI/declarative path)", () => {
    const raw = loadFixture("synthetic-draft-tool-step.gxwf.yml");
    const auto = cytoscapeElements(raw);
    const explicit = cytoscapeElements(raw, { draftOverlay: resolveDraftOverlay(raw) });
    expect(auto).toEqual(explicit);
    expect(auto.nodes.find((n) => n.data.id === "trim and QC paired reads")!.data.planned).toBe(
      true,
    );
  });

  it("forces plain output for a draft when draftOverlay is null (CLI --no-draft-overlay)", () => {
    const raw = loadFixture("synthetic-draft-tool-step.gxwf.yml");
    const plain = cytoscapeElements(raw, { draftOverlay: null });
    for (const node of plain.nodes) {
      expect(node.classes).not.toContain("planned");
      expect(node.data.planned).toBeUndefined();
      expect(node.data.plan_reason).toBeUndefined();
    }
    for (const edge of plain.edges) {
      expect(edge.classes ?? []).not.toContain("planned");
      expect(edge.data.planned).toBeUndefined();
    }
  });

  it("excludes the concrete step in a mixed draft and marks only the planned one", () => {
    const raw = loadFixture("synthetic-draft-mixed-steps.gxwf.yml");
    const els = cytoscapeElements(raw, { draftOverlay: resolveDraftOverlay(raw) });
    const align = els.nodes.find((n) => n.data.id === "align")!;
    const call = els.nodes.find((n) => n.data.id === "call variants")!;
    expect(align.classes).toEqual(["type_tool", "runnable"]);
    expect(align.data.planned).toBeUndefined();
    expect(call.classes).toContain("planned");
    expect(call.data.planned).toBe(true);
  });

  it("flags the outer subworkflow node from an inner-draft step hit", () => {
    const raw = loadFixture("synthetic-draft-subworkflow-inner-draft.gxwf.yml");
    const els = cytoscapeElements(raw, { draftOverlay: resolveDraftOverlay(raw) });
    const outer = els.nodes.find((n) => n.data.id === "outer subworkflow step")!;
    expect(outer.data.step_type).toBe("subworkflow");
    expect(outer.classes).toEqual(["type_subworkflow", "runnable", "planned"]);
    expect(outer.data.planned).toBe(true);
  });

  it("coexists planned with mapover_* / reduction on a single edge", () => {
    // A draft whose first step is planned (TODO tool) AND whose edge into it
    // also carries a map-over annotation. Both class hints must survive.
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
    const els = cytoscapeElements(draft, {
      edgeAnnotations: annotations,
      draftOverlay: resolveDraftOverlay(draft),
    });
    const edge = els.edges.find((e) => e.data.target === "tool_a")!;
    expect(edge.classes).toContain("mapover_1");
    expect(edge.classes).toContain("planned");
    // Annotation data still attached alongside the planned flag.
    expect(edge.data.map_depth).toBe(1);
    expect(edge.data.mapping).toBe("list");
    expect(edge.data.planned).toBe(true);
  });

  it("returns undefined overlay for a concrete workflow and emits byte-identical output", () => {
    const concrete = {
      class: "GalaxyWorkflow",
      inputs: [{ id: "in_a", type: "data" }],
      steps: [{ id: "s", label: "s", tool_id: "cat1", in: [{ id: "i", source: "in_a" }] }],
    };
    expect(resolveDraftOverlay(concrete)).toBeUndefined();
    const auto = cytoscapeElements(concrete);
    const withResolved = cytoscapeElements(concrete, {
      draftOverlay: resolveDraftOverlay(concrete),
    });
    expect(withResolved).toEqual(auto);
    for (const node of auto.nodes) expect(node.data.planned).toBeUndefined();
    for (const edge of auto.edges) expect(edge.data.planned).toBeUndefined();
  });
});
