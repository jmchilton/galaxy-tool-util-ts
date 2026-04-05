/**
 * Tests for roundtripValidate() — native → format2 → native diffing with
 * benign-artifact classification.
 */

import { describe, it, expect } from "vitest";
import { roundtripValidate, type ToolInputsResolver } from "../src/workflow/index.js";
import type {
  BooleanParameterModel,
  IntegerParameterModel,
  SelectParameterModel,
  TextParameterModel,
  ToolParameterModel,
} from "../src/schema/bundle-types.js";

// --- Param factories (mirrors stateful-wrappers.test.ts) ---

function intParam(name: string): IntegerParameterModel {
  return {
    name,
    parameter_type: "gx_integer",
    type: "integer",
    hidden: false,
    label: null,
    help: null,
    argument: null,
    is_dynamic: false,
    optional: false,
    value: 0,
    min: null,
    max: null,
    validators: [],
  };
}

function boolParam(name: string): BooleanParameterModel {
  return {
    name,
    parameter_type: "gx_boolean",
    type: "boolean",
    hidden: false,
    label: null,
    help: null,
    argument: null,
    is_dynamic: false,
    optional: false,
    value: false,
    truevalue: "true",
    falsevalue: "false",
  };
}

function selectMultipleParam(name: string, options: string[]): SelectParameterModel {
  return {
    name,
    parameter_type: "gx_select",
    type: "select",
    hidden: false,
    label: null,
    help: null,
    argument: null,
    is_dynamic: false,
    optional: false,
    multiple: true,
    options: options.map((v, i) => ({ label: v, value: v, selected: i === 0 })),
    validators: [],
  };
}

function textParam(name: string): TextParameterModel {
  return {
    name,
    parameter_type: "gx_text",
    type: "text",
    hidden: false,
    label: null,
    help: null,
    argument: null,
    is_dynamic: false,
    optional: true,
    area: false,
    value: null,
    default_options: [],
    validators: [],
  };
}

// --- Fixtures ---

function mapResolver(map: Record<string, ToolParameterModel[]>): ToolInputsResolver {
  return (toolId) => map[toolId];
}

function coolToolInputs(): ToolParameterModel[] {
  return [
    intParam("count"),
    boolParam("enabled"),
    selectMultipleParam("tags", ["a", "b", "c"]),
    textParam("label"),
  ];
}

function nativeWorkflow(toolState: Record<string, unknown>): Record<string, unknown> {
  return {
    a_galaxy_workflow: "true",
    "format-version": "0.1",
    name: "roundtrip-test",
    annotation: "",
    tags: [],
    steps: {
      "0": {
        id: 0,
        type: "tool",
        label: "cool_tool",
        name: "cool_tool",
        annotation: "",
        tool_id: "cool_tool",
        tool_version: "1.0",
        tool_state: toolState,
        input_connections: {},
        inputs: [],
        outputs: [],
        workflow_outputs: [],
        post_job_actions: {},
        position: { left: 0, top: 0 },
      },
    },
  };
}

describe("roundtripValidate", () => {
  it("clean workflow roundtrips without error", () => {
    // Already-typed state — no coercions needed, no stale keys
    const wf = nativeWorkflow({
      count: 42,
      enabled: true,
      tags: ["a", "b"],
      label: "hi",
    });
    const result = roundtripValidate(wf, mapResolver({ cool_tool: coolToolInputs() }));
    expect(result.success).toBe(true);
    expect(result.stepResults).toHaveLength(1);
    expect(result.stepResults[0].diffs.filter((d) => d.severity === "error")).toEqual([]);
  });

  it("stale bookkeeping keys are stripped as benign diffs", () => {
    const wf = nativeWorkflow({
      count: 42,
      enabled: true,
      tags: ["a"],
      label: "hi",
      __page__: 0,
      __rerun_remap_job_id__: null,
    });
    const result = roundtripValidate(wf, mapResolver({ cool_tool: coolToolInputs() }));
    expect(result.success).toBe(true);
    expect(result.clean).toBe(false);
    const kinds = result.stepResults[0].diffs.map((d) => d.kind);
    expect(kinds).toContain("bookkeeping_stripped");
  });

  it("type-coerced values are tolerated (string int ↔ number)", () => {
    // Native has "42" (string) — forward converts to 42 (number),
    // reverse encodes back as 42 (number). Original "42" vs reimported 42 →
    // should be tolerated by scalarsEquivalent as equivalent (no diff).
    const wf = nativeWorkflow({
      count: "42",
      enabled: "true",
      tags: "a,b,c",
      label: "hi",
    });
    const result = roundtripValidate(wf, mapResolver({ cool_tool: coolToolInputs() }));
    expect(result.success).toBe(true);
    // count / enabled: scalar-equivalent (no diff). tags: comma-string ↔ list
    // should be flagged benign via multi-select normalization.
    const errorDiffs = result.stepResults[0].diffs.filter((d) => d.severity === "error");
    expect(errorDiffs).toEqual([]);
  });

  it("reports conversion fallback when tool is uncached", () => {
    const wf = nativeWorkflow({ count: "42", enabled: "true", tags: "a", label: "hi" });
    // Empty resolver — tool not found
    const result = roundtripValidate(wf, () => undefined);
    expect(result.success).toBe(false);
    expect(result.stepResults[0].failureClass).toBe("conversion_error");
    expect(result.forwardSteps[0].converted).toBe(false);
  });

  it("clean=true when zero diffs of any severity", () => {
    const wf = nativeWorkflow({
      count: 42,
      enabled: true,
      tags: ["a", "b"],
      label: "hi",
    });
    const result = roundtripValidate(wf, mapResolver({ cool_tool: coolToolInputs() }));
    expect(result.clean).toBe(true);
  });

  it("subworkflow steps emit informational entries (not counted as failures)", () => {
    const wf: Record<string, unknown> = {
      a_galaxy_workflow: "true",
      "format-version": "0.1",
      name: "with-subworkflow",
      annotation: "",
      tags: [],
      steps: {
        "0": {
          id: 0,
          type: "tool",
          label: "cool_tool",
          name: "cool_tool",
          annotation: "",
          tool_id: "cool_tool",
          tool_version: "1.0",
          tool_state: { count: 1, enabled: true, tags: ["a"], label: "x" },
          input_connections: {},
          inputs: [],
          outputs: [],
          workflow_outputs: [],
          post_job_actions: {},
          position: { left: 0, top: 0 },
        },
        "1": {
          id: 1,
          type: "subworkflow",
          label: "nested",
          name: "nested",
          annotation: "",
          tool_state: {},
          input_connections: {},
          inputs: [],
          outputs: [],
          workflow_outputs: [],
          position: { left: 100, top: 0 },
          subworkflow: {
            a_galaxy_workflow: "true",
            "format-version": "0.1",
            name: "nested",
            annotation: "",
            tags: [],
            steps: {},
          },
        },
      },
    };
    const result = roundtripValidate(wf, mapResolver({ cool_tool: coolToolInputs() }));
    // Subworkflow entry present but doesn't flip success/clean
    expect(result.success).toBe(true);
    expect(result.clean).toBe(true);
    const sw = result.stepResults.find((s) => s.failureClass === "subworkflow_not_diffed");
    expect(sw).toBeDefined();
    expect(sw!.stepId).toBe("1");
    expect(sw!.success).toBe(true);
  });

  it("non-tool steps are ignored in per-step results", () => {
    const wf: Record<string, unknown> = {
      a_galaxy_workflow: "true",
      "format-version": "0.1",
      name: "mixed",
      annotation: "",
      tags: [],
      steps: {
        "0": {
          id: 0,
          type: "data_input",
          label: "input",
          name: "input",
          annotation: "",
          tool_state: { name: "input", optional: false },
          input_connections: {},
          inputs: [{ name: "input", description: "" }],
          outputs: [],
          workflow_outputs: [],
          position: { left: 0, top: 0 },
        },
        "1": {
          id: 1,
          type: "tool",
          label: "cool_tool",
          name: "cool_tool",
          annotation: "",
          tool_id: "cool_tool",
          tool_version: "1.0",
          tool_state: { count: 42, enabled: true, tags: ["a"], label: "hi" },
          input_connections: {},
          inputs: [],
          outputs: [],
          workflow_outputs: [],
          post_job_actions: {},
          position: { left: 100, top: 0 },
        },
      },
    };
    const result = roundtripValidate(wf, mapResolver({ cool_tool: coolToolInputs() }));
    expect(result.stepResults).toHaveLength(1);
    expect(result.stepResults[0].toolId).toBe("cool_tool");
    expect(result.success).toBe(true);
  });
});
