import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { describe, expect, it } from "vitest";
import {
  DRAFT_CLASS,
  PLAN_FIELDS,
  TODO_SENTINEL_PATTERN,
  detectDraft,
  isDraftWorkflow,
  isTodoSentinel,
} from "../src/workflow/draft-checks.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(here, "fixtures", "draft");
function loadFixture(name: string): unknown {
  return parseYaml(fs.readFileSync(path.join(fixturesDir, name), "utf-8"));
}

describe("isTodoSentinel", () => {
  it.each([
    ["TODO", true],
    ["TODO_foo", true],
    ["TODO_foo_bar_2", true],
    ["TODO_", false],
    ["TODO-foo", false],
    ["TODOfoo", false],
    ["todo", false],
    ["todo_foo", false],
    ["FOO_TODO", false],
    ["", false],
  ] as const)("isTodoSentinel(%j) === %s", (value, expected) => {
    expect(isTodoSentinel(value)).toBe(expected);
  });

  it("rejects non-strings", () => {
    expect(isTodoSentinel(null)).toBe(false);
    expect(isTodoSentinel(undefined)).toBe(false);
    expect(isTodoSentinel(42)).toBe(false);
    expect(isTodoSentinel({})).toBe(false);
  });
});

describe("isDraftWorkflow", () => {
  it("true on class: GalaxyWorkflowDraft", () => {
    expect(isDraftWorkflow({ class: DRAFT_CLASS })).toBe(true);
  });

  it("false on concrete GalaxyWorkflow", () => {
    expect(isDraftWorkflow({ class: "GalaxyWorkflow" })).toBe(false);
  });

  it("false when class is missing", () => {
    expect(isDraftWorkflow({ steps: {} })).toBe(false);
  });

  it("false on non-objects", () => {
    expect(isDraftWorkflow(null)).toBe(false);
    expect(isDraftWorkflow("GalaxyWorkflowDraft")).toBe(false);
    expect(isDraftWorkflow([])).toBe(false);
  });
});

describe("PLAN_FIELDS / TODO_SENTINEL_PATTERN constants", () => {
  it("matches the values shipped by gxformat2/draft.py", () => {
    expect(PLAN_FIELDS).toEqual(["_plan_state", "_plan_context", "_plan_in", "_plan_out"]);
    expect(TODO_SENTINEL_PATTERN.source).toBe("^TODO(_[a-z0-9_]+)?$");
  });
});

describe("detectDraft", () => {
  it("returns isDraft: false with empty arrays on concrete workflows", () => {
    const survey = detectDraft({ class: "GalaxyWorkflow", steps: {} });
    expect(survey).toEqual({ isDraft: false, todos: [], planFields: [] });
  });

  it("collects every TODO + plan field on synthetic-draft-tool-step", () => {
    const survey = detectDraft(loadFixture("synthetic-draft-tool-step.gxwf.yml"));
    expect(survey.isDraft).toBe(true);

    const locations = survey.todos.map((t) => ({ path: t.path, location: t.location }));
    expect(locations).toEqual([
      { path: ["fastp"], location: { kind: "tool_id" } },
      { path: ["fastp"], location: { kind: "tool_version" } },
      { path: ["fastp"], location: { kind: "in_key", key: "TODO_input" } },
      { path: ["fastp"], location: { kind: "out_id", id: "TODO_trimmed_paired" } },
      { path: ["fastp"], location: { kind: "out_id", id: "TODO_html_report" } },
      {
        path: [],
        location: {
          kind: "output_source",
          output_label: "trimmed",
          port: "TODO_trimmed_paired",
        },
      },
    ]);

    const planSummary = survey.planFields.map((p) => ({ path: p.path, field: p.field }));
    expect(planSummary).toEqual([
      { path: ["fastp"], field: "_plan_state" },
      { path: ["fastp"], field: "_plan_context" },
      { path: ["fastp"], field: "_plan_in" },
      { path: ["fastp"], field: "_plan_out" },
    ]);
  });

  it("recurses into subworkflow run: blocks that are themselves drafts", () => {
    const inner = {
      class: DRAFT_CLASS,
      steps: {
        inner_step: { tool_id: "TODO", tool_version: "TODO" },
      },
    };
    const outer = {
      class: DRAFT_CLASS,
      steps: {
        outer_step: { type: "subworkflow", run: inner },
      },
    };
    const survey = detectDraft(outer);
    expect(survey.todos.map((t) => ({ path: t.path, kind: t.location.kind }))).toEqual([
      { path: ["outer_step", "inner_step"], kind: "tool_id" },
      { path: ["outer_step", "inner_step"], kind: "tool_version" },
    ]);
  });

  it("does NOT recurse into concrete run: blocks", () => {
    const survey = detectDraft(loadFixture("synthetic-draft-plan-subworkflow.gxwf.yml"));
    expect(survey.isDraft).toBe(true);
    // The inner run: is `class: GalaxyWorkflow` (concrete). The outer step
    // has `_plan_context` but the inner cat step's `tool_id: cat1` should
    // NOT be visited (no TODOs collected from the inner workflow).
    expect(survey.todos).toEqual([]);
    expect(survey.planFields).toEqual([
      { path: ["qc"], field: "_plan_context", value: expect.any(String) },
    ]);
  });

  it("ignores _plan_* on the top-level draft document (only step-level plan fields are collected)", () => {
    const survey = detectDraft(loadFixture("synthetic-draft-plan-top-level.gxwf.yml"));
    expect(survey.isDraft).toBe(true);
    // Step `cat` is fully concrete and has no _plan_* — survey should be empty.
    expect(survey.todos).toEqual([]);
    expect(survey.planFields).toEqual([]);
  });
});
