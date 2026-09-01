/**
 * Unit tests for the validation wrappers used by stateful conversion.
 */
import { describe, it, expect } from "vitest";
import {
  ConversionValidationFailure,
  validateNativeStepState,
  validateFormat2StepState,
  validateFormat2StepStateStrict,
} from "../src/workflow/stateful-validate.js";
import type {
  ConditionalParameterModel,
  FloatParameterModel,
  IntegerParameterModel,
  SectionParameterModel,
  SelectParameterModel,
  TextParameterModel,
  ToolParameterModel,
} from "../src/schema/bundle-types.js";

function sectionParam(name: string, parameters: ToolParameterModel[]): SectionParameterModel {
  return {
    name,
    parameter_type: "gx_section",
    hidden: false,
    label: null,
    help: null,
    argument: null,
    is_dynamic: false,
    parameters,
  };
}

function intParam(name: string, optional = false): IntegerParameterModel {
  return {
    name,
    parameter_type: "gx_integer",
    type: "integer",
    hidden: false,
    label: null,
    help: null,
    argument: null,
    is_dynamic: false,
    optional,
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
    default_value: null,
    default_options: [],
    validators: [],
  };
}

function floatParam(name: string): FloatParameterModel {
  return {
    name,
    parameter_type: "gx_float",
    type: "float",
    hidden: false,
    label: null,
    help: null,
    argument: null,
    is_dynamic: false,
    optional: false,
    // No default: makes the leaf genuinely required in the `workflow_step`
    // representation, which is what the connection-aware path must satisfy.
    value: null,
    min: null,
    max: null,
    validators: [],
  };
}

function selectParam(name: string, options: string[]): SelectParameterModel {
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
    multiple: false,
    options: options.map((v, i) => ({ label: v, value: v, selected: i === 0 })),
    validators: [],
  };
}

function conditionalParam(
  name: string,
  testParam: SelectParameterModel,
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

describe("validateNativeStepState", () => {
  it("accepts typed scalars", () => {
    const inputs: ToolParameterModel[] = [intParam("count")];
    expect(() => validateNativeStepState(inputs, { count: 42 })).not.toThrow();
    expect(() => validateNativeStepState(inputs, { count: "42" })).not.toThrow();
  });

  it("rejects non-numeric string in integer field", () => {
    const inputs: ToolParameterModel[] = [intParam("count")];
    expect(() => validateNativeStepState(inputs, { count: "not-a-number" })).toThrow(
      ConversionValidationFailure,
    );
  });

  it("rejects nested object where scalar expected", () => {
    const inputs: ToolParameterModel[] = [intParam("count")];
    expect(() => validateNativeStepState(inputs, { count: { nested: true } })).toThrow(
      ConversionValidationFailure,
    );
  });

  it("error carries phase='pre' and formatted issues", () => {
    const inputs: ToolParameterModel[] = [intParam("count")];
    try {
      validateNativeStepState(inputs, { count: "xyz" });
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ConversionValidationFailure);
      const e = err as ConversionValidationFailure;
      expect(e.phase).toBe("pre");
      expect(e.issues.length).toBeGreaterThan(0);
    }
  });
});

describe("validateFormat2StepState", () => {
  it("accepts typed scalars", () => {
    const inputs: ToolParameterModel[] = [intParam("count"), textParam("label")];
    expect(() => validateFormat2StepState(inputs, { count: 42, label: "hi" })).not.toThrow();
  });

  it("rejects string in strict integer field", () => {
    const inputs: ToolParameterModel[] = [intParam("count")];
    expect(() => validateFormat2StepState(inputs, { count: "42" })).toThrow(
      ConversionValidationFailure,
    );
  });

  it("error carries phase='post'", () => {
    const inputs: ToolParameterModel[] = [intParam("count")];
    try {
      validateFormat2StepState(inputs, { count: "42" });
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ConversionValidationFailure);
      expect((err as ConversionValidationFailure).phase).toBe("post");
    }
  });

  // Regression: iuc/compose_text_param-shaped conditional whose `float` case has
  // a REQUIRED typed `component_value`. When that leaf is connection-supplied,
  // conversion strips it out of the state (it lives in the `in` block), so the
  // post-conversion check must credit the connection — not report it missing.
  // Previously this raised a misleading "component_value: is missing" and made
  // the whole workflow fail round-trip.
  function connectedConditionalInputs(): ToolParameterModel[] {
    return [
      conditionalParam("param_type", selectParam("select_param_type", ["text", "float"]), [
        {
          discriminator: "text",
          parameters: [textParam("component_value")],
          is_default_when: true,
        },
        {
          discriminator: "float",
          parameters: [floatParam("component_value")],
          is_default_when: false,
        },
      ]),
    ];
  }

  it("accepts a required typed leaf supplied by a connection (float branch)", () => {
    const inputs = connectedConditionalInputs();
    const state = { param_type: { select_param_type: "float", __current_case__: 1 } };
    const connections = { "param_type|component_value": { id: 1, output_name: "out" } };
    expect(() => validateFormat2StepState(inputs, state, connections)).not.toThrow();
  });

  it("connection-aware path still rejects an invalid non-connected value", () => {
    // A connection is present (so we take the linked path), but an unrelated,
    // non-connected integer carries a bad value — validation must still fail,
    // confirming the fix credits connections without disabling type checks.
    const inputs: ToolParameterModel[] = [intParam("count"), ...connectedConditionalInputs()];
    const state = {
      count: "not-a-number",
      param_type: { select_param_type: "float", __current_case__: 1 },
    };
    const connections = { "param_type|component_value": { id: 1, output_name: "out" } };
    expect(() => validateFormat2StepState(inputs, state, connections)).toThrow(
      ConversionValidationFailure,
    );
  });
});

describe("validateFormat2StepStateStrict", () => {
  it("returns a located diagnostic (does not throw) for a scalar in a section", () => {
    const inputs: ToolParameterModel[] = [sectionParam("advanced", [textParam("opt")])];
    const diags = validateFormat2StepStateStrict(inputs, { advanced: "not_a_dict" });

    expect(diags).toHaveLength(1);
    expect(diags[0].severity).toBe("error");
    expect(diags[0].path).toBe("advanced");
    expect(diags[0].message).toContain("expected a nested object or list");
    expect(diags[0].message).not.toContain("legacy parameter encoding"); // walker jargon dropped
  });
});
