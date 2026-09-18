/**
 * toNative accepts either a raw Format2 doc or an already-normalized one and
 * produces the same result. The declarative corpus only ever feeds raw YAML,
 * so the pre-normalized entry point is covered here.
 *
 * Raw list-form conversion itself is covered declaratively by
 * test_to_native_list_form_* against synthetic-list-form-steps.gxwf.yml.
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

describe("toNative pre-normalized input", () => {
  it("matches raw conversion when handed a normalized workflow", () => {
    const fromRaw = toNative(LIST_FORM_WITH_DICT_IN);
    const fromNormalized = toNative(normalizedFormat2(LIST_FORM_WITH_DICT_IN));

    expect(fromNormalized.steps["1"].input_connections).toEqual(
      fromRaw.steps["1"].input_connections,
    );
  });
});
