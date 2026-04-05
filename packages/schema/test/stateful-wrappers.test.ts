/**
 * Tests for toFormat2Stateful / toNativeStateful wrappers.
 *
 * Verifies:
 * - All-cached → all steps converted, state coerced, no stale keys
 * - Missing tool in cache → graceful fallback, status reports error
 * - Per-step failure is isolated from other steps
 * - encodeStateToNative returns clean dicts (no JSON.stringify per key)
 */

import { describe, it, expect } from "vitest";
import {
  toFormat2Stateful,
  toNativeStateful,
  type ToolInputsResolver,
} from "../src/workflow/normalized/index.js";
import type {
  ToolParameterModel,
  IntegerParameterModel,
  BooleanParameterModel,
  SelectParameterModel,
  TextParameterModel,
} from "../src/schema/bundle-types.js";

/** Build a resolver callback from a dict — tests care about tool_id only. */
function mapResolver(map: Record<string, ToolParameterModel[]>): ToolInputsResolver {
  return (toolId) => map[toolId];
}

// --- Param factories ---

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

// --- Fixture builder: a two-step native workflow ---

function buildNativeWorkflow(): Record<string, unknown> {
  return {
    a_galaxy_workflow: "true",
    "format-version": "0.1",
    name: "test-wf",
    annotation: "",
    tags: [],
    uuid: "00000000-0000-4000-8000-000000000000",
    steps: {
      "0": {
        id: 0,
        type: "data_input",
        label: "input",
        name: "input",
        annotation: "",
        tool_state: { name: "input", optional: false },
        position: { left: 0, top: 0 },
        input_connections: {},
        inputs: [{ name: "input", description: "" }],
        outputs: [],
        workflow_outputs: [],
      },
      "1": {
        id: 1,
        type: "tool",
        label: "cool_tool",
        name: "cool_tool",
        annotation: "",
        tool_id: "cool_tool",
        tool_version: "1.0",
        tool_state: {
          // Strings that should coerce to proper types
          count: "42",
          enabled: "true",
          tags: "a,b,c",
          label: "hi",
          __page__: 0,
          __rerun_remap_job_id__: null,
        },
        input_connections: {},
        inputs: [],
        outputs: [],
        workflow_outputs: [],
        post_job_actions: {},
        position: { left: 100, top: 0 },
      },
      "2": {
        id: 2,
        type: "tool",
        label: "uncached_tool",
        name: "uncached_tool",
        annotation: "",
        tool_id: "uncached_tool",
        tool_version: "1.0",
        tool_state: { whatever: "99" },
        input_connections: {},
        inputs: [],
        outputs: [],
        workflow_outputs: [],
        post_job_actions: {},
        position: { left: 200, top: 0 },
      },
    },
  };
}

function coolToolInputs(): ToolParameterModel[] {
  return [
    intParam("count"),
    boolParam("enabled"),
    selectMultipleParam("tags", ["a", "b", "c"]),
    textParam("label"),
  ];
}

describe("toFormat2Stateful", () => {
  it("converts cached tools and flags uncached ones", () => {
    const resolver = mapResolver({ cool_tool: coolToolInputs() });

    const result = toFormat2Stateful(buildNativeWorkflow(), resolver);

    // Two tool-step status entries
    expect(result.steps).toHaveLength(2);
    const byStep = new Map(result.steps.map((s) => [s.toolId, s]));
    expect(byStep.get("cool_tool")?.converted).toBe(true);
    expect(byStep.get("uncached_tool")?.converted).toBe(false);
    expect(byStep.get("uncached_tool")?.error).toMatch(/not resolved/);

    // Find the two tool steps in the output by label
    const fmt2Steps = result.workflow.steps;
    const coolStep = fmt2Steps.find((s) => s.label === "cool_tool");
    const uncachedStep = fmt2Steps.find((s) => s.label === "uncached_tool");
    expect(coolStep).toBeDefined();
    expect(uncachedStep).toBeDefined();

    // cool_tool: state should have coerced scalars + no stale keys
    const coolState = coolStep!.tool_state as Record<string, unknown> | null | undefined;
    expect(coolState).toBeDefined();
    expect(coolState).not.toBeNull();
    expect(coolState!.count).toBe(42);
    expect(coolState!.enabled).toBe(true);
    expect(coolState!.tags).toEqual(["a", "b", "c"]);
    expect(coolState!.label).toBe("hi");
    expect(coolState!).not.toHaveProperty("__page__");
    expect(coolState!).not.toHaveProperty("__rerun_remap_job_id__");

    // uncached_tool: fell back to schema-free passthrough (stale keys stripped)
    const uncachedState = uncachedStep!.tool_state as Record<string, unknown>;
    expect(uncachedState.whatever).toBe("99"); // still a string (no coercion)
  });

  it("per-step error in one step does not break others", () => {
    // Provide an input that the walker will error on: numeric conditional test
    // param expected but state is a weird type. For this we simulate by forcing
    // an error via a bad tool input list — easiest: provide a tool input whose
    // parameter_type is unknown so the walker throws.
    const badInputs = [
      // @ts-expect-error intentionally invalid parameter_type to trigger walker error
      { name: "x", parameter_type: "gx_unknown_type", type: "unknown" } as ToolParameterModel,
    ];
    const resolver = mapResolver({
      cool_tool: badInputs,
      uncached_tool: [],
    });

    const result = toFormat2Stateful(buildNativeWorkflow(), resolver);
    // cool_tool should either succeed (if walker tolerates unknown) or fail —
    // either way, uncached_tool must have a status entry
    expect(result.steps.some((s) => s.toolId === "uncached_tool")).toBe(true);
    // Workflow still produced (fallback paths don't throw)
    expect(result.workflow.steps.length).toBeGreaterThan(0);
  });

  it("non-tool steps are not reported in status", () => {
    const resolver: ToolInputsResolver = () => undefined;
    const result = toFormat2Stateful(buildNativeWorkflow(), resolver);
    // Only the two tool steps appear in status, not the data_input step
    expect(result.steps).toHaveLength(2);
    expect(result.steps.every((s) => s.toolId !== undefined)).toBe(true);
  });
});

describe("toNativeStateful", () => {
  it("round-trips through format2 → native with clean state dicts", () => {
    const resolver = mapResolver({ cool_tool: coolToolInputs() });

    // First: native → format2 (stateful)
    const fmt2Result = toFormat2Stateful(buildNativeWorkflow(), resolver);
    // Then: format2 → native (stateful)
    const nativeResult = toNativeStateful(fmt2Result.workflow, resolver);

    // Status for cool_tool should be converted
    const coolStatus = nativeResult.steps.find((s) => s.toolId === "cool_tool");
    expect(coolStatus).toBeDefined();
    expect(coolStatus!.converted).toBe(true);

    // Find cool_tool step in the native output
    const steps = nativeResult.workflow.steps as Record<string, Record<string, unknown>>;
    const coolStep = Object.values(steps).find(
      (s) => (s.tool_id as string | undefined) === "cool_tool",
    );
    expect(coolStep).toBeDefined();

    // tool_state must be a proper dict — not JSON strings per key
    const nativeState = coolStep!.tool_state as Record<string, unknown>;
    // Multi-select was coerced to string array on the way back
    expect(nativeState.tags).toEqual(["a", "b", "c"]);
    // Numbers/booleans stay as typed values (format2 has them as numbers/bools;
    // encodeStateToNative does not re-stringify unless the type demands it)
    expect(nativeState.count).toBe(42);
    expect(nativeState.enabled).toBe(true);
    // No value is a JSON-encoded string
    for (const v of Object.values(nativeState)) {
      if (typeof v === "string") {
        // Strings in state should be real string values, not JSON-encoded dicts/arrays
        expect(v.startsWith("{") || v.startsWith("[")).toBe(false);
      }
    }
  });

  it("flags uncached tools and falls back", () => {
    const resolver: ToolInputsResolver = () => undefined;
    // Build a minimal format2 workflow with one tool step
    const fmt2Wf = {
      class: "GalaxyWorkflow",
      label: "wf",
      inputs: [],
      outputs: [],
      steps: [
        {
          id: "missing_tool",
          tool_id: "missing_tool",
          tool_version: "1.0",
          in: [],
          out: [],
          state: { x: 1 },
        },
      ],
    };
    const result = toNativeStateful(fmt2Wf, resolver);
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].converted).toBe(false);
    expect(result.steps[0].error).toMatch(/not resolved/);
  });
});
