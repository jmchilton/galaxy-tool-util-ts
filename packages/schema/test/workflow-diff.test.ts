/**
 * Rendering and input-handling tests for diffWorkflows.
 *
 * Diff semantics live in the synced declarative cases (fixtures/expectations/diff.yml).
 */
import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { describe, expect, it } from "vitest";

import { diffWorkflows, renderWorkflowDiff } from "../src/workflow/workflow-diff.js";

const WORKFLOWS_DIR = path.join(import.meta.dirname, "fixtures", "workflows");

function load(relative: string): unknown {
  const content = fs.readFileSync(path.join(WORKFLOWS_DIR, relative), "utf-8");
  return relative.endsWith(".ga") ? JSON.parse(content) : parseYaml(content);
}

const diffFixture = (name: string) => load(`format2/diff/${name}`);

describe("renderWorkflowDiff", () => {
  it("says so when nothing differs", () => {
    const base = diffFixture("synthetic-diff-base.gxwf.yml");
    expect(renderWorkflowDiff(diffWorkflows(base, base))).toBe("No differences.");
  });

  it("lists a removed step with its edges and the rewire", () => {
    const text = renderWorkflowDiff(
      diffWorkflows(
        diffFixture("synthetic-diff-base.gxwf.yml"),
        diffFixture("synthetic-diff-removed-step.gxwf.yml"),
      ),
    );
    expect(text).toContain(
      "Step removed: trim (trim reads) [trimmer 1.0]\n    upstream: min_quality, reads\n    downstream: filter\n",
    );
    expect(text).toContain("    - trim/out_file1 -> filter/input\n    + reads -> filter/input\n");
    expect(text.endsWith("AFTER inputs feeding no step: min_quality")).toBe(true);
  });

  it("lists plan fields of a removed draft step", () => {
    const text = renderWorkflowDiff(
      diffWorkflows(
        diffFixture("synthetic-diff-draft-before.gxwf.yml"),
        diffFixture("synthetic-diff-draft-after.gxwf.yml"),
      ),
    );
    expect(text).toContain(
      "Step removed: chr_filter (keep only requested chromosomes) [TODO TODO]",
    );
    expect(text).toContain("    has _plan_state\n    has _plan_context");
  });

  it("spells out unset state values", () => {
    const text = renderWorkflowDiff(
      diffWorkflows(
        diffFixture("synthetic-diff-explicit-false-bare.gxwf.yml"),
        diffFixture("synthetic-diff-explicit-state.gxwf.yml"),
      ),
    );
    expect(text).toContain("    state min_length: added null\n");
    expect(text).toContain('    state comment: added ""\n');
    expect(text).toContain("    state inclusive_filter: added []");
  });

  it("renders values with Python json.dumps separators", () => {
    const text = renderWorkflowDiff(
      diffWorkflows(
        diffFixture("synthetic-diff-base.gxwf.yml"),
        diffFixture("synthetic-diff-changed-step.gxwf.yml"),
      ),
    );
    expect(text).toContain('    out html_report actions: (none) -> {"rename": "QC report"}');
  });
});

describe("diffWorkflows input handling", () => {
  it("rejects native workflows", () => {
    const base = diffFixture("synthetic-diff-base.gxwf.yml");
    expect(() => diffWorkflows(load("native/real-unicycler-assembly.ga"), base)).toThrow(/native/);
  });

  it("rejects $graph documents", () => {
    const graph = { $graph: [{ id: "main", class: "GalaxyWorkflow", steps: {} }] };
    expect(() => diffWorkflows(graph, graph)).toThrow(/\$graph/);
  });

  it("rejects non-mapping input", () => {
    expect(() => diffWorkflows([], {})).toThrow(TypeError);
  });

  it("compares an @import run as {@import: path}", () => {
    const withRun = (run: unknown) => ({
      class: "GalaxyWorkflow",
      steps: { nested: { run } },
    });
    const diff = diffWorkflows(withRun({ "@import": "sub.gxwf.yml" }), withRun("sub.gxwf.yml"));
    expect(diff.steps.changed.nested.fields.run).toEqual({
      before: { "@import": "sub.gxwf.yml" },
      after: "sub.gxwf.yml",
    });
  });

  it("lists a self-sourcing edge of a removed step once", () => {
    const withLoop = (loop: boolean) => ({
      class: "GalaxyWorkflow",
      inputs: { reads: "data" },
      steps: loop
        ? { loop: { tool_id: "cat1", in: { input1: "reads", input2: "loop/out_file1" } } }
        : {},
    });
    expect(diffWorkflows(withLoop(true), withLoop(false)).steps.removed.loop.connections).toEqual([
      "loop/out_file1 -> loop/input2",
      "reads -> loop/input1",
    ]);
  });

  it("infers the subworkflow type of an untyped step with a run", () => {
    const withNested = (nested: Record<string, unknown> | null) => ({
      class: "GalaxyWorkflow",
      steps: nested ? { nested } : {},
    });
    const inline = { run: { class: "GalaxyWorkflow", inputs: {}, steps: {} } };
    expect(diffWorkflows(withNested(null), withNested(inline)).steps.added.nested.type).toBe(
      "subworkflow",
    );
    const typed = { ...inline, type: "subworkflow" };
    expect(diffWorkflows(withNested(inline), withNested(typed)).has_changes).toBe(false);
    const linked = withNested({ run: "sub.gxwf.yml" });
    expect(diffWorkflows(withNested(null), linked).steps.added.nested.type).toBe("subworkflow");
  });

  it("ignores undeclared keys on out entries", () => {
    const withOut = (out: Record<string, unknown>) => ({
      class: "GalaxyWorkflow",
      steps: { keep: { tool_id: "cat1", out: { out_file1: out } } },
    });
    const diff = diffWorkflows(withOut({ hide: true }), withOut({ hide: true, _plan_note: "x" }));
    expect(diff.has_changes).toBe(false);
  });

  it("resolves input type aliases in list-form inputs", () => {
    const withType = (type: string) => ({
      class: "GalaxyWorkflow",
      inputs: [{ id: "reads", type }],
      steps: {},
    });
    expect(diffWorkflows(withType("File"), withType("data")).has_changes).toBe(false);
  });

  it("treats explicit null keys in validators and restrictions as unset", () => {
    const withText = (
      validator: Record<string, unknown>,
      restriction: Record<string, unknown>,
    ) => ({
      class: "GalaxyWorkflow",
      inputs: { t: { type: "text", validators: [validator], restrictions: [restriction] } },
      steps: {},
    });
    const regex = { type: "regex", expression: "^x$" };
    const bare = withText(regex, { value: "x" });
    const explicitNulls = withText({ ...regex, negate: null }, { value: "x", label: null });
    expect(diffWorkflows(bare, explicitNulls).has_changes).toBe(false);
    const negated = withText({ ...regex, negate: true }, { value: "x" });
    expect(Object.keys(diffWorkflows(bare, negated).inputs.changed.t)).toEqual(["validators"]);
  });

  it("fills Python model defaults for validator, record field and column types", () => {
    const withInput = (input: Record<string, unknown>) => ({
      class: "GalaxyWorkflow",
      inputs: { x: input },
      steps: {},
    });
    const record = { type: "collection", collection_type: "record" };
    const sheet = { type: "collection", collection_type: "sample_sheet" };
    const pairs = [
      [
        { type: "text", validators: [{ expression: "^x$" }] },
        { type: "text", validators: [{ type: "regex", expression: "^x$" }] },
      ],
      [
        { ...record, fields: [{ name: "a" }] },
        { ...record, fields: [{ name: "a", type: "File" }] },
      ],
      [
        { ...sheet, column_definitions: [{ name: "c", optional: false }] },
        { ...sheet, column_definitions: [{ name: "c", type: "string", optional: false }] },
      ],
    ];
    for (const [before, after] of pairs) {
      expect(diffWorkflows(withInput(before), withInput(after)).has_changes).toBe(false);
    }
  });

  it("orders state change keys as Python dumps them", () => {
    const diff = diffWorkflows(
      diffFixture("synthetic-diff-explicit-false-bare.gxwf.yml"),
      diffFixture("synthetic-diff-explicit-state.gxwf.yml"),
    );
    const keyOrders = Object.values(diff.steps.changed.cat.state).map((change) =>
      Object.keys(change),
    );
    expect(keyOrders.length).toBeGreaterThan(0);
    expect(keyOrders).toEqual(keyOrders.map(() => ["before", "after", "kind"]));
  });

  it("reports ids and step keys named __proto__", () => {
    // JSON.parse makes __proto__ an own key, as YAML parsing does.
    const after = JSON.parse(
      '{"class": "GalaxyWorkflow", "inputs": {"__proto__": {"type": "data"}},' +
        ' "steps": {"__proto__": {"tool_id": "cat1", "in": {"input1": "__proto__"}}}}',
    );
    const diff = diffWorkflows({ class: "GalaxyWorkflow", steps: {} }, after);
    expect(diff.has_changes).toBe(true);
    expect(diff.inputs.added).toEqual(["__proto__"]);
    expect(Object.keys(diff.steps.added)).toEqual(["__proto__"]);
    expect(JSON.parse(JSON.stringify(diff)).steps.added.__proto__.tool_id).toBe("cat1");
  });
});
