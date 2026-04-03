/**
 * Unit tests for async subworkflow expansion.
 *
 * Tests: base64 resolution, URL resolution, TRS detection, @import handling,
 * cross-format conversion, cycle detection, depth limiting, native content_id.
 */

import { describe, it, expect } from "vitest";
import * as yaml from "yaml";

import {
  expandedFormat2,
  expandedNative,
  isTrsUrl,
  MAX_EXPANSION_DEPTH,
  type RefResolver,
} from "../src/workflow/normalized/expanded.js";

// --- Helpers ---

/** Minimal Format2 workflow dict. */
function minimalFormat2(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    class: "GalaxyWorkflow",
    inputs: { x: "data" },
    outputs: {},
    steps: {},
    ...overrides,
  };
}

/** Minimal native workflow dict. */
function minimalNative(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    a_galaxy_workflow: "true",
    "format-version": "0.1",
    steps: {
      "0": { id: 0, type: "data_input", label: "inp" },
    },
    ...overrides,
  };
}

/** Encode a workflow dict as base64:// URI. */
function toBase64Uri(wf: Record<string, unknown>): string {
  const yamlStr = yaml.stringify(wf);
  const encoded = Buffer.from(yamlStr).toString("base64");
  return `base64://${encoded}`;
}

/** Build a mock resolver that maps URLs to workflow dicts. */
function mockResolver(mapping: Record<string, Record<string, unknown>>): RefResolver {
  return async (ref: string) => {
    const result = mapping[ref];
    if (!result) throw new Error(`Mock resolver: unknown ref "${ref}"`);
    return structuredClone(result);
  };
}

// --- isTrsUrl ---

describe("isTrsUrl", () => {
  it("matches standard TRS v2 URL", () => {
    expect(isTrsUrl("https://dockstore.org/ga4gh/trs/v2/tools/my-tool/versions/1.0")).toBe(true);
  });

  it("matches TRS URL with encoded tool_id", () => {
    expect(
      isTrsUrl("https://toolshed.g2.bx.psu.edu/ga4gh/trs/v2/tools/%23workflow%2Ftool/versions/v1"),
    ).toBe(true);
  });

  it("rejects plain URL", () => {
    expect(isTrsUrl("https://example.com/workflow.ga")).toBe(false);
  });

  it("rejects non-http", () => {
    expect(isTrsUrl("base64://abc")).toBe(false);
  });
});

// --- expandedFormat2 without resolver ---

describe("expandedFormat2 (no resolver)", () => {
  it("passes through inline subworkflow", async () => {
    const inner = minimalFormat2({ steps: { cat: { tool_id: "cat1" } } });
    const outer = minimalFormat2({
      steps: { nested: { run: inner, in: { x: "x" } } },
    });
    const wf = await expandedFormat2(outer);
    const step = wf.steps[0];
    expect(step.run).not.toBeNull();
    expect(typeof step.run).toBe("object");
  });

  it("leaves string run as-is without resolver", async () => {
    const outer = minimalFormat2({
      steps: { nested: { run: "https://example.com/wf.yml", in: { x: "x" } } },
    });
    const wf = await expandedFormat2(outer);
    // Without resolver, string run passes through (not resolved)
    expect(wf.steps[0].run).toBe("https://example.com/wf.yml");
  });

  it("leaves @import path string as-is without resolver", async () => {
    const outer = minimalFormat2({
      steps: { nested: { run: { "@import": "inner.gxwf.yml" }, in: { x: "x" } } },
    });
    const wf = await expandedFormat2(outer);
    // @import becomes a string during normalization, passes through without resolver
    expect(wf.steps[0].run).toBe("inner.gxwf.yml");
  });
});

// --- expandedFormat2 with resolver ---

describe("expandedFormat2 (with resolver)", () => {
  it("resolves URL run reference", async () => {
    const inner = minimalFormat2({ steps: { cat: { tool_id: "cat1" } } });
    const outer = minimalFormat2({
      steps: { nested: { run: "https://example.com/wf.yml", in: { x: "x" } } },
    });
    const resolver = mockResolver({ "https://example.com/wf.yml": inner });
    const wf = await expandedFormat2(outer, { resolver });
    const step = wf.steps[0];
    expect(step.run).not.toBeNull();
    expect(typeof step.run).toBe("object");
    const sub = step.run as Record<string, unknown>;
    // Inner workflow should be normalized (steps is array)
    expect(Array.isArray(sub.steps)).toBe(true);
  });

  it("resolves base64:// run reference", async () => {
    const inner = minimalFormat2({ steps: { cat: { tool_id: "cat1" } } });
    const uri = toBase64Uri(inner);
    const outer = minimalFormat2({
      steps: { nested: { run: uri, in: { x: "x" } } },
    });
    // base64 URIs contain "://" so they go to the resolver
    const resolver: RefResolver = async (ref: string) => {
      expect(ref).toBe(uri);
      const encoded = ref.slice("base64://".length);
      const content = Buffer.from(encoded, "base64").toString("utf-8");
      return yaml.parse(content) as Record<string, unknown>;
    };
    const wf = await expandedFormat2(outer, { resolver });
    expect(typeof wf.steps[0].run).toBe("object");
  });

  it("resolves @import via resolver (file path)", async () => {
    const inner = minimalFormat2({ steps: { cat: { tool_id: "cat1" } } });
    const outer = minimalFormat2({
      steps: { nested: { run: { "@import": "inner.gxwf.yml" }, in: { x: "x" } } },
    });
    const resolver = mockResolver({ "inner.gxwf.yml": inner });
    const wf = await expandedFormat2(outer, { resolver });
    expect(typeof wf.steps[0].run).toBe("object");
  });

  it("handles cross-format (native resolved as format2)", async () => {
    // Resolver returns a native workflow; expansion should convert to format2
    const inner = minimalNative({
      steps: {
        "0": { id: 0, type: "data_input", label: "inp" },
        "1": { id: 1, tool_id: "cat1", tool_version: "1.0" },
      },
    });
    const outer = minimalFormat2({
      steps: { nested: { run: "https://example.com/native.ga", in: { x: "x" } } },
    });
    const resolver = mockResolver({ "https://example.com/native.ga": inner });
    const wf = await expandedFormat2(outer, { resolver });
    expect(typeof wf.steps[0].run).toBe("object");
    const sub = wf.steps[0].run as Record<string, unknown>;
    expect(sub.class).toBe("GalaxyWorkflow");
  });

  it("resolves nested references recursively", async () => {
    const innermost = minimalFormat2({ steps: { cat: { tool_id: "cat1" } } });
    const middle = minimalFormat2({
      steps: { sub: { run: "https://example.com/innermost.yml", in: { x: "x" } } },
    });
    const outer = minimalFormat2({
      steps: { sub: { run: "https://example.com/middle.yml", in: { x: "x" } } },
    });
    const resolver = mockResolver({
      "https://example.com/middle.yml": middle,
      "https://example.com/innermost.yml": innermost,
    });
    const wf = await expandedFormat2(outer, { resolver });
    const middleWf = wf.steps[0].run as Record<string, unknown>;
    expect(middleWf).not.toBeNull();
    const middleSteps = middleWf.steps as Array<Record<string, unknown>>;
    expect(typeof middleSteps[0].run).toBe("object");
  });
});

// --- expandedNative with resolver ---

describe("expandedNative (with resolver)", () => {
  it("resolves content_id URL to inline subworkflow", async () => {
    const inner = minimalNative({
      steps: {
        "0": { id: 0, type: "data_input" },
        "1": { id: 1, tool_id: "random_lines1" },
      },
    });
    const outer = minimalNative({
      steps: {
        "0": { id: 0, type: "data_input", label: "inp" },
        "1": { id: 1, type: "subworkflow", content_id: "https://example.com/inner.ga" },
      },
    });
    const resolver = mockResolver({ "https://example.com/inner.ga": inner });
    const wf = await expandedNative(outer, { resolver });
    const step = wf.steps["1"];
    expect(step.subworkflow).not.toBeNull();
    expect(step.content_id).toBeUndefined();
  });

  it("handles cross-format (format2 resolved as native)", async () => {
    const inner = minimalFormat2({ steps: { cat: { tool_id: "cat1" } } });
    const outer = minimalNative({
      steps: {
        "0": { id: 0, type: "data_input", label: "inp" },
        "1": { id: 1, type: "subworkflow", content_id: "https://example.com/inner.gxwf.yml" },
      },
    });
    const resolver = mockResolver({ "https://example.com/inner.gxwf.yml": inner });
    const wf = await expandedNative(outer, { resolver });
    const step = wf.steps["1"];
    expect(step.subworkflow).not.toBeNull();
    expect(step.subworkflow!.a_galaxy_workflow).toBe("true");
  });

  it("leaves non-URL content_id as-is", async () => {
    const outer = minimalNative({
      steps: {
        "0": { id: 0, type: "data_input", label: "inp" },
        "1": { id: 1, type: "subworkflow", content_id: "$local_ref" },
      },
    });
    const resolver = mockResolver({});
    const wf = await expandedNative(outer, { resolver });
    expect(wf.steps["1"].content_id).toBe("$local_ref");
    expect(wf.steps["1"].subworkflow).toBeFalsy();
  });
});

// --- Resolver error propagation ---

describe("resolver error propagation", () => {
  it("propagates resolver errors", async () => {
    const outer = minimalFormat2({
      steps: { nested: { run: "https://example.com/wf.yml", in: { x: "x" } } },
    });
    const failResolver: RefResolver = async () => {
      throw new Error("HTTP 404: Not Found");
    };
    await expect(expandedFormat2(outer, { resolver: failResolver })).rejects.toThrow(
      "HTTP 404: Not Found",
    );
  });

  it("propagates resolver errors for native content_id", async () => {
    const outer = minimalNative({
      steps: {
        "0": { id: 0, type: "data_input" },
        "1": { id: 1, type: "subworkflow", content_id: "https://example.com/inner.ga" },
      },
    });
    const failResolver: RefResolver = async () => {
      throw new Error("network error");
    };
    await expect(expandedNative(outer, { resolver: failResolver })).rejects.toThrow(
      "network error",
    );
  });
});

// --- Cycle detection ---

describe("cycle detection", () => {
  it("detects direct circular reference", async () => {
    const outer = minimalFormat2({
      steps: { nested: { run: "https://example.com/self.yml", in: { x: "x" } } },
    });
    // Resolver returns the same workflow, creating a cycle
    const selfRef = minimalFormat2({
      steps: { nested: { run: "https://example.com/self.yml", in: { x: "x" } } },
    });
    const resolver = mockResolver({ "https://example.com/self.yml": selfRef });
    await expect(expandedFormat2(outer, { resolver })).rejects.toThrow(
      "Circular subworkflow reference",
    );
  });

  it("detects indirect circular reference", async () => {
    const wfA = minimalFormat2({
      steps: { sub: { run: "https://example.com/b.yml", in: { x: "x" } } },
    });
    const wfB = minimalFormat2({
      steps: { sub: { run: "https://example.com/a.yml", in: { x: "x" } } },
    });
    const resolver = mockResolver({
      "https://example.com/a.yml": wfA,
      "https://example.com/b.yml": wfB,
    });
    const outer = minimalFormat2({
      steps: { sub: { run: "https://example.com/a.yml", in: { x: "x" } } },
    });
    await expect(expandedFormat2(outer, { resolver })).rejects.toThrow(
      "Circular subworkflow reference",
    );
  });
});

// --- Depth limiting ---

describe("depth limiting", () => {
  it(`rejects chains deeper than ${MAX_EXPANSION_DEPTH}`, async () => {
    // Build a chain of workflows: wf0 → wf1 → wf2 → ... → wfN
    const chain: Record<string, Record<string, unknown>> = {};
    for (let i = 0; i <= MAX_EXPANSION_DEPTH + 1; i++) {
      const nextUrl = `https://example.com/wf${i + 1}.yml`;
      chain[`https://example.com/wf${i}.yml`] = minimalFormat2({
        steps: { sub: { run: nextUrl, in: { x: "x" } } },
      });
    }
    // Terminal workflow (no further nesting)
    chain[`https://example.com/wf${MAX_EXPANSION_DEPTH + 2}.yml`] = minimalFormat2({
      steps: { cat: { tool_id: "cat1" } },
    });

    const resolver = mockResolver(chain);
    const outer = minimalFormat2({
      steps: { sub: { run: "https://example.com/wf0.yml", in: { x: "x" } } },
    });
    await expect(expandedFormat2(outer, { resolver })).rejects.toThrow("Max expansion depth");
  });
});
