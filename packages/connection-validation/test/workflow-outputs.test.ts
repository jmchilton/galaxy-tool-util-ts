import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";

import type { GetToolInfo } from "../src/get-tool-info.js";
import { resolveWorkflowOutputs } from "../src/workflow-outputs.js";

const noTools: GetToolInfo = { getToolInfo: () => undefined };

function catTool(id: string): Record<string, unknown> {
  return {
    class: "GalaxyUserTool",
    id,
    name: id,
    version: "0.1",
    container: "busybox",
    shell_command: "cat '$(inputs.input1.path)' > output.txt",
    inputs: [{ name: "input1", type: "data", format: "txt" }],
    outputs: [{ name: "output1", type: "data", format: "txt", from_work_dir: "output.txt" }],
  };
}

describe("resolveWorkflowOutputs", () => {
  it("resolves shape and fixed format through subworkflows and map-over", () => {
    const workflow = parseYaml(
      readFileSync(
        new URL("./fixtures/mapped_subworkflow_outputs.gxwf.yml", import.meta.url),
        "utf-8",
      ),
    );
    expect(resolveWorkflowOutputs(workflow, noTools)).toEqual(
      new Map([
        ["mapped", { kind: "collection", collectionType: "list", format: "txt" }],
        ["single", { kind: "dataset", format: "txt" }],
        ["reads_out", { kind: "collection", collectionType: "list" }],
        ["unresolved", {}],
      ]),
    );
  });

  it("gives no format to outputs of a step that can be skipped, or downstream of one", () => {
    const workflow = {
      class: "GalaxyWorkflow",
      inputs: { genome: "data", when: "boolean" },
      outputs: {
        conditional: { outputSource: "maybe/output1" },
        downstream: { outputSource: "after/output1" },
        always: { outputSource: "always/output1" },
      },
      steps: {
        maybe: {
          run: catTool("maybe"),
          in: { input1: "genome", when: "when" },
          when: "$(inputs.when)",
        },
        after: { run: catTool("after"), in: { input1: "maybe/output1" } },
        always: { run: catTool("always"), in: { input1: "genome" } },
      },
    };
    const outputs = resolveWorkflowOutputs(workflow, noTools);
    expect(outputs.get("conditional")).toEqual({ kind: "dataset" });
    expect(outputs.get("downstream")).toEqual({ kind: "dataset" });
    expect(outputs.get("always")).toEqual({ kind: "dataset", format: "txt" });
  });

  // Galaxy's lib/galaxy_test/workflow/pick_value_skip_pja: the skipped output is expression.json.
  it("follows connections the graph can't type, such as pick_value's", () => {
    const workflow = {
      class: "GalaxyWorkflow",
      inputs: { genome: "data", when: "boolean" },
      outputs: { picked: { outputSource: "pick/output" } },
      steps: {
        maybe: {
          run: catTool("maybe"),
          in: { input1: "genome", when: "when" },
          when: "$(inputs.when)",
        },
        pick: {
          type: "pick_value",
          in: { input_0: "maybe/output1" },
          state: { mode: "first_or_skip" },
          out: { output: { change_datatype: "txt" } },
        },
      },
    };
    expect(resolveWorkflowOutputs(workflow, noTools).get("picked")?.format).toBeUndefined();
  });

  it("leaves outputs downstream of an invalid connection unshaped; others still resolve", () => {
    const workflow = {
      class: "GalaxyWorkflow",
      inputs: {
        reads: { type: "collection", collection_type: "list" },
        genome: "data",
      },
      outputs: {
        broken: { outputSource: "pairs/inner_out" },
        after_broken: { outputSource: "after/output1" },
        fine: { outputSource: "fine/output1" },
      },
      steps: {
        pairs: {
          run: {
            class: "GalaxyWorkflow",
            inputs: { inner_in: { type: "collection", collection_type: "paired" } },
            outputs: { inner_out: { outputSource: "inner_in" } },
            steps: {},
          },
          in: { inner_in: "reads" },
        },
        after: { run: catTool("after"), in: { input1: "pairs/inner_out" } },
        fine: { run: catTool("fine"), in: { input1: "reads" } },
      },
    };
    const outputs = resolveWorkflowOutputs(workflow, noTools);
    expect(outputs.get("broken")).toEqual({ kind: "collection" });
    expect(outputs.get("after_broken")).toEqual({ format: "txt" });
    expect(outputs.get("fine")).toEqual({
      kind: "collection",
      collectionType: "list",
      format: "txt",
    });
  });

  it("resolves nothing for a label used twice", () => {
    const workflow = {
      a_galaxy_workflow: "true",
      steps: {
        0: { type: "data_input", workflow_outputs: [{ label: "out", output_name: "output" }] },
        1: { type: "data_input", workflow_outputs: [{ label: "out", output_name: "output" }] },
      },
    };
    expect(resolveWorkflowOutputs(workflow, noTools)).toEqual(new Map([["out", {}]]));
  });
});
