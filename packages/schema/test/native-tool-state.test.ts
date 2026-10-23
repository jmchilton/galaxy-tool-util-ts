import { describe, expect, it } from "vitest";

import { lintNative } from "../src/workflow/lint.js";
import { normalizedNative } from "../src/workflow/normalized/native.js";

function parameterInputWorkflow(toolState: string) {
  return {
    a_galaxy_workflow: "true",
    "format-version": "0.1",
    steps: { "0": { id: 0, type: "parameter_input", label: "p", tool_state: toolState } },
  };
}

describe("native tool_state that is not a JSON object", () => {
  for (const toolState of ["null", "[]", '"text"', "3"]) {
    it(`normalizes ${toolState} to an empty state`, () => {
      expect(normalizedNative(parameterInputWorkflow(toolState)).steps["0"].tool_state).toEqual({});
    });

    it(`lints ${toolState} without throwing`, () => {
      expect(lintNative(parameterInputWorkflow(toolState)).error_count).toBe(0);
    });
  }
});
