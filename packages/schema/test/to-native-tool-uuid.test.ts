/**
 * Regression tests for tool_uuid emission in toNative (issue #147).
 *
 * tool_uuid is a reference to a dynamic / inline-defined (user) tool, not a
 * workflow-step identifier. Shed tools must NOT carry the step uuid as their
 * tool_uuid — Galaxy's importer would try to resolve a tool by that uuid and
 * abort the whole import with ObjectNotFound.
 */

import { describe, it, expect } from "vitest";
import { toNative } from "../src/workflow/index.js";

const STEP_UUID = "29d53567-67bd-4c7b-8fa6-abc8282e6a9f";

describe("toNative tool_uuid", () => {
  it("does not copy the step uuid onto a shed tool's tool_uuid", () => {
    const native = toNative({
      class: "GalaxyWorkflow",
      inputs: { the_input: "data" },
      outputs: {},
      steps: {
        cat: {
          tool_id: "toolshed.g2.bx.psu.edu/repos/devteam/cat/cat1/1.0.0",
          tool_version: "1.0.0",
          uuid: STEP_UUID,
          in: { input1: "the_input" },
        },
      },
    });

    const step = native.steps["1"];
    expect(step.type).toBe("tool");
    // step identity is preserved on uuid...
    expect(step.uuid).toBe(STEP_UUID);
    // ...but a shed tool carries no tool_uuid at all (not the step uuid).
    expect(step.tool_uuid).toBeUndefined();
  });

  it("emits null tool_uuid for an inline user-defined tool without a uuid", () => {
    const native = toNative({
      class: "GalaxyWorkflow",
      inputs: { the_input: "data" },
      outputs: {},
      steps: {
        my_tool: {
          run: {
            class: "GalaxyUserTool",
            id: "cat_user_defined",
            version: "0.1",
            name: "cat_user_defined",
            container: "busybox",
            shell_command: "cat '$(inputs.input1.path)' > output.txt",
            inputs: [{ name: "input1", type: "data" }],
            outputs: [{ name: "output1", type: "data", from_work_dir: "output.txt" }],
          },
          in: { input1: "the_input" },
        },
      },
    });

    const step = native.steps["1"];
    expect(step.tool_id).toBeNull();
    expect((step.tool_representation as Record<string, unknown>).class).toBe("GalaxyUserTool");
    expect(step.tool_uuid).toBeNull();
  });
});
