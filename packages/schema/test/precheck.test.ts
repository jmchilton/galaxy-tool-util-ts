import { describe, it, expect } from "vitest";
import { precheckNativeWorkflow } from "../src/workflow/precheck.js";
import type { ToolInputsResolver } from "../src/workflow/normalized/stateful-runner.js";
import type {
  NormalizedNativeWorkflow,
  NormalizedNativeStep,
} from "../src/workflow/normalized/native.js";
import type {
  ToolParameterModel,
  IntegerParameterModel,
  TextParameterModel,
  ConditionalParameterModel,
  BooleanParameterModel,
} from "../src/schema/bundle-types.js";

function mapResolver(map: Record<string, ToolParameterModel[]>): ToolInputsResolver {
  return (toolId) => map[toolId];
}

// --- Helpers ---

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

function conditionalParam(
  name: string,
  testParam: BooleanParameterModel,
  whens: ConditionalParameterModel["whens"],
): ConditionalParameterModel {
  return {
    name,
    parameter_type: "gx_conditional",
    hidden: false,
    label: null,
    help: null,
    argument: null,
    is_dynamic: false,
    test_parameter: testParam,
    whens,
  };
}

function toolStep(
  id: number,
  toolId: string,
  toolState: Record<string, unknown>,
): NormalizedNativeStep {
  return {
    id,
    type: "tool",
    tool_id: toolId,
    tool_version: "1.0",
    tool_state: toolState,
    input_connections: {},
    connected_paths: new Set(),
    post_job_actions: {},
    inputs: [],
    outputs: [],
    workflow_outputs: [],
  } as unknown as NormalizedNativeStep;
}

function inputStep(id: number): NormalizedNativeStep {
  return {
    id,
    type: "data_input",
    tool_id: null,
    tool_state: {},
    input_connections: {},
    connected_paths: new Set(),
    post_job_actions: {},
    inputs: [],
    outputs: [],
    workflow_outputs: [],
  } as unknown as NormalizedNativeStep;
}

function workflow(steps: Record<string, NormalizedNativeStep>): NormalizedNativeWorkflow {
  return {
    name: "test",
    a_galaxy_workflow: "true",
    "format-version": "0.1",
    tags: [],
    steps,
    unique_tools: new Set(),
  } as unknown as NormalizedNativeWorkflow;
}

// --- Tests ---

describe("precheckNativeWorkflow", () => {
  it("clean workflow → canProcess true", () => {
    const wf = workflow({
      "0": toolStep(0, "my_tool", { num: 42, label: "test" }),
    });
    const resolver = mapResolver({ my_tool: [intParam("num"), textParam("label")] });
    const result = precheckNativeWorkflow(wf, resolver);
    expect(result.canProcess).toBe(true);
    expect(result.skipReasons).toEqual([]);
    expect(result.stepResults[0].canProcess).toBe(true);
  });

  it("${...} replacement in typed field → canProcess false", () => {
    const wf = workflow({
      "0": toolStep(0, "my_tool", { num: "${threshold}" }),
    });
    const resolver = mapResolver({ my_tool: [intParam("num")] });
    const result = precheckNativeWorkflow(wf, resolver);
    expect(result.canProcess).toBe(false);
    expect(result.skipReasons.length).toBeGreaterThan(0);
    expect(result.skipReasons[0]).toContain("replacement");
  });

  it("${...} in text field only → canProcess true (maybe-case)", () => {
    const wf = workflow({
      "0": toolStep(0, "my_tool", { label: "${user_label}" }),
    });
    const resolver = mapResolver({ my_tool: [textParam("label")] });
    const result = precheckNativeWorkflow(wf, resolver);
    expect(result.canProcess).toBe(true);
  });

  it("string-encoded container (legacy encoding) → canProcess false", () => {
    const cond = conditionalParam("cond", boolParam("use_ref"), [
      { discriminator: true, parameters: [], is_default_when: false },
      { discriminator: false, parameters: [], is_default_when: true },
    ]);
    const wf = workflow({
      "0": toolStep(0, "my_tool", { cond: '{"use_ref": true}' }),
    });
    const resolver = mapResolver({ my_tool: [cond] });
    const result = precheckNativeWorkflow(wf, resolver);
    expect(result.canProcess).toBe(false);
    expect(result.skipReasons[0]).toContain("legacy parameter encoding");
  });

  it("non-tool steps pass through without tool lookup", () => {
    const wf = workflow({
      "0": inputStep(0),
    });
    const result = precheckNativeWorkflow(wf, null);
    expect(result.canProcess).toBe(true);
    expect(result.stepResults[0].canProcess).toBe(true);
  });

  it("missing tool inputs → step passes (fallback happens at conversion)", () => {
    const wf = workflow({
      "0": toolStep(0, "unknown_tool", { num: "${bad}" }),
    });
    const result = precheckNativeWorkflow(wf, mapResolver({}));
    expect(result.canProcess).toBe(true);
  });

  it("null resolver → all steps pass", () => {
    const wf = workflow({
      "0": toolStep(0, "my_tool", { num: "${bad}" }),
    });
    const result = precheckNativeWorkflow(wf, null);
    expect(result.canProcess).toBe(true);
  });

  it("mixed clean and dirty steps → canProcess false, per-step accurate", () => {
    const wf = workflow({
      "0": toolStep(0, "tool_a", { num: 42 }),
      "1": toolStep(1, "tool_b", { num: "${bad}" }),
    });
    const resolver = mapResolver({
      tool_a: [intParam("num")],
      tool_b: [intParam("num")],
    });
    const result = precheckNativeWorkflow(wf, resolver);
    expect(result.canProcess).toBe(false);
    expect(result.stepResults[0].canProcess).toBe(true);
    expect(result.stepResults[1].canProcess).toBe(false);
  });

  it("reports stepId and toolId in results", () => {
    const wf = workflow({
      "0": toolStep(0, "my_tool", {}),
    });
    const resolver = mapResolver({ my_tool: [] });
    const result = precheckNativeWorkflow(wf, resolver);
    expect(result.stepResults[0].stepId).toBe("0");
    expect(result.stepResults[0].toolId).toBe("my_tool");
  });
});
