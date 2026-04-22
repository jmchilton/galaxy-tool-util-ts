import { describe, expect, it } from "vitest";

import { DatatypesMapperModel } from "../src/datatypes-mapper.js";
import { testDatatypesMapper, testTypesAndMapping } from "./fixtures.js";

describe("DatatypesMapperModel", () => {
  it("resolves subtype relationships through extension mappings", () => {
    expect(testDatatypesMapper.isSubType("txt", "data")).toBe(true);
    expect(testDatatypesMapper.isSubType("txt", "txt")).toBe(true);
    expect(testDatatypesMapper.isSubType("data", "txt")).toBe(false);
  });

  it("supports subtype check against a list of parents", () => {
    expect(testDatatypesMapper.isSubTypeOfAny("data", ["txt", "data"])).toBe(true);
    expect(testDatatypesMapper.isSubTypeOfAny("tabular", ["binary"])).toBe(false);
    expect(testDatatypesMapper.isSubTypeOfAny("tabular", ["binary", "txt"])).toBe(true);
  });

  it("allows parents given as explicit class names", () => {
    expect(testDatatypesMapper.isSubType("txt", "Data")).toBe(true);
    expect(testDatatypesMapper.isSubType("txt", "Binary")).toBe(false);
  });

  it("returns false for unknown child datatypes", () => {
    expect(testDatatypesMapper.isSubType("nonexistent", "data")).toBe(false);
  });

  it("returns false for unknown parent extension that is also not a class", () => {
    expect(testDatatypesMapper.isSubType("txt", "")).toBe(false);
  });

  it("sorts datatypes without mutating the caller's array", () => {
    const input = { ...testTypesAndMapping, datatypes: ["zzz", "aaa", "mmm"] };
    const before = [...input.datatypes];
    const mapper = new DatatypesMapperModel(input);
    expect(mapper.datatypes).toEqual(["aaa", "mmm", "zzz"]);
    expect(input.datatypes).toEqual(before);
  });
});
