/**
 * Port of Galaxy's rule builder DSL: `galaxy.util.rules_dsl.RuleSet` and the
 * client's `RuleBuilder/rule-definitions.js` `applyRules`.
 *
 * Conformance is checked against Galaxy's `rules_dsl_spec.yml`, synced via
 * `make sync-rules-dsl-spec`. Python `re` expressions go through
 * `pyre-to-regexp`, as in Galaxy's client.
 */

import pyre, { type PyreRegExp } from "pyre-to-regexp";

export class RulesDSLError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RulesDSLError";
  }
}

export interface Rule {
  type: string;
  [key: string]: unknown;
}

export interface RuleMapping {
  type: string;
  columns: number[];
  [key: string]: unknown;
}

export interface RuleSetDict {
  rules: Rule[];
  mapping?: RuleMapping[];
}

/** Collection element metadata a rule set reads from; tests also pass bare scalars. */
export interface RuleSource {
  identifiers?: string[];
  indices?: number[];
  tags?: string[];
  columns?: unknown[];
  hid?: unknown;
  name?: unknown;
  path?: unknown;
  uri?: unknown;
}

export type RuleRow = unknown[];

type KeyType = "int" | "str" | "bool" | "list";

interface RuleDefinition {
  validate(rule: Rule): void;
  apply(rule: Rule, data: RuleRow[], sources: unknown[]): [RuleRow[], unknown[]];
  /** Column header markers after the rule; unchanged when omitted. */
  columns?(rule: Rule, columns: string[]): string[];
}

const NEW_COLUMN = "new";

const addsOneColumn = (_rule: Rule, columns: string[]) => [...columns, NEW_COLUMN];

const removeColumns = (columns: string[], targets: number[]) =>
  columns.filter((_, index) => !targets.includes(index));

const KEY_TYPE_CHECKS: Record<KeyType, (value: unknown) => boolean> = {
  int: (value) => Number.isInteger(value),
  str: (value) => typeof value === "string",
  bool: (value) => typeof value === "boolean",
  list: (value) => Array.isArray(value),
};

function ensureRuleContainsKeys(rule: Rule, keys: Record<string, KeyType>): void {
  for (const [key, keyType] of Object.entries(keys)) {
    if (!(key in rule)) {
      throw new RulesDSLError(`Rule of type [${rule.type}] does not contain key [${key}].`);
    }
    if (!KEY_TYPE_CHECKS[keyType](rule[key])) {
      throw new RulesDSLError(
        `Rule of type [${rule.type}] does not contain correct value type for key [${key}].`,
      );
    }
  }
}

function ensureKeyValueIn(rule: Rule, key: string, values: string[]): void {
  const value = rule[key];
  if (!values.includes(value as string)) {
    throw new RulesDSLError(`Invalid value [${String(value)}] for [${key}] encountered.`);
  }
}

/** Compile a Python `re` pattern the way Galaxy's client does. */
function compilePattern(expression: string): PyreRegExp {
  try {
    return pyre(String(expression));
  } catch {
    throw new RulesDSLError("Invalid regular expression specified.");
  }
}

function applyRegex(
  regex: string,
  target: number,
  data: RuleRow[],
  replacement?: string,
  groupCount?: number | string,
  allowUnmatched = false,
): RuleRow[] {
  const pattern = compilePattern(regex);
  const groups = groupCount ? Number(groupCount) : 0;
  let failedCount = 0;
  const newData = data.map((row) => {
    const match = pattern.exec(String(row[target]));
    if (!match) {
      if (!allowUnmatched) {
        failedCount++;
        return row;
      }
      return [...row, ...Array<string>(replacement == null && groups ? groups : 1).fill("")];
    }
    if (replacement != null) {
      return [...row, pattern.pyreReplace(match[0], replacement)];
    }
    if (groups) {
      if (match.length - 1 !== groups) {
        failedCount++;
        return row;
      }
      return [...row, ...match.slice(1)];
    }
    return [...row, match[0]];
  });
  if (failedCount > 0) {
    throw new RulesDSLError(`${failedCount} row(s) failed to match specified regular expression.`);
  }
  return newData;
}

function filterIndex<T>(keep: (index: number) => boolean, items: T[]): T[] {
  return items.filter((_, index) => keep(index));
}

/** Python `float()` on a cell; throws instead of producing NaN. */
function toFloat(value: unknown): number {
  const text = String(value).trim();
  const result = Number(text);
  if (text === "" || (Number.isNaN(result) && text.toLowerCase() !== "nan")) {
    throw new RulesDSLError(`Could not convert [${text}] to a number.`);
  }
  return result;
}

function source(sources: unknown[], index: number): RuleSource {
  return sources[index] as RuleSource;
}

function metadataIndex(value: string, prefix: string): number {
  const index = Number(value.slice(prefix.length));
  if (!Number.isInteger(index)) {
    throw new RulesDSLError(`Invalid column metadata value [${value}].`);
  }
  return index;
}

/** Upload/history metadata only Galaxy's client reads; Python rejects these. */
const CLIENT_METADATA = ["hid", "name", "path", "uri"] as const;

const RULES_DEFINITIONS: Record<string, RuleDefinition> = {
  add_column_metadata: {
    columns: addsOneColumn,
    validate: (rule) => ensureRuleContainsKeys(rule, { value: "str" }),
    apply: (rule, data, sources) => {
      const value = rule.value as string;
      let cell: (index: number) => unknown;
      if (value.startsWith("identifier")) {
        const identifierIndex = metadataIndex(value, "identifier");
        cell = (index) => source(sources, index).identifiers![identifierIndex];
      } else if (value.startsWith("index")) {
        const elementIndex = metadataIndex(value, "index");
        cell = (index) => String(source(sources, index).indices![elementIndex]);
      } else if (value === "tags") {
        cell = (index) => [...source(sources, index).tags!].sort().join(",");
      } else if ((CLIENT_METADATA as readonly string[]).includes(value)) {
        cell = (index) => source(sources, index)[value as (typeof CLIENT_METADATA)[number]];
      } else {
        throw new RulesDSLError(`Unknown metadata type [${value}]`);
      }
      return [data.map((row, index) => [...row, cell(index)]), sources];
    },
  },
  add_column_group_tag_value: {
    columns: addsOneColumn,
    validate: (rule) => ensureRuleContainsKeys(rule, { value: "str" }),
    apply: (rule, data, sources) => {
      const tagPrefix = `group:${rule.value as string}:`;
      const newRows = data.map((row, index) => {
        const tag = [...source(sources, index).tags!].sort().find((t) => t.startsWith(tagPrefix));
        const value = tag === undefined ? (rule.default_value ?? "") : tag.slice(tagPrefix.length);
        return [...row, value];
      });
      return [newRows, sources];
    },
  },
  add_column_concatenate: {
    columns: addsOneColumn,
    validate: (rule) =>
      ensureRuleContainsKeys(rule, { target_column_0: "int", target_column_1: "int" }),
    apply: (rule, data, sources) => {
      const column0 = rule.target_column_0 as number;
      const column1 = rule.target_column_1 as number;
      return [
        data.map((row) => [...row, (row[column0] as string) + (row[column1] as string)]),
        sources,
      ];
    },
  },
  add_column_basename: {
    columns: addsOneColumn,
    validate: (rule) => ensureRuleContainsKeys(rule, { target_column: "int" }),
    apply: (rule, data, sources) => [
      applyRegex("[^/]*$", rule.target_column as number, data),
      sources,
    ],
  },
  add_column_regex: {
    columns: (rule, columns) => {
      const added = rule.replacement == null && rule.group_count ? Number(rule.group_count) : 1;
      return [...columns, ...Array<string>(added).fill(NEW_COLUMN)];
    },
    validate: (rule) => {
      ensureRuleContainsKeys(rule, { target_column: "int", expression: "str" });
      compilePattern(rule.expression as string);
    },
    apply: (rule, data, sources) => {
      let allowUnmatched = false;
      if ("allow_unmatched" in rule) {
        ensureRuleContainsKeys(rule, { allow_unmatched: "bool" });
        allowUnmatched = rule.allow_unmatched as boolean;
      }
      const newData = applyRegex(
        rule.expression as string,
        rule.target_column as number,
        data,
        rule.replacement as string | undefined,
        rule.group_count as number | undefined,
        allowUnmatched,
      );
      return [newData, sources];
    },
  },
  add_column_rownum: {
    columns: addsOneColumn,
    validate: (rule) => ensureRuleContainsKeys(rule, { start: "int" }),
    apply: (rule, data, sources) => {
      const start = rule.start as number;
      return [data.map((row, index) => [...row, `${index + start}`]), sources];
    },
  },
  add_column_value: {
    columns: addsOneColumn,
    validate: (rule) => ensureRuleContainsKeys(rule, { value: "str" }),
    apply: (rule, data, sources) => [data.map((row) => [...row, String(rule.value)]), sources],
  },
  add_column_substr: {
    columns: addsOneColumn,
    validate: (rule) => {
      ensureRuleContainsKeys(rule, { target_column: "int", length: "int", substr_type: "str" });
      ensureKeyValueIn(rule, "substr_type", [
        "keep_prefix",
        "drop_prefix",
        "keep_suffix",
        "drop_suffix",
      ]);
    },
    apply: (rule, data, sources) => {
      const target = rule.target_column as number;
      const length = rule.length as number;
      const substrType = rule.substr_type as string;
      const newRows = data.map((row) => {
        const original = row[target] as string;
        let start = 0;
        let end = original.length;
        if (substrType === "keep_prefix") {
          end = length;
        } else if (substrType === "drop_prefix") {
          start = length;
        } else if (substrType === "keep_suffix") {
          start = Math.max(end - length, 0);
        } else {
          end = Math.max(end - length, 0);
        }
        return [...row, original.slice(start, end)];
      });
      return [newRows, sources];
    },
  },
  add_column_from_sample_sheet_index: {
    columns: addsOneColumn,
    validate: (rule) => ensureRuleContainsKeys(rule, { value: "int" }),
    apply: (rule, data, sources) => {
      const columnIndex = rule.value as number;
      return [
        data.map((row, index) => [...row, source(sources, index).columns![columnIndex]]),
        sources,
      ];
    },
  },
  remove_columns: {
    columns: (rule, columns) => removeColumns(columns, rule.target_columns as number[]),
    validate: (rule) => ensureRuleContainsKeys(rule, { target_columns: "list" }),
    apply: (rule, data, sources) => {
      const targetColumns = rule.target_columns as number[];
      return [data.map((row) => row.filter((_, index) => !targetColumns.includes(index))), sources];
    },
  },
  add_filter_regex: {
    validate: (rule) => {
      ensureRuleContainsKeys(rule, { target_column: "int", invert: "bool", expression: "str" });
      compilePattern(rule.expression as string);
    },
    apply: (rule, data, sources) => {
      const pattern = compilePattern(rule.expression as string);
      const invert = rule.invert as boolean;
      const keep = (index: number) =>
        pattern.test(String(data[index]![rule.target_column as number])) ? !invert : invert;
      return [filterIndex(keep, data), filterIndex(keep, sources)];
    },
  },
  add_filter_count: {
    validate: (rule) => {
      ensureRuleContainsKeys(rule, { count: "int", invert: "bool", which: "str" });
      ensureKeyValueIn(rule, "which", ["first", "last"]);
    },
    apply: (rule, data, sources) => {
      const numRows = data.length;
      const n = rule.count as number;
      const invert = rule.invert as boolean;
      const keep = (index: number) => {
        const matches = rule.which === "first" ? index >= n : index < numRows - n;
        return matches ? !invert : invert;
      };
      return [filterIndex(keep, data), filterIndex(keep, sources)];
    },
  },
  add_filter_empty: {
    validate: (rule) => ensureRuleContainsKeys(rule, { target_column: "int", invert: "bool" }),
    apply: (rule, data, sources) => {
      const invert = rule.invert as boolean;
      const keep = (index: number) =>
        (data[index]![rule.target_column as number] as string).length !== 0 ? !invert : invert;
      return [filterIndex(keep, data), filterIndex(keep, sources)];
    },
  },
  add_filter_matches: {
    validate: (rule) =>
      ensureRuleContainsKeys(rule, { target_column: "int", invert: "bool", value: "str" }),
    apply: (rule, data, sources) => {
      const invert = rule.invert as boolean;
      const keep = (index: number) =>
        data[index]![rule.target_column as number] === rule.value ? !invert : invert;
      return [filterIndex(keep, data), filterIndex(keep, sources)];
    },
  },
  add_filter_compare: {
    validate: (rule) => {
      ensureRuleContainsKeys(rule, { target_column: "int", value: "int", compare_type: "str" });
      ensureKeyValueIn(rule, "compare_type", [
        "less_than",
        "less_than_equal",
        "greater_than",
        "greater_than_equal",
      ]);
    },
    apply: (rule, data, sources) => {
      const value = rule.value as number;
      const keep = (index: number) => {
        const target = toFloat(data[index]![rule.target_column as number]);
        switch (rule.compare_type) {
          case "less_than":
            return target < value;
          case "less_than_equal":
            return target <= value;
          case "greater_than":
            return target > value;
          default:
            return target >= value;
        }
      };
      return [filterIndex(keep, data), filterIndex(keep, sources)];
    },
  },
  sort: {
    validate: (rule) => ensureRuleContainsKeys(rule, { target_column: "int", numeric: "bool" }),
    apply: (rule, data, sources) => {
      const target = rule.target_column as number;
      const key = (row: RuleRow) => (rule.numeric ? toFloat(row[target]) : String(row[target]));
      // Array.prototype.sort is stable, matching Python's sorted().
      const sorted = data
        .map((row, index) => ({ row, source: sources[index], key: key(row) }))
        .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
      return [sorted.map((item) => item.row), sorted.map((item) => item.source)];
    },
  },
  swap_columns: {
    columns: (rule, columns) => {
      const swapped = [...columns];
      swapped[rule.target_column_0 as number] = columns[rule.target_column_1 as number]!;
      swapped[rule.target_column_1 as number] = columns[rule.target_column_0 as number]!;
      return swapped;
    },
    validate: (rule) =>
      ensureRuleContainsKeys(rule, { target_column_0: "int", target_column_1: "int" }),
    apply: (rule, data, sources) => {
      const column0 = rule.target_column_0 as number;
      const column1 = rule.target_column_1 as number;
      const newRows = data.map((row) => {
        const copy = [...row];
        copy[column0] = row[column1];
        copy[column1] = row[column0];
        return copy;
      });
      return [newRows, sources];
    },
  },
  split_columns: {
    columns: (rule, columns) => removeColumns(columns, rule.target_columns_0 as number[]),
    validate: (rule) =>
      ensureRuleContainsKeys(rule, { target_columns_0: "list", target_columns_1: "list" }),
    apply: (rule, data, sources) => {
      const columns0 = rule.target_columns_0 as number[];
      const columns1 = rule.target_columns_1 as number[];
      const newRows = data.flatMap((row) => {
        const row0: RuleRow = [];
        const row1: RuleRow = [];
        row.forEach((cell, index) => {
          if (columns0.includes(index)) {
            row0.push(cell);
          } else if (columns1.includes(index)) {
            row1.push(cell);
          } else {
            row0.push(cell);
            row1.push(cell);
          }
        });
        return [row0, row1];
      });
      return [newRows, sources.flatMap((s) => [s, s])];
    },
  },
};

function ruleDefinition(rule: Rule): RuleDefinition {
  const definition = RULES_DEFINITIONS[rule.type];
  if (!definition) {
    throw new RulesDSLError(`Unknown rule type [${rule.type}].`);
  }
  return definition;
}

export class RuleSet {
  readonly rules: Rule[];
  readonly mapping: RuleMapping[];

  constructor(ruleSet: RuleSetDict) {
    if (!Array.isArray(ruleSet.rules)) {
      throw new RulesDSLError("Rule set does not contain [rules].");
    }
    this.rules = ruleSet.rules;
    this.mapping = ruleSet.mapping ?? [];
  }

  apply(data: RuleRow[], sources: unknown[]): [RuleRow[], unknown[]] {
    for (const rule of this.rules) {
      const definition = ruleDefinition(rule);
      definition.validate(rule);
      [data, sources] = definition.apply(rule, data, sources);
    }
    return [data, sources];
  }

  get hasErrors(): boolean {
    try {
      for (const rule of this.rules) {
        ruleDefinition(rule).validate(rule);
      }
    } catch {
      return true;
    }
    return false;
  }

  get mappingAsDict(): Record<string, RuleMapping> {
    return Object.fromEntries(this.mapping.map((m) => [m.type, m]));
  }

  get identifierColumns(): number[] {
    const mapping = this.mappingAsDict;
    const columns = [...(mapping.list_identifiers?.columns ?? [])];
    for (const type of ["paired_identifier", "paired_or_unpaired_identifier"]) {
      if (mapping[type]) {
        columns.push(mapping[type].columns[0]!);
      }
    }
    return columns;
  }

  /** Collection type the mapping builds, e.g. `list:paired`; `""` when nothing is mapped. */
  get collectionType(): string {
    const mapping = this.mappingAsDict;
    const ranks = (mapping.list_identifiers?.columns ?? []).map(() => "list");
    if (mapping.paired_identifier) {
      ranks.push("paired");
    }
    if (mapping.paired_or_unpaired_identifier) {
      ranks.push("paired_or_unpaired");
    }
    return ranks.join(":");
  }
}

/** A rule as Galaxy's rule builder holds it; `applyRules` sets `error` and `warn`. */
export interface ClientRule extends Rule {
  error?: string | null;
  warn?: string | null;
}

export interface ApplyRulesResult {
  data: RuleRow[];
  sources: unknown[];
  columns: string[];
  colHeadersPerRule: string[][];
}

export const SKIPPED_RULE_WARNING = "Skipped due to previous errors.";

/** Spreadsheet-style headers (`A`, `B`, …) for the current table width. */
export function colHeadersFor(data: RuleRow[], columns?: string[]): string[] {
  const width = data.length === 0 ? (columns?.length ?? 0) : data[0]!.length;
  return Array.from({ length: width }, (_, i) => String.fromCharCode(65 + i));
}

/**
 * Galaxy client's `applyRules`: runs rules without validating them, records a
 * failing rule's message on `rule.error` and skips the rest with `rule.warn`.
 */
export function applyRules(
  data: RuleRow[],
  sources: unknown[],
  columns: string[],
  rules: ClientRule[],
  headersPerRule: string[][] = [],
): ApplyRulesResult {
  const colHeadersPerRule = Array.from(headersPerRule);
  let hasRuleError = false;
  rules.forEach((rule, ruleIndex) => {
    colHeadersPerRule[ruleIndex] = colHeadersFor(data, columns);
    rule.error = null;
    rule.warn = null;
    if (hasRuleError) {
      rule.warn = SKIPPED_RULE_WARNING;
      return;
    }
    try {
      const definition = ruleDefinition(rule);
      [data, sources] = definition.apply(rule, data, sources);
      columns = definition.columns ? definition.columns(rule, columns) : columns;
    } catch (e) {
      hasRuleError = true;
      rule.error = e instanceof Error ? e.message : String(e);
    }
  });
  return { data, sources, columns, colHeadersPerRule };
}
