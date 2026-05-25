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
  extractConcreteSubset,
  isDraftWorkflow,
  isTodoSentinel,
  nextDraftStep,
  validateDraft,
} from "../src/workflow/draft-checks.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(here, "fixtures", "workflows", "format2", "draft");
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

describe("validateDraft", () => {
  it("rejects non-draft documents up front", () => {
    const r = validateDraft({ class: "GalaxyWorkflow", steps: {} });
    expect(r.ok).toBe(false);
    expect(r.structureErrors).toHaveLength(1);
    expect(r.structureErrors[0]?.message).toMatch(/class must be "GalaxyWorkflowDraft"/);
  });

  it("passes on the upstream synthetic-draft-tool-step fixture", () => {
    const r = validateDraft(loadFixture("synthetic-draft-tool-step.gxwf.yml"));
    expect(r.ok).toBe(true);
    expect(r.structureErrors).toEqual([]);
    expect(r.topologyErrors).toEqual([]);
    expect(r.semanticErrors).toEqual([]);
    // No warnings expected: TODO_<hint> ports, no top-level _plan_*.
    expect(r.warnings).toEqual([]);
    expect(r.survey.isDraft).toBe(true);
  });

  it("flags top-level _plan_* as a warning (not an error)", () => {
    const r = validateDraft(loadFixture("synthetic-draft-plan-top-level.gxwf.yml"));
    expect(r.ok).toBe(true);
    expect(r.warnings.map((w) => w.message)).toEqual([
      "top-level `_plan_context` is not part of the draft contract; planning fields belong on individual steps",
    ]);
  });

  it("errors on TODO sentinel in step label", () => {
    const r = validateDraft({
      class: DRAFT_CLASS,
      inputs: { reads: { type: "data" } },
      outputs: {},
      steps: { TODO: { tool_id: "cat1", tool_version: "1.0.0" } },
    });
    expect(r.ok).toBe(false);
    expect(r.topologyErrors.map((e) => e.message)).toContain(
      `step label cannot be a TODO sentinel: "TODO"`,
    );
  });

  it("errors on dangling step/port edge ref", () => {
    const r = validateDraft({
      class: DRAFT_CLASS,
      inputs: { reads: { type: "data" } },
      outputs: { final: { outputSource: "missing_step/out1" } },
      steps: {
        a: {
          tool_id: "cat1",
          tool_version: "1.0.0",
          in: { input1: "missing_step/out1" },
          out: [{ id: "out1" }],
        },
      },
    });
    expect(r.ok).toBe(false);
    const msgs = r.topologyErrors.map((e) => e.message);
    expect(msgs).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          `workflow output "final" source "missing_step/out1" references unknown step "missing_step"`,
        ),
        expect.stringContaining(
          `step input "input1" source "missing_step/out1" references unknown step "missing_step"`,
        ),
      ]),
    );
  });

  it("errors on unknown port on a declared step", () => {
    const r = validateDraft({
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
        b: {
          tool_id: "cat1",
          tool_version: "1.0.0",
          in: { input1: "a/wrong_port" },
          out: [{ id: "out1" }],
        },
      },
    });
    expect(r.ok).toBe(false);
    expect(r.topologyErrors.map((e) => e.message)).toContain(
      `step input "input1" source "a/wrong_port" references unknown port "wrong_port" on step "a"`,
    );
  });

  it("allows TODO_<hint> ports as edge sources (drafts may reference unresolved ports)", () => {
    const r = validateDraft({
      class: DRAFT_CLASS,
      inputs: { reads: { type: "data" } },
      outputs: { final: { outputSource: "fastp/TODO_trimmed" } },
      steps: {
        fastp: {
          tool_id: "TODO",
          tool_version: "TODO",
          in: { TODO_input: "reads" },
          out: [{ id: "TODO_trimmed" }],
        },
      },
    });
    expect(r.ok).toBe(true);
    expect(r.topologyErrors).toEqual([]);
  });

  it("emits semantic error on malformed TODO-shaped strings (TODO_, TODO-foo, TODO_Foo)", () => {
    const r = validateDraft({
      class: DRAFT_CLASS,
      inputs: { reads: { type: "data" } },
      outputs: {},
      steps: {
        a: {
          tool_id: "TODO-foo",
          tool_version: "TODO_",
          in: { TODO_input: "reads" }, // canonical, not malformed
          out: [{ id: "TODO_Foo" }],
        },
      },
    });
    expect(r.ok).toBe(false);
    const malformed = r.semanticErrors.map((e) => e.message);
    expect(malformed).toEqual(
      expect.arrayContaining([
        expect.stringContaining(`tool_id "TODO-foo" is TODO-shaped but malformed`),
        expect.stringContaining(`tool_version "TODO_" is TODO-shaped but malformed`),
        expect.stringContaining(`out: id "TODO_Foo" is TODO-shaped but malformed`),
      ]),
    );
    // `TODOfoo`-style strings (TODO followed by a letter, no separator) are
    // NOT flagged — the heuristic only matches TODO followed by `_`, `-`,
    // or end-of-string, to avoid false positives on unrelated identifiers
    // like TODONE / TODOLIST.
  });

  it("warns on bare TODO in port position", () => {
    const r = validateDraft({
      class: DRAFT_CLASS,
      inputs: { reads: { type: "data" } },
      outputs: {},
      steps: {
        a: {
          tool_id: "TODO",
          tool_version: "TODO",
          in: { TODO: "reads" },
          out: [{ id: "TODO" }],
        },
      },
    });
    expect(r.ok).toBe(true);
    const warnMsgs = r.warnings.map((w) => w.message);
    expect(warnMsgs).toEqual(
      expect.arrayContaining([
        expect.stringContaining("bare `TODO` in port position (location: in.TODO)"),
        expect.stringContaining("bare `TODO` in port position (location: out.TODO)"),
      ]),
    );
    // tool_id / tool_version bare TODO is *allowed* — should not appear as a warning.
    expect(warnMsgs.some((m) => m.includes("tool_id"))).toBe(false);
  });

  it("recurses into draft subworkflows and emits errors with the outer-prefixed step path", () => {
    const r = validateDraft({
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
    });
    expect(r.ok).toBe(false);
    const err = r.topologyErrors.find((e) =>
      e.message.includes("step label cannot be a TODO sentinel"),
    );
    expect(err).toBeDefined();
    expect(err?.path).toEqual(["outer"]);
  });
});

describe("nextDraftStep", () => {
  it("returns { draft: false } on non-draft documents", () => {
    expect(nextDraftStep({ class: "GalaxyWorkflow", steps: {} })).toEqual({ draft: false });
    expect(nextDraftStep(null)).toEqual({ draft: false });
  });

  it("returns { draft: false } on a draft with no remaining work", () => {
    const result = nextDraftStep({
      class: DRAFT_CLASS,
      inputs: { reads: { type: "data" } },
      outputs: { final: { outputSource: "a/out1" } },
      steps: {
        a: {
          tool_id: "cat1",
          tool_version: "1.0.0",
          in: { input1: "reads" },
          out: [{ id: "out1" }],
        },
      },
    });
    expect(result).toEqual({ draft: false });
  });

  it("returns prompt-shaped work[] in the locked-decision order on synthetic-draft-tool-step", () => {
    const result = nextDraftStep(loadFixture("synthetic-draft-tool-step.gxwf.yml"));
    expect(result.draft).toBe(true);
    if (!result.draft) throw new Error("unreachable");
    expect(result.step).toEqual(["fastp"]);
    expect(result.work).toEqual([
      "TODO[tool_id]: pick a Galaxy Tool Shed wrapper for this step",
      "TODO[tool_version]: pick the wrapper version",
      "TODO[in.TODO_input]: assign the real wrapper input port name (semantic hint: 'input')",
      "TODO[out.TODO_trimmed_paired]: assign the real wrapper output port name (semantic hint: 'trimmed_paired'; referenced by workflow output 'trimmed')",
      "TODO[out.TODO_html_report]: assign the real wrapper output port name (semantic hint: 'html_report')",
      expect.stringMatching(/^_plan_state: Adapter trimming on/),
      expect.stringMatching(/^_plan_context: Upstream process used fastp/),
      expect.stringMatching(/^_plan_in: TODO_input is the paired reads/),
      expect.stringMatching(/^_plan_out: TODO_trimmed_paired feeds/),
    ]);
  });

  it("walks steps in topological order — concrete dependencies first, drafts last", () => {
    // Chain: a (concrete) -> b (concrete) -> c (draft). c is the only step
    // needing work; the function must return c even though it's last.
    const wf = {
      class: DRAFT_CLASS,
      inputs: { reads: { type: "data" } },
      outputs: { final: { outputSource: "c/out1" } },
      steps: {
        c: {
          tool_id: "TODO",
          tool_version: "TODO",
          in: { input1: "b/out1" },
          out: [{ id: "out1" }],
        },
        b: {
          tool_id: "cat1",
          tool_version: "1.0.0",
          in: { input1: "a/out1" },
          out: [{ id: "out1" }],
        },
        a: {
          tool_id: "cat1",
          tool_version: "1.0.0",
          in: { input1: "reads" },
          out: [{ id: "out1" }],
        },
      },
    };
    const result = nextDraftStep(wf);
    expect(result).toMatchObject({ draft: true, step: ["c"] });
  });

  it("tie-breaks by step label alphabetically at the same topological level", () => {
    // Two draft steps both at level 0; alphabetical wins.
    const wf = {
      class: DRAFT_CLASS,
      inputs: { reads: { type: "data" } },
      outputs: {},
      steps: {
        zulu: { tool_id: "TODO", tool_version: "TODO", in: { x: "reads" } },
        alpha: { tool_id: "TODO", tool_version: "TODO", in: { x: "reads" } },
      },
    };
    const result = nextDraftStep(wf);
    expect(result).toMatchObject({ draft: true, step: ["alpha"] });
  });

  it("is idempotent across repeated runs", () => {
    const wf = loadFixture("synthetic-draft-tool-step.gxwf.yml");
    const a = JSON.stringify(nextDraftStep(wf));
    const b = JSON.stringify(nextDraftStep(wf));
    const c = JSON.stringify(nextDraftStep(wf));
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it("descends into draft subworkflows only after the outer step is concrete", () => {
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
            steps: {
              inner: {
                tool_id: "TODO",
                tool_version: "TODO",
                in: { x: "reads" },
                out: [{ id: "result" }],
              },
            },
          },
        },
      },
    };
    const result = nextDraftStep(wf);
    expect(result).toMatchObject({ draft: true, step: ["outer", "inner"] });
  });

  it("returns the outer step first when both outer and inner need work", () => {
    const wf = {
      class: DRAFT_CLASS,
      inputs: { reads: { type: "data" } },
      outputs: {},
      steps: {
        outer: {
          type: "subworkflow",
          _plan_context: "settle outer first",
          in: { reads: "reads" },
          out: [{ id: "result" }],
          run: {
            class: DRAFT_CLASS,
            steps: { inner: { tool_id: "TODO", tool_version: "TODO" } },
          },
        },
      },
    };
    const result = nextDraftStep(wf);
    expect(result).toMatchObject({
      draft: true,
      step: ["outer"],
      work: ["_plan_context: settle outer first"],
    });
  });

  it("handles bare TODO with no semantic hint", () => {
    const wf = {
      class: DRAFT_CLASS,
      inputs: { reads: { type: "data" } },
      outputs: {},
      steps: {
        a: {
          tool_id: "TODO",
          tool_version: "TODO",
          in: { TODO: "reads" },
          out: [{ id: "TODO" }],
        },
      },
    };
    const result = nextDraftStep(wf);
    expect(result.draft).toBe(true);
    if (!result.draft) throw new Error("unreachable");
    expect(result.work).toEqual([
      "TODO[tool_id]: pick a Galaxy Tool Shed wrapper for this step",
      "TODO[tool_version]: pick the wrapper version",
      "TODO[in.TODO]: assign the real wrapper input port name",
      "TODO[out.TODO]: assign the real wrapper output port name",
    ]);
  });
});

describe("fix-ups (review feedback)", () => {
  // Reviewer #1: list-form `in:` and `out:` shapes.
  it("detectDraft picks up TODO sentinels in list-form `in:` entries", () => {
    const survey = detectDraft({
      class: DRAFT_CLASS,
      steps: {
        fastp: {
          tool_id: "TODO",
          tool_version: "TODO",
          in: [{ id: "TODO_input", source: "reads" }],
          out: [{ id: "TODO_trimmed" }],
        },
      },
    });
    const kinds = survey.todos.map((t) => t.location.kind);
    expect(kinds).toContain("in_key");
    const inHit = survey.todos.find((t) => t.location.kind === "in_key");
    expect(inHit?.sentinel).toBe("TODO_input");
  });

  it("detectDraft picks up TODO sentinels in list-form `out:` (already worked, locking in)", () => {
    const survey = detectDraft({
      class: DRAFT_CLASS,
      steps: {
        a: { tool_id: "TODO", tool_version: "TODO", out: [{ id: "TODO_x" }, { id: "TODO_y" }] },
      },
    });
    const outIds = survey.todos
      .filter((t) => t.location.kind === "out_id")
      .map((t) => (t.location.kind === "out_id" ? t.location.id : ""));
    expect(outIds).toEqual(["TODO_x", "TODO_y"]);
  });

  it("validateDraft picks up dangling edge refs in list-form `in:` entries", () => {
    const r = validateDraft({
      class: DRAFT_CLASS,
      inputs: { reads: { type: "data" } },
      outputs: {},
      steps: {
        a: {
          tool_id: "cat1",
          tool_version: "1.0.0",
          in: [{ id: "input1", source: "missing/out1" }],
          out: [{ id: "out1" }],
        },
      },
    });
    expect(r.ok).toBe(false);
    expect(r.topologyErrors.map((e) => e.message)).toContain(
      `step input "input1" source "missing/out1" references unknown step "missing"`,
    );
  });

  // Reviewer #2: top-level _plan_* warning at INNER draft roots.
  it("validateDraft warns about _plan_* at inner draft subworkflow roots, with the outer step's path", () => {
    const r = validateDraft({
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
            _plan_context: "settle the inner workflow",
            inputs: { reads: { type: "data" } },
            outputs: {},
            steps: { inner: { tool_id: "cat1", tool_version: "1.0.0" } },
          },
        },
      },
    });
    // Outer has no _plan_*; inner does. Expect exactly one warning.
    const planWarnings = r.warnings.filter((w) => w.message.includes("_plan_context"));
    expect(planWarnings).toHaveLength(1);
    expect(planWarnings[0]?.path).toEqual(["outer"]);
  });

  // Reviewer #5: tighter TODO_LIKE regex no longer false-positives on TODONE/TODOLIST.
  it("validateDraft does NOT flag identifiers that merely start with TODO", () => {
    const r = validateDraft({
      class: DRAFT_CLASS,
      inputs: { reads: { type: "data" } },
      outputs: {},
      steps: {
        TODONE_step: {
          tool_id: "TODONE",
          tool_version: "TODOLIST",
          in: { TODONE: "reads" },
          out: [{ id: "TODOLIST" }],
        },
      },
    });
    expect(r.semanticErrors).toEqual([]);
  });

  // Reviewer #6: ordering idempotence — different dict insertion orders produce identical nextDraftStep output.
  it("nextDraftStep is byte-for-byte identical across two semantically-equal workflows with different dict key order", () => {
    const wfA = {
      class: DRAFT_CLASS,
      inputs: { reads: { type: "data" } },
      outputs: {},
      steps: {
        alpha: { tool_id: "TODO", tool_version: "TODO", in: { x: "reads" } },
        zulu: { tool_id: "TODO", tool_version: "TODO", in: { x: "reads" } },
      },
    };
    // Same content, opposite insertion order.
    const wfB = {
      class: DRAFT_CLASS,
      outputs: {},
      inputs: { reads: { type: "data" } },
      steps: {
        zulu: { tool_id: "TODO", tool_version: "TODO", in: { x: "reads" } },
        alpha: { tool_id: "TODO", tool_version: "TODO", in: { x: "reads" } },
      },
    };
    expect(JSON.stringify(nextDraftStep(wfA))).toBe(JSON.stringify(nextDraftStep(wfB)));
  });

  // Reviewer #4: clarify inner-draft outputs path.
  it("detectDraft uses the outer-step path for inner-draft workflow outputs", () => {
    const survey = detectDraft({
      class: DRAFT_CLASS,
      steps: {
        outer: {
          type: "subworkflow",
          run: {
            class: DRAFT_CLASS,
            outputs: { result: { outputSource: "inner_step/TODO_port" } },
            steps: {
              inner_step: { tool_id: "cat1", tool_version: "1.0.0", out: [{ id: "TODO_port" }] },
            },
          },
        },
      },
    });
    const outputHit = survey.todos.find((t) => t.location.kind === "output_source");
    expect(outputHit?.path).toEqual(["outer"]);
    if (outputHit?.location.kind === "output_source") {
      expect(outputHit.location.output_label).toBe("result");
      expect(outputHit.location.port).toBe("TODO_port");
    }
  });
});

describe("extractConcreteSubset", () => {
  it("passes non-draft documents through unchanged with empty drop arrays", () => {
    const wf = { class: "GalaxyWorkflow", steps: {} };
    const r = extractConcreteSubset(wf);
    expect(r.workflow).toBe(wf);
    expect(r.dropped_steps).toEqual([]);
    expect(r.dropped_outputs).toEqual([]);
    expect(r.rewritten_step_inputs).toEqual([]);
  });

  it("drops a directly-drafty tool step and its dependent workflow output", () => {
    const r = extractConcreteSubset(loadFixture("synthetic-draft-tool-step.gxwf.yml"));
    expect(r.dropped_steps).toHaveLength(1);
    expect(r.dropped_steps[0]?.path).toEqual(["fastp"]);
    // fastp has BOTH TODO sentinels AND _plan_* fields; the locked
    // ordering reports TODOs first.
    expect(r.dropped_steps[0]?.reason.kind).toBe("step_has_todo");

    // Workflow output `trimmed` referenced `fastp/TODO_trimmed_paired` — must drop.
    expect(r.dropped_outputs.map((o) => o.label)).toEqual(["trimmed"]);

    // Returned workflow still carries the draft class.
    const wf = r.workflow as Record<string, unknown>;
    expect(wf.class).toBe(DRAFT_CLASS);
    // Surviving steps map has no entries (fastp was the only step).
    expect(wf.steps).toEqual({});
    // Workflow inputs preserved verbatim.
    expect(wf.inputs).toEqual({
      reads: { type: "collection", collection_type: "list:paired", format: "fastqsanger.gz" },
    });
  });

  it("cascades through a chain — direct drop in round 0, cascade drops in rounds 1+", () => {
    const wf = {
      class: DRAFT_CLASS,
      inputs: { reads: { type: "data" } },
      outputs: { final: { outputSource: "c/out1" } },
      steps: {
        a: {
          tool_id: "TODO",
          tool_version: "TODO",
          in: { input1: "reads" },
          out: [{ id: "out1" }],
        },
        b: {
          tool_id: "cat1",
          tool_version: "1.0.0",
          in: { input1: "a/out1" },
          out: [{ id: "out1" }],
        },
        c: {
          tool_id: "cat1",
          tool_version: "1.0.0",
          in: { input1: "b/out1" },
          out: [{ id: "out1" }],
        },
      },
    };
    const r = extractConcreteSubset(wf);
    expect(r.dropped_steps.map((d) => d.path)).toEqual([["a"], ["b"], ["c"]]);
    expect(r.dropped_steps[0]?.reason.kind).toBe("step_has_todo");
    expect(r.dropped_steps[1]?.reason).toEqual({ kind: "cascade", depends_on: [["a"]] });
    expect(r.dropped_steps[2]?.reason).toEqual({ kind: "cascade", depends_on: [["b"]] });
    expect(r.dropped_outputs.map((o) => o.label)).toEqual(["final"]);
  });

  it("rewrites multi-source inputs to the surviving ref subset (string carrier)", () => {
    const wf = {
      class: DRAFT_CLASS,
      inputs: { reads: { type: "data" } },
      outputs: {},
      steps: {
        a: {
          tool_id: "TODO",
          tool_version: "TODO",
          in: { input1: "reads" },
          out: [{ id: "out1" }],
        },
        b: {
          tool_id: "cat1",
          tool_version: "1.0.0",
          in: { input1: "reads" },
          out: [{ id: "out1" }],
        },
        c: {
          tool_id: "cat1",
          tool_version: "1.0.0",
          in: { joined: { source: ["a/out1", "b/out1"] } },
          out: [{ id: "out1" }],
        },
      },
    };
    const r = extractConcreteSubset(wf);
    expect(r.dropped_steps.map((d) => d.path)).toEqual([["a"]]);
    expect(r.rewritten_step_inputs).toEqual([
      {
        path: ["c"],
        in_key: "joined",
        removed_refs: ["a/out1"],
        surviving_refs: ["b/out1"],
      },
    ]);
    const cIn = (
      (r.workflow as Record<string, unknown>).steps as Record<string, Record<string, unknown>>
    ).c?.in as Record<string, unknown>;
    // 1 surviving ref collapses to string form on the source field.
    expect(cIn.joined).toEqual({ source: "b/out1" });
  });

  it("rewrites multi-source inputs to the surviving ref subset (list carrier with 2 left)", () => {
    const wf = {
      class: DRAFT_CLASS,
      inputs: { reads: { type: "data" } },
      outputs: {},
      steps: {
        bad: { tool_id: "TODO", tool_version: "TODO", out: [{ id: "out1" }] },
        a: { tool_id: "cat1", tool_version: "1.0.0", out: [{ id: "out1" }] },
        b: { tool_id: "cat1", tool_version: "1.0.0", out: [{ id: "out1" }] },
        c: {
          tool_id: "cat1",
          tool_version: "1.0.0",
          in: { joined: { source: ["a/out1", "bad/out1", "b/out1"] } },
          out: [{ id: "out1" }],
        },
      },
    };
    const r = extractConcreteSubset(wf);
    const cIn = (
      (r.workflow as Record<string, unknown>).steps as Record<string, Record<string, unknown>>
    ).c?.in as Record<string, Record<string, unknown>>;
    expect(cIn.joined?.source).toEqual(["a/out1", "b/out1"]);
    expect(r.rewritten_step_inputs).toEqual([
      {
        path: ["c"],
        in_key: "joined",
        removed_refs: ["bad/out1"],
        surviving_refs: ["a/out1", "b/out1"],
      },
    ]);
  });

  it("falls back to `default:` when single source dies — step survives, source key removed", () => {
    const wf = {
      class: DRAFT_CLASS,
      inputs: { reads: { type: "data" } },
      outputs: {},
      steps: {
        bad: { tool_id: "TODO", tool_version: "TODO", out: [{ id: "out1" }] },
        c: {
          tool_id: "cat1",
          tool_version: "1.0.0",
          in: { x: { source: "bad/out1", default: "fallback-value" } },
          out: [{ id: "out1" }],
        },
      },
    };
    const r = extractConcreteSubset(wf);
    expect(r.dropped_steps.map((d) => d.path)).toEqual([["bad"]]);
    // c survives via the default.
    const cStep = (
      (r.workflow as Record<string, unknown>).steps as Record<string, Record<string, unknown>>
    ).c;
    expect(cStep).toBeDefined();
    expect((cStep?.in as Record<string, unknown>)?.x).toEqual({ default: "fallback-value" });
    expect(r.rewritten_step_inputs).toEqual([
      {
        path: ["c"],
        in_key: "x",
        removed_refs: ["bad/out1"],
        surviving_refs: [],
      },
    ]);
  });

  it("cascades when single source dies and there is no `default:`", () => {
    const wf = {
      class: DRAFT_CLASS,
      inputs: { reads: { type: "data" } },
      outputs: {},
      steps: {
        bad: { tool_id: "TODO", tool_version: "TODO", out: [{ id: "out1" }] },
        c: {
          tool_id: "cat1",
          tool_version: "1.0.0",
          in: { x: { source: "bad/out1" } },
          out: [{ id: "out1" }],
        },
      },
    };
    const r = extractConcreteSubset(wf);
    expect(r.dropped_steps.map((d) => d.path)).toEqual([["bad"], ["c"]]);
    expect(r.rewritten_step_inputs).toEqual([]);
  });

  it("drops a step carrying only `_plan_*` (no TODO sentinels) with step_has_plan_field reason", () => {
    const wf = {
      class: DRAFT_CLASS,
      inputs: { reads: { type: "data" } },
      outputs: {},
      steps: {
        planner: {
          tool_id: "cat1",
          tool_version: "1.0.0",
          in: { input1: "reads" },
          out: [{ id: "out1" }],
          _plan_context: "drop me — still planning this step",
          _plan_state: "not implemented yet",
        },
      },
    };
    const r = extractConcreteSubset(wf);
    expect(r.dropped_steps).toEqual([
      {
        path: ["planner"],
        reason: { kind: "step_has_plan_field", fields: ["_plan_state", "_plan_context"] },
      },
    ]);
    // Strip itself lives in E (clean.ts stripPlanFields). The returned
    // workflow's `steps` is empty here — there are no surviving steps to
    // assert the no-strip invariant against.
    expect((r.workflow as Record<string, unknown>).steps).toEqual({});
  });

  it("preserves workflow inputs verbatim even when no surviving step consumes them", () => {
    const wf = {
      class: DRAFT_CLASS,
      inputs: { reads: { type: "data" }, orphan_extra: { type: "data" } },
      outputs: {},
      steps: {
        a: {
          tool_id: "TODO",
          tool_version: "TODO",
          in: { input1: "reads" },
          out: [{ id: "out1" }],
        },
      },
    };
    const r = extractConcreteSubset(wf);
    expect((r.workflow as Record<string, unknown>).inputs).toEqual({
      reads: { type: "data" },
      orphan_extra: { type: "data" },
    });
  });

  it("recurses into draft subworkflows — inner shrinks, outer survives", () => {
    const wf = {
      class: DRAFT_CLASS,
      inputs: { reads: { type: "data" } },
      outputs: { result: { outputSource: "outer/result" } },
      steps: {
        outer: {
          type: "subworkflow",
          in: { reads: "reads" },
          out: [{ id: "result" }],
          run: {
            class: DRAFT_CLASS,
            inputs: { reads: { type: "data" } },
            outputs: { result: { outputSource: "good/out1" } },
            steps: {
              good: {
                tool_id: "cat1",
                tool_version: "1.0.0",
                in: { input1: "reads" },
                out: [{ id: "out1" }],
              },
              bad: {
                tool_id: "TODO",
                tool_version: "TODO",
                in: { input1: "reads" },
                out: [{ id: "out1" }],
              },
            },
          },
        },
      },
    };
    const r = extractConcreteSubset(wf);
    // Inner drop surfaces with outer-prefixed path.
    expect(r.dropped_steps.map((d) => d.path)).toEqual([["outer", "bad"]]);
    // Outer step survives.
    const outer = (
      (r.workflow as Record<string, unknown>).steps as Record<string, Record<string, unknown>>
    ).outer;
    expect(outer).toBeDefined();
    const innerWf = outer?.run as Record<string, unknown>;
    expect(innerWf.class).toBe(DRAFT_CLASS);
    expect(innerWf.steps).toEqual({
      good: {
        tool_id: "cat1",
        tool_version: "1.0.0",
        in: { input1: "reads" },
        out: [{ id: "out1" }],
      },
    });
    // Top-level output survives because outer step's `result` port still maps
    // to the surviving inner output.
    expect(r.dropped_outputs).toEqual([]);
  });

  it("cascades the outer step when the inner subworkflow drops the port the outer consumes", () => {
    // Outer step S exposes `out: result`, mapping inner workflow's `result` output.
    // Inner drops the `result` output because its source step is drafty.
    // Then a downstream outer step that consumes `S/result` cascades.
    const wf = {
      class: DRAFT_CLASS,
      inputs: { reads: { type: "data" } },
      outputs: {},
      steps: {
        S: {
          type: "subworkflow",
          in: { reads: "reads" },
          out: [{ id: "result" }],
          run: {
            class: DRAFT_CLASS,
            inputs: { reads: { type: "data" } },
            outputs: { result: { outputSource: "inner_bad/out1" } },
            steps: {
              inner_bad: {
                tool_id: "TODO",
                tool_version: "TODO",
                in: { input1: "reads" },
                out: [{ id: "out1" }],
              },
            },
          },
        },
        downstream: {
          tool_id: "cat1",
          tool_version: "1.0.0",
          in: { input1: "S/result" },
          out: [{ id: "out1" }],
        },
      },
    };
    const r = extractConcreteSubset(wf);
    // Inner drops `inner_bad`.
    const innerDrop = r.dropped_steps.find((d) => d.path.join("/") === "S/inner_bad");
    expect(innerDrop).toBeDefined();
    // Outer `downstream` cascades because S no longer exposes `result`.
    const downstreamDrop = r.dropped_steps.find((d) => d.path.join("/") === "downstream");
    expect(downstreamDrop?.reason).toEqual({ kind: "cascade", depends_on: [["S"]] });
    // Outer step S itself survives (per the locked decision — outer is never shrunk).
    const outer = (
      (r.workflow as Record<string, unknown>).steps as Record<string, Record<string, unknown>>
    ).S;
    expect(outer).toBeDefined();
  });

  it("treats string-form `run:` (URL / @import / TRS) as opaque — no descent", () => {
    const wf = {
      class: DRAFT_CLASS,
      inputs: { reads: { type: "data" } },
      outputs: {},
      steps: {
        opaque_sub: {
          type: "subworkflow",
          in: { reads: "reads" },
          out: [{ id: "result" }],
          run: "https://example.org/some/workflow.ga",
        },
        downstream: {
          tool_id: "cat1",
          tool_version: "1.0.0",
          in: { input1: "opaque_sub/result" },
          out: [{ id: "out1" }],
        },
      },
    };
    const r = extractConcreteSubset(wf);
    // No drops — opaque sub's declared `out:` ports count as live.
    expect(r.dropped_steps).toEqual([]);
    expect((r.workflow as Record<string, unknown>).steps).toBeDefined();
  });

  it("does NOT descend into concrete (`class: GalaxyWorkflow`) inline subworkflows", () => {
    const r = extractConcreteSubset(loadFixture("synthetic-draft-plan-subworkflow.gxwf.yml"));
    // The outer step `qc` has _plan_context → drops in round 0.
    expect(r.dropped_steps.map((d) => d.path)).toEqual([["qc"]]);
    expect(r.dropped_steps[0]?.reason.kind).toBe("step_has_plan_field");
    // The inner concrete workflow is never recursed into.
  });

  it("orders drops: directly-drafty alphabetical first, then cascade rounds", () => {
    // Two directly-drafty steps (zulu, alpha), one cascading step (mid).
    const wf = {
      class: DRAFT_CLASS,
      inputs: { reads: { type: "data" } },
      outputs: {},
      steps: {
        zulu: {
          tool_id: "TODO",
          tool_version: "TODO",
          in: { input1: "reads" },
          out: [{ id: "out1" }],
        },
        alpha: {
          tool_id: "TODO",
          tool_version: "TODO",
          in: { input1: "reads" },
          out: [{ id: "out1" }],
        },
        mid: {
          tool_id: "cat1",
          tool_version: "1.0.0",
          in: { input1: "zulu/out1" },
          out: [{ id: "out1" }],
        },
      },
    };
    const r = extractConcreteSubset(wf);
    expect(r.dropped_steps.map((d) => d.path)).toEqual([["alpha"], ["zulu"], ["mid"]]);
  });

  it("orders dropped_outputs alphabetically by label", () => {
    const wf = {
      class: DRAFT_CLASS,
      inputs: { reads: { type: "data" } },
      outputs: {
        zout: { outputSource: "bad/out1" },
        aout: { outputSource: "bad/out1" },
        mout: { outputSource: "bad/out1" },
      },
      steps: {
        bad: { tool_id: "TODO", tool_version: "TODO", out: [{ id: "out1" }] },
      },
    };
    const r = extractConcreteSubset(wf);
    expect(r.dropped_outputs.map((o) => o.label)).toEqual(["aout", "mout", "zout"]);
  });

  it("is byte-for-byte idempotent across repeated runs", () => {
    const wf = loadFixture("synthetic-draft-tool-step.gxwf.yml");
    const a = JSON.stringify(extractConcreteSubset(wf));
    const b = JSON.stringify(extractConcreteSubset(wf));
    const c = JSON.stringify(extractConcreteSubset(wf));
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it("preserves original step iteration order among survivors", () => {
    const wf = {
      class: DRAFT_CLASS,
      inputs: { reads: { type: "data" } },
      outputs: {},
      steps: {
        zulu: { tool_id: "cat1", tool_version: "1.0.0", out: [{ id: "out1" }] },
        bad: { tool_id: "TODO", tool_version: "TODO", out: [{ id: "out1" }] },
        alpha: { tool_id: "cat1", tool_version: "1.0.0", out: [{ id: "out1" }] },
        middle: { tool_id: "cat1", tool_version: "1.0.0", out: [{ id: "out1" }] },
      },
    };
    const r = extractConcreteSubset(wf);
    const stepKeys = Object.keys((r.workflow as Record<string, unknown>).steps as object);
    expect(stepKeys).toEqual(["zulu", "alpha", "middle"]);
  });

  it("supports list-form step `in:` rewrites (carrier preserved as list entry)", () => {
    const wf = {
      class: DRAFT_CLASS,
      inputs: { reads: { type: "data" } },
      outputs: {},
      steps: {
        bad: { tool_id: "TODO", tool_version: "TODO", out: [{ id: "out1" }] },
        good: { tool_id: "cat1", tool_version: "1.0.0", out: [{ id: "out1" }] },
        c: {
          tool_id: "cat1",
          tool_version: "1.0.0",
          in: [{ id: "joined", source: ["bad/out1", "good/out1"] }],
          out: [{ id: "out1" }],
        },
      },
    };
    const r = extractConcreteSubset(wf);
    const cIn = (
      (r.workflow as Record<string, unknown>).steps as Record<string, Record<string, unknown>>
    ).c?.in;
    expect(cIn).toEqual([{ id: "joined", source: "good/out1" }]);
    expect(r.rewritten_step_inputs).toEqual([
      {
        path: ["c"],
        in_key: "joined",
        removed_refs: ["bad/out1"],
        surviving_refs: ["good/out1"],
      },
    ]);
  });

  it("preserves top-level `_plan_*` fields on the workflow root verbatim (extract does not strip)", () => {
    const wf = {
      class: DRAFT_CLASS,
      _plan_context: "root-level planning notes that survive extract",
      inputs: { reads: { type: "data" } },
      outputs: {},
      steps: {
        bad: { tool_id: "TODO", tool_version: "TODO", out: [{ id: "out1" }] },
      },
    };
    const r = extractConcreteSubset(wf);
    expect((r.workflow as Record<string, unknown>)._plan_context).toBe(
      "root-level planning notes that survive extract",
    );
  });

  it("surfaces an inner subworkflow output drop with its outer-step path", () => {
    const wf = {
      class: DRAFT_CLASS,
      inputs: { reads: { type: "data" } },
      outputs: {},
      steps: {
        S: {
          type: "subworkflow",
          in: { reads: "reads" },
          out: [{ id: "result" }],
          run: {
            class: DRAFT_CLASS,
            inputs: { reads: { type: "data" } },
            outputs: { result: { outputSource: "bad/out1" } },
            steps: {
              bad: { tool_id: "TODO", tool_version: "TODO", out: [{ id: "out1" }] },
            },
          },
        },
      },
    };
    const r = extractConcreteSubset(wf);
    // Outer step S itself survives (we never shrink outer subworkflow steps in v1).
    expect(Object.keys((r.workflow as Record<string, unknown>).steps as object)).toEqual(["S"]);
    // The inner `result` output drop is hoisted with path: ["S"].
    const innerOutputDrop = r.dropped_outputs.find(
      (o) => o.path.join("/") === "S" && o.label === "result",
    );
    expect(innerOutputDrop).toBeDefined();
    expect(innerOutputDrop?.reason.kind).toBe("cascade");
  });

  it("emits no rewrite entry when every multi-source ref survives", () => {
    const wf = {
      class: DRAFT_CLASS,
      inputs: { reads: { type: "data" } },
      outputs: {},
      steps: {
        a: { tool_id: "cat1", tool_version: "1.0.0", out: [{ id: "out1" }] },
        b: { tool_id: "cat1", tool_version: "1.0.0", out: [{ id: "out1" }] },
        c: {
          tool_id: "cat1",
          tool_version: "1.0.0",
          in: { joined: { source: ["a/out1", "b/out1"] } },
          out: [{ id: "out1" }],
        },
      },
    };
    const r = extractConcreteSubset(wf);
    expect(r.dropped_steps).toEqual([]);
    expect(r.rewritten_step_inputs).toEqual([]);
  });

  it("leaves `default:`-only step inputs (no `source:`) untouched", () => {
    const wf = {
      class: DRAFT_CLASS,
      inputs: { reads: { type: "data" } },
      outputs: {},
      steps: {
        a: {
          tool_id: "cat1",
          tool_version: "1.0.0",
          in: { x: { default: "v" } },
          out: [{ id: "out1" }],
        },
      },
    };
    const r = extractConcreteSubset(wf);
    expect(r.dropped_steps).toEqual([]);
    expect(r.rewritten_step_inputs).toEqual([]);
    const aIn = (
      (r.workflow as Record<string, unknown>).steps as Record<string, Record<string, unknown>>
    ).a?.in as Record<string, unknown>;
    expect(aIn.x).toEqual({ default: "v" });
  });

  it("supports list-form workflow `outputs:` drops", () => {
    const wf = {
      class: DRAFT_CLASS,
      inputs: { reads: { type: "data" } },
      outputs: [
        { id: "keep", outputSource: "good/out1" },
        { id: "drop_me", outputSource: "bad/out1" },
      ],
      steps: {
        good: { tool_id: "cat1", tool_version: "1.0.0", out: [{ id: "out1" }] },
        bad: { tool_id: "TODO", tool_version: "TODO", out: [{ id: "out1" }] },
      },
    };
    const r = extractConcreteSubset(wf);
    expect((r.workflow as Record<string, unknown>).outputs).toEqual([
      { id: "keep", outputSource: "good/out1" },
    ]);
    expect(r.dropped_outputs.map((o) => o.label)).toEqual(["drop_me"]);
  });
});
