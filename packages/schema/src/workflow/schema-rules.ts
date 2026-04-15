/**
 * Schema-rule catalog types and parser.
 *
 * Mirrors gxformat2/schema_rules.py. Schema rules describe checks already
 * enforced by the Effect decode layer. Each rule ships with positive and
 * negative fixtures; the catalog contract is tested end-to-end by running
 * fixtures through validators — not by inspecting ParseError shapes.
 *
 * The YAML file lives alongside this module at `./schema_rules.yml`. This
 * module stays fs-free to keep src/ browser-compatible — callers read the
 * file themselves (see test/schema-rules-catalog.test.ts) and hand the
 * string to `parseSchemaRules`.
 */

import * as yaml from "yaml";

/** Relative path (from this module) to the catalog YAML. */
export const SCHEMA_RULES_FILENAME = "schema_rules.yml";

export type Severity = "error" | "warning";
export type AppliesTo = "format2" | "native";
/**
 * Validator flavors that reject the negative fixture.
 * - `both`: both lax and strict reject (e.g. missing required field)
 * - `strict`: only strict rejects (e.g. unknown extra field)
 * - `lax`: only lax rejects — unusual, reserved for completeness
 */
export type Scope = "both" | "strict" | "lax";

export interface SchemaRuleTests {
  positive: string[];
  negative: string[];
}

export interface SchemaRule {
  id: string;
  severity: Severity;
  applies_to: AppliesTo[];
  scope: Scope;
  description: string;
  tests: SchemaRuleTests;
}

interface RawSchemaRule {
  severity: Severity;
  applies_to: AppliesTo[];
  scope: Scope;
  description?: string;
  tests: SchemaRuleTests;
}

export function parseSchemaRules(yamlContent: string): SchemaRule[] {
  const raw = yaml.parse(yamlContent) as Record<string, RawSchemaRule>;
  return Object.entries(raw).map(([id, body]) => ({
    id,
    severity: body.severity,
    applies_to: body.applies_to,
    scope: body.scope,
    description: body.description ?? "",
    tests: body.tests,
  }));
}
