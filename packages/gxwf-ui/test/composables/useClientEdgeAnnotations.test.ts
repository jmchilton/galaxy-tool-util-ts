import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadWorkflowContent = vi.fn();
const getToolInfo = vi.fn();

vi.mock("../../src/composables/useContents", () => ({
  useContents: () => ({ loadWorkflowContent }),
}));

vi.mock("../../src/composables/useToolInfoService", () => ({
  useToolInfoService: () => ({ getToolInfo }),
}));

import { useClientEdgeAnnotations } from "../../src/composables/useClientEdgeAnnotations";

const TOOL_A = "toolshed.example/repos/test/a/tool_a";
const TOOL_B = "toolshed.example/repos/test/b/tool_b";

const inputOnlyWorkflow = {
  a_galaxy_workflow: "true",
  "format-version": "0.1",
  steps: { "0": { id: 0, type: "data_input", label: "in", tool_id: null, tool_state: "{}" } },
};

const twoToolWorkflow = {
  a_galaxy_workflow: "true",
  "format-version": "0.1",
  steps: {
    "0": { id: 0, type: "data_input", label: "in", tool_id: null, tool_state: "{}" },
    "1": {
      id: 1,
      type: "tool",
      label: "t1",
      tool_id: TOOL_A,
      tool_version: "1.0",
      tool_state: "{}",
      input_connections: { input_file: [{ id: 0, output_name: "output" }] },
    },
    "2": {
      id: 2,
      type: "tool",
      label: "t2",
      tool_id: TOOL_B,
      tool_version: "2.0",
      tool_state: "{}",
      input_connections: {},
    },
  },
};

beforeEach(() => {
  loadWorkflowContent.mockReset();
  getToolInfo.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useClientEdgeAnnotations", () => {
  it("returns an empty map and never calls the service when no tool refs are present", async () => {
    loadWorkflowContent.mockResolvedValue(inputOnlyWorkflow);

    const { annotations, loading, error, misses, progress, build } = useClientEdgeAnnotations();
    await build("workflow.ga");

    expect(loading.value).toBe(false);
    expect(error.value).toBeNull();
    expect(annotations.value).not.toBeNull();
    expect(annotations.value!.size).toBe(0);
    expect(misses.value).toEqual([]);
    expect(progress.value).toBeNull();
    expect(getToolInfo).not.toHaveBeenCalled();
  });

  it("calls the service for every tool ref and progresses to total", async () => {
    loadWorkflowContent.mockResolvedValue(twoToolWorkflow);
    getToolInfo.mockResolvedValue(null); // unresolved — both go to misses

    const { build, misses, progress, annotations } = useClientEdgeAnnotations();
    await build("workflow.ga");

    expect(getToolInfo).toHaveBeenCalledTimes(2);
    expect(getToolInfo).toHaveBeenCalledWith(TOOL_A, "1.0");
    expect(getToolInfo).toHaveBeenCalledWith(TOOL_B, "2.0");
    expect(misses.value).toEqual([
      { toolId: TOOL_A, toolVersion: "1.0", reason: "not_found" },
      { toolId: TOOL_B, toolVersion: "2.0", reason: "not_found" },
    ]);
    expect(progress.value).toEqual({ resolved: 2, total: 2 });
    // Annotations is still a Map (empty / partially populated) — never null on success.
    expect(annotations.value).not.toBeNull();
  });

  it("captures rejected fetcher errors as misses with their message", async () => {
    loadWorkflowContent.mockResolvedValue(twoToolWorkflow);
    getToolInfo.mockImplementation(async (id: string) => {
      if (id === TOOL_A) throw new Error("network down");
      return null;
    });

    const { build, misses } = useClientEdgeAnnotations();
    await build("workflow.ga");

    const aMiss = misses.value.find((m) => m.toolId === TOOL_A);
    const bMiss = misses.value.find((m) => m.toolId === TOOL_B);
    expect(aMiss).toEqual({ toolId: TOOL_A, toolVersion: "1.0", reason: "network down" });
    expect(bMiss).toEqual({ toolId: TOOL_B, toolVersion: "2.0", reason: "not_found" });
  });

  it("surfaces loadWorkflowContent failures into error and clears annotations", async () => {
    loadWorkflowContent.mockRejectedValue(new Error("boom"));

    const { build, error, annotations, loading } = useClientEdgeAnnotations();
    await build("workflow.ga");

    expect(error.value).toBe("boom");
    expect(annotations.value).toBeNull();
    expect(loading.value).toBe(false);
  });

  it("clear() resets all reactive surfaces", async () => {
    loadWorkflowContent.mockResolvedValue(twoToolWorkflow);
    getToolInfo.mockResolvedValue(null);

    const { build, clear, annotations, misses, progress, error } = useClientEdgeAnnotations();
    await build("workflow.ga");
    clear();

    expect(annotations.value).toBeNull();
    expect(misses.value).toEqual([]);
    expect(progress.value).toBeNull();
    expect(error.value).toBeNull();
  });
});
