import { describe, it, expect } from "vitest";
import { scanForReplacements } from "../src/workflow/replacement-scan.js";
import type {
  ToolParameterModel,
  ConditionalParameterModel,
  RepeatParameterModel,
  SectionParameterModel,
} from "../src/schema/bundle-types.js";

function intParam(name: string): ToolParameterModel {
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
    value: 10,
    min: null,
    max: null,
    validators: [],
  };
}

function textParam(name: string): ToolParameterModel {
  return {
    name,
    parameter_type: "gx_text",
    type: "text",
    hidden: false,
    label: null,
    help: null,
    argument: null,
    is_dynamic: false,
    optional: false,
    area: false,
    value: null,
    default_options: [],
    validators: [],
  };
}

function selectParam(name: string): ToolParameterModel {
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
    options: [],
    validators: [],
  };
}

describe("scanForReplacements", () => {
  it("returns 'no' for clean state", () => {
    const inputs = [intParam("num"), textParam("label")];
    const state = { num: 5, label: "hello" };
    expect(scanForReplacements(inputs, state)).toBe("no");
  });

  it("returns 'yes' for ${...} in integer field", () => {
    const inputs = [intParam("num")];
    const state = { num: "${num_lines}" };
    expect(scanForReplacements(inputs, state)).toBe("yes");
  });

  it("returns 'yes' for ${...} in select field", () => {
    const inputs = [selectParam("method")];
    const state = { method: "${method}" };
    expect(scanForReplacements(inputs, state)).toBe("yes");
  });

  it("returns 'maybe_assumed_no' for ${...} only in text field", () => {
    const inputs = [textParam("label")];
    const state = { label: "prefix ${var} suffix" };
    expect(scanForReplacements(inputs, state)).toBe("maybe_assumed_no");
  });

  it("returns 'yes' when ${...} in both text and typed fields", () => {
    const inputs = [textParam("label"), intParam("count")];
    const state = { label: "${label}", count: "${count}" };
    expect(scanForReplacements(inputs, state)).toBe("yes");
  });

  it("scans inside conditionals", () => {
    const cond: ConditionalParameterModel = {
      name: "cond",
      parameter_type: "gx_conditional",
      hidden: false,
      label: null,
      help: null,
      argument: null,
      is_dynamic: false,
      test_parameter: selectParam("method") as any,
      whens: [
        { discriminator: "a", parameters: [intParam("val")], is_default_when: true },
      ],
    };
    const state = { cond: { method: "a", val: "${num}" } };
    expect(scanForReplacements([cond], state)).toBe("yes");
  });

  it("scans inside repeats", () => {
    const repeat: RepeatParameterModel = {
      name: "queries",
      parameter_type: "gx_repeat",
      hidden: false,
      label: null,
      help: null,
      argument: null,
      is_dynamic: false,
      parameters: [intParam("count")],
      min: null,
      max: null,
    };
    const state = { queries: [{ count: "${n}" }] };
    expect(scanForReplacements([repeat], state)).toBe("yes");
  });

  it("scans inside sections", () => {
    const section: SectionParameterModel = {
      name: "advanced",
      parameter_type: "gx_section",
      hidden: false,
      label: null,
      help: null,
      argument: null,
      is_dynamic: false,
      parameters: [intParam("threads")],
    };
    const state = { advanced: { threads: "${threads}" } };
    expect(scanForReplacements([section], state)).toBe("yes");
  });

  it("ignores data params", () => {
    const inputs: ToolParameterModel[] = [
      {
        name: "input",
        parameter_type: "gx_data",
        type: "data",
        hidden: false,
        label: null,
        help: null,
        argument: null,
        is_dynamic: false,
        optional: false,
        multiple: false,
        extensions: ["data"],
      },
    ];
    const state = { input: "${input}" };
    expect(scanForReplacements(inputs, state)).toBe("no");
  });

  it("returns 'no' for non-string values", () => {
    const inputs = [intParam("num")];
    const state = { num: 42 };
    expect(scanForReplacements(inputs, state)).toBe("no");
  });
});
