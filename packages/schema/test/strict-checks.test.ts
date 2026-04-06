import { describe, it, expect } from "vitest";
import {
  validateEncodingNative,
  validateEncodingFormat2,
  checkStrictEncoding,
  checkStrictStructure,
} from "../src/workflow/strict-checks.js";

describe("validateEncodingNative", () => {
  it("clean native workflow → no errors", () => {
    const wf = {
      a_galaxy_workflow: "true",
      "format-version": "0.1",
      steps: {
        "0": {
          id: 0,
          type: "tool",
          tool_id: "some_tool",
          tool_state: { input_text: "hello" },
        },
      },
    };
    expect(validateEncodingNative(wf)).toEqual([]);
  });

  it("tool_state as JSON string → error", () => {
    const wf = {
      a_galaxy_workflow: "true",
      "format-version": "0.1",
      steps: {
        "0": {
          id: 0,
          type: "tool",
          tool_id: "some_tool",
          tool_state: JSON.stringify({ input_text: "hello" }),
        },
      },
    };
    const errors = validateEncodingNative(wf);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("step 0");
    expect(errors[0]).toContain("JSON string");
  });

  it("skips subworkflow steps", () => {
    const wf = {
      a_galaxy_workflow: "true",
      "format-version": "0.1",
      steps: {
        "0": {
          id: 0,
          type: "subworkflow",
          tool_state: "ignored",
        },
      },
    };
    expect(validateEncodingNative(wf)).toEqual([]);
  });

  it("skips steps without tool_id", () => {
    const wf = {
      a_galaxy_workflow: "true",
      "format-version": "0.1",
      steps: {
        "0": {
          id: 0,
          type: "data_input",
          tool_id: null,
          tool_state: "{}",
        },
      },
    };
    expect(validateEncodingNative(wf)).toEqual([]);
  });
});

describe("validateEncodingFormat2", () => {
  it("clean format2 workflow → no errors", () => {
    const wf = {
      class: "GalaxyWorkflow",
      steps: [
        {
          tool_id: "some_tool",
          state: { input_text: "hello" },
        },
      ],
    };
    expect(validateEncodingFormat2(wf)).toEqual([]);
  });

  it("tool_state instead of state → error", () => {
    const wf = {
      class: "GalaxyWorkflow",
      steps: [
        {
          tool_id: "some_tool",
          tool_state: { input_text: "hello" },
        },
      ],
    };
    const errors = validateEncodingFormat2(wf);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("step 0");
    expect(errors[0]).toContain("tool_state");
    expect(errors[0]).toContain("state");
  });

  it("step with both state and tool_state → no error (state present)", () => {
    const wf = {
      class: "GalaxyWorkflow",
      steps: [
        {
          tool_id: "some_tool",
          state: { input_text: "hello" },
          tool_state: { input_text: "hello" },
        },
      ],
    };
    expect(validateEncodingFormat2(wf)).toEqual([]);
  });

  it("skips subworkflow steps (run field)", () => {
    const wf = {
      class: "GalaxyWorkflow",
      steps: [
        {
          run: { class: "GalaxyWorkflow", steps: [] },
          tool_state: { input_text: "hello" },
        },
      ],
    };
    expect(validateEncodingFormat2(wf)).toEqual([]);
  });
});

describe("checkStrictEncoding", () => {
  it("dispatches to native for native workflows", () => {
    const wf = {
      a_galaxy_workflow: "true",
      "format-version": "0.1",
      steps: {
        "0": {
          id: 0,
          type: "tool",
          tool_id: "t",
          tool_state: '{"x": 1}',
        },
      },
    };
    expect(checkStrictEncoding(wf)).toHaveLength(1);
  });

  it("dispatches to format2 for format2 workflows", () => {
    const wf = {
      class: "GalaxyWorkflow",
      steps: [{ tool_id: "t", tool_state: { x: 1 } }],
    };
    expect(checkStrictEncoding(wf)).toHaveLength(1);
  });
});

describe("checkStrictStructure", () => {
  it("clean native workflow → no errors", () => {
    const wf = {
      a_galaxy_workflow: "true",
      "format-version": "0.1",
      steps: {},
    };
    expect(checkStrictStructure(wf, "native")).toEqual([]);
  });

  it("native workflow with extra root key → errors", () => {
    const wf = {
      a_galaxy_workflow: "true",
      "format-version": "0.1",
      steps: {},
      bogus_extra_key: "should fail",
    };
    const errors = checkStrictStructure(wf, "native");
    expect(errors.length).toBeGreaterThan(0);
  });

  it("clean format2 workflow → no errors", () => {
    const wf = {
      class: "GalaxyWorkflow",
      inputs: [],
      outputs: [],
      steps: [],
    };
    expect(checkStrictStructure(wf, "format2")).toEqual([]);
  });

  it("format2 workflow with extra key → errors", () => {
    const wf = {
      class: "GalaxyWorkflow",
      inputs: [],
      outputs: [],
      steps: [],
      bogus_extra_key: "should fail",
    };
    const errors = checkStrictStructure(wf, "format2");
    expect(errors.length).toBeGreaterThan(0);
  });
});
