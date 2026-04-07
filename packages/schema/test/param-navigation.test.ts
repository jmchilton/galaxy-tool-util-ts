/**
 * Tests for findParamAtPath — parameter tree navigation with conditional branch filtering.
 */
import { describe, it, expect } from "vitest";
import { findParamAtPath } from "../src/workflow/param-navigation.js";
import type {
  BooleanParameterModel,
  ConditionalParameterModel,
  IntegerParameterModel,
  RepeatParameterModel,
  SectionParameterModel,
  SelectParameterModel,
  ToolParameterModel,
} from "../src/schema/bundle-types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
    value: null,
    options: options.map((v) => ({ label: v, value: v, selected: false })),
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
    validators: [],
  };
}

function sectionParam(name: string, children: ToolParameterModel[]): SectionParameterModel {
  return {
    name,
    parameter_type: "gx_section",
    type: "section",
    hidden: false,
    label: null,
    help: null,
    expanded: false,
    parameters: children,
  };
}

function repeatParam(name: string, children: ToolParameterModel[]): RepeatParameterModel {
  return {
    name,
    parameter_type: "gx_repeat",
    type: "repeat",
    hidden: false,
    label: null,
    help: null,
    min: null,
    max: null,
    default: null,
    title: name,
    parameters: children,
  };
}

function conditionalParam(
  name: string,
  testParam: BooleanParameterModel | SelectParameterModel,
  whens: Array<{
    discriminator: string | boolean;
    is_default_when: boolean;
    parameters: ToolParameterModel[];
  }>,
): ConditionalParameterModel {
  return {
    name,
    parameter_type: "gx_conditional",
    type: "conditional",
    hidden: false,
    label: null,
    help: null,
    test_parameter: testParam,
    whens,
  };
}

// ---------------------------------------------------------------------------
// Tests: flat list
// ---------------------------------------------------------------------------

describe("findParamAtPath — flat params", () => {
  const params: ToolParameterModel[] = [intParam("count"), intParam("size")];

  it("empty path returns undefined + full list", () => {
    const r = findParamAtPath(params, []);
    expect(r.param).toBeUndefined();
    expect(r.availableParams).toBe(params);
  });

  it("resolves single-segment path to matching param", () => {
    const r = findParamAtPath(params, ["count"]);
    expect(r.param?.name).toBe("count");
    expect(r.availableParams).toBe(params);
  });

  it("returns undefined param for unknown key", () => {
    const r = findParamAtPath(params, ["unknown"]);
    expect(r.param).toBeUndefined();
    expect(r.availableParams).toBe(params);
  });

  it("returns undefined for path that goes deeper than a leaf", () => {
    const r = findParamAtPath(params, ["count", "nested"]);
    expect(r.param).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Tests: section
// ---------------------------------------------------------------------------

describe("findParamAtPath — section", () => {
  const params: ToolParameterModel[] = [
    sectionParam("opts", [intParam("alpha"), intParam("beta")]),
  ];

  it("resolves to section param itself", () => {
    const r = findParamAtPath(params, ["opts"]);
    expect(r.param?.name).toBe("opts");
  });

  it("resolves nested param inside section", () => {
    const r = findParamAtPath(params, ["opts", "alpha"]);
    expect(r.param?.name).toBe("alpha");
  });

  it("availableParams inside section are the section's children", () => {
    const r = findParamAtPath(params, ["opts", "alpha"]);
    expect(r.availableParams.map((p) => p.name)).toEqual(["alpha", "beta"]);
  });

  it("returns undefined for unknown key inside section", () => {
    const r = findParamAtPath(params, ["opts", "missing"]);
    expect(r.param).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Tests: repeat
// ---------------------------------------------------------------------------

describe("findParamAtPath — repeat", () => {
  const params: ToolParameterModel[] = [repeatParam("rows", [intParam("val")])];

  it("resolves to repeat param itself", () => {
    const r = findParamAtPath(params, ["rows"]);
    expect(r.param?.name).toBe("rows");
  });

  it("skips numeric index and resolves nested param", () => {
    const r = findParamAtPath(params, ["rows", 0, "val"]);
    expect(r.param?.name).toBe("val");
  });

  it("skips numeric index for availableParams listing", () => {
    const r = findParamAtPath(params, ["rows", 0]);
    expect(r.availableParams.map((p) => p.name)).toEqual(["val"]);
  });
});

// ---------------------------------------------------------------------------
// Tests: conditional
// ---------------------------------------------------------------------------

describe("findParamAtPath — conditional", () => {
  const cond = conditionalParam("mode_cond", selectParam("mode_select", ["fast", "sensitive"]), [
    { discriminator: "fast", is_default_when: true, parameters: [intParam("fast_param")] },
    { discriminator: "sensitive", is_default_when: false, parameters: [intParam("sens_param")] },
  ]);
  const params: ToolParameterModel[] = [cond];

  it("resolves to conditional param itself", () => {
    const r = findParamAtPath(params, ["mode_cond"]);
    expect(r.param?.name).toBe("mode_cond");
  });

  it("resolves test_parameter by name", () => {
    const r = findParamAtPath(params, ["mode_cond", "mode_select"]);
    expect(r.param?.name).toBe("mode_select");
  });

  it("with state=fast, resolves fast branch param", () => {
    const r = findParamAtPath(params, ["mode_cond", "fast_param"], {
      mode_cond: { mode_select: "fast" },
    });
    expect(r.param?.name).toBe("fast_param");
  });

  it("with state=sensitive, resolves sensitive branch param", () => {
    const r = findParamAtPath(params, ["mode_cond", "sens_param"], {
      mode_cond: { mode_select: "sensitive" },
    });
    expect(r.param?.name).toBe("sens_param");
  });

  it("with state=fast, availableParams inside cond are test_param + fast branch only", () => {
    const r = findParamAtPath(params, ["mode_cond", "fast_param"], {
      mode_cond: { mode_select: "fast" },
    });
    expect(r.availableParams.map((p) => p.name)).toEqual(["mode_select", "fast_param"]);
  });

  it("without state, availableParams include all branches merged", () => {
    const r = findParamAtPath(params, ["mode_cond", "fast_param"]);
    expect(r.availableParams.map((p) => p.name)).toContain("fast_param");
    expect(r.availableParams.map((p) => p.name)).toContain("sens_param");
  });

  it("with state present but discriminator not set, shows all branches", () => {
    // e.g. mode_cond: {} in YAML — object exists but mode_select not yet written
    const r = findParamAtPath(params, ["mode_cond", "fast_param"], { mode_cond: {} });
    expect(r.availableParams.map((p) => p.name)).toContain("fast_param");
    expect(r.availableParams.map((p) => p.name)).toContain("sens_param");
  });

  it("with state=fast, sensitive branch param returns undefined param", () => {
    const r = findParamAtPath(params, ["mode_cond", "sens_param"], {
      mode_cond: { mode_select: "fast" },
    });
    expect(r.param).toBeUndefined();
  });

  it("with boolean conditional, resolves correct branch", () => {
    const boolCond = conditionalParam("flag_cond", boolParam("flag"), [
      { discriminator: true, is_default_when: true, parameters: [intParam("on_param")] },
      { discriminator: false, is_default_when: false, parameters: [intParam("off_param")] },
    ]);
    const r = findParamAtPath([boolCond], ["flag_cond", "on_param"], {
      flag_cond: { flag: "true" },
    });
    expect(r.param?.name).toBe("on_param");
  });
});
