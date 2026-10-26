/* Conformance consumer for rules_dsl_spec.yml.

   Synced from Galaxy via `make sync-rules-dsl-spec`. The same corpus drives
   Python's test/unit/util/test_rule_utils.py (RuleSet) and the client's
   RuleDefinitions.test.ts (applyRules).
*/
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, it, expect } from "vitest";
import { parse as parseYaml } from "yaml";

import {
  RuleSet,
  SKIPPED_RULE_WARNING,
  applyRules,
  colHeadersFor,
  type ClientRule,
  type RuleRow,
  type RuleSetDict,
} from "../src/rules-dsl.js";

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

  it("reports how many rows failed to match", () => {
    expect(() =>
      regexRule("(o+)").apply([["foo"], ["cat"], ["bat"], ["rat"]], [1, 2, 3, 4]),
    ).toThrow("3 row(s) failed to match specified regular expression.");
  });

  it("flags invalid patterns as errors", () => {
    expect(regexRule("(?P<x>a").hasErrors).toBe(true);
  });
});

describe("applyRules (client) rules_dsl_spec.yml conformance", () => {
  // Client applyRules never validates, so error-only cases without `initial` don't apply.
  SPEC_CASES.forEach((specCase, i) => {
    if (!specCase.initial) return;
    it(`case ${i}${specCase.doc ? ` - ${specCase.doc}` : ""}`, () => {
      const rules = structuredClone(specCase.rules) as ClientRule[];
      const { data, sources } = specCase.initial!;
      const columns = Array<string>(data[0]?.length ?? 0).fill("new");
      const result = applyRules(data, sources!, columns, rules);
      if (specCase.error) {
        expect(rules.some((rule) => rule.error)).toBe(true);
        return;
      }
      expect(rules.map((rule) => rule.error)).toEqual(rules.map(() => null));
      expect(result.data).toEqual(specCase.final!.data);
      if (specCase.final!.sources) {
        expect(result.sources).toEqual(specCase.final!.sources);
      }
      expect(result.columns).toHaveLength(result.data[0]?.length ?? result.columns.length);
    });
  });
});

describe("applyRules (client)", () => {
  const data = [
    ["a", "b", "c"],
    ["d", "e", "f"],
  ];

  it("tracks new, removed and swapped columns", () => {
    const rules: ClientRule[] = [
      { type: "add_column_value", value: "x" },
      { type: "add_column_regex", target_column: 0, expression: "(.)", group_count: 1 },
      { type: "remove_columns", target_columns: [1] },
      { type: "swap_columns", target_column_0: 0, target_column_1: 3 },
    ];
    const result = applyRules(data, [1, 2], ["c0", "c1", "c2"], rules);
    expect(result.columns).toEqual(["new", "c2", "new", "c0"]);
    expect(result.data).toEqual([
      ["a", "c", "x", "a"],
      ["d", "f", "x", "d"],
    ]);
    expect(result.colHeadersPerRule).toEqual([
      ["A", "B", "C"],
      ["A", "B", "C", "D"],
      ["A", "B", "C", "D", "E"],
      ["A", "B", "C", "D"],
    ]);
  });

  it("counts one column per regex group", () => {
    const rules: ClientRule[] = [
      { type: "add_column_regex", target_column: 0, expression: "(.)(.)?", group_count: 2 },
    ];
    expect(applyRules(data, [1, 2], ["c0", "c1", "c2"], rules).columns).toHaveLength(5);
  });

  it("drops target_columns_0 from the headers when splitting", () => {
    const rules: ClientRule[] = [
      { type: "split_columns", target_columns_0: [0], target_columns_1: [1] },
    ];
    const result = applyRules(data, [1, 2], ["c0", "c1", "c2"], rules);
    expect(result.columns).toEqual(["c1", "c2"]);
    expect(result.data[0]).toHaveLength(2);
  });

  it("records the error and skips later rules", () => {
    const rules: ClientRule[] = [
      { type: "add_column_regex", target_column: 0, expression: "(z)" },
      { type: "add_column_value", value: "x" },
    ];
    const result = applyRules(data, [1, 2], ["c0", "c1", "c2"], rules);
    expect(rules[0]!.error).toBe("2 row(s) failed to match specified regular expression.");
    expect(rules[1]!.warn).toBe(SKIPPED_RULE_WARNING);
    expect(result.data).toEqual(data);
  });

  it("reports invalid expressions and unknown rule types", () => {
    const rules: ClientRule[] = [
      { type: "add_filter_regex", target_column: 0, expression: "(", invert: false },
    ];
    applyRules(data, [1, 2], [], rules);
    expect(rules[0]!.error).toBe("Invalid regular expression specified.");
    const unknown: ClientRule[] = [{ type: "invalid_rule_type" }];
    applyRules(data, [1, 2], [], unknown);
    expect(unknown[0]!.error).toBe("Unknown rule type [invalid_rule_type].");
  });

  it("reads upload metadata columns", () => {
    const rules: ClientRule[] = [{ type: "add_column_metadata", value: "uri" }];
    const result = applyRules([["a"]], [{ uri: "https://example.org/a" }], ["new"], rules);
    expect(result.data).toEqual([["a", "https://example.org/a"]]);
  });

  it("does not mutate the caller's columns", () => {
    const columns = ["c0", "c1", "c2"];
    applyRules(data, [1, 2], columns, [{ type: "add_column_value", value: "x" }]);
    expect(columns).toEqual(["c0", "c1", "c2"]);
  });
});

describe("colHeadersFor", () => {
  it("returns an empty header list when there is no data and no columns", () => {
    expect(colHeadersFor([], undefined)).toEqual([]);
  });

  it("uses the data width over the column count", () => {
    expect(colHeadersFor([["a", "b", "c"]], ["new"])).toEqual(["A", "B", "C"]);
  });

  it("uses column count when there is no data", () => {
    expect(colHeadersFor([], ["new", "new"])).toEqual(["A", "B"]);
  });
});
