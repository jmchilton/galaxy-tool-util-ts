import { describe, expect, it } from "vitest";
import { promoteFullyConcreteDrafts, stripPlanFields } from "../src/workflow/promote-draft.js";

describe("stripPlanFields", () => {
  it("removes all four _plan_* keys from a step", () => {
    const wf = {
      class: "GalaxyWorkflowDraft",
      steps: {
        s1: {
          tool_id: "cat1",
          _plan_state: "drafty",
          _plan_context: "x",
          _plan_in: "y",
          _plan_out: "z",
        },
      },
    };
    const result = stripPlanFields(wf);
    expect((result.workflow as { steps: { s1: object } }).steps.s1).toEqual({ tool_id: "cat1" });
    expect(result.removedPaths.map((r) => r.field).sort()).toEqual([
      "_plan_context",
      "_plan_in",
      "_plan_out",
      "_plan_state",
    ]);
    expect(result.removedPaths.every((r) => r.path.length === 1 && r.path[0] === "s1")).toBe(true);
  });

  it("removes _plan_* from the workflow root and reports path: []", () => {
    const wf = {
      class: "GalaxyWorkflowDraft",
      _plan_context: "top-level dead weight",
      steps: {},
    };
    const result = stripPlanFields(wf);
    expect((result.workflow as Record<string, unknown>)._plan_context).toBeUndefined();
    expect(result.removedPaths).toEqual([{ path: [], field: "_plan_context" }]);
  });

  it("recurses into draft subworkflow `run:` blocks", () => {
    const wf = {
      class: "GalaxyWorkflowDraft",
      steps: {
        outer: {
          type: "subworkflow",
          _plan_context: "outer plan",
          run: {
            class: "GalaxyWorkflowDraft",
            _plan_state: "inner-root plan",
            steps: {
              inner: { tool_id: "cat1", _plan_in: "inner step plan" },
            },
          },
        },
      },
    };
    const result = stripPlanFields(wf);

    const root = result.workflow as {
      steps: {
        outer: {
          _plan_context?: unknown;
          run: { _plan_state?: unknown; steps: { inner: { _plan_in?: unknown } } };
        };
      };
    };
    expect(root.steps.outer._plan_context).toBeUndefined();
    expect(root.steps.outer.run._plan_state).toBeUndefined();
    expect(root.steps.outer.run.steps.inner._plan_in).toBeUndefined();

    const paths = result.removedPaths.map((r) => ({ path: r.path.join("/"), field: r.field }));
    expect(paths).toContainEqual({ path: "outer", field: "_plan_context" });
    expect(paths).toContainEqual({ path: "outer", field: "_plan_state" });
    expect(paths).toContainEqual({ path: "outer/inner", field: "_plan_in" });
  });

  it("does NOT recurse into concrete (class: GalaxyWorkflow) subworkflow run:", () => {
    const wf = {
      class: "GalaxyWorkflowDraft",
      steps: {
        outer: {
          run: {
            class: "GalaxyWorkflow",
            // This shouldn't exist on a concrete workflow but if it did we
            // wouldn't strip it — concrete `run:` is opaque to draft tooling.
            _plan_state: "should survive",
            steps: { inner: { tool_id: "cat1", _plan_in: "should survive" } },
          },
        },
      },
    };
    const result = stripPlanFields(wf);
    const root = result.workflow as {
      steps: {
        outer: {
          run: { _plan_state?: unknown; steps: { inner: { _plan_in?: unknown } } };
        };
      };
    };
    expect(root.steps.outer.run._plan_state).toBe("should survive");
    expect(root.steps.outer.run.steps.inner._plan_in).toBe("should survive");
  });

  it("does NOT recurse into string-form run: (URLs / TRS refs)", () => {
    const wf = {
      class: "GalaxyWorkflowDraft",
      steps: {
        outer: { run: "https://example.com/inner.gxwf.yml" },
      },
    };
    const result = stripPlanFields(wf);
    // No throws, no entries.
    expect(result.removedPaths).toEqual([]);
  });

  it("returns the input unchanged for non-record values", () => {
    expect(stripPlanFields(null)).toEqual({ workflow: null, removedPaths: [] });
    expect(stripPlanFields("string")).toEqual({ workflow: "string", removedPaths: [] });
    expect(stripPlanFields([])).toEqual({ workflow: [], removedPaths: [] });
  });

  it("is idempotent — second strip removes nothing", () => {
    const wf = {
      class: "GalaxyWorkflowDraft",
      _plan_context: "x",
      steps: { s1: { tool_id: "cat1", _plan_state: "y" } },
    };
    const r1 = stripPlanFields(wf);
    expect(r1.removedPaths.length).toBeGreaterThan(0);
    const r2 = stripPlanFields(wf);
    expect(r2.removedPaths).toEqual([]);
  });
});

describe("promoteFullyConcreteDrafts", () => {
  it("flips class when no TODOs / no _plan_* remain", () => {
    const wf = {
      class: "GalaxyWorkflowDraft",
      steps: {
        s1: {
          tool_id: "cat1",
          tool_version: "1.0.0",
          in: { input1: "reads" },
          out: [{ id: "out_file1" }],
        },
      },
    };
    const result = promoteFullyConcreteDrafts(wf);
    expect((result.workflow as { class: string }).class).toBe("GalaxyWorkflow");
    expect(result.promotedPaths).toEqual([[]]);
  });

  it("leaves class alone when TODO sentinels remain", () => {
    const wf = {
      class: "GalaxyWorkflowDraft",
      steps: {
        s1: { tool_id: "TODO", tool_version: "1.0.0", in: { input1: "reads" } },
      },
    };
    const result = promoteFullyConcreteDrafts(wf);
    expect((result.workflow as { class: string }).class).toBe("GalaxyWorkflowDraft");
    expect(result.promotedPaths).toEqual([]);
  });

  it("leaves class alone when _plan_* remains at workflow root", () => {
    const wf = {
      class: "GalaxyWorkflowDraft",
      _plan_context: "leftover",
      steps: { s1: { tool_id: "cat1", tool_version: "1.0.0" } },
    };
    const result = promoteFullyConcreteDrafts(wf);
    expect((result.workflow as { class: string }).class).toBe("GalaxyWorkflowDraft");
  });

  it("leaves class alone when a step still carries _plan_*", () => {
    const wf = {
      class: "GalaxyWorkflowDraft",
      steps: {
        s1: { tool_id: "cat1", tool_version: "1.0.0", _plan_state: "drafty" },
      },
    };
    const result = promoteFullyConcreteDrafts(wf);
    expect((result.workflow as { class: string }).class).toBe("GalaxyWorkflowDraft");
  });

  it("recurses into draft subworkflow run: and flips when inner becomes concrete", () => {
    const wf = {
      class: "GalaxyWorkflowDraft",
      steps: {
        outer: {
          type: "subworkflow",
          in: { reads: "reads" },
          out: [{ id: "out" }],
          run: {
            class: "GalaxyWorkflowDraft",
            steps: {
              inner: { tool_id: "cat1", tool_version: "1.0.0", in: { input1: "reads" } },
            },
          },
        },
      },
    };
    const result = promoteFullyConcreteDrafts(wf);
    const root = result.workflow as { class: string; steps: { outer: { run: { class: string } } } };
    expect(root.class).toBe("GalaxyWorkflow");
    expect(root.steps.outer.run.class).toBe("GalaxyWorkflow");
    expect(result.promotedPaths).toContainEqual([]);
    expect(result.promotedPaths).toContainEqual(["outer"]);
  });

  it("flips inner draft but leaves outer drafty when outer still has work", () => {
    const wf = {
      class: "GalaxyWorkflowDraft",
      steps: {
        drafty: { tool_id: "TODO" },
        outer: {
          run: {
            class: "GalaxyWorkflowDraft",
            steps: { inner: { tool_id: "cat1" } },
          },
        },
      },
    };
    const result = promoteFullyConcreteDrafts(wf);
    const root = result.workflow as { class: string; steps: { outer: { run: { class: string } } } };
    expect(root.class).toBe("GalaxyWorkflowDraft");
    expect(root.steps.outer.run.class).toBe("GalaxyWorkflow");
    expect(result.promotedPaths).toEqual([["outer"]]);
  });

  it("does NOT flip outer when an inner draft still carries work", () => {
    const wf = {
      class: "GalaxyWorkflowDraft",
      steps: {
        outer: {
          run: {
            class: "GalaxyWorkflowDraft",
            steps: { inner: { tool_id: "TODO" } },
          },
        },
      },
    };
    const result = promoteFullyConcreteDrafts(wf);
    const root = result.workflow as { class: string; steps: { outer: { run: { class: string } } } };
    expect(root.class).toBe("GalaxyWorkflowDraft");
    expect(root.steps.outer.run.class).toBe("GalaxyWorkflowDraft");
    expect(result.promotedPaths).toEqual([]);
  });

  it("passes non-draft workflows through unchanged", () => {
    const wf = { class: "GalaxyWorkflow", steps: {} };
    const result = promoteFullyConcreteDrafts(wf);
    expect((result.workflow as { class: string }).class).toBe("GalaxyWorkflow");
    expect(result.promotedPaths).toEqual([]);
  });

  it("handles non-record input gracefully", () => {
    expect(promoteFullyConcreteDrafts(null)).toEqual({ workflow: null, promotedPaths: [] });
    expect(promoteFullyConcreteDrafts(42)).toEqual({ workflow: 42, promotedPaths: [] });
  });
});
