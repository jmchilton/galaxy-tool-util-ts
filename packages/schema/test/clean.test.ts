/**
 * Tests for cleanWorkflow() — structural cleaning + tool-aware stale key removal.
 *
 * Red-to-green: tests written before the implementation is complete.
 */

import { describe, it, expect } from "vitest";
import { cleanWorkflow } from "../src/workflow/clean.js";
import type { ToolInputsResolver } from "../src/workflow/normalized/stateful-runner.js";
import type { ToolParameterModel, IntegerParameterModel } from "../src/schema/bundle-types.js";

// --- Param factories ---

function intParam(name: string): IntegerParameterModel {
  return {
    name,
    parameter_type: "gx_integer",
    type: "integer",
    hidden: false,
    label: null,
    help: null,
    argument: null,
    is_dynamic: false,
    optional: false,
    value: 0,
    min: null,
    max: null,
    validators: [],
  };
}

function mapResolver(map: Record<string, ToolParameterModel[]>): ToolInputsResolver {
  return (toolId) => map[toolId];
}

// --- Native workflow fixtures ---

function nativeWorkflow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    a_galaxy_workflow: "true",
    format_version: "0.1",
    uuid: "wf-uuid-1234",
    steps: {},
    ...overrides,
  };
}

function nativeStep(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: "tool",
    tool_id: "toolshed.g2.bx.psu.edu/repos/devteam/some_tool/some_tool/1.0",
    tool_version: "1.0",
    tool_state: { param_a: 42, param_b: "hello" },
    uuid: "step-uuid-5678",
    errors: "some runtime error",
    ...overrides,
  };
}

// --- Format2 workflow fixtures ---

function format2Workflow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    class: "GalaxyWorkflow",
    uuid: "wf-uuid-format2",
    steps: [],
    ...overrides,
  };
}

function format2Step(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    tool_id: "toolshed.g2.bx.psu.edu/repos/devteam/some_tool/some_tool/1.0",
    tool_version: "1.0",
    label: "step1",
    uuid: "step-uuid-format2",
    errors: "some runtime error",
    state: { param_a: 42, param_b: "hello" },
    in: [],
    out: [],
    ...overrides,
  };
}

// ─── Structural cleaning — native ─────────────────────────────────────────────

describe("cleanWorkflow — native structural cleaning", () => {
  it("strips uuid from native workflow dict", async () => {
    const wf = nativeWorkflow({ steps: {} });
    expect(wf.uuid).toBe("wf-uuid-1234");
    await cleanWorkflow(wf);
    expect(wf.uuid).toBeUndefined();
  });

  it("preserves tool_state on native step", async () => {
    const step = nativeStep();
    const wf = nativeWorkflow({ steps: { "0": step } });
    await cleanWorkflow(wf);
    expect((step.tool_state as Record<string, unknown>).param_a).toBe(42);
  });

  it("reports structural keys as removed in step result", async () => {
    const step = nativeStep();
    const wf = nativeWorkflow({ steps: { "0": step } });
    const { results } = await cleanWorkflow(wf);
    const r = results[0];
    expect(r.removed_keys).toContain("uuid");
    expect(r.removed_keys).toContain("errors");
  });
});

// ─── Structural cleaning — format2 ───────────────────────────────────────────

describe("cleanWorkflow — format2 structural cleaning", () => {
  it("strips uuid from format2 workflow dict", async () => {
    const wf = format2Workflow({ steps: [] });
    expect(wf.uuid).toBe("wf-uuid-format2");
    await cleanWorkflow(wf);
    expect(wf.uuid).toBeUndefined();
  });

  it("strips uuid and errors from format2 step (list steps)", async () => {
    const step = format2Step();
    const wf = format2Workflow({ steps: [step] });
    await cleanWorkflow(wf);
    expect(step.uuid).toBeUndefined();
    expect(step.errors).toBeUndefined();
  });

  it("strips uuid and errors from format2 step (dict steps)", async () => {
    const step = format2Step();
    const wf = format2Workflow({ steps: { "0": step } });
    await cleanWorkflow(wf);
    expect(step.uuid).toBeUndefined();
    expect(step.errors).toBeUndefined();
  });

  it("preserves position on format2 step", async () => {
    const step = format2Step({ position: { top: 100, left: 200 } });
    const wf = format2Workflow({ steps: [step] });
    await cleanWorkflow(wf);
    expect(step.position).toEqual({ top: 100, left: 200 });
  });

  it("preserves state on format2 step", async () => {
    const step = format2Step();
    const wf = format2Workflow({ steps: [step] });
    await cleanWorkflow(wf);
    expect((step.state as Record<string, unknown>).param_a).toBe(42);
  });

  it("returns step results for format2", async () => {
    const step = format2Step();
    const wf = format2Workflow({ steps: [step] });
    const { results } = await cleanWorkflow(wf);
    expect(results.length).toBe(1);
    expect(results[0].removed_keys).toContain("uuid");
    expect(results[0].removed_keys).toContain("errors");
  });
});

// ─── Tool-aware native cleaning ───────────────────────────────────────────────

describe("cleanWorkflow — native tool-aware stale key removal", () => {
  it("removes stale tool_state key when resolver provided", async () => {
    const step = nativeStep({ tool_state: { param_a: 42, stale_key: "old" } });
    const wf = nativeWorkflow({ steps: { "0": step } });
    const resolver = mapResolver({
      "toolshed.g2.bx.psu.edu/repos/devteam/some_tool/some_tool/1.0": [intParam("param_a")],
    });
    await cleanWorkflow(wf, { toolInputsResolver: resolver });
    expect((step.tool_state as Record<string, unknown>).param_a).toBe(42);
    expect((step.tool_state as Record<string, unknown>).stale_key).toBeUndefined();
  });

  it("keeps all tool_state keys without resolver", async () => {
    const step = nativeStep({ tool_state: { param_a: 42, stale_key: "old" } });
    const wf = nativeWorkflow({ steps: { "0": step } });
    await cleanWorkflow(wf);
    expect((step.tool_state as Record<string, unknown>).stale_key).toBe("old");
  });

  it("gracefully skips tool-aware strip when tool not found in resolver", async () => {
    const step = nativeStep({ tool_state: { param_a: 42, stale_key: "old" } });
    const wf = nativeWorkflow({ steps: { "0": step } });
    const resolver = mapResolver({}); // empty — tool not found
    await cleanWorkflow(wf, { toolInputsResolver: resolver });
    // Stale key preserved when tool not found
    expect((step.tool_state as Record<string, unknown>).stale_key).toBe("old");
  });
});

// ─── Tool-aware format2 cleaning ──────────────────────────────────────────────

describe("cleanWorkflow — format2 tool-aware stale key removal", () => {
  it("removes unexpected state key when resolver provided", async () => {
    const step = format2Step({
      state: { param_a: 42, stale_key: "old" },
    });
    const wf = format2Workflow({ steps: [step] });
    const resolver = mapResolver({
      "toolshed.g2.bx.psu.edu/repos/devteam/some_tool/some_tool/1.0": [intParam("param_a")],
    });
    await cleanWorkflow(wf, { toolInputsResolver: resolver });
    expect((step.state as Record<string, unknown>).param_a).toBe(42);
    expect((step.state as Record<string, unknown>).stale_key).toBeUndefined();
  });

  it("keeps unexpected state key without resolver", async () => {
    const step = format2Step({
      state: { param_a: 42, stale_key: "old" },
    });
    const wf = format2Workflow({ steps: [step] });
    await cleanWorkflow(wf);
    expect((step.state as Record<string, unknown>).stale_key).toBe("old");
  });

  it("gracefully skips format2 tool-aware strip when tool not found", async () => {
    const step = format2Step({ state: { param_a: 42, stale_key: "old" } });
    const wf = format2Workflow({ steps: [step] });
    const resolver = mapResolver({});
    await cleanWorkflow(wf, { toolInputsResolver: resolver });
    expect((step.state as Record<string, unknown>).stale_key).toBe("old");
  });
});

// ─── skipUuid option ──────────────────────────────────────────────────────────

describe("cleanWorkflow — skipUuid option", () => {
  it("preserves uuid on native workflow when skipUuid=true", async () => {
    const wf = nativeWorkflow({ steps: {} });
    await cleanWorkflow(wf, { skipUuid: true });
    expect(wf.uuid).toBe("wf-uuid-1234");
  });

  it("preserves uuid on format2 workflow when skipUuid=true", async () => {
    const wf = format2Workflow({ steps: [] });
    await cleanWorkflow(wf, { skipUuid: true });
    expect(wf.uuid).toBe("wf-uuid-format2");
  });

  it("preserves uuid on format2 step when skipUuid=true", async () => {
    const step = format2Step();
    const wf = format2Workflow({ steps: [step] });
    await cleanWorkflow(wf, { skipUuid: true });
    expect(step.uuid).toBe("step-uuid-format2");
  });

  it("still strips errors on format2 step when skipUuid=true", async () => {
    const step = format2Step();
    const wf = format2Workflow({ steps: [step] });
    await cleanWorkflow(wf, { skipUuid: true });
    expect(step.errors).toBeUndefined();
  });
});
