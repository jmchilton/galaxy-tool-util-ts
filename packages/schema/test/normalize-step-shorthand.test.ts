import { describe, it, expect } from "vitest";

import { normalizeStepIn, normalizeStepOut } from "../src/workflow/normalized/format2.js";

describe("normalizeStepIn", () => {
  it("returns [] for a missing in block", () => {
    expect(normalizeStepIn(undefined)).toEqual([]);
    expect(normalizeStepIn(null)).toEqual([]);
  });

  it("expands a list of strings", () => {
    expect(normalizeStepIn(["query"])).toEqual([{ id: "query" }]);
  });

  it("expands a list of objects", () => {
    expect(normalizeStepIn([{ id: "query", source: "step1/out" }])).toEqual([
      { id: "query", source: "step1/out" },
    ]);
  });

  it("expands map-to-string shorthand", () => {
    expect(normalizeStepIn({ query: "step1/out" })).toEqual([{ id: "query", source: "step1/out" }]);
  });

  it("expands map-to-object shorthand", () => {
    expect(normalizeStepIn({ query: { source: "step1/out" } })).toEqual([
      { id: "query", source: "step1/out" },
    ]);
  });

  it("expands map-to-list (multi-source) shorthand", () => {
    expect(normalizeStepIn({ query: ["a/out", "b/out"] })).toEqual([
      { id: "query", source: ["a/out", "b/out"] },
    ]);
  });

  it("keeps an entry with no source", () => {
    expect(normalizeStepIn({ query: null })).toEqual([{ id: "query" }]);
  });
});

describe("normalizeStepOut", () => {
  it("returns [] for a missing out block", () => {
    expect(normalizeStepOut(undefined)).toEqual([]);
  });

  it("expands a list of strings", () => {
    expect(normalizeStepOut(["out_file1", "out_file2"])).toEqual([
      { id: "out_file1" },
      { id: "out_file2" },
    ]);
  });

  it("expands a list of objects", () => {
    expect(normalizeStepOut([{ id: "out_file1", hide: true }])).toEqual([
      { id: "out_file1", hide: true },
    ]);
  });

  it("expands the map form", () => {
    expect(normalizeStepOut({ out_file1: { hide: true }, out_file2: {} })).toEqual([
      { id: "out_file1", hide: true },
      { id: "out_file2" },
    ]);
  });
});
