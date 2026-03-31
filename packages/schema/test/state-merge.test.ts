import { describe, it, expect } from "vitest";
import {
  flatStatePath,
  keysStartingWith,
  repeatInputsToArray,
  selectWhichWhen,
  injectConnectionsIntoState,
} from "../src/workflow/state-merge.js";
import type {
  ToolParameterModel,
  ConditionalParameterModel,
  RepeatParameterModel,
  SectionParameterModel,
  BooleanParameterModel,
  SelectParameterModel,
} from "../src/schema/bundle-types.js";

// --- Helper factories ---

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

function dataParam(name: string): ToolParameterModel {
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

// --- Tests ---

describe("flatStatePath", () => {
  it("returns name when no prefix", () => {
    expect(flatStatePath("input1")).toBe("input1");
  });

  it("returns prefix|name with prefix", () => {
    expect(flatStatePath("input1", "cond")).toBe("cond|input1");
  });
});

describe("keysStartingWith", () => {
  it("filters keys by prefix", () => {
    const map = { "a|x": 1, "a|y": 2, "b|z": 3 };
    expect(keysStartingWith(map, "a|")).toEqual({ "a|x": 1, "a|y": 2 });
  });

  it("returns empty for no matches", () => {
    expect(keysStartingWith({ x: 1 }, "z")).toEqual({});
  });
});

describe("repeatInputsToArray", () => {
  it("splits flat connection keys into per-instance arrays", () => {
    const connections = {
      "queries_0|input": "step1/output",
      "queries_1|input": "step2/output",
    };
    const result = repeatInputsToArray("queries", connections);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ "queries_0|input": "step1/output" });
    expect(result[1]).toEqual({ "queries_1|input": "step2/output" });
  });

  it("returns empty array for no matching keys", () => {
    expect(repeatInputsToArray("queries", { other: "x" })).toEqual([]);
  });

  it("handles gaps in instance indices", () => {
    const connections = {
      "queries_0|input": "a",
      "queries_2|input": "b",
    };
    const result = repeatInputsToArray("queries", connections);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ "queries_0|input": "a" });
    expect(result[1]).toEqual({});
    expect(result[2]).toEqual({ "queries_2|input": "b" });
  });
});

describe("selectWhichWhen", () => {
  it("matches boolean true", () => {
    const cond = conditionalParam("cond", boolParam("test"), [
      { discriminator: true, parameters: [textParam("a")], is_default_when: false },
      { discriminator: false, parameters: [textParam("b")], is_default_when: true },
    ]);
    const when = selectWhichWhen(cond, { test: true });
    expect(when?.discriminator).toBe(true);
  });

  it("matches boolean string 'true'", () => {
    const cond = conditionalParam("cond", boolParam("test"), [
      { discriminator: true, parameters: [], is_default_when: false },
      { discriminator: false, parameters: [], is_default_when: true },
    ]);
    const when = selectWhichWhen(cond, { test: "true" });
    expect(when?.discriminator).toBe(true);
  });

  it("matches select discriminator", () => {
    const cond = conditionalParam("cond", selectParam("method", ["blast", "diamond"]), [
      { discriminator: "blast", parameters: [textParam("evalue")], is_default_when: true },
      { discriminator: "diamond", parameters: [textParam("sensitivity")], is_default_when: false },
    ]);
    const when = selectWhichWhen(cond, { method: "diamond" });
    expect(when?.discriminator).toBe("diamond");
  });

  it("falls back to default when", () => {
    const cond = conditionalParam("cond", selectParam("method", ["a", "b"]), [
      { discriminator: "a", parameters: [], is_default_when: true },
      { discriminator: "b", parameters: [], is_default_when: false },
    ]);
    const when = selectWhichWhen(cond, { method: "unknown" });
    expect(when?.discriminator).toBe("a");
  });

  it("returns null when no match and no default", () => {
    const cond = conditionalParam("cond", selectParam("method", ["a"]), [
      { discriminator: "a", parameters: [], is_default_when: false },
    ]);
    const when = selectWhichWhen(cond, { method: "z" });
    expect(when).toBeNull();
  });

  it("falls back to default when test value is missing from state", () => {
    const cond = conditionalParam("cond", boolParam("test"), [
      { discriminator: true, parameters: [], is_default_when: false },
      { discriminator: false, parameters: [], is_default_when: true },
    ]);
    const when = selectWhichWhen(cond, {});
    expect(when?.discriminator).toBe(false);
  });

  it("matches boolean string 'False' (case insensitive)", () => {
    const cond = conditionalParam("cond", boolParam("test"), [
      { discriminator: true, parameters: [], is_default_when: false },
      { discriminator: false, parameters: [], is_default_when: true },
    ]);
    const when = selectWhichWhen(cond, { test: "False" });
    expect(when?.discriminator).toBe(false);
  });
});

describe("injectConnectionsIntoState", () => {
  it("injects ConnectedValue for leaf parameters", () => {
    const inputs = [textParam("input1"), dataParam("input2")];
    const state: Record<string, unknown> = { input1: "hello" };
    const connections = { input2: ["step0/output"] };
    const remaining = injectConnectionsIntoState(inputs, state, connections);

    expect(state.input1).toBe("hello");
    expect(state.input2).toEqual({ __class__: "ConnectedValue" });
    expect(remaining).toEqual({});
  });

  it("leaves state unchanged for unconnected params", () => {
    const inputs = [textParam("input1")];
    const state: Record<string, unknown> = { input1: "hello" };
    const connections = {};
    injectConnectionsIntoState(inputs, state, connections);
    expect(state.input1).toBe("hello");
  });

  it("returns unmatched connections", () => {
    const inputs = [textParam("input1")];
    const state: Record<string, unknown> = {};
    const connections = { nonexistent: ["step0/output"] };
    const remaining = injectConnectionsIntoState(inputs, state, connections);
    expect(remaining).toEqual({ nonexistent: ["step0/output"] });
  });

  it("handles conditional parameters", () => {
    const cond = conditionalParam("cond", selectParam("method", ["blast", "diamond"]), [
      { discriminator: "blast", parameters: [dataParam("blast_db")], is_default_when: true },
      { discriminator: "diamond", parameters: [dataParam("diamond_db")], is_default_when: false },
    ]);
    const inputs: ToolParameterModel[] = [cond];
    const state: Record<string, unknown> = { cond: { method: "blast" } };
    const connections = { "cond|blast_db": ["step0/output"] };
    const remaining = injectConnectionsIntoState(inputs, state, connections);

    expect((state.cond as Record<string, unknown>).blast_db).toEqual({ __class__: "ConnectedValue" });
    expect(remaining).toEqual({});
  });

  it("handles repeat parameters", () => {
    const repeat = repeatParam("queries", [dataParam("input")]);
    const inputs: ToolParameterModel[] = [repeat];
    const state: Record<string, unknown> = { queries: [{}] };
    const connections = {
      "queries_0|input": ["step0/output"],
      "queries_1|input": ["step1/output"],
    };
    const remaining = injectConnectionsIntoState(inputs, state, connections);

    const queriesState = state.queries as Record<string, unknown>[];
    expect(queriesState).toHaveLength(2);
    expect(queriesState[0].input).toEqual({ __class__: "ConnectedValue" });
    expect(queriesState[1].input).toEqual({ __class__: "ConnectedValue" });
    expect(remaining).toEqual({});
  });

  it("handles section parameters", () => {
    const section = sectionParam("advanced", [dataParam("ref_file"), textParam("extra")]);
    const inputs: ToolParameterModel[] = [section];
    const state: Record<string, unknown> = { advanced: { extra: "foo" } };
    const connections = { "advanced|ref_file": ["step0/output"] };
    const remaining = injectConnectionsIntoState(inputs, state, connections);

    const adv = state.advanced as Record<string, unknown>;
    expect(adv.ref_file).toEqual({ __class__: "ConnectedValue" });
    expect(adv.extra).toBe("foo");
    expect(remaining).toEqual({});
  });

  it("handles nested conditional inside repeat", () => {
    const cond = conditionalParam("cond", boolParam("use_ref"), [
      { discriminator: true, parameters: [dataParam("ref")], is_default_when: false },
      { discriminator: false, parameters: [], is_default_when: true },
    ]);
    const repeat = repeatParam("queries", [dataParam("input"), cond]);
    const inputs: ToolParameterModel[] = [repeat];

    const state: Record<string, unknown> = {
      queries: [{ cond: { use_ref: true } }],
    };
    const connections = {
      "queries_0|input": ["step0/output"],
      "queries_0|cond|ref": ["step1/output"],
    };
    const remaining = injectConnectionsIntoState(inputs, state, connections);

    const q0 = (state.queries as Record<string, unknown>[])[0];
    expect(q0.input).toEqual({ __class__: "ConnectedValue" });
    expect((q0.cond as Record<string, unknown>).ref).toEqual({ __class__: "ConnectedValue" });
    expect(remaining).toEqual({});
  });

  it("creates missing container state entries", () => {
    const section = sectionParam("advanced", [textParam("option")]);
    const inputs: ToolParameterModel[] = [section];
    const state: Record<string, unknown> = {};
    const connections = { "advanced|option": ["step0/output"] };

    injectConnectionsIntoState(inputs, state, connections);
    expect(state.advanced).toBeDefined();
    expect((state.advanced as Record<string, unknown>).option).toEqual({ __class__: "ConnectedValue" });
  });
});
