import { describe, expect, it } from "vitest";
import * as S from "effect/Schema";

import { NormalizedFormat2InputSchema, toFormat2, toNative } from "../src/workflow/index.js";

describe("numeric workflow input bounds", () => {
  it.each([
    { type: "int", bounds: { min: 1, max: 5 } },
    { type: "int", bounds: { min: 0 } },
    { type: "float", bounds: { max: 0.5 } },
  ])("preserves $type $bounds through Format 2 -> native -> Format 2", ({ type, bounds }) => {
    const input = S.decodeUnknownSync(NormalizedFormat2InputSchema)({ id: "n", type, ...bounds });
    expect(input).toMatchObject(bounds);

    const workflow = { class: "GalaxyWorkflow", inputs: { n: { type, ...bounds } }, steps: {} };
    const native = toNative(workflow);
    expect(native.steps["0"].tool_state.validators).toEqual([
      {
        type: "in_range",
        min: "min" in bounds ? bounds.min : null,
        max: "max" in bounds ? bounds.max : null,
        negate: false,
      },
    ]);

    const restored = toFormat2(native).inputs[0] as Record<string, unknown>;
    for (const [key, value] of Object.entries(bounds)) expect(restored[key]).toBe(value);
    for (const key of ["min", "max"]) {
      if (!(key in bounds)) expect(restored).not.toHaveProperty(key);
    }
  });

  it.each([
    {
      type: "integer",
      validator: { type: "in_range", min: 1, max: 5, negate: false },
      bounds: { min: 1, max: 5 },
    },
    {
      type: "float",
      validator: { type: "in_range", min: null, max: 0.5, negate: false },
      bounds: { max: 0.5 },
    },
  ])(
    "exports native $type in_range validators as Format 2 bounds",
    ({ type, validator, bounds }) => {
      const native = toNative({
        class: "GalaxyWorkflow",
        inputs: { n: { type: "int" } },
        steps: {},
      });
      native.steps["0"].tool_state.parameter_type = type;
      native.steps["0"].tool_state.validators = [validator];

      const restored = toFormat2(native).inputs[0] as Record<string, unknown>;
      expect(restored).toMatchObject(bounds);
      for (const key of ["min", "max"]) {
        if (!(key in bounds)) expect(restored).not.toHaveProperty(key);
      }
    },
  );

  it("does not turn unrelated or negated validators into bounds", () => {
    const native = toNative({ class: "GalaxyWorkflow", inputs: { n: { type: "int" } }, steps: {} });
    native.steps["0"].tool_state.validators = [
      { type: "regex", expression: "[0-9]+", negate: false },
      { type: "in_range", min: 1, max: 5, negate: true },
    ];

    const restored = toFormat2(native).inputs[0];
    expect(restored).not.toHaveProperty("min");
    expect(restored).not.toHaveProperty("max");
  });
});
