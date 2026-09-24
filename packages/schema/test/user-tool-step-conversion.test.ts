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
});
