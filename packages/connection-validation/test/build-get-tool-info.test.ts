import { describe, expect, it } from "vitest";

import {
  buildGetToolInfo,
  collectToolRefs,
  type AsyncToolFetcher,
  type ToolRef,
} from "../src/build-get-tool-info.js";

function fakeTool(id: string, version: string | null) {
  return { id, version, name: `${id}@${version ?? "<none>"}` } as never;
}

const subworkflowFixture = {
  steps: {
    "0": { id: 0, type: "data_input" },
    "1": { id: 1, type: "tool", tool_id: "tool_a", tool_version: "1.0" },
    "2": {
      id: 2,
      type: "subworkflow",
      subworkflow: {
        steps: [
          { id: 0, type: "tool", tool_id: "tool_b", tool_version: "2.0" },
          // duplicate of tool_a@1.0 — should dedupe
          { id: 1, type: "tool", tool_id: "tool_a", tool_version: "1.0" },
          // unversioned ref
          { id: 2, type: "tool", tool_id: "tool_c", tool_version: null },
        ],
      },
    },
    "3": {
      id: 3,
      type: "subworkflow",
      run: { steps: [{ id: 0, type: "tool", tool_id: "tool_d", tool_version: "3.0" }] },
    },
  },
};

describe("collectToolRefs", () => {
  it("walks subworkflow + run, dedupes, preserves null version", () => {
    const refs = collectToolRefs(subworkflowFixture);
    expect(refs).toEqual([
      { toolId: "tool_a", toolVersion: "1.0" },
      { toolId: "tool_b", toolVersion: "2.0" },
      { toolId: "tool_c", toolVersion: null },
      { toolId: "tool_d", toolVersion: "3.0" },
    ]);
  });
});

describe("buildGetToolInfo", () => {
  it("preloads via fetcher and returns a sync lookup", async () => {
    const seen: ToolRef[] = [];
    const fetcher: AsyncToolFetcher = async (id, v) => {
      seen.push({ toolId: id, toolVersion: v });
      return fakeTool(id, v);
    };
    const info = await buildGetToolInfo(subworkflowFixture, fetcher);
    expect(seen).toHaveLength(4);
    expect(info.getToolInfo("tool_a", "1.0")).toEqual(fakeTool("tool_a", "1.0"));
    expect(info.getToolInfo("tool_b", "2.0")).toEqual(fakeTool("tool_b", "2.0"));
    expect(info.getToolInfo("tool_d", "3.0")).toEqual(fakeTool("tool_d", "3.0"));
  });

  it("falls back to null-version then to first-by-id when version not preloaded", async () => {
    const fetcher: AsyncToolFetcher = async (id, v) => fakeTool(id, v);
    const info = await buildGetToolInfo(subworkflowFixture, fetcher);
    // tool_c was preloaded with null — caller asks with a different version.
    expect(info.getToolInfo("tool_c", "9.9")).toEqual(fakeTool("tool_c", null));
    // tool_a only has 1.0 cached — caller asks with a missing version.
    expect(info.getToolInfo("tool_a", "9.9")).toEqual(fakeTool("tool_a", "1.0"));
  });

  it("reports misses when fetcher returns null and skips lookup", async () => {
    const misses: Array<{ ref: ToolRef; reason: unknown }> = [];
    const fetcher: AsyncToolFetcher = async (id, v) => (id === "tool_b" ? null : fakeTool(id, v));
    const info = await buildGetToolInfo(subworkflowFixture, fetcher, {
      onMiss: (ref, reason) => misses.push({ ref, reason }),
    });
    expect(misses).toEqual([
      { ref: { toolId: "tool_b", toolVersion: "2.0" }, reason: "not_found" },
    ]);
    expect(info.getToolInfo("tool_b", "2.0")).toBeUndefined();
    expect(info.getToolInfo("tool_a", "1.0")).toEqual(fakeTool("tool_a", "1.0"));
  });

  it("reports misses when fetcher rejects", async () => {
    const misses: Array<{ ref: ToolRef; reason: unknown }> = [];
    const boom = new Error("boom");
    const fetcher: AsyncToolFetcher = async (id, v) => {
      if (id === "tool_a") throw boom;
      return fakeTool(id, v);
    };
    await buildGetToolInfo(subworkflowFixture, fetcher, {
      onMiss: (ref, reason) => misses.push({ ref, reason }),
    });
    expect(misses).toEqual([{ ref: { toolId: "tool_a", toolVersion: "1.0" }, reason: boom }]);
  });

  it("emits onProgress once per ref, total = ref count", async () => {
    const progress: Array<[number, number]> = [];
    const fetcher: AsyncToolFetcher = async (id, v) => fakeTool(id, v);
    await buildGetToolInfo(subworkflowFixture, fetcher, {
      onProgress: (resolved, total) => progress.push([resolved, total]),
    });
    expect(progress).toEqual([
      [1, 4],
      [2, 4],
      [3, 4],
      [4, 4],
    ]);
  });

  it("respects concurrency > 1 and still preloads every ref", async () => {
    let inFlight = 0;
    let peak = 0;
    const fetcher: AsyncToolFetcher = async (id, v) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
      return fakeTool(id, v);
    };
    const info = await buildGetToolInfo(subworkflowFixture, fetcher, { concurrency: 3 });
    expect(peak).toBeGreaterThan(1);
    expect(info.getToolInfo("tool_a", "1.0")).toEqual(fakeTool("tool_a", "1.0"));
    expect(info.getToolInfo("tool_b", "2.0")).toEqual(fakeTool("tool_b", "2.0"));
    expect(info.getToolInfo("tool_c", null)).toEqual(fakeTool("tool_c", null));
    expect(info.getToolInfo("tool_d", "3.0")).toEqual(fakeTool("tool_d", "3.0"));
  });
});
