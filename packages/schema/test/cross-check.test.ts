import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import {
  checkTestsAgainstWorkflow,
  extractWorkflowInputs,
  extractWorkflowOutputs,
  type WorkflowShape,
} from "../src/test-format/cross-check/index.js";

const FIXTURES = join(fileURLToPath(new URL(".", import.meta.url)), "fixtures", "test-format");
const WORKFLOWS = join(FIXTURES, "workflows");
const CROSS_CHECK = join(FIXTURES, "cross-check");

function loadWf(path: string): Record<string, unknown> {
  const raw = readFileSync(join(WORKFLOWS, path), "utf-8");
  if (path.endsWith(".ga") || path.endsWith(".json")) return JSON.parse(raw);
  return parseYaml(raw);
}

function loadTests(subdir: "positive" | "negative", name: string): unknown {
  return parseYaml(readFileSync(join(CROSS_CHECK, subdir, name), "utf-8"));
}

function shape(wf: Record<string, unknown>): WorkflowShape {
  return {
    inputs: extractWorkflowInputs(wf),
    outputs: extractWorkflowOutputs(wf),
  };
}

describe.each([
  { kind: "format2", file: "basic.gxwf.yml" },
  { kind: "native", file: "basic.ga" },
])("checkTestsAgainstWorkflow — $kind workflow", ({ file }) => {
  const workflow = shape(loadWf(file));

  for (const name of readdirSync(join(CROSS_CHECK, "positive")).sort()) {
    it(`positive: ${name} — no diagnostics`, () => {
      const diagnostics = checkTestsAgainstWorkflow(loadTests("positive", name), workflow);
      expect(diagnostics).toEqual([]);
    });
  }

  it("negative: input_not_in_workflow → workflow_input_undefined", () => {
    const d = checkTestsAgainstWorkflow(
      loadTests("negative", "input_not_in_workflow-tests.yml"),
      workflow,
    );
    expect(d.map((x) => x.keyword)).toContain("workflow_input_undefined");
    expect(d.find((x) => x.keyword === "workflow_input_undefined")?.path).toBe(
      "/0/job/mystery_input",
    );
  });

  it("negative: missing_required_input → workflow_input_required", () => {
    const d = checkTestsAgainstWorkflow(
      loadTests("negative", "missing_required_input-tests.yml"),
      workflow,
    );
    const req = d.find((x) => x.keyword === "workflow_input_required");
    expect(req).toBeDefined();
    expect(req?.params.input).toBe("input_file");
    expect(req?.path).toBe("/0/job");
  });

  it("negative: input_type_mismatch → workflow_input_type", () => {
    const d = checkTestsAgainstWorkflow(
      loadTests("negative", "input_type_mismatch-tests.yml"),
      workflow,
    );
    const mismatch = d.find((x) => x.keyword === "workflow_input_type");
    expect(mismatch).toBeDefined();
    expect(mismatch?.params.input).toBe("threshold");
    expect(mismatch?.path).toBe("/0/job/threshold");
  });

  it("negative: output_not_in_workflow → workflow_output_undefined", () => {
    const d = checkTestsAgainstWorkflow(
      loadTests("negative", "output_not_in_workflow-tests.yml"),
      workflow,
    );
    const phantom = d.find((x) => x.keyword === "workflow_output_undefined");
    expect(phantom).toBeDefined();
    expect(phantom?.params.output).toBe("phantom_output");
    expect(phantom?.path).toBe("/0/outputs/phantom_output");
  });
});

describe("jsonpointer escaping", () => {
  it("escapes / and ~ in input names", () => {
    const wf: WorkflowShape = { inputs: [], outputs: [] };
    const doc = [{ job: { "weird/name~with": 1 }, outputs: {} }];
    const d = checkTestsAgainstWorkflow(doc, wf);
    expect(d[0]?.path).toBe("/0/job/weird~1name~0with");
  });
});
