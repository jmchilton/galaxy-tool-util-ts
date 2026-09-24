import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as S from "effect/Schema";
import * as YAML from "yaml";

import {
  NormalizedFormat2StepSchema,
  isGalaxyUserToolRun,
  normalizedFormat2,
  toFormat2,
  toNative,
} from "../src/workflow/index.js";

const FIXTURE = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures/workflows/format2/synthetic-user-defined-tool.gxwf.yml",
);

function userToolWorkflow(): Record<string, any> {
  return YAML.parse(readFileSync(FIXTURE, "utf-8"));
}

describe("embedded GalaxyUserTool step", () => {
  it("normalizes to a step whose run decodes as a GalaxyUserTool stub", () => {
    const step = normalizedFormat2(userToolWorkflow()).steps[0];
    const decoded = S.decodeUnknownSync(NormalizedFormat2StepSchema)(step);
    expect(isGalaxyUserToolRun(decoded.run)).toBe(true);
    expect(decoded.run).toMatchObject({ class: "GalaxyUserTool", container: "busybox" });
  });

  it("keeps tool state and when through format2 -> native -> format2", () => {
    const raw = userToolWorkflow();
    raw.steps.my_tool.run.inputs.push({ name: "lines", type: "integer" });
    raw.steps.my_tool.state = { lines: 3 };
    raw.steps.my_tool.when = "$(inputs.lines > 0)";

    const native = toNative(raw);
    expect(native.steps["1"].tool_state).toEqual({ __page__: 0, lines: 3 });

    const step = toFormat2(native).steps[0];
    expect(step.run).toEqual(raw.steps.my_tool.run);
    expect(step.tool_id).toBeUndefined();
    expect(step.tool_state).toEqual({ lines: 3 });
    expect(step.when).toBe("$(inputs.lines > 0)");
  });
});
