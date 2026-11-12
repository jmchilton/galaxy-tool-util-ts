import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as yaml from "yaml";
import { toNative } from "../src/workflow/index.js";

const FORMAT2_FIXTURES = path.join(import.meta.dirname, "fixtures", "workflows", "format2");

function loadFixture(name: string): Record<string, unknown> {
  return yaml.parse(fs.readFileSync(path.join(FORMAT2_FIXTURES, name), "utf-8"));
}

describe("toNative frame references", () => {
  it("names the frame and label for an unknown contains_steps entry", () => {
    expect(() => toNative(loadFixture("synthetic-frame-unknown-step.gxwf.yml"))).toThrow(
      /^Frame 'Typo' references unknown step or input label 'cat_stepp' in contains_steps$/,
    );
  });

  it("names the frame and index for an out-of-range contains_steps entry", () => {
    expect(() => toNative(loadFixture("synthetic-frame-index-out-of-range.gxwf.yml"))).toThrow(
      /^Frame 'Range' references out-of-range step index '2' in contains_steps$/,
    );
  });

  it("resolves an all-digit step label as a label even past the index range", () => {
    const native = toNative(loadFixture("synthetic-frame-digit-label.gxwf.yml"));
    expect((native.comments as Record<string, unknown>[])[0].child_steps).toEqual([1, 0]);
  });

  it("flags a digit string longer than any index as out of range", () => {
    const wf = loadFixture("synthetic-frame-index-out-of-range.gxwf.yml");
    const huge = "9".repeat(5000);
    (wf.comments as Record<string, unknown>[])[0].contains_steps = [huge];
    expect(() => toNative(wf)).toThrow(`out-of-range step index '${huge}'`);
  });

  it("skips non-integer numeric entries like gxformat2", () => {
    const wf = loadFixture("synthetic-frame-index-out-of-range.gxwf.yml");
    (wf.comments as Record<string, unknown>[])[0].contains_steps = [-0.5];
    expect(() => toNative(wf)).not.toThrow(/out-of-range step index/);
  });

  it("checks frames inside a subworkflow against that subworkflow's labels", () => {
    const wf = loadFixture("synthetic-frame-unknown-step.gxwf.yml");
    const parent = {
      class: "GalaxyWorkflow",
      inputs: { outer: "data" },
      outputs: {},
      steps: { nested: { run: wf, in: { input1: "outer" } } },
    };
    expect(() => toNative(parent)).toThrow(/Frame 'Typo' references unknown step/);
  });

  it("rejects unknown contains_comments labels on non-frame comments", () => {
    const wf = {
      class: "GalaxyWorkflow",
      inputs: {},
      outputs: {},
      steps: {},
      comments: [{ type: "text", text: "x", contains_comments: ["missing"] }],
    };
    expect(() => toNative(wf)).toThrow(/unknown comment label 'missing'/);
  });
});
