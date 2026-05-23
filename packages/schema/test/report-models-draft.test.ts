import { describe, expect, it } from "vitest";
import {
  DRAFT_CLASS,
  buildSingleDraftValidationReport,
  validateDraft,
} from "../src/workflow/index.js";

describe("buildSingleDraftValidationReport", () => {
  it("produces ok=true + 'draft valid' summary on a clean draft", () => {
    const wf = {
      class: DRAFT_CLASS,
      inputs: { reads: { type: "data" } },
      outputs: {},
      steps: {
        a: {
          tool_id: "cat1",
          tool_version: "1.0.0",
          in: { input1: "reads" },
          out: [{ id: "out1" }],
        },
      },
    };
    const r = buildSingleDraftValidationReport("clean.gxwf.yml", validateDraft(wf));
    expect(r.workflow).toBe("clean.gxwf.yml");
    expect(r.ok).toBe(true);
    expect(r.summary).toBe("draft valid");
    expect(r.structure_errors).toEqual([]);
    expect(r.topology_errors).toEqual([]);
    expect(r.semantic_errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.survey).toEqual({
      is_draft: true,
      todo_count: 0,
      todo_paths: [],
      plan_step_paths: [],
    });
  });

  it("reports structure error + 'draft valid' summary cannot apply when not a draft", () => {
    const r = buildSingleDraftValidationReport(
      "concrete.gxwf.yml",
      validateDraft({
        class: "GalaxyWorkflow",
        steps: {},
      }),
    );
    expect(r.ok).toBe(false);
    expect(r.structure_errors).toHaveLength(1);
    expect(r.summary).toMatch(/^1 error/);
    expect(r.survey.is_draft).toBe(false);
  });

  it("dedups todo and plan paths by walk-order while preserving first-seen order", () => {
    // Step `fastp` has multiple TODO hits — should appear once in todo_paths.
    const wf = {
      class: DRAFT_CLASS,
      inputs: { reads: { type: "data" } },
      outputs: {},
      steps: {
        fastp: {
          tool_id: "TODO",
          tool_version: "TODO",
          in: { TODO_input: "reads" },
          out: [{ id: "TODO_out" }],
          _plan_state: "plan stuff",
          _plan_context: "context",
        },
        chain: {
          tool_id: "TODO",
          tool_version: "TODO",
          in: { input1: "fastp/TODO_out" },
          out: [{ id: "out1" }],
        },
      },
    };
    const r = buildSingleDraftValidationReport("dedup.gxwf.yml", validateDraft(wf));
    expect(r.survey.todo_paths).toEqual([["fastp"], ["chain"]]);
    expect(r.survey.plan_step_paths).toEqual([["fastp"]]);
    expect(r.survey.todo_count).toBeGreaterThan(2);
  });

  it("summarizes warnings without errors as 'draft valid (N warnings)'", () => {
    // Top-level `_plan_*` triggers a warning but no error.
    const wf = {
      class: DRAFT_CLASS,
      _plan_context: "top-level planning",
      inputs: { reads: { type: "data" } },
      outputs: {},
      steps: {
        a: {
          tool_id: "cat1",
          tool_version: "1.0.0",
          in: { input1: "reads" },
          out: [{ id: "out1" }],
        },
      },
    };
    const r = buildSingleDraftValidationReport("warn.gxwf.yml", validateDraft(wf));
    expect(r.ok).toBe(true);
    expect(r.warnings).toHaveLength(1);
    expect(r.summary).toBe("draft valid (1 warning)");
  });

  it("pluralizes 'errors' and 'warnings' correctly", () => {
    // Multiple topology errors: TODO label + dangling edge + malformed sentinel.
    const wf = {
      class: DRAFT_CLASS,
      inputs: { reads: { type: "data" } },
      outputs: {},
      steps: {
        TODO: {
          tool_id: "TODO-foo", // malformed → 1 semantic error
          tool_version: "1.0.0",
          in: { input1: "reads" },
          out: [{ id: "out1" }],
        },
      },
    };
    const r = buildSingleDraftValidationReport("multi.gxwf.yml", validateDraft(wf));
    expect(r.ok).toBe(false);
    // At least 2 errors: TODO label (topology) + TODO-foo malformed (semantic)
    expect(r.summary).toMatch(/^\d+ errors/);
  });

  it("preserves diagnostic step paths verbatim (clone safety)", () => {
    const wf = {
      class: DRAFT_CLASS,
      inputs: { reads: { type: "data" } },
      outputs: {},
      steps: {
        outer: {
          type: "subworkflow",
          in: { reads: "reads" },
          out: [{ id: "result" }],
          run: {
            class: DRAFT_CLASS,
            inputs: { reads: { type: "data" } },
            outputs: {},
            steps: { TODO: { tool_id: "cat1", tool_version: "1.0.0" } },
          },
        },
      },
    };
    const r = buildSingleDraftValidationReport("nested.gxwf.yml", validateDraft(wf));
    const todoLabelErr = r.topology_errors.find((e) =>
      e.message.includes("step label cannot be a TODO sentinel"),
    );
    expect(todoLabelErr?.path).toEqual(["outer"]);
  });
});
