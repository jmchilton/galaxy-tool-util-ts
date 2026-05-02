/**
 * Coverage for the envelope-aware server transport: must accept either the
 * legacy bare-record shape or the new `{annotations, tool_specs}` envelope,
 * and must write `tool_specs` into the IndexedDB-backed `useToolInfoService`
 * when present so subsequent client-side builds can hit a warm cache.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const addTool = vi.fn();

vi.mock("../../src/composables/useToolInfoService", () => ({
  useToolInfoService: () => ({ addTool }),
}));

import { useEdgeAnnotations } from "../../src/composables/useEdgeAnnotations";

const ann = {
  "in|output->t1|input_file": {
    sourceStep: "in",
    sourceOutput: "output",
    targetStep: "t1",
    targetInput: "input_file",
    mapDepth: 0,
    reduction: false,
    status: "ok" as const,
  },
};

beforeEach(() => {
  addTool.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useEdgeAnnotations", () => {
  it("handles legacy bare-record response shape (older gxwf-web)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify(ann), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
      ),
    );

    const { build, annotations, error } = useEdgeAnnotations();
    await build("wf.ga");

    expect(error.value).toBeNull();
    expect(annotations.value!.size).toBe(1);
    expect(annotations.value!.get("in|output->t1|input_file")?.sourceStep).toBe("in");
    expect(addTool).not.toHaveBeenCalled();
  });

  it("handles envelope response and writes tool_specs through to the cache", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              annotations: ann,
              tool_specs: {
                "data_tool@1.0": {
                  tool_id: "data_tool",
                  tool_version: "1.0",
                  parsed: { id: "data_tool", version: "1.0", inputs: [], outputs: [] },
                },
                "other_tool@2.0": {
                  tool_id: "other_tool",
                  tool_version: "2.0",
                  parsed: { id: "other_tool", version: "2.0", inputs: [], outputs: [] },
                },
              },
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
      ),
    );

    const { build, annotations } = useEdgeAnnotations();
    await build("wf.ga");

    expect(annotations.value!.size).toBe(1);
    expect(addTool).toHaveBeenCalledTimes(2);
    expect(addTool).toHaveBeenCalledWith(
      "data_tool",
      "1.0",
      expect.objectContaining({ id: "data_tool" }),
      "gxwf-web",
      expect.stringContaining("/edge-annotations"),
    );
    expect(addTool).toHaveBeenCalledWith(
      "other_tool",
      "2.0",
      expect.objectContaining({ id: "other_tool" }),
      "gxwf-web",
      expect.stringContaining("/edge-annotations"),
    );
  });

  it("logs but does not fail when a tool_specs write fails", async () => {
    addTool.mockRejectedValueOnce(new Error("quota exceeded"));
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              annotations: ann,
              tool_specs: {
                "data_tool@1.0": {
                  tool_id: "data_tool",
                  tool_version: "1.0",
                  parsed: { id: "data_tool", version: "1.0", inputs: [], outputs: [] },
                },
              },
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
      ),
    );
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});

    const { build, annotations, error } = useEdgeAnnotations();
    await build("wf.ga");

    expect(error.value).toBeNull();
    expect(annotations.value!.size).toBe(1);
    expect(debugSpy).toHaveBeenCalled();
    debugSpy.mockRestore();
  });

  it("envelope with empty tool_specs is a no-op for the cache write-through", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ annotations: ann, tool_specs: {} }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
      ),
    );

    const { build, annotations, error } = useEdgeAnnotations();
    await build("wf.ga");

    expect(error.value).toBeNull();
    expect(annotations.value!.size).toBe(1);
    expect(addTool).not.toHaveBeenCalled();
  });

  it("populates error and clears annotations on non-2xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 500, statusText: "boom" })),
    );

    const { build, error, annotations } = useEdgeAnnotations();
    await build("wf.ga");

    expect(error.value).toContain("500");
    expect(annotations.value).toBeNull();
  });
});
