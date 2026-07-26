/**
 * Unit tests for the `InputSource` / `PageSource` seam and its inline/YAML dict
 * implementation (`DictInputSource` / `DictPageSource`) — the TS mirror of
 * Galaxy's `parser.interface.InputSource` + `YamlInputSource`. The end-to-end
 * dict behavior is covered by `user-tool-parse.test.ts`; these pin the seam
 * surface and the deliberate no-YAML-sections decision.
 */
import { describe, it, expect } from "vitest";

import { DictInputSource, DictPageSource, parseInputs } from "../src/user-tool-parse/index.js";

describe("DictPageSource", () => {
  it("normalizes a list of input dicts", () => {
    const sources = new DictPageSource([{ name: "a", type: "integer" }]).parseInputSources();
    expect(sources).toHaveLength(1);
    expect(sources[0].parseName()).toBe("a");
  });

  it("normalizes an object-map, injecting the key as name", () => {
    const sources = new DictPageSource({ a: { type: "integer" } }).parseInputSources();
    expect(sources[0].parseName()).toBe("a");
  });

  it("returns [] for a non-list, non-object raw", () => {
    expect(new DictPageSource(null).parseInputSources()).toEqual([]);
  });
});

describe("DictInputSource.parseInputType", () => {
  it("maps only conditional/repeat container keywords", () => {
    expect(new DictInputSource({ type: "conditional" }).parseInputType()).toBe("conditional");
    expect(new DictInputSource({ type: "repeat" }).parseInputType()).toBe("repeat");
    expect(new DictInputSource({ type: "integer" }).parseInputType()).toBe("param");
  });

  it("treats section as a param (YAML sections unsupported, matching Python)", () => {
    expect(new DictInputSource({ type: "section" }).parseInputType()).toBe("param");
  });
});

describe("YAML sections are rejected", () => {
  it("throws Unknown Galaxy parameter type for a top-level type: section", () => {
    expect(() => parseInputs([{ name: "s", type: "section" }])).toThrow(
      /Unknown Galaxy parameter type 'section'/,
    );
  });

  it("also rejects a section nested inside a repeat (same recursion path)", () => {
    expect(() =>
      parseInputs([{ name: "r", type: "repeat", blocks: [{ name: "s", type: "section" }] }]),
    ).toThrow(/Unknown Galaxy parameter type 'section'/);
  });
});

describe("DictInputSource accessors", () => {
  it("get returns the raw value or the default", () => {
    const s = new DictInputSource({ value: 5 });
    expect(s.get("value")).toBe(5);
    expect(s.get("missing", "d")).toBe("d");
  });

  it("getBool coerces dict-native strings/bools", () => {
    expect(new DictInputSource({ x: "yes" }).getBool("x", false)).toBe(true);
    expect(new DictInputSource({ x: true }).getBool("x", false)).toBe(true);
    expect(new DictInputSource({}).getBool("x", true)).toBe(true);
  });

  it("parseStaticOptions returns null when no options array is present", () => {
    expect(new DictInputSource({}).parseStaticOptions()).toBeNull();
    expect(new DictInputSource({ options: [{ value: "a" }] }).parseStaticOptions()).toEqual([
      { label: "a", value: "a", selected: false },
    ]);
  });

  it("parseNestedInputsSource follows the blocks/parameters/inputs fallback", () => {
    const s = new DictInputSource({ blocks: [{ name: "inner", type: "integer" }] });
    const inner = s.parseNestedInputsSource().parseInputSources();
    expect(inner[0].parseName()).toBe("inner");
  });

  it("parseTestInputSource throws when a conditional lacks test_parameter", () => {
    expect(() => new DictInputSource({ name: "c" }).parseTestInputSource()).toThrow(
      /conditional 'c' must define a 'test_parameter'/,
    );
  });

  it("parseWhenInputSources supports both the map and list shapes", () => {
    const asMap = new DictInputSource({
      when: { a: [{ name: "p", type: "integer" }] },
    }).parseWhenInputSources();
    expect(asMap).toHaveLength(1);
    expect(asMap[0][0]).toBe("a");
    expect(asMap[0][1].parseInputSources()[0].parseName()).toBe("p");

    const asList = new DictInputSource({
      whens: [{ discriminator: "b", parameters: [{ name: "q", type: "integer" }] }],
    }).parseWhenInputSources();
    expect(asList[0][0]).toBe("b");
    expect(asList[0][1].parseInputSources()[0].parseName()).toBe("q");
  });
});
