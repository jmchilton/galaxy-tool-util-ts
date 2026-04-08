import { describe, it, expect } from "vitest";
import {
  walkNativeState,
  walkFormat2State,
  SKIP_VALUE,
  UnknownKeyError,
} from "../src/workflow/walker.js";
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
} from "../src/schema/bundle-types.js";

// --- Helper factories (shared with state-merge.test.ts pattern) ---

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

/** Identity callback — returns value as-is. */
const identity = (_toolInput: ToolParameterModel, value: unknown, _path: string) => value;

/** Collecting callback — records (toolInput, value, path) triples. */
function collectingCallback() {
  const calls: { toolInput: ToolParameterModel; value: unknown; statePath: string }[] = [];
  const callback = (toolInput: ToolParameterModel, value: unknown, statePath: string) => {
    calls.push({ toolInput, value, statePath });
    return value;
  };
  return { calls, callback };
}

// --- walkNativeState tests ---

describe("walkNativeState", () => {
  describe("leaf parameters", () => {
    it("passes correct (toolInput, value, statePath) to callback", () => {
      const inputs = [textParam("input1"), intParam("num")];
      const state = { input1: "hello", num: 42 };
      const { calls, callback } = collectingCallback();

      walkNativeState({}, inputs, state, callback);

      expect(calls).toHaveLength(2);
      expect(calls[0].toolInput.name).toBe("input1");
      expect(calls[0].value).toBe("hello");
      expect(calls[0].statePath).toBe("input1");
      expect(calls[1].toolInput.name).toBe("num");
      expect(calls[1].value).toBe(42);
      expect(calls[1].statePath).toBe("num");
    });

    it("builds output dict from callback return values", () => {
      const inputs = [textParam("input1")];
      const state = { input1: "hello" };
      const result = walkNativeState({}, inputs, state, (_ti, value) => {
        return `modified_${value}`;
      });
      expect(result).toEqual({ input1: "modified_hello" });
    });

    it("handles undefined values for missing keys", () => {
      const inputs = [textParam("input1")];
      const state = {};
      const { calls, callback } = collectingCallback();
      walkNativeState({}, inputs, state, callback);
      expect(calls[0].value).toBeUndefined();
    });
  });

  describe("SKIP_VALUE", () => {
    it("omits values from output when callback returns SKIP_VALUE", () => {
      const inputs = [textParam("keep"), textParam("skip")];
      const state = { keep: "a", skip: "b" };
      const result = walkNativeState({}, inputs, state, (ti) => {
        return ti.name === "skip" ? SKIP_VALUE : state[ti.name];
      });
      expect(result).toEqual({ keep: "a" });
      expect("skip" in result).toBe(false);
    });
  });

  describe("bookkeeping keys", () => {
    it("strips __current_case__ and other bookkeeping keys (not passed to callback)", () => {
      const inputs = [textParam("input1")];
      const state = {
        input1: "hello",
        __current_case__: 0,
        __page__: 1,
        __index__: 2,
        __rerun_remap_job_id__: "abc",
      };
      const result = walkNativeState({}, inputs, state, identity);
      expect(result).toEqual({ input1: "hello" });
    });
  });

  describe("conditional branch selection", () => {
    it("selects correct branch based on boolean test value", () => {
      const cond = conditionalParam("cond", boolParam("use_ref"), [
        { discriminator: true, parameters: [textParam("ref_path")], is_default_when: false },
        { discriminator: false, parameters: [textParam("other")], is_default_when: true },
      ]);
      const state = { cond: { use_ref: true, ref_path: "/data/ref.fa" } };
      const { calls, callback } = collectingCallback();
      walkNativeState({}, [cond], state, callback);

      const names = calls.map((c) => c.toolInput.name);
      expect(names).toContain("use_ref");
      expect(names).toContain("ref_path");
      expect(names).not.toContain("other");
    });

    it("selects correct branch based on select test value", () => {
      const cond = conditionalParam("cond", selectParam("method", ["blast", "diamond"]), [
        { discriminator: "blast", parameters: [floatParam("evalue")], is_default_when: true },
        {
          discriminator: "diamond",
          parameters: [textParam("sensitivity")],
          is_default_when: false,
        },
      ]);
      const state = { cond: { method: "diamond", sensitivity: "more-sensitive" } };
      const result = walkNativeState({}, [cond], state, identity);

      expect(result).toEqual({ cond: { method: "diamond", sensitivity: "more-sensitive" } });
    });

    it("falls back to default when no match", () => {
      const cond = conditionalParam("cond", selectParam("method", ["a", "b"]), [
        { discriminator: "a", parameters: [textParam("opt_a")], is_default_when: true },
        { discriminator: "b", parameters: [textParam("opt_b")], is_default_when: false },
      ]);
      const state = { cond: { method: "unknown", opt_a: "val" } };
      const result = walkNativeState({}, [cond], state, identity);
      expect(result).toEqual({ cond: { method: "unknown", opt_a: "val" } });
    });

    it("provides prefixed statePath for nested params", () => {
      const cond = conditionalParam("cond", boolParam("test"), [
        { discriminator: true, parameters: [textParam("inner")], is_default_when: false },
        { discriminator: false, parameters: [], is_default_when: true },
      ]);
      const state = { cond: { test: true, inner: "val" } };
      const { calls, callback } = collectingCallback();
      walkNativeState({}, [cond], state, callback);

      const innerCall = calls.find((c) => c.toolInput.name === "inner");
      expect(innerCall?.statePath).toBe("cond|inner");
    });
  });

  describe("repeat instance expansion", () => {
    it("expands repeats from state array", () => {
      const repeat = repeatParam("queries", [textParam("input"), intParam("num")]);
      const state = {
        queries: [
          { input: "a", num: 1 },
          { input: "b", num: 2 },
        ],
      };
      const result = walkNativeState({}, [repeat], state, identity);
      expect(result).toEqual({
        queries: [
          { input: "a", num: 1 },
          { input: "b", num: 2 },
        ],
      });
    });

    it("expands repeats from inputConnections when state is empty", () => {
      const repeat = repeatParam("queries", [dataParam("input")]);
      const state = { queries: [] };
      const connections = {
        "queries_0|input": ["step0/output"],
        "queries_1|input": ["step1/output"],
      };
      const result = walkNativeState(connections, [repeat], state, identity);
      // Two instances created from connections, values are undefined (not in state)
      expect(result.queries).toHaveLength(2);
    });

    it("uses max of state array and connections for instance count", () => {
      const repeat = repeatParam("queries", [dataParam("input"), textParam("label")]);
      const state = {
        queries: [{ input: "a", label: "first" }],
      };
      const connections = {
        "queries_0|input": ["step0/output"],
        "queries_1|input": ["step1/output"],
      };
      const result = walkNativeState(connections, [repeat], state, identity);
      expect((result.queries as unknown[]).length).toBe(2);
    });

    it("provides correct statePath for repeat instances", () => {
      const repeat = repeatParam("queries", [textParam("input")]);
      const state = {
        queries: [{ input: "a" }, { input: "b" }],
      };
      const { calls, callback } = collectingCallback();
      walkNativeState({}, [repeat], state, callback);

      expect(calls[0].statePath).toBe("queries_0|input");
      expect(calls[1].statePath).toBe("queries_1|input");
    });
  });

  describe("section recursion", () => {
    it("recurses into sections", () => {
      const section = sectionParam("advanced", [textParam("opt1"), intParam("opt2")]);
      const state = { advanced: { opt1: "foo", opt2: 10 } };
      const result = walkNativeState({}, [section], state, identity);
      expect(result).toEqual({ advanced: { opt1: "foo", opt2: 10 } });
    });

    it("provides prefixed statePath for section params", () => {
      const section = sectionParam("advanced", [textParam("opt1")]);
      const state = { advanced: { opt1: "foo" } };
      const { calls, callback } = collectingCallback();
      walkNativeState({}, [section], state, callback);
      expect(calls[0].statePath).toBe("advanced|opt1");
    });

    it("handles missing section state gracefully", () => {
      const section = sectionParam("advanced", [textParam("opt1")]);
      const state = {};
      const result = walkNativeState({}, [section], state, identity);
      // opt1 is undefined, callback returns undefined, which is not SKIP_VALUE
      expect(result).toEqual({ advanced: { opt1: undefined } });
    });
  });

  describe("nested structures", () => {
    it("handles conditional inside repeat", () => {
      const cond = conditionalParam("cond", boolParam("use_ref"), [
        { discriminator: true, parameters: [textParam("ref")], is_default_when: false },
        { discriminator: false, parameters: [], is_default_when: true },
      ]);
      const repeat = repeatParam("queries", [dataParam("input"), cond]);
      const state = {
        queries: [{ input: "a", cond: { use_ref: true, ref: "/path" } }],
      };
      const { calls, callback } = collectingCallback();
      walkNativeState({}, [repeat], state, callback);

      const refCall = calls.find((c) => c.toolInput.name === "ref");
      expect(refCall?.value).toBe("/path");
      expect(refCall?.statePath).toBe("queries_0|cond|ref");
    });

    it("handles section inside conditional", () => {
      const section = sectionParam("opts", [textParam("extra")]);
      const cond = conditionalParam("cond", boolParam("advanced"), [
        { discriminator: true, parameters: [section], is_default_when: false },
        { discriminator: false, parameters: [], is_default_when: true },
      ]);
      const state = { cond: { advanced: true, opts: { extra: "val" } } };
      const { calls, callback } = collectingCallback();
      walkNativeState({}, [cond], state, callback);

      const extraCall = calls.find((c) => c.toolInput.name === "extra");
      expect(extraCall?.statePath).toBe("cond|opts|extra");
      expect(extraCall?.value).toBe("val");
    });
  });

  describe("unknown key detection", () => {
    it("throws UnknownKeyError when enabled and unknown keys present", () => {
      const inputs = [textParam("input1")];
      const state = { input1: "hello", unknown_key: "bad" };
      expect(() =>
        walkNativeState({}, inputs, state, identity, { checkUnknownKeys: true }),
      ).toThrow(UnknownKeyError);
    });

    it("does not throw for bookkeeping keys", () => {
      const inputs = [textParam("input1")];
      const state = { input1: "hello", __current_case__: 0 };
      expect(() =>
        walkNativeState({}, inputs, state, identity, { checkUnknownKeys: true }),
      ).not.toThrow();
    });

    it("does not check unknown keys by default", () => {
      const inputs = [textParam("input1")];
      const state = { input1: "hello", extra: "ignored" };
      expect(() => walkNativeState({}, inputs, state, identity)).not.toThrow();
    });
  });

  describe("string container rejection", () => {
    it("throws for string conditional state", () => {
      const cond = conditionalParam("cond", boolParam("test"), [
        { discriminator: true, parameters: [], is_default_when: true },
      ]);
      const state = { cond: '{"test": true}' };
      expect(() => walkNativeState({}, [cond], state, identity)).toThrow(
        /legacy parameter encoding/,
      );
    });

    it("throws for string repeat state", () => {
      const repeat = repeatParam("queries", [textParam("input")]);
      const state = { queries: '[{"input": "a"}]' };
      expect(() => walkNativeState({}, [repeat], state, identity)).toThrow(
        /legacy parameter encoding/,
      );
    });

    it("throws for string section state", () => {
      const section = sectionParam("advanced", [textParam("opt")]);
      const state = { advanced: '{"opt": "val"}' };
      expect(() => walkNativeState({}, [section], state, identity)).toThrow(
        /legacy parameter encoding/,
      );
    });
  });
});

// --- walkFormat2State tests ---

describe("walkFormat2State", () => {
  describe("leaf parameters", () => {
    it("passes correct (toolInput, value, statePath) to callback", () => {
      const inputs = [textParam("input1"), intParam("num")];
      const state = { input1: "hello", num: 42 };
      const { calls, callback } = collectingCallback();

      walkFormat2State(inputs, state, callback);

      expect(calls).toHaveLength(2);
      expect(calls[0].toolInput.name).toBe("input1");
      expect(calls[0].value).toBe("hello");
      expect(calls[0].statePath).toBe("input1");
    });

    it("builds output dict from callback return values", () => {
      const inputs = [textParam("a")];
      const state = { a: "val" };
      const result = walkFormat2State(inputs, state, (_ti, v) => `${v}_transformed`);
      expect(result).toEqual({ a: "val_transformed" });
    });
  });

  describe("SKIP_VALUE", () => {
    it("omits values from output", () => {
      const inputs = [textParam("keep"), textParam("skip")];
      const state = { keep: "a", skip: "b" };
      const result = walkFormat2State(inputs, state, (ti) =>
        ti.name === "skip" ? SKIP_VALUE : state[ti.name],
      );
      expect(result).toEqual({ keep: "a" });
    });
  });

  describe("conditional branch selection", () => {
    it("selects correct branch", () => {
      const cond = conditionalParam("cond", selectParam("method", ["a", "b"]), [
        { discriminator: "a", parameters: [textParam("opt_a")], is_default_when: true },
        { discriminator: "b", parameters: [textParam("opt_b")], is_default_when: false },
      ]);
      const state = { cond: { method: "b", opt_b: "val" } };
      const result = walkFormat2State([cond], state, identity);
      expect(result).toEqual({ cond: { method: "b", opt_b: "val" } });
    });
  });

  describe("repeat iteration", () => {
    it("iterates over state array instances", () => {
      const repeat = repeatParam("queries", [textParam("input")]);
      const state = { queries: [{ input: "a" }, { input: "b" }] };
      const result = walkFormat2State([repeat], state, identity);
      expect(result).toEqual({ queries: [{ input: "a" }, { input: "b" }] });
    });

    it("handles empty repeat array", () => {
      const repeat = repeatParam("queries", [textParam("input")]);
      const state = { queries: [] };
      const result = walkFormat2State([repeat], state, identity);
      // Explicit empty array preserved (valid state)
      expect(result).toEqual({ queries: [] });
    });

    it("handles missing repeat state", () => {
      const repeat = repeatParam("queries", [textParam("input")]);
      const state = {};
      const result = walkFormat2State([repeat], state, identity);
      // Absent key stays absent
      expect(result).toEqual({});
    });
  });

  describe("section recursion", () => {
    it("recurses into sections", () => {
      const section = sectionParam("advanced", [textParam("opt1")]);
      const state = { advanced: { opt1: "foo" } };
      const result = walkFormat2State([section], state, identity);
      expect(result).toEqual({ advanced: { opt1: "foo" } });
    });
  });

  describe("string container rejection", () => {
    it("throws for string conditional state", () => {
      const cond = conditionalParam("cond", boolParam("test"), [
        { discriminator: true, parameters: [], is_default_when: true },
      ]);
      expect(() => walkFormat2State([cond], { cond: '{"test":true}' }, identity)).toThrow(
        /legacy parameter encoding/,
      );
    });
  });

  describe("nested structures", () => {
    it("handles deeply nested structures", () => {
      const innerSection = sectionParam("inner", [textParam("deep")]);
      const cond = conditionalParam("cond", boolParam("toggle"), [
        { discriminator: true, parameters: [innerSection], is_default_when: false },
        { discriminator: false, parameters: [], is_default_when: true },
      ]);
      const repeat = repeatParam("items", [cond]);
      const state = {
        items: [{ cond: { toggle: true, inner: { deep: "found" } } }],
      };
      const { calls, callback } = collectingCallback();
      walkFormat2State([repeat], state, callback);

      const deepCall = calls.find((c) => c.toolInput.name === "deep");
      expect(deepCall?.value).toBe("found");
      expect(deepCall?.statePath).toBe("items_0|cond|inner|deep");
    });
  });
});
