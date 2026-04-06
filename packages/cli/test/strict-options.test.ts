import { describe, it, expect } from "vitest";
import { resolveStrictOptions } from "../src/commands/strict-options.js";

describe("resolveStrictOptions", () => {
  it("--strict expands to all three", () => {
    const result = resolveStrictOptions({ strict: true });
    expect(result).toEqual({
      strictStructure: true,
      strictEncoding: true,
      strictState: true,
    });
  });

  it("individual flags work independently", () => {
    expect(resolveStrictOptions({ strictStructure: true })).toEqual({
      strictStructure: true,
      strictEncoding: false,
      strictState: false,
    });
    expect(resolveStrictOptions({ strictEncoding: true })).toEqual({
      strictStructure: false,
      strictEncoding: true,
      strictState: false,
    });
    expect(resolveStrictOptions({ strictState: true })).toEqual({
      strictStructure: false,
      strictEncoding: false,
      strictState: true,
    });
  });

  it("empty options → all false", () => {
    expect(resolveStrictOptions({})).toEqual({
      strictStructure: false,
      strictEncoding: false,
      strictState: false,
    });
  });

  it("individual flags compose with --strict", () => {
    const result = resolveStrictOptions({ strict: true, strictStructure: false });
    // --strict overrides individual false
    expect(result.strictStructure).toBe(true);
  });

  it("two flags compose independently", () => {
    const result = resolveStrictOptions({ strictStructure: true, strictState: true });
    expect(result).toEqual({
      strictStructure: true,
      strictEncoding: false,
      strictState: true,
    });
  });
});
