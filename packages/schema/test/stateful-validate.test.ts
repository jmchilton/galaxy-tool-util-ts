/**
 * Unit tests for the validation wrappers used by stateful conversion.
 */
import { describe, it, expect } from "vitest";
import {
  ConversionValidationFailure,
  validateNativeStepState,
  validateFormat2StepState,
} from "../src/workflow/stateful-validate.js";
import type {
  IntegerParameterModel,
  TextParameterModel,
  ToolParameterModel,
} from "../src/schema/bundle-types.js";

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
    value: null,
    default_options: [],
    validators: [],
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
});
