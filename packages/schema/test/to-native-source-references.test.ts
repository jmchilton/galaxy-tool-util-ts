import { describe, it, expect } from "vitest";

import { lintFormat2, toNative, UnresolvedSourceError } from "../src/workflow/index.js";

// galaxy-tool-util-ts#229: a step whose label differs from its id (map key),
// referenced by that id. Sources resolve by label, as in gxformat2.
function labelShadowsId(source = "first/out_file1"): Record<string, unknown> {
  return {
    class: "GalaxyWorkflow",
    inputs: { reads: { type: "data" } },
    outputs: { out: { outputSource: "second/out_file1" } },
    steps: {
      first: {
        label: "First concatenation",
        tool_id: "cat1",
        tool_version: "1.0.0",
        in: { input1: "reads" },
      },
      second: { tool_id: "cat1", tool_version: "1.0.0", in: { input1: source } },
    },
  };
}

function lintErrors(wf: Record<string, unknown>): string[] {
  return lintFormat2(wf).errors.map((e) => e.message);
}

describe("toNative source references", () => {
  it("rejects a source that names a labelled step by its id, and says which label to use", () => {
    let error: unknown;
    try {
      toNative(labelShadowsId());
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(UnresolvedSourceError);
    expect((error as Error).message).toBe(
      "Cannot resolve 'first/out_file1': step 'first' has the label 'First concatenation', " +
        "and sources resolve by label. Reference it as 'First concatenation/out_file1', " +
        "or set its label to 'first'",
    );
  });

  it("resolves the same source by the step's label", () => {
    const native = toNative(labelShadowsId("First concatenation/out_file1"));
    expect(native.steps["2"]?.input_connections).toEqual({
      input1: [{ id: 1, output_name: "out_file1" }],
    });
  });

  it("names a source whose step does not exist", () => {
    expect(() => toNative(labelShadowsId("missing/out_file1"))).toThrow(
      "Cannot resolve 'missing/out_file1': no step or input has the label 'missing'",
    );
  });

  it("rejects an outputSource that names a labelled step by its id", () => {
    const wf = labelShadowsId("First concatenation/out_file1");
    wf.outputs = { out: { outputSource: "first/out_file1" } };
    expect(() => toNative(wf)).toThrow(/step 'first' has the label 'First concatenation'/);
  });

  it("still resolves numeric step ids", () => {
    const native = toNative(labelShadowsId("1/out_file1"));
    expect(native.steps["2"]?.input_connections).toEqual({
      input1: [{ id: 1, output_name: "out_file1" }],
    });
  });

  it("checks sources inside a subworkflow against that subworkflow's labels", () => {
    const parent = {
      class: "GalaxyWorkflow",
      inputs: { outer: "data" },
      outputs: {},
      steps: { nested: { run: labelShadowsId(), in: { reads: "outer" } } },
    };
    expect(() => toNative(parent)).toThrow(UnresolvedSourceError);
  });
});

describe("toNative source references: other forms", () => {
  it("names a `$step` source as written, without the internal port name", () => {
    const wf = labelShadowsId("First concatenation/out_file1");
    (wf.steps as Record<string, Record<string, unknown>>).second.in = { $step: "first" };
    expect(() => toNative(wf)).toThrow(
      "Cannot resolve 'first': step 'first' has the label 'First concatenation', and sources " +
        "resolve by label. Reference it as 'First concatenation', or set its label to 'first'",
    );
  });

  it("connects an input that is itself named `runtime_value`", () => {
    const wf = labelShadowsId("runtime_value");
    wf.inputs = { runtime_value: { type: "data" } };
    (wf.steps as Record<string, Record<string, unknown>>).first.in = { input1: "runtime_value" };
    const native = toNative(wf);
    expect(native.steps["1"]?.input_connections).toEqual({
      input1: [{ id: 0, output_name: "output" }],
    });
  });

  it("says which id to use for a source naming an input by its label", () => {
    const wf = labelShadowsId("First concatenation/out_file1");
    wf.inputs = [{ id: "reads", label: "Reads In", type: "data" }];
    (wf.steps as Record<string, Record<string, unknown>>).first.in = { input1: "Reads In" };
    expect(() => toNative(wf)).toThrow(
      "Cannot resolve 'Reads In': input 'reads' has the label 'Reads In', and sources resolve " +
        "inputs by id. Reference it as 'reads'",
    );
  });

  it("leaves the connection out in `drop` mode", () => {
    const native = toNative(labelShadowsId(), { unresolvedSources: "drop" });
    expect(native.steps["2"]?.input_connections).toEqual({});
  });
});

describe("lintFormat2 source references", () => {
  it("reports a step source that names a labelled step by its id", () => {
    expect(lintErrors(labelShadowsId())).toContain(
      "Step 'second' input 'input1': Cannot resolve 'first/out_file1': step 'first' has the " +
        "label 'First concatenation', and sources resolve by label. Reference it as " +
        "'First concatenation/out_file1', or set its label to 'first'",
    );
  });

  it("reports an outputSource that names a labelled step by its id", () => {
    const wf = labelShadowsId("First concatenation/out_file1");
    wf.outputs = { out: { outputSource: "first/out_file1" } };
    expect(lintErrors(wf)).toEqual([
      "Output 'out': Cannot resolve 'first/out_file1': step 'first' has the label " +
        "'First concatenation', and sources resolve by label. Reference it as " +
        "'First concatenation/out_file1', or set its label to 'first'",
    ]);
  });

  it("accepts sources by label, by numeric id and the runtime placeholder", () => {
    for (const source of ["First concatenation/out_file1", "1/out_file1", "runtime_value"]) {
      expect(lintErrors(labelShadowsId(source))).toEqual([]);
    }
  });
});
