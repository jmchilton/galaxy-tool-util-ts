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

/**
 * Resolver honoring (toolId, toolVersion). Map keys are either `toolId` (any
 * version) or `toolId@version` (exact version match, falls back to bare id).
 */
function mapResolver(map: Record<string, ToolParameterModel[]>): ToolInputsResolver {
  return (toolId, toolVersion) => {
    if (toolVersion != null) {
      const versioned = map[`${toolId}@${toolVersion}`];
      if (versioned) return versioned;
    }
    return map[toolId];
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

  it("stale bookkeeping keys are pre-cleaned before diff (clean=true)", () => {
    // Matches Galaxy's roundtrip_validate(clean_stale=True) default: the
    // tool-aware strip runs over the original before the diff, so
    // undeclared bookkeeping keys never reach compareTree.
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
    expect(result.clean).toBe(true);
  });

  it("stale bookkeeping keys fall back to differ benign when tool is uncached", () => {
    // Pre-clean requires a resolver hit; without one, pre-clean is skipped
    // and the differ's STALE_KEYS path classifies drops as benign. Defense
    // in depth for unknown-tool cases. The whole step still falls back to
    // conversion_error because forward conversion needs tool inputs too —
    // but the point is the pre-clean doesn't mutate state it can't
    // interpret.
    const wf = nativeWorkflow({
      count: 42,
      enabled: true,
      tags: ["a"],
      label: "hi",
      __page__: 0,
    });
    const result = roundtripValidate(wf, () => undefined);
    // With no resolver, the forward conversion fails -> conversion_error
    // step status, no diffs attempted. That's the expected uncached path.
    expect(result.stepResults[0].failureClass).toBe("conversion_error");
  });

  it("runtime-leak keys are pre-cleaned before diff (|__identifier__, uuid)", () => {
    // Collection-element identifier keys and invocation UUIDs leak from job
    // execution into tool_state. The tool-aware pre-clean drops them as
    // undeclared parameter keys (same pass that handles bookkeeping
    // residue). Mirrors Galaxy's clean._strip_recursive + clean_stale_state
    // → RUNTIME_LEAK category gets stripped transitively.
    const wf = nativeWorkflow({
      count: 42,
      enabled: true,
      tags: ["a"],
      label: "hi",
      "label|__identifier__": "sample-1",
      __workflow_invocation_uuid__: "abc123",
    });
    const result = roundtripValidate(wf, mapResolver({ cool_tool: coolToolInputs() }));
    expect(result.success).toBe(true);
    expect(result.clean).toBe(true);
    // Sanity: no error diffs from the residue keys.
    const errorDiffs = result.stepResults[0].diffs.filter((d) => d.severity === "error");
    expect(errorDiffs).toEqual([]);
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

  it("recursively diffs tool steps inside inline subworkflows", () => {
    // Nested tool step inside a subworkflow with a stale bookkeeping key.
    // Should surface as a benign diff attributed to prefixed stepId "1.0",
    // not silently dropped via a subworkflow_not_diffed stub.
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
          label: "cool_tool_top",
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
            steps: {
              "0": {
                id: 0,
                type: "tool",
                label: "cool_tool_nested",
                name: "cool_tool",
                annotation: "",
                tool_id: "cool_tool",
                tool_version: "1.0",
                tool_state: {
                  count: 5,
                  enabled: false,
                  tags: ["b"],
                  label: "nested_val",
                  __rerun_remap_job_id__: null,
                },
                input_connections: {},
                inputs: [],
                outputs: [],
                workflow_outputs: [],
                post_job_actions: {},
                position: { left: 0, top: 0 },
              },
            },
          },
        },
      },
    };
    const result = roundtripValidate(wf, mapResolver({ cool_tool: coolToolInputs() }));
    // Overall: clean (pre-clean runs recursively over subworkflows too,
    // stripping the nested __rerun_remap_job_id__ before diff).
    expect(result.success).toBe(true);
    expect(result.clean).toBe(true);
    // Top-level tool step present with depth 0.
    const top = result.stepResults.find((s) => s.stepId === "0");
    expect(top).toBeDefined();
    expect(top!.depth).toBe(0);
    expect(top!.diffs).toEqual([]);
    // Nested tool step present with prefixed id "1.0" and depth 1.
    const nested = result.stepResults.find((s) => s.stepId === "1.0");
    expect(nested).toBeDefined();
    expect(nested!.depth).toBe(1);
    expect(nested!.toolId).toBe("cool_tool");
    expect(nested!.diffs).toEqual([]);
    // No stray subworkflow_external_ref entries for inline subs.
    expect(result.stepResults.some((s) => s.failureClass === "subworkflow_external_ref")).toBe(
      false,
    );
  });

  it("external (URL/TRS) subworkflow refs surface as informational entries", () => {
    const wf: Record<string, unknown> = {
      a_galaxy_workflow: "true",
      "format-version": "0.1",
      name: "with-external-sub",
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
          label: "external",
          name: "external",
          annotation: "",
          tool_state: {},
          input_connections: {},
          inputs: [],
          outputs: [],
          workflow_outputs: [],
          position: { left: 100, top: 0 },
          content_source: "url",
          content_id: "https://example.com/wf.ga",
          // subworkflow field absent → external
        },
      },
    };
    const result = roundtripValidate(wf, mapResolver({ cool_tool: coolToolInputs() }));
    expect(result.success).toBe(true);
    expect(result.clean).toBe(true);
    const ext = result.stepResults.find((s) => s.failureClass === "subworkflow_external_ref");
    expect(ext).toBeDefined();
    expect(ext!.stepId).toBe("1");
    expect(ext!.depth).toBe(0);
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

  it("resolves different parameter shapes per tool_version", () => {
    // Same tool_id, two versions with incompatible parameter shapes. v1 has
    // `count` only; v2 adds `label` and `tags`. A resolver ignoring version
    // would hand v2's inputs to v1's state (or vice versa), either throwing
    // "unknown parameter" from the walker or dropping real values.
    const v1Inputs: ToolParameterModel[] = [intParam("count")];
    const v2Inputs: ToolParameterModel[] = [
      intParam("count"),
      textParam("label"),
      selectMultipleParam("tags", ["a", "b", "c"]),
    ];
    const wf: Record<string, unknown> = {
      a_galaxy_workflow: "true",
      "format-version": "0.1",
      name: "multi-version",
      annotation: "",
      tags: [],
      steps: {
        "0": {
          id: 0,
          type: "tool",
          label: "v1",
          name: "multi_tool",
          annotation: "",
          tool_id: "multi_tool",
          tool_version: "1.0",
          tool_state: { count: "7" },
          input_connections: {},
          inputs: [],
          outputs: [],
          workflow_outputs: [],
          post_job_actions: {},
          position: { left: 0, top: 0 },
        },
        "1": {
          id: 1,
          type: "tool",
          label: "v2",
          name: "multi_tool",
          annotation: "",
          tool_id: "multi_tool",
          tool_version: "2.0",
          tool_state: { count: "3", label: "hi", tags: "a,b" },
          input_connections: {},
          inputs: [],
          outputs: [],
          workflow_outputs: [],
          post_job_actions: {},
          position: { left: 100, top: 0 },
        },
      },
    };
    const resolver = mapResolver({
      "multi_tool@1.0": v1Inputs,
      "multi_tool@2.0": v2Inputs,
    });
    const result = roundtripValidate(wf, resolver);
    expect(result.forwardSteps).toHaveLength(2);
    expect(result.forwardSteps.every((s) => s.converted)).toBe(true);
    expect(result.stepResults.every((s) => s.success)).toBe(true);
    // v1 should only see `count`; v2 sees all three. If resolver ignored
    // version, v1 would be handed v2's inputs (walker wouldn't throw but the
    // extra keys would round-trip through as benign diffs) — instead expect
    // zero error diffs for both.
    expect(
      result.stepResults.flatMap((s) => s.diffs).filter((d) => d.severity === "error"),
    ).toEqual([]);
  });

  it("resolver seeing wrong version drops that step to fallback", () => {
    // Workflow declares v2; resolver only knows v1. Resolver returns undefined
    // for the (id, v2) pair → step falls back with unknown_tool.
    const v1Inputs: ToolParameterModel[] = [intParam("count")];
    const wf = {
      a_galaxy_workflow: "true",
      "format-version": "0.1",
      name: "wrong-version",
      annotation: "",
      tags: [],
      steps: {
        "0": {
          id: 0,
          type: "tool",
          label: "v2",
          name: "multi_tool",
          annotation: "",
          tool_id: "multi_tool",
          tool_version: "2.0",
          tool_state: { count: 1 },
          input_connections: {},
          inputs: [],
          outputs: [],
          workflow_outputs: [],
          post_job_actions: {},
          position: { left: 0, top: 0 },
        },
      },
    };
    // Strict resolver — version must match.
    const resolver: ToolInputsResolver = (toolId, toolVersion) => {
      if (toolId === "multi_tool" && toolVersion === "1.0") return v1Inputs;
      return undefined;
    };
    const result = roundtripValidate(wf, resolver);
    expect(result.forwardSteps[0].converted).toBe(false);
    expect(result.forwardSteps[0].failureClass).toBe("unknown_tool");
    expect(result.forwardSteps[0].toolVersion).toBe("2.0");
  });
});
