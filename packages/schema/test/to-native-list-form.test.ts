/**
 * Regression tests for list-form Format2 workflows reaching toNative.
 *
 * gxformat2 lets `inputs`/`steps` be lists *and* lets a step's `in`/`out` be
 * dicts. toNative used to sniff the top-level shape to decide whether a
 * workflow was already normalized, so that combination skipped normalization
 * and blew up with "step.in is not iterable" inside connection extraction.
 */

import { describe, it, expect } from "vitest";
import { toNative, normalizedFormat2 } from "../src/workflow/index.js";

const LIST_FORM_WITH_DICT_IN = {
  class: "GalaxyWorkflow",
  inputs: [{ id: "the_input", type: "data" }],
  outputs: [],
  steps: [
    {
      id: "filter",
      tool_id: "Filter1",
      tool_version: "1.1.1",
      in: { input: "the_input" },
      out: [{ id: "out_file1" }],
    },
  ],
};

const MAP_FORM_EQUIVALENT = {
  class: "GalaxyWorkflow",
  inputs: { the_input: "data" },
  outputs: {},
  steps: {
    filter: {
      tool_id: "Filter1",
      tool_version: "1.1.1",
      in: { input: "the_input" },
      out: [{ id: "out_file1" }],
    },
  },
};

describe("toNative list-form Format2", () => {
  it("converts list-form inputs/steps carrying dict-form step inputs", () => {
    const native = toNative(LIST_FORM_WITH_DICT_IN);

    const step = native.steps["1"];
    expect(step.type).toBe("tool");
    expect(step.input_connections).toEqual({ input: [{ id: 0, output_name: "output" }] });
  });

  it("wires the same connections whichever spelling the workflow uses", () => {
    const fromList = toNative(LIST_FORM_WITH_DICT_IN);
    const fromMap = toNative(MAP_FORM_EQUIVALENT);

    expect(fromList.steps["1"].input_connections).toEqual(fromMap.steps["1"].input_connections);
  });

  it("is idempotent under an explicit normalize", () => {
    const fromRaw = toNative(LIST_FORM_WITH_DICT_IN);
    const fromNormalized = toNative(normalizedFormat2(LIST_FORM_WITH_DICT_IN));

    expect(fromNormalized.steps["1"].input_connections).toEqual(
      fromRaw.steps["1"].input_connections,
    );
  });
});
