import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";

import type { GetToolInfo } from "../src/get-tool-info.js";
import { resolveWorkflowOutputCollectionTypes } from "../src/workflow-output-types.js";

const WORKFLOW = parseYaml(
  readFileSync(new URL("./fixtures/mapped_subworkflow_outputs.gxwf.yml", import.meta.url), "utf-8"),
);

const noTools: GetToolInfo = { getToolInfo: () => undefined };

describe("resolveWorkflowOutputCollectionTypes", () => {
  it("resolves labelled outputs; omits unknown ones", () => {
    expect(resolveWorkflowOutputCollectionTypes(WORKFLOW, noTools)).toEqual(
      new Map([
        ["mapped", "list"],
        ["single", null],
        ["reads_out", "list"],
      ]),
    );
  });
});
