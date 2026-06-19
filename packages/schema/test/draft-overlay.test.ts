import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { describe, expect, it } from "vitest";

import { resolveDraftOverlay, PLANNED_CLASS } from "../src/workflow/draft-checks.js";
import { normalizedFormat2 } from "../src/workflow/normalized/format2.js";
import { stepRenderIdentity } from "../src/workflow/normalized/labels.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(here, "fixtures", "workflows", "format2", "draft");

function loadFixture(name: string): unknown {
  return parseYaml(fs.readFileSync(path.join(fixturesDir, name), "utf-8"));
}

describe("resolveDraftOverlay", () => {
  it("returns undefined for a non-draft workflow", () => {
    const concrete = {
      class: "GalaxyWorkflow",
      inputs: { a: { type: "data" } },
      steps: { tool: { tool_id: "cat1", in: { input: "a" }, out: [{ id: "out" }] } },
    };
    expect(resolveDraftOverlay(concrete)).toBeUndefined();
  });

  it("flags a step planned from a TODO sentinel alone (no _plan_*)", () => {
    const wf = {
      class: "GalaxyWorkflowDraft",
      inputs: { a: { type: "data" } },
      steps: { pick: { tool_id: "TODO", in: { input: "a" }, out: [{ id: "out" }] } },
    };
    const overlay = resolveDraftOverlay(wf)!;
    expect([...overlay.plannedSteps]).toEqual(["pick"]);
    expect(overlay.plannedReason.get("pick")?.todos).toContain("tool_id");
    expect(overlay.plannedReason.get("pick")?.planFields).toEqual({});
  });

  it("flags a step planned from a _plan_* field alone (concrete tool)", () => {
    const wf = {
      class: "GalaxyWorkflowDraft",
      inputs: { a: { type: "data" } },
      steps: {
        run: {
          tool_id: "cat1",
          in: { input: "a" },
          out: [{ id: "out" }],
          _plan_state: "tune the cutoff",
        },
      },
    };
    const overlay = resolveDraftOverlay(wf)!;
    expect([...overlay.plannedSteps]).toEqual(["run"]);
    expect(overlay.plannedReason.get("run")?.todos).toEqual([]);
    expect(overlay.plannedReason.get("run")?.planFields).toEqual({
      _plan_state: "tune the cutoff",
    });
  });

  it("excludes a fully concrete step from a draft with another planned step", () => {
    const wf = {
      class: "GalaxyWorkflowDraft",
      inputs: { a: { type: "data" } },
      steps: {
        concrete: { tool_id: "cat1", in: { input: "a" }, out: [{ id: "out" }] },
        planned: { tool_id: "TODO", in: { input: "concrete/out" }, out: [{ id: "TODO_x" }] },
      },
    };
    const overlay = resolveDraftOverlay(wf)!;
    expect(overlay.plannedSteps.has("planned")).toBe(true);
    expect(overlay.plannedSteps.has("concrete")).toBe(false);
  });

  it("keys dict-form planned steps by render identity (explicit label wins over map key)", () => {
    const wf = {
      class: "GalaxyWorkflowDraft",
      inputs: { a: { type: "data" } },
      steps: {
        fastp: {
          tool_id: "TODO",
          label: "trim reads",
          in: { TODO_input: "a" },
          out: [{ id: "TODO_out" }],
        },
      },
    };
    const overlay = resolveDraftOverlay(wf)!;
    // Identity is the explicit label, NOT the map key "fastp".
    expect([...overlay.plannedSteps]).toEqual(["trim reads"]);
  });

  it("keys list-form planned steps by id when no label is present", () => {
    const wf = {
      class: "GalaxyWorkflowDraft",
      inputs: [{ id: "a", type: "data" }],
      steps: [
        { id: "s1", tool_id: "TODO", in: [{ id: "x", source: "a" }], out: [{ id: "TODO_o" }] },
      ],
    };
    const overlay = resolveDraftOverlay(wf)!;
    expect([...overlay.plannedSteps]).toEqual(["s1"]);
  });

  it("flags a top-level subworkflow node planned when an inner draft step has a hit", () => {
    const wf = {
      class: "GalaxyWorkflowDraft",
      inputs: { a: { type: "data" } },
      steps: {
        nested: {
          run: {
            class: "GalaxyWorkflowDraft",
            inputs: { inner_in: { type: "data" } },
            steps: {
              inner_tool: { tool_id: "TODO", in: { i: "inner_in" }, out: [{ id: "TODO_o" }] },
            },
          },
          in: { inner_in: "a" },
        },
      },
    };
    const overlay = resolveDraftOverlay(wf)!;
    // The outer subworkflow node is marked, not the inner step.
    expect(overlay.plannedSteps.has("nested")).toBe(true);
    expect(overlay.plannedSteps.has("inner_tool")).toBe(false);
  });

  it("does not mark any node from a top-level TODO outputSource (workflow-level hit)", () => {
    const wf = {
      class: "GalaxyWorkflowDraft",
      inputs: { a: { type: "data" } },
      outputs: { result: { outputSource: "concrete/TODO_port" } },
      steps: { concrete: { tool_id: "cat1", in: { input: "a" }, out: [{ id: "out" }] } },
    };
    const overlay = resolveDraftOverlay(wf)!;
    // The outputSource TODO is a workflow-level hit (empty path) — it marks no
    // step node. The only step is concrete, so nothing is planned.
    expect(overlay.plannedSteps.size).toBe(0);
  });
});

describe("draft overlay key-space contract", () => {
  // Guards the regression #142 fixed: overlay keys MUST equal the identity the
  // mermaid/cytoscape builders use to look a node up. If these drift, a planned
  // node renders as concrete. This pins the Python port's identity rule too.
  for (const fixture of [
    "synthetic-draft-tool-step.gxwf.yml",
    "synthetic-draft-mixed-steps.gxwf.yml",
    "synthetic-draft-planned-source.gxwf.yml",
  ]) {
    it(`overlay keys match normalized step render identities (${fixture})`, () => {
      const raw = loadFixture(fixture);
      const overlay = resolveDraftOverlay(raw)!;
      expect(overlay).toBeDefined();
      expect(overlay.plannedSteps.size).toBeGreaterThan(0);

      const normalized = normalizedFormat2(raw);
      const identities = new Set(normalized.steps.map((s) => stepRenderIdentity(s)));
      // Every planned key resolves to a real node the builder can look up.
      for (const key of overlay.plannedSteps) {
        expect(identities.has(key)).toBe(true);
      }
    });
  }
});

describe("PLANNED_CLASS", () => {
  it("is the shared token both builders use", () => {
    expect(PLANNED_CLASS).toBe("planned");
  });
});
