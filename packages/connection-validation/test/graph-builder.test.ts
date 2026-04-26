/* Tests for buildWorkflowGraph: step typing, I/O extraction, topological order. */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, it, expect } from "vitest";
import { parse as parseYaml } from "yaml";

import { loadParsedToolCache } from "../../core/test/helpers/parsed-tool-cache.js";

import { buildWorkflowGraph } from "../src/graph-builder.js";
import type { GetToolInfo } from "../src/get-tool-info.js";

const FIXTURES = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "core",
  "test",
  "fixtures",
  "connection_workflows",
);
const PARSED_TOOLS = join(FIXTURES, "parsed_tools");

function loadCache(): GetToolInfo {
  const cache = loadParsedToolCache(PARSED_TOOLS);
  return {
    getToolInfo: (toolId) => cache.get(toolId),
  };
}

function loadWorkflow(stem: string): Record<string, unknown> {
  return parseYaml(readFileSync(join(FIXTURES, `${stem}.gxwf.yml`), "utf-8")) as Record<
    string,
    unknown
  >;
}

describe("buildWorkflowGraph", () => {
  const tools = loadCache();

  it("extracts data input + tool outputs for ok_simple_chain_dataset", () => {
    const wf = loadWorkflow("ok_simple_chain_dataset");
    const graph = buildWorkflowGraph(wf, tools);

    expect(graph.sortedStepIds.length).toBeGreaterThan(0);
    // Inputs always sort before tool steps that consume them.
    const idx = (id: string) => graph.sortedStepIds.indexOf(id);

    const inputSteps = Object.entries(graph.steps).filter(([, s]) => s.stepType === "data_input");
    const toolSteps = Object.entries(graph.steps).filter(([, s]) => s.stepType === "tool");
    expect(inputSteps.length).toBe(1);
    expect(toolSteps.length).toBe(2);

    for (const [inputId] of inputSteps) {
      for (const [toolId] of toolSteps) {
        expect(idx(inputId)).toBeLessThan(idx(toolId));
      }
    }

    // Each tool step has a 'parameter' input typed as data.
    for (const [, step] of toolSteps) {
      expect(step.inputs.parameter?.type).toBe("data");
      expect(step.outputs.output?.type).toBe("data");
    }
  });

  it("extracts data_collection_input with declared collection type", () => {
    const wf = loadWorkflow("ok_list_to_dataset");
    const graph = buildWorkflowGraph(wf, tools);
    const collInput = Object.values(graph.steps).find(
      (s) => s.stepType === "data_collection_input",
    );
    expect(collInput).toBeDefined();
    expect(collInput!.outputs.output.type).toBe("collection");
    expect(collInput!.outputs.output.collectionType).toBeTruthy();
  });

  it("recurses into subworkflows and builds output map", () => {
    const wf = loadWorkflow("ok_subworkflow_passthrough");
    const graph = buildWorkflowGraph(wf, tools);
    const subStep = Object.values(graph.steps).find((s) => s.stepType === "subworkflow");
    expect(subStep).toBeDefined();
    expect(subStep!.innerGraph).toBeDefined();
    expect(subStep!.innerGraph!.sortedStepIds.length).toBeGreaterThan(0);
  });

  it("topological sort places sources before sinks across all fixtures", () => {
    const fixtures = readdirSync(FIXTURES).filter((f) => f.endsWith(".gxwf.yml"));
    for (const fixture of fixtures) {
      const wf = parseYaml(readFileSync(join(FIXTURES, fixture), "utf-8")) as Record<
        string,
        unknown
      >;
      const graph = buildWorkflowGraph(wf, tools);
      const order = new Map(graph.sortedStepIds.map((id, i) => [id, i]));
      for (const [stepId, step] of Object.entries(graph.steps)) {
        for (const refs of Object.values(step.connections)) {
          for (const ref of refs) {
            if (graph.steps[ref.sourceStep]) {
              expect(
                order.get(ref.sourceStep)!,
                `${fixture}: ${ref.sourceStep} -> ${stepId}`,
              ).toBeLessThan(order.get(stepId)!);
            }
          }
        }
      }
    }
  });
});
