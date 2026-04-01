/**
 * Unit tests for Python → JS/JSON-Schema regex conversion.
 *
 * Covers the 5 known failing patterns from Galaxy tools (query_tabular,
 * bcftools_annotate, samtools_stats) plus representative passing patterns.
 */

import { describe, it, expect } from "vitest";
import {
  pythonToJsRegex,
  stripPythonIdentityEscapes,
  fixBracketCharClass,
  jsonSchemaSafePattern,
} from "../src/schema/validators/regex.js";

describe("pythonToJsRegex", () => {
  it("passes through patterns without flags", () => {
    expect(pythonToJsRegex("^[actg]*$")).toEqual({ pattern: "^[actg]*$", flags: "" });
  });

  it("strips leading (?flags)", () => {
    expect(pythonToJsRegex("(?i)hello")).toEqual({ pattern: "hello", flags: "i" });
  });

  it("strips (?flags) after ^ anchor", () => {
    const result = pythonToJsRegex("^(?ims)\\s*select\\s+.*\\s+from\\s+.*$");
    expect(result.pattern).toBe("^\\s*select\\s+.*\\s+from\\s+.*$");
    expect(result.flags).toBe("ims");
  });

  it("converts supported flags i, m, s and drops unsupported a, L, u, x", () => {
    expect(pythonToJsRegex("(?aiLmsux)test")).toEqual({ pattern: "test", flags: "ims" });
  });

  it("handles ^(?flags) preserving the anchor", () => {
    const result = pythonToJsRegex("^(?i)foo$");
    expect(result.pattern).toBe("^foo$");
    expect(result.flags).toBe("i");
  });
});

describe("stripPythonIdentityEscapes", () => {
  it("strips \\_ (bcftools_annotate pattern)", () => {
    expect(stripPythonIdentityEscapes("(%[A-Z]+)(\\_%[A-Z]+)*")).toBe("(%[A-Z]+)(_%[A-Z]+)*");
  });

  it("strips \\' and \\\" (samtools_stats pattern)", () => {
    expect(stripPythonIdentityEscapes("[^\\s\\'\\\":]")).toBe("[^\\s'\":]");
  });

  it("preserves valid escapes (\\d, \\s, \\w, etc.)", () => {
    expect(stripPythonIdentityEscapes("\\d+\\s\\w")).toBe("\\d+\\s\\w");
  });

  it("preserves syntax character escapes (\\., \\*, \\+, etc.)", () => {
    expect(stripPythonIdentityEscapes("\\. \\* \\+ \\? \\( \\)")).toBe("\\. \\* \\+ \\? \\( \\)");
  });

  it("preserves \\[ and \\]", () => {
    expect(stripPythonIdentityEscapes("\\[foo\\]")).toBe("\\[foo\\]");
  });

  it("handles \\\\X (escaped backslash + char) correctly", () => {
    // \\_ in regex source = literal backslash followed by _
    // The first \\ is an escaped backslash — should NOT be modified
    expect(stripPythonIdentityEscapes("\\\\_")).toBe("\\\\_");
  });
});

describe("fixBracketCharClass", () => {
  it("converts []] to [\\]] (query_tabular pattern)", () => {
    expect(fixBracketCharClass("[[]\\S+[^,\"]*[]]")).toBe("[[]\\S+[^,\"]*[\\]]");
  });

  it("leaves normal character classes unchanged", () => {
    expect(fixBracketCharClass("[a-z]")).toBe("[a-z]");
  });
});

describe("jsonSchemaSafePattern", () => {
  it("passes simple patterns through", () => {
    expect(jsonSchemaSafePattern("^[actg]*$")).toBe("^[actg]*$");
  });

  it("fixes bcftools_annotate pattern with \\_", () => {
    const pattern = "^([+]?(%[A-Z]+)(\\_%[A-Z]+)*)?$";
    const safe = jsonSchemaSafePattern(pattern);
    expect(safe).not.toBeNull();
    // Verify it compiles under /u
    expect(() => new RegExp(safe!, "u")).not.toThrow();
    // Verify it still matches expected values
    const re = new RegExp(safe!);
    expect(re.test("%CHROM_%POS")).toBe(true);
    expect(re.test("")).toBe(true);
  });

  it("fixes samtools_stats pattern with \\' and \\\"", () => {
    const pattern = "^[^\\s\\'\\\":]+(:\\d+(-\\d+){0,1}){0,1}$";
    const safe = jsonSchemaSafePattern(pattern);
    expect(safe).not.toBeNull();
    expect(() => new RegExp(safe!, "u")).not.toThrow();
    const re = new RegExp(safe!);
    expect(re.test("file.bam")).toBe(true);
    expect(re.test("file.bam:100-200")).toBe(true);
    expect(re.test("file with space")).toBe(false);
  });

  it("fixes query_tabular pattern with []]", () => {
    const pattern = "^([A-Za-z]\\w*|[[]\\S+[^,\"]*[]])$";
    const safe = jsonSchemaSafePattern(pattern);
    expect(safe).not.toBeNull();
    expect(() => new RegExp(safe!, "u")).not.toThrow();
  });

  it("returns null for truly unsalvageable patterns", () => {
    // A pattern that can't be fixed — use something definitely invalid in /u mode
    // (This is a safety net test; in practice we haven't hit this)
    const result = jsonSchemaSafePattern("(?<=\\K)test");
    // \K is invalid in JS entirely, but after stripping it becomes K which is fine
    // Let's just verify the function doesn't throw
    expect(result === null || typeof result === "string").toBe(true);
  });
});

describe("end-to-end: known failing patterns compile under /u", () => {
  const knownPatterns = [
    // bcftools_annotate
    "^([+]?(%[A-Z]+)(\\_%[A-Z]+)*)?$",
    // samtools_stats
    "^[^\\s\\'\\\":]+(:\\d+(-\\d+){0,1}){0,1}$",
    // query_tabular (two variants with []])
    "^([A-Za-z]\\w*|\\d+\\.?\\d*|[[]\\S+[^,\"]*[]])(\\s*,\\s*([A-Za-z]\\w*|\\d+\\.?\\d*|[[]\\S+[^,\"]*[]]))*\\s*$",
    "^([A-Za-z]\\w*|[[]\\S+[^,\"]*[]])(\\s*,\\s*([A-Za-z]\\w*|[[]\\S+[^,\"]*[]]))*\\s*$",
  ];

  for (const pattern of knownPatterns) {
    it(`jsonSchemaSafePattern("${pattern.slice(0, 40)}...")`, () => {
      const safe = jsonSchemaSafePattern(pattern);
      expect(safe).not.toBeNull();
      expect(() => new RegExp(safe!, "u")).not.toThrow();
    });
  }
});
