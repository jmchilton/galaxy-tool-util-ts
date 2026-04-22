import { describe, expect, it } from "vitest";
import * as S from "effect/Schema";

import { ParsedTool } from "../src/schema/parsed-tool.js";
import { buildMinimalToolState } from "../src/workflow/minimal-tool-state.js";
import { buildFormat2Step, buildNativeStep, buildStep } from "../src/workflow/step-skeleton.js";
import { NativeStepSchema } from "../src/workflow/raw/native.effect.js";
import { WorkflowStepSchema } from "../src/workflow/raw/gxformat2.effect.js";
import {
  ConversionValidationFailure,
  validateFormat2StepState,
  validateNativeStepState,
} from "../src/workflow/stateful-validate.js";
import type { ToolParameterModel } from "../src/schema/bundle-types.js";

import fastqcFixture from "../../core/test/fixtures/fastqc-parsed-tool.json" with { type: "json" };

const fastqc = S.decodeUnknownSync(ParsedTool)(fastqcFixture);

const minimalTool = S.decodeUnknownSync(ParsedTool)({
  id: "minimal_tool",
  version: null,
  name: "Minimal",
  description: null,
  inputs: [],
  outputs: [],
  citations: [],
  license: null,
  profile: null,
  edam_operations: [],
  edam_topics: [],
  xrefs: [],
});

describe("buildMinimalToolState", () => {
  // This invariant is load-bearing. If it ever changes, update the doc comment
  // on `buildMinimalToolState` and the Stage 4 plan together — the function's
  // whole design is that today the right answer is `{}`.
  it("returns {} for a real parsed tool", () => {
    expect(buildMinimalToolState(fastqc)).toEqual({});
  });

  it("returns {} for a minimal parsed tool", () => {
    expect(buildMinimalToolState(minimalTool)).toEqual({});
  });
});

describe("buildNativeStep", () => {
  it("produces a NativeStep that validates against NativeStepSchema", () => {
    const step = buildNativeStep({ tool: fastqc });
    expect(() => S.decodeUnknownSync(NativeStepSchema)(step)).not.toThrow();
  });

  it("seeds tool_state via buildMinimalToolState (object, not string)", () => {
    const step = buildNativeStep({ tool: fastqc });
    expect(step.tool_state).toEqual({});
    expect(typeof step.tool_state).toBe("object");
  });

  it("uses tool id/version/name as defaults", () => {
    const step = buildNativeStep({ tool: fastqc });
    expect(step.tool_id).toBe("fastqc");
    expect(step.tool_version).toBe("0.74+galaxy0");
    expect(step.name).toBe("FastQC");
    expect(step.content_id).toBe("fastqc");
    expect(step.type).toBe("tool");
  });

  it("honors stepIndex, label, and position overrides", () => {
    const step = buildNativeStep({
      tool: fastqc,
      stepIndex: 3,
      label: "qc1",
      position: { top: 10, left: 20 },
    });
    expect(step.id).toBe(3);
    expect(step.label).toBe("qc1");
    expect(step.position).toEqual({ top: 10, left: 20 });
  });

  it("defaults stepIndex to 0, label to null, position to {0,0}", () => {
    const step = buildNativeStep({ tool: fastqc });
    expect(step.id).toBe(0);
    expect(step.label).toBeNull();
    expect(step.position).toEqual({ top: 0, left: 0 });
  });

  it("emits null tool_version for a tool with no version (deterministic across serializers)", () => {
    const step = buildNativeStep({ tool: minimalTool });
    expect(step.tool_version).toBeNull();
  });
});

describe("buildFormat2Step", () => {
  it("produces a WorkflowStep that validates against WorkflowStepSchema", () => {
    const step = buildFormat2Step({ tool: fastqc });
    expect(() => S.decodeUnknownSync(WorkflowStepSchema)(step)).not.toThrow();
  });

  it("uses `state` (not `tool_state`) and seeds via buildMinimalToolState", () => {
    const step = buildFormat2Step({ tool: fastqc });
    expect(step.state).toEqual({});
    expect(step.tool_state).toBeUndefined();
  });

  it("label defaults to tool.name", () => {
    const step = buildFormat2Step({ tool: fastqc });
    expect(step.label).toBe("FastQC");
  });

  it("honors an explicit label", () => {
    const step = buildFormat2Step({ tool: fastqc, label: "qc1" });
    expect(step.label).toBe("qc1");
  });

  it("sets tool_id/tool_version and type=tool", () => {
    const step = buildFormat2Step({ tool: fastqc });
    expect(step.tool_id).toBe("fastqc");
    expect(step.tool_version).toBe("0.74+galaxy0");
    expect(step.type).toBe("tool");
  });

  it("emits null tool_version for a tool with no version (deterministic across serializers)", () => {
    const step = buildFormat2Step({ tool: minimalTool });
    expect(step.tool_version).toBeNull();
  });
});

/**
 * The minimal `{}` state must pass tool-state validation — except for the
 * specific case of required `data` / `data_collection` inputs, which the user
 * is expected to wire via `input_connections` after insertion.
 *
 * This is the validator-level round-trip the plan calls for: asserting
 * positively that any diagnostic references a data-typed input name, so a
 * future change that silently lets other validation errors through would
 * fail this test.
 */
describe("step skeleton passes tool-state validation (except for data connections)", () => {
  function dataTypedInputNames(inputs: readonly ToolParameterModel[]): Set<string> {
    const names = new Set<string>();
    for (const p of inputs) {
      const pt = (p as { parameter_type?: string }).parameter_type;
      if (pt === "gx_data" || pt === "gx_data_collection") {
        names.add((p as { name: string }).name);
      }
    }
    return names;
  }

  it("native skeleton: all diagnostics reference data/data_collection inputs", () => {
    const step = buildNativeStep({ tool: fastqc });
    const inputs = fastqc.inputs as unknown as ToolParameterModel[];
    const dataNames = dataTypedInputNames(inputs);
    expect(dataNames.size).toBeGreaterThan(0); // guard: fastqc has data inputs

    let caught: ConversionValidationFailure | null = null;
    try {
      validateNativeStepState(inputs, step.tool_state as Record<string, unknown>, {});
    } catch (e) {
      if (e instanceof ConversionValidationFailure) caught = e;
      else throw e;
    }

    // fastqc's `input_file` is a required gx_data; an empty tool_state MUST
    // produce at least one diagnostic. If that ever stops being true, the
    // schema has weakened and we want to know.
    expect(caught).not.toBeNull();
    expect(caught!.issues.length).toBeGreaterThan(0);
    for (const issue of caught!.issues) {
      const path = issue.split(":")[0]!;
      const head = path.split(".")[0]!;
      expect(dataNames.has(head)).toBe(true);
    }
  });

  it("format2 skeleton: all diagnostics reference data/data_collection inputs", () => {
    const step = buildFormat2Step({ tool: fastqc });
    const inputs = fastqc.inputs as unknown as ToolParameterModel[];
    const dataNames = dataTypedInputNames(inputs);

    let caught: ConversionValidationFailure | null = null;
    try {
      validateFormat2StepState(inputs, step.state as Record<string, unknown>);
    } catch (e) {
      if (e instanceof ConversionValidationFailure) caught = e;
      else throw e;
    }

    // format2 puts data connections under `in:`, not `state:` — so empty
    // `state: {}` is expected to validate cleanly for any tool. If a
    // diagnostic IS emitted, it must still only reference a data-typed input.
    if (caught) {
      for (const issue of caught.issues) {
        const path = issue.split(":")[0]!;
        const head = path.split(".")[0]!;
        expect(dataNames.has(head)).toBe(true);
      }
    }
  });

  it("native skeleton for a no-input tool validates cleanly", () => {
    const step = buildNativeStep({ tool: minimalTool });
    const inputs = minimalTool.inputs as unknown as ToolParameterModel[];
    expect(() =>
      validateNativeStepState(inputs, step.tool_state as Record<string, unknown>, {}),
    ).not.toThrow();
  });

  it("format2 skeleton for a no-input tool validates cleanly", () => {
    const step = buildFormat2Step({ tool: minimalTool });
    const inputs = minimalTool.inputs as unknown as ToolParameterModel[];
    expect(() =>
      validateFormat2StepState(inputs, step.state as Record<string, unknown>),
    ).not.toThrow();
  });
});

describe("buildStep", () => {
  it("dispatches to native builder when format=native", () => {
    const step = buildStep({ tool: fastqc, format: "native" });
    expect(() => S.decodeUnknownSync(NativeStepSchema)(step)).not.toThrow();
  });

  it("dispatches to format2 builder when format=format2", () => {
    const step = buildStep({ tool: fastqc, format: "format2" });
    expect(() => S.decodeUnknownSync(WorkflowStepSchema)(step)).not.toThrow();
  });
});
