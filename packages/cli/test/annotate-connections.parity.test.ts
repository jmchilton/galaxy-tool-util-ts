/**
 * Parity coverage for the lifted preloader. `resolveEdgeAnnotationsWithCache`
 * goes through `@galaxy-tool-util/connection-validation::buildGetToolInfo` via
 * the CLI's `loadCachedTool` adapter — this asserts the wired path produces
 * the EdgeAnnotation map we expect for a workflow with a known data edge.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { makeNodeToolCache } from "@galaxy-tool-util/core/node";

import { resolveEdgeAnnotationsWithCache } from "../src/commands/annotate-connections.js";
import { createCliTestContext, type CliTestContext } from "./helpers/cli-test-context.js";
import { seedAllTools, DATA_TOOL_ID } from "./helpers/fixtures.js";

const chainWorkflow = {
  a_galaxy_workflow: "true",
  "format-version": "0.1",
  steps: {
    "0": { id: 0, type: "data_input", label: "in", tool_id: null, tool_state: "{}" },
    "1": {
      id: 1,
      type: "tool",
      label: "t1",
      tool_id: DATA_TOOL_ID,
      tool_version: "1.0",
      tool_state: "{}",
      input_connections: { input_file: [{ id: 0, output_name: "output" }] },
    },
  },
};

describe("resolveEdgeAnnotationsWithCache (lifted helper parity)", () => {
  let ctx: CliTestContext;

  beforeEach(async () => {
    ctx = await createCliTestContext("annotate-parity");
    await seedAllTools(ctx.tmpDir);
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it("annotates the input→tool edge using the lifted preloader", async () => {
    const cache = makeNodeToolCache({ cacheDir: ctx.tmpDir });
    await cache.index.load();

    const annotations = await resolveEdgeAnnotationsWithCache(chainWorkflow, cache);

    const key = "in|output->t1|input_file";
    const ann = annotations.get(key);
    expect(
      ann,
      `expected annotation under ${key}, got keys: ${[...annotations.keys()].join(",")}`,
    ).toBeDefined();
    expect(ann!.status).toBe("ok");
    expect(ann!.mapDepth).toBe(0);
    expect(ann!.reduction).toBe(false);
    expect(ann!.sourceStep).toBe("in");
    expect(ann!.targetStep).toBe("t1");
  });

  it("returns an empty map when no tool refs resolve", async () => {
    const cache = makeNodeToolCache({ cacheDir: ctx.tmpDir });
    await cache.index.load();

    const noToolWorkflow = {
      a_galaxy_workflow: "true",
      "format-version": "0.1",
      steps: { "0": { id: 0, type: "data_input", label: "in", tool_id: null, tool_state: "{}" } },
    };
    const annotations = await resolveEdgeAnnotationsWithCache(noToolWorkflow, cache);
    expect(annotations.size).toBe(0);
  });
});
