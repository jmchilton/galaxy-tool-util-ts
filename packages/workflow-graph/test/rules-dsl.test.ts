/* Conformance consumer for rules_dsl_spec.yml.

   Synced from Galaxy via `make sync-rules-dsl-spec`. The same corpus drives
   Python's test/unit/util/test_rule_utils.py and the client's
   RuleDefinitions.test.ts.
*/
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, it, expect } from "vitest";
import { parse as parseYaml } from "yaml";

import { RuleSet, type RuleRow, type RuleSetDict } from "../src/rules-dsl.js";

const SPEC_PATH = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "rules_dsl_spec.yml");

interface State {
  data: RuleRow[];
  sources?: unknown[];
}

interface SpecCase extends RuleSetDict {
  doc?: string;
  error?: boolean;
  initial?: State;
  final?: State;
}

const SPEC_CASES = parseYaml(readFileSync(SPEC_PATH, "utf-8")) as SpecCase[];

describe("rules_dsl_spec.yml conformance", () => {
  it("loads the synced corpus", () => {
    expect(SPEC_CASES.length).toBeGreaterThan(50);
  });

  SPEC_CASES.forEach((specCase, i) => {
    it(`case ${i}${specCase.doc ? ` - ${specCase.doc}` : ""}`, () => {
      const ruleSet = new RuleSet(specCase);
      if (specCase.initial) {
        const run = () => ruleSet.apply(specCase.initial!.data, specCase.initial!.sources!);
        if (specCase.error) {
          expect(run).toThrow();
          return;
        }
        const [data, sources] = run();
        expect(data).toEqual(specCase.final!.data);
        if (specCase.final!.sources) {
          expect(sources).toEqual(specCase.final!.sources);
        }
      } else {
        expect(specCase.error).toBe(true);
        expect(ruleSet.hasErrors).toBe(true);
      }
    });
  });
});

describe("RuleSet.collectionType", () => {
  const cases: [RuleSetDict["mapping"], string][] = [
    [[{ type: "list_identifiers", columns: [0] }], "list"],
    [[{ type: "list_identifiers", columns: [0, 1] }], "list:list"],
    [[{ type: "paired_identifier", columns: [0] }], "paired"],
    [
      [
        { type: "list_identifiers", columns: [0] },
        { type: "paired_identifier", columns: [1] },
      ],
      "list:paired",
    ],
    [[{ type: "paired_or_unpaired_identifier", columns: [0] }], "paired_or_unpaired"],
    [
      [
        { type: "list_identifiers", columns: [0] },
        { type: "paired_or_unpaired_identifier", columns: [1] },
      ],
      "list:paired_or_unpaired",
    ],
    [[], ""],
    [undefined, ""],
  ];
  for (const [mapping, expected] of cases) {
    it(`${JSON.stringify(mapping)} -> "${expected}"`, () => {
      expect(new RuleSet({ rules: [], mapping }).collectionType).toBe(expected);
    });
  }

  it("ignores non-identifier mappings such as url", () => {
    const mapping = [
      { type: "url", columns: [2] },
      { type: "list_identifiers", columns: [0] },
    ];
    expect(new RuleSet({ rules: [], mapping }).collectionType).toBe("list");
  });

  it("does not depend on the rules validating", () => {
    const ruleSet = new RuleSet({
      rules: [{ type: "invalid_rule_type" }],
      mapping: [{ type: "list_identifiers", columns: [0] }],
    });
    expect(ruleSet.hasErrors).toBe(true);
    expect(ruleSet.collectionType).toBe("list");
  });
});

describe("Python regex translation", () => {
  const regexRule = (expression: string, replacement?: string) =>
    new RuleSet({
      rules: [{ type: "add_column_regex", target_column: 0, expression, replacement }],
    });

  it("supports (?P<name>...) groups and \\g<name> replacements", () => {
    const [data] = regexRule("(?P<sample>\\w+)_R(?P<read>[12])", "\\g<read>-\\g<sample>").apply(
      [["s1_R2"]],
      [1],
    );
    expect(data).toEqual([["s1_R2", "2-s1"]]);
  });

  it("supports \\g<1> numbered replacements", () => {
    const [data] = regexRule("(\\w+)_(\\d)", "\\g<2>\\1").apply([["ab_3"]], [1]);
    expect(data).toEqual([["ab_3", "3ab"]]);
  });

  it("rejects replacements referencing missing groups", () => {
    expect(() => regexRule("(o+)", "\\2").apply([["foo"]], [1])).toThrow(/group reference/);
  });

  it("flags invalid patterns as errors", () => {
    expect(regexRule("(?P<x>a").hasErrors).toBe(true);
  });
});
