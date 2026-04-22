import { describe, expect, it } from "vitest";
import { expandToolStateDefaults } from "../src/workflow/fill-defaults.js";
import type {
  BooleanParameterModel,
  ConditionalParameterModel,
  DataCollectionParameterModel,
  DataParameterModel,
  DrillDownOption,
  DrillDownParameterModel,
  FloatParameterModel,
  GenomeBuildParameterModel,
  HiddenParameterModel,
  IntegerParameterModel,
  RepeatParameterModel,
  SectionParameterModel,
  SelectParameterModel,
  TextParameterModel,
  ToolParameterModel,
} from "../src/schema/bundle-types.js";

// --- Param factories (mirrored from walker.test.ts; kept local for now) ---

function intParam(name: string, value: number | null = 0, optional = false): IntegerParameterModel {
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
    value,
    min: null,
    max: null,
    validators: [],
  };
}

function floatParam(name: string, value: number | null = 0): FloatParameterModel {
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
    value,
    min: null,
    max: null,
    validators: [],
  };
}

function hiddenParam(name: string, value: string | null): HiddenParameterModel {
  return {
    name,
    parameter_type: "gx_hidden",
    type: "hidden",
    hidden: true,
    label: null,
    help: null,
    argument: null,
    is_dynamic: false,
    optional: false,
    value,
    validators: [],
  };
}

function textParam(name: string, value: string | null = null, optional = true): TextParameterModel {
  return {
    name,
    parameter_type: "gx_text",
    type: "text",
    hidden: false,
    label: null,
    help: null,
    argument: null,
    is_dynamic: false,
    optional,
    area: false,
    value,
    default_options: [],
    validators: [],
  };
}

function boolParam(name: string, value = false, optional = false): BooleanParameterModel {
  return {
    name,
    parameter_type: "gx_boolean",
    type: "boolean",
    hidden: false,
    label: null,
    help: null,
    argument: null,
    is_dynamic: false,
    optional,
    value,
    truevalue: "true",
    falsevalue: "false",
  };
}

function selectParam(
  name: string,
  options: { value: string; selected: boolean }[] | null,
  multiple = false,
  optional = false,
): SelectParameterModel {
  return {
    name,
    parameter_type: "gx_select",
    type: "select",
    hidden: false,
    label: null,
    help: null,
    argument: null,
    is_dynamic: false,
    optional,
    multiple,
    options:
      options === null
        ? null
        : options.map((o) => ({ label: o.value, value: o.value, selected: o.selected })),
    validators: [],
  };
}

function drillDownParam(
  name: string,
  options: DrillDownOption[],
  multiple = false,
): DrillDownParameterModel {
  return {
    name,
    parameter_type: "gx_drill_down",
    type: "drill_down",
    hidden: false,
    label: null,
    help: null,
    argument: null,
    is_dynamic: false,
    optional: false,
    multiple,
    options,
    hierarchy: "exact",
  };
}

function genomeBuildParam(name: string, optional: boolean): GenomeBuildParameterModel {
  return {
    name,
    parameter_type: "gx_genomebuild",
    type: "genomebuild",
    hidden: false,
    label: null,
    help: null,
    argument: null,
    is_dynamic: false,
    optional,
    multiple: false,
    options: [],
  };
}

function dataParam(name: string): DataParameterModel {
  return {
    name,
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
  };
}

function dataCollectionParam(name: string, optional: boolean): DataCollectionParameterModel {
  return {
    name,
    parameter_type: "gx_data_collection",
    type: "data_collection",
    hidden: false,
    label: null,
    help: null,
    argument: null,
    is_dynamic: false,
    optional,
    collection_type: null,
    extensions: [],
    value: null,
  };
}

function conditionalParam(
  name: string,
  testParam: BooleanParameterModel | SelectParameterModel,
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

function repeatParam(
  name: string,
  parameters: ToolParameterModel[],
  min: number | null = null,
): RepeatParameterModel {
  return {
    name,
    parameter_type: "gx_repeat",
    hidden: false,
    label: null,
    help: null,
    argument: null,
    is_dynamic: false,
    parameters,
    min,
    max: null,
  };
}

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

// --- Tests ---

describe("expandToolStateDefaults — scalar defaults", () => {
  it("fills integer / float / hidden values when absent", () => {
    const result = expandToolStateDefaults(
      [intParam("i", 7), floatParam("f", 1.5), hiddenParam("h", "secret")],
      {},
    );
    expect(result).toEqual({ i: 7, f: 1.5, h: "secret" });
  });

  it("emits null when int param value is null", () => {
    const result = expandToolStateDefaults([intParam("i", null, true)], {});
    expect(result).toEqual({ i: null });
  });

  it("boolean always defaults to false even when optional and value unset", () => {
    const result = expandToolStateDefaults(
      [boolParam("b1", false, false), boolParam("b2", true, true)],
      {},
    );
    expect(result).toEqual({ b1: false, b2: true });
  });

  it("select single non-optional: first selected option, else first option", () => {
    const p1 = selectParam("s1", [
      { value: "a", selected: false },
      { value: "b", selected: true },
      { value: "c", selected: false },
    ]);
    const p2 = selectParam("s2", [
      { value: "x", selected: false },
      { value: "y", selected: false },
    ]);
    const result = expandToolStateDefaults([p1, p2], {});
    expect(result).toEqual({ s1: "b", s2: "x" });
  });

  it("select single optional with no selected: null (matches Python default_value=None)", () => {
    const p = selectParam("s", [{ value: "a", selected: false }], false, true);
    const result = expandToolStateDefaults([p], {});
    expect(result).toEqual({ s: null });
  });

  it("select multiple: array of selected values, or null if none selected", () => {
    const p1 = selectParam(
      "m1",
      [
        { value: "a", selected: true },
        { value: "b", selected: false },
        { value: "c", selected: true },
      ],
      true,
    );
    const p2 = selectParam("m2", [{ value: "x", selected: false }], true);
    const result = expandToolStateDefaults([p1, p2], {});
    expect(result).toEqual({ m1: ["a", "c"], m2: null });
  });

  it("dynamic-options select (options=null): absent", () => {
    const p = selectParam("d", null);
    const result = expandToolStateDefaults([p], {});
    expect(result).toEqual({});
  });

  it("drill_down single: first selected in tree, else absent", () => {
    const opts: DrillDownOption[] = [
      {
        value: "root",
        name: "Root",
        selected: false,
        options: [
          { value: "a", name: "A", selected: false, options: [] },
          { value: "b", name: "B", selected: true, options: [] },
        ],
      },
    ];
    const p = drillDownParam("dd", opts, false);
    const result = expandToolStateDefaults([p], {});
    expect(result).toEqual({ dd: "b" });
  });

  it("drill_down single, nothing selected: absent", () => {
    const opts: DrillDownOption[] = [{ value: "a", name: "A", selected: false, options: [] }];
    const p = drillDownParam("dd", opts, false);
    const result = expandToolStateDefaults([p], {});
    expect(result).toEqual({});
  });

  it("drill_down multiple: array of selected values", () => {
    const opts: DrillDownOption[] = [
      { value: "a", name: "A", selected: true, options: [] },
      {
        value: "b",
        name: "B",
        selected: false,
        options: [{ value: "c", name: "C", selected: true, options: [] }],
      },
    ];
    const p = drillDownParam("dd", opts, true);
    const result = expandToolStateDefaults([p], {});
    expect(result).toEqual({ dd: ["a", "c"] });
  });

  it("data input: never filled", () => {
    const result = expandToolStateDefaults([dataParam("d")], {});
    expect(result).toEqual({});
  });

  it("data_collection optional: null; non-optional: absent", () => {
    const result = expandToolStateDefaults(
      [dataCollectionParam("c1", true), dataCollectionParam("c2", false)],
      {},
    );
    expect(result).toEqual({ c1: null });
  });

  it("genomebuild optional: null; non-optional: absent", () => {
    const result = expandToolStateDefaults(
      [genomeBuildParam("g1", true), genomeBuildParam("g2", false)],
      {},
    );
    expect(result).toEqual({ g1: null });
  });

  it("text non-optional no-value: empty string", () => {
    const result = expandToolStateDefaults([textParam("t", null, false)], {});
    expect(result).toEqual({ t: "" });
  });

  it("text non-optional with default_value: default_value", () => {
    const result = expandToolStateDefaults([textParam("t", "hello", false)], {});
    expect(result).toEqual({ t: "hello" });
  });

  it("text optional no-value: null (passthrough)", () => {
    const result = expandToolStateDefaults([textParam("t", null, true)], {});
    expect(result).toEqual({ t: null });
  });

  it("text non-optional present null: coerced to empty string", () => {
    const result = expandToolStateDefaults([textParam("t", null, false)], { t: null });
    expect(result).toEqual({ t: "" });
  });

  it("text present value: not overwritten", () => {
    const result = expandToolStateDefaults([textParam("t", "default", false)], { t: "user" });
    expect(result).toEqual({ t: "user" });
  });
});

describe("expandToolStateDefaults — containers", () => {
  it("conditional: active branch from user test_value gets defaults filled", () => {
    const cond = conditionalParam(
      "cond",
      selectParam(
        "which",
        [
          { value: "a", selected: true },
          { value: "b", selected: false },
        ],
        false,
        false,
      ),
      [
        {
          discriminator: "a",
          parameters: [intParam("branch_a", 100)],
          is_default_when: true,
        },
        {
          discriminator: "b",
          parameters: [intParam("branch_b", 200)],
          is_default_when: false,
        },
      ],
    );
    const result = expandToolStateDefaults([cond], { cond: { which: "b" } });
    expect(result).toEqual({ cond: { which: "b", branch_b: 200 } });
  });

  it("conditional empty state: default-when branch + test param default filled", () => {
    const cond = conditionalParam(
      "cond",
      selectParam("which", [
        { value: "a", selected: true },
        { value: "b", selected: false },
      ]),
      [
        {
          discriminator: "a",
          parameters: [intParam("branch_a", 100)],
          is_default_when: true,
        },
        {
          discriminator: "b",
          parameters: [intParam("branch_b", 200)],
          is_default_when: false,
        },
      ],
    );
    const result = expandToolStateDefaults([cond], {});
    expect(result).toEqual({ cond: { which: "a", branch_a: 100 } });
  });

  it("repeat existing instances: filled in place, user values preserved", () => {
    const rep = repeatParam("r", [intParam("x", 5), intParam("y", 10)]);
    const result = expandToolStateDefaults([rep], { r: [{ x: 99 }, {}] });
    expect(result).toEqual({
      r: [
        { x: 99, y: 10 },
        { x: 5, y: 10 },
      ],
    });
  });

  it("repeat min padding: empty array → min instances, each filled", () => {
    const rep = repeatParam("r", [intParam("x", 5)], 2);
    const result = expandToolStateDefaults([rep], {});
    expect(result).toEqual({ r: [{ x: 5 }, { x: 5 }] });
  });

  it("repeat no min, absent: empty array", () => {
    const rep = repeatParam("r", [intParam("x", 5)]);
    const result = expandToolStateDefaults([rep], {});
    expect(result).toEqual({ r: [] });
  });

  it("section present: recurse and fill", () => {
    const sec = sectionParam("sec", [intParam("x", 5), textParam("t", "hi", false)]);
    const result = expandToolStateDefaults([sec], { sec: { x: 99 } });
    expect(result).toEqual({ sec: { x: 99, t: "hi" } });
  });

  it("section absent: created as {} and filled", () => {
    const sec = sectionParam("sec", [intParam("x", 5)]);
    const result = expandToolStateDefaults([sec], {});
    expect(result).toEqual({ sec: { x: 5 } });
  });

  it("nested: section containing conditional containing repeat", () => {
    const rep = repeatParam("r", [intParam("i", 1)], 1);
    const cond = conditionalParam(
      "cond",
      selectParam("which", [
        { value: "a", selected: true },
        { value: "b", selected: false },
      ]),
      [
        { discriminator: "a", parameters: [rep], is_default_when: true },
        {
          discriminator: "b",
          parameters: [intParam("other", 42)],
          is_default_when: false,
        },
      ],
    );
    const sec = sectionParam("sec", [cond]);
    const result = expandToolStateDefaults([sec], {});
    expect(result).toEqual({
      sec: { cond: { which: "a", r: [{ i: 1 }] } },
    });
  });
});

describe("expandToolStateDefaults — invariants", () => {
  it("idempotence across scalar + container cases", () => {
    const rep = repeatParam("r", [intParam("x", 5)], 2);
    const cond = conditionalParam(
      "cond",
      selectParam("which", [
        { value: "a", selected: true },
        { value: "b", selected: false },
      ]),
      [
        {
          discriminator: "a",
          parameters: [textParam("t", "def", false)],
          is_default_when: true,
        },
        {
          discriminator: "b",
          parameters: [intParam("n", 9)],
          is_default_when: false,
        },
      ],
    );
    const sec = sectionParam("sec", [intParam("x", 1)]);
    const tool: ToolParameterModel[] = [
      intParam("i", 3),
      boolParam("b", true),
      textParam("t", null, false),
      rep,
      cond,
      sec,
      dataParam("d"),
    ];
    const once = expandToolStateDefaults(tool, { cond: { which: "b" } });
    const twice = expandToolStateDefaults(tool, once);
    expect(twice).toEqual(once);
  });

  it("present scalar values are never overwritten", () => {
    const result = expandToolStateDefaults(
      [intParam("i", 7), boolParam("b", false), textParam("t", "default", false)],
      { i: 42, b: true, t: "user" },
    );
    expect(result).toEqual({ i: 42, b: true, t: "user" });
  });

  it("unknown bookkeeping keys preserved", () => {
    const cond = conditionalParam(
      "cond",
      selectParam("which", [
        { value: "a", selected: true },
        { value: "b", selected: false },
      ]),
      [
        {
          discriminator: "a",
          parameters: [intParam("x", 1)],
          is_default_when: true,
        },
      ],
    );
    const result = expandToolStateDefaults([cond], {
      cond: { which: "a", __current_case__: 0, custom_bookkeeping: "stay" },
    });
    expect(result.cond).toMatchObject({
      which: "a",
      x: 1,
      __current_case__: 0,
      custom_bookkeeping: "stay",
    });
  });

  it("data inputs not seeded with RuntimeValue or null", () => {
    const result = expandToolStateDefaults([dataParam("d")], {});
    expect("d" in result).toBe(false);
  });
});
