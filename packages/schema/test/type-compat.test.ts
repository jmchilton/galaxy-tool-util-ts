import { describe, it, expect } from "vitest";
import { isCompatibleType, jsTypeOf } from "../src/test-format/cross-check/type-compat.js";

describe("isCompatibleType (type string on both sides)", () => {
  it("accepts 'number' for int/integer/long/float/double", () => {
    for (const t of ["int", "integer", "long", "float", "double"] as const) {
      expect(isCompatibleType(t, "number")).toBe(true);
      expect(isCompatibleType(t, "string")).toBe(false);
    }
  });

  it("accepts 'boolean' only for boolean", () => {
    expect(isCompatibleType("boolean", "boolean")).toBe(true);
    expect(isCompatibleType("boolean", "string")).toBe(false);
  });

  it("accepts 'string' for text/string", () => {
    expect(isCompatibleType("string", "string")).toBe(true);
    expect(isCompatibleType("text", "string")).toBe(true);
    expect(isCompatibleType("string", "number")).toBe(false);
  });

  it("accepts string or object for File (path or {class: File})", () => {
    expect(isCompatibleType("File", "string")).toBe(true);
    expect(isCompatibleType("File", "object")).toBe(true);
    expect(isCompatibleType("File", "number")).toBe(false);
  });

  it("accepts 'null' for null", () => {
    expect(isCompatibleType("null", "null")).toBe(true);
    expect(isCompatibleType("null", "string")).toBe(false);
  });

  it("permissive default for unmapped types (data, collection, color, custom)", () => {
    expect(isCompatibleType("data", "object")).toBe(true);
    expect(isCompatibleType("collection", "object")).toBe(true);
    expect(isCompatibleType("color", "string")).toBe(true);
    expect(isCompatibleType("something_weird", "number")).toBe(true);
  });
});

describe("jsTypeOf — YAML-LS AST vocabulary", () => {
  it.each([
    [null, "null"],
    [[], "array"],
    ["x", "string"],
    [5, "number"],
    [true, "boolean"],
    [{}, "object"],
  ])("jsTypeOf(%o) === %s", (value, tag) => {
    expect(jsTypeOf(value)).toBe(tag);
  });
});
