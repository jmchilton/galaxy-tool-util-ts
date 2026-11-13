import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { makeNodeToolCache } from "@galaxy-tool-util/core/node";

import { operateValidate } from "../src/workflows.js";

describe("operateValidate step labels", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gxwf-step-label-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns each step's label alongside its position", async () => {
    const cache = makeNodeToolCache({ cacheDir: tmpDir });
    await cache.index.load();
    const data = {
      class: "GalaxyWorkflow",
      inputs: { reads: { type: "data" } },
      outputs: {},
      steps: { cat: { tool_id: "cat1", tool_version: "1.0.0", in: { input1: "reads" }, out: [] } },
    };

    const report = await operateValidate(
      { absPath: path.join(tmpDir, "wf.gxwf.yml"), format: "format2", data },
      cache,
    );

    expect(report.results.map((r) => [r.step, r.label])).toEqual([["0", "cat"]]);
  });
});
