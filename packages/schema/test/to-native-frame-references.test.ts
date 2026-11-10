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
});
