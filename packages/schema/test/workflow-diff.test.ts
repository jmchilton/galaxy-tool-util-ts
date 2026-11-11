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

  it("resolves input type aliases in list-form inputs", () => {
    const withType = (type: string) => ({
      class: "GalaxyWorkflow",
      inputs: [{ id: "reads", type }],
      steps: {},
    });
    expect(diffWorkflows(withType("File"), withType("data")).has_changes).toBe(false);
  });
});
