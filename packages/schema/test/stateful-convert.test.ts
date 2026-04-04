import { describe, it, expect } from "vitest";
import {
  convertScalarValue,
  reverseScalarValue,
  convertStateToFormat2,
  encodeStateToNative,
} from "../src/workflow/stateful-convert.js";
import type {
  ToolParameterModel,
  ConditionalParameterModel,
  RepeatParameterModel,
  SectionParameterModel,
  BooleanParameterModel,
  SelectParameterModel,
  IntegerParameterModel,
  FloatParameterModel,
  DataParameterModel,
  DataCollectionParameterModel,
  DataColumnParameterModel,
  RulesParameterModel,
  HiddenParameterModel,
  TextParameterModel,
  ColorParameterModel,
} from "../src/schema/bundle-types.js";
import type { NormalizedNativeStep } from "../src/workflow/normalized/native.js";

// --- Param factories ---

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
    value: 0.0,
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

function selectParam(name: string, options: string[], multiple = false): SelectParameterModel {
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
    multiple,
    options: options.map((v, i) => ({ label: v, value: v, selected: i === 0 })),
    validators: [],
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

function dataCollectionParam(name: string): DataCollectionParameterModel {
  return {
    name,
    parameter_type: "gx_data_collection",
    type: "data_collection",
    hidden: false,
    label: null,
    help: null,
    argument: null,
    is_dynamic: false,
    optional: false,
    collection_type: "list",
    extensions: ["data"],
    value: null,
  };
}

function dataColumnParam(name: string, multiple = false): DataColumnParameterModel {
  return {
    name,
    parameter_type: "gx_data_column",
    type: "data_column",
    hidden: false,
    label: null,
    help: null,
    argument: null,
    is_dynamic: false,
    optional: false,
    multiple,
    value: null,
  };
}

function rulesParam(name: string): RulesParameterModel {
  return {
    name,
    parameter_type: "gx_rules",
    type: "rules",
    hidden: false,
    label: null,
    help: null,
    argument: null,
    is_dynamic: false,
    optional: false,
  };
}

function hiddenParam(name: string): HiddenParameterModel {
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
    value: null,
    validators: [],
  };
}

function colorParam(name: string): ColorParameterModel {
  return {
    name,
    parameter_type: "gx_color",
    type: "color",
    hidden: false,
    label: null,
    help: null,
    argument: null,
    is_dynamic: false,
    optional: false,
    value: "#000000",
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

function repeatParam(name: string, parameters: ToolParameterModel[]): RepeatParameterModel {
  return {
    name,
    parameter_type: "gx_repeat",
    hidden: false,
    label: null,
    help: null,
    argument: null,
    is_dynamic: false,
    parameters,
    min: null,
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

/** Minimal NormalizedNativeStep for testing. */
function nativeStep(
  toolState: Record<string, unknown>,
  opts?: {
    inputConnections?: Record<string, readonly unknown[]>;
    connectedPaths?: string[];
  },
): NormalizedNativeStep {
  return {
    id: 1,
    type: "tool",
    tool_id: "test_tool",
    tool_version: "1.0",
    tool_state: toolState,
    input_connections: opts?.inputConnections ?? {},
    connected_paths: new Set(opts?.connectedPaths ?? []),
    post_job_actions: {},
    inputs: [],
    outputs: [],
    workflow_outputs: [],
  } as unknown as NormalizedNativeStep;
}

// --- convertScalarValue tests ---

describe("convertScalarValue", () => {
  describe("gx_integer", () => {
    it("converts string to number", () => {
      expect(convertScalarValue(intParam("n"), "42")).toBe(42);
    });

    it("preserves number", () => {
      expect(convertScalarValue(intParam("n"), 42)).toBe(42);
    });

    it("preserves null", () => {
      expect(convertScalarValue(intParam("n"), null)).toBeNull();
    });

    it("preserves non-numeric string", () => {
      expect(convertScalarValue(intParam("n"), "abc")).toBe("abc");
    });

    it("converts negative string", () => {
      expect(convertScalarValue(intParam("n"), "-5")).toBe(-5);
    });
  });

  describe("gx_float", () => {
    it("converts string to number", () => {
      expect(convertScalarValue(floatParam("f"), "3.14")).toBe(3.14);
    });

    it("preserves number", () => {
      expect(convertScalarValue(floatParam("f"), 3.14)).toBe(3.14);
    });

    it("converts integer string", () => {
      expect(convertScalarValue(floatParam("f"), "42")).toBe(42);
    });
  });

  describe("gx_boolean", () => {
    it("converts string 'true' to boolean", () => {
      expect(convertScalarValue(boolParam("b"), "true")).toBe(true);
    });

    it("converts string 'false' to boolean", () => {
      expect(convertScalarValue(boolParam("b"), "false")).toBe(false);
    });

    it("converts string 'True' (case insensitive)", () => {
      expect(convertScalarValue(boolParam("b"), "True")).toBe(true);
    });

    it("preserves boolean", () => {
      expect(convertScalarValue(boolParam("b"), true)).toBe(true);
    });
  });

  describe("gx_select (multiple)", () => {
    it("splits comma-delimited string to array", () => {
      expect(convertScalarValue(selectParam("s", ["a", "b", "c"], true), "a,b,c")).toEqual([
        "a",
        "b",
        "c",
      ]);
    });

    it("handles single value string", () => {
      expect(convertScalarValue(selectParam("s", ["a"], true), "a")).toEqual(["a"]);
    });

    it("handles empty string", () => {
      expect(convertScalarValue(selectParam("s", [], true), "")).toEqual([]);
    });

    it("preserves existing array", () => {
      expect(convertScalarValue(selectParam("s", ["a", "b"], true), ["a", "b"])).toEqual([
        "a",
        "b",
      ]);
    });
  });

  describe("gx_select (single)", () => {
    it("passes through string value", () => {
      expect(convertScalarValue(selectParam("s", ["a", "b"]), "a")).toBe("a");
    });
  });

  describe("gx_data_column (single)", () => {
    it("converts string to number", () => {
      expect(convertScalarValue(dataColumnParam("c"), "3")).toBe(3);
    });

    it("preserves number", () => {
      expect(convertScalarValue(dataColumnParam("c"), 3)).toBe(3);
    });
  });

  describe("gx_data_column (multiple)", () => {
    it("converts comma-delimited string to number array", () => {
      expect(convertScalarValue(dataColumnParam("c", true), "0,1,2")).toEqual([0, 1, 2]);
    });

    it("preserves existing array, coercing to numbers", () => {
      expect(convertScalarValue(dataColumnParam("c", true), ["0", "1"])).toEqual([0, 1]);
    });
  });

  describe("passthrough types", () => {
    it("passes through text", () => {
      expect(convertScalarValue(textParam("t"), "hello")).toBe("hello");
    });

    it("passes through color", () => {
      expect(convertScalarValue(colorParam("c"), "#ff0000")).toBe("#ff0000");
    });

    it("passes through hidden", () => {
      expect(convertScalarValue(hiddenParam("h"), "secret")).toBe("secret");
    });
  });
});

// --- reverseScalarValue tests ---

describe("reverseScalarValue", () => {
  describe("gx_select (multiple)", () => {
    it("coerces array elements to strings", () => {
      expect(reverseScalarValue(selectParam("s", ["a", "b"], true), ["a", "b"])).toEqual([
        "a",
        "b",
      ]);
    });

    it("passes through non-array", () => {
      expect(reverseScalarValue(selectParam("s", ["a"], true), "a")).toBe("a");
    });
  });

  describe("gx_data_column (single)", () => {
    it("coerces number to string", () => {
      expect(reverseScalarValue(dataColumnParam("c"), 3)).toBe("3");
    });
  });

  describe("gx_data_column (multiple)", () => {
    it("coerces number array to string array", () => {
      expect(reverseScalarValue(dataColumnParam("c", true), [0, 1, 2])).toEqual(["0", "1", "2"]);
    });
  });

  describe("passthrough", () => {
    it("passes through integer", () => {
      expect(reverseScalarValue(intParam("n"), 42)).toBe(42);
    });

    it("passes through boolean", () => {
      expect(reverseScalarValue(boolParam("b"), true)).toBe(true);
    });

    it("passes through text", () => {
      expect(reverseScalarValue(textParam("t"), "hello")).toBe("hello");
    });
  });
});

// --- Round-trip scalar coercion ---

describe("scalar coercion round-trip", () => {
  it("integer: string → number → number (preserves semantics)", () => {
    const param = intParam("n");
    const format2 = convertScalarValue(param, "42");
    const native = reverseScalarValue(param, format2);
    expect(native).toBe(42); // number, not string — but semantically equivalent
  });

  it("multi-select: string → array → string array", () => {
    const param = selectParam("s", ["a", "b", "c"], true);
    const format2 = convertScalarValue(param, "a,b");
    expect(format2).toEqual(["a", "b"]);
    const native = reverseScalarValue(param, format2);
    expect(native).toEqual(["a", "b"]);
  });

  it("data_column: string → number → string", () => {
    const param = dataColumnParam("c");
    const format2 = convertScalarValue(param, "3");
    expect(format2).toBe(3);
    const native = reverseScalarValue(param, format2);
    expect(native).toBe("3");
  });
});

// --- convertStateToFormat2 tests ---

describe("convertStateToFormat2", () => {
  it("coerces scalar values", () => {
    const inputs = [intParam("num"), textParam("label")];
    const step = nativeStep({ num: "42", label: "test" });
    const result = convertStateToFormat2(step, inputs);
    expect(result.state).toEqual({ num: 42, label: "test" });
    expect(result.in).toEqual({});
  });

  it("skips null values", () => {
    const inputs = [textParam("a"), textParam("b")];
    const step = nativeStep({ a: "keep", b: null });
    const result = convertStateToFormat2(step, inputs);
    expect(result.state).toEqual({ a: "keep" });
  });

  it('skips "null" string values', () => {
    const inputs = [textParam("a")];
    const step = nativeStep({ a: "null" });
    const result = convertStateToFormat2(step, inputs);
    expect(result.state).toEqual({});
  });

  it("skips data parameters", () => {
    const inputs = [dataParam("input1"), textParam("label")];
    const step = nativeStep({ input1: { __class__: "ConnectedValue" }, label: "test" });
    const result = convertStateToFormat2(step, inputs);
    expect(result.state).toEqual({ label: "test" });
    expect("input1" in result.state).toBe(false);
  });

  it("skips data_collection parameters", () => {
    const inputs = [dataCollectionParam("collection1"), textParam("label")];
    const step = nativeStep({ collection1: null, label: "test" });
    const result = convertStateToFormat2(step, inputs);
    expect(result.state).toEqual({ label: "test" });
  });

  it("records RuntimeValue data params in `in` block", () => {
    const inputs = [dataParam("input1")];
    const step = nativeStep({ input1: { __class__: "RuntimeValue" } });
    const result = convertStateToFormat2(step, inputs);
    expect(result.state).toEqual({});
    expect(result.in).toEqual({ input1: "runtime_value" });
  });

  it("records RuntimeValue scalar params in `in` block", () => {
    const inputs = [textParam("query")];
    const step = nativeStep({ query: { __class__: "RuntimeValue" } });
    const result = convertStateToFormat2(step, inputs);
    expect(result.state).toEqual({});
    expect(result.in).toEqual({ query: "runtime_value" });
  });

  it("skips ConnectedValue markers from state", () => {
    const inputs = [textParam("input1")];
    const step = nativeStep({ input1: { __class__: "ConnectedValue" } });
    const result = convertStateToFormat2(step, inputs);
    expect(result.state).toEqual({});
  });

  it("parses gx_rules JSON string", () => {
    const inputs = [rulesParam("rules")];
    const rulesJson = JSON.stringify({ rules: [{ type: "add_column_metadata" }] });
    const step = nativeStep({ rules: rulesJson });
    const result = convertStateToFormat2(step, inputs);
    expect(result.state.rules).toEqual({ rules: [{ type: "add_column_metadata" }] });
  });

  it("skips null gx_rules", () => {
    const inputs = [rulesParam("rules")];
    const step = nativeStep({ rules: null });
    const result = convertStateToFormat2(step, inputs);
    expect(result.state).toEqual({});
  });

  it("handles conditional with scalar coercion", () => {
    const cond = conditionalParam("cond", boolParam("advanced"), [
      { discriminator: true, parameters: [intParam("threshold")], is_default_when: false },
      { discriminator: false, parameters: [], is_default_when: true },
    ]);
    const step = nativeStep({ cond: { advanced: true, threshold: "10" } });
    const result = convertStateToFormat2(step, [cond]);
    expect(result.state).toEqual({ cond: { advanced: true, threshold: 10 } });
  });

  it("handles repeat with scalar coercion", () => {
    const repeat = repeatParam("items", [intParam("count")]);
    const step = nativeStep({ items: [{ count: "5" }, { count: "10" }] });
    const result = convertStateToFormat2(step, [repeat]);
    expect(result.state).toEqual({ items: [{ count: 5 }, { count: 10 }] });
  });

  it("handles section with scalar coercion", () => {
    const section = sectionParam("opts", [floatParam("rate")]);
    const step = nativeStep({ opts: { rate: "0.01" } });
    const result = convertStateToFormat2(step, [section]);
    expect(result.state).toEqual({ opts: { rate: 0.01 } });
  });

  it("strips bookkeeping keys", () => {
    const inputs = [textParam("input1")];
    const step = nativeStep({
      input1: "val",
      __current_case__: 0,
      __page__: 1,
    });
    const result = convertStateToFormat2(step, inputs);
    expect(result.state).toEqual({ input1: "val" });
  });
});

// --- encodeStateToNative tests ---

describe("encodeStateToNative", () => {
  it("reverse-coerces multi-select arrays to string arrays", () => {
    const inputs = [selectParam("method", ["a", "b"], true)];
    const state = { method: ["a", "b"] };
    const result = encodeStateToNative(inputs, state);
    expect(result).toEqual({ method: ["a", "b"] });
  });

  it("reverse-coerces data_column number to string", () => {
    const inputs = [dataColumnParam("col")];
    const state = { col: 3 };
    const result = encodeStateToNative(inputs, state);
    expect(result).toEqual({ col: "3" });
  });

  it("passes through scalar types unchanged", () => {
    const inputs = [intParam("num"), textParam("label"), boolParam("flag")];
    const state = { num: 42, label: "test", flag: true };
    const result = encodeStateToNative(inputs, state);
    expect(result).toEqual({ num: 42, label: "test", flag: true });
  });

  it("handles nested structures", () => {
    const section = sectionParam("opts", [dataColumnParam("col", true)]);
    const state = { opts: { col: [0, 1, 2] } };
    const result = encodeStateToNative([section], state);
    expect(result).toEqual({ opts: { col: ["0", "1", "2"] } });
  });
});
