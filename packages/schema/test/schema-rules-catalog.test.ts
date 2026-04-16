/**
 * Parametrized runner for the schema-rule catalog.
 *
 * Mirrors gxformat2/tests/test_schema_rules_catalog.py. Positive fixtures must
 * pass both lax and strict validation. Negative fixtures must fail per the
 * rule's declared scope and continue to pass in the opposite flavor
 * (documenting that it IS scope-specific). Validators are selected from the
 * fixture filename extension.
 */

import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

import * as yaml from "yaml";

import {
  parseSchemaRules,
  SCHEMA_RULES_FILENAME,
  type AppliesTo,
  type SchemaRule,
} from "../src/workflow/schema-rules.js";
import { validatorForFixture } from "../src/workflow/validators.js";

const FIXTURES_DIR = path.join(import.meta.dirname, "fixtures", "workflows");
const FORMAT2_DIR = path.join(FIXTURES_DIR, "format2");
const NATIVE_DIR = path.join(FIXTURES_DIR, "native");

const SCHEMA_RULES_PATH = path.join(
  import.meta.dirname,
  "..",
  "src",
  "workflow",
  SCHEMA_RULES_FILENAME,
);
const RULES: SchemaRule[] = parseSchemaRules(fs.readFileSync(SCHEMA_RULES_PATH, "utf-8"));

function fixtureAppliesTo(fixture: string): AppliesTo {
  return fixture.endsWith(".ga") ? "native" : "format2";
}

function loadFixture(name: string): unknown {
  for (const dir of [FORMAT2_DIR, NATIVE_DIR]) {
    const filePath = path.join(dir, name);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf-8");
      return name.endsWith(".ga") ? JSON.parse(content) : yaml.parse(content);
    }
  }
  throw new Error(`Fixture not found: ${name}`);
}

function referencedFixtures(): Set<string> {
  const set = new Set<string>();
  for (const rule of RULES) {
    for (const fx of rule.tests.positive) set.add(fx);
    for (const fx of rule.tests.negative) set.add(fx);
  }
  return set;
}

describe("schema-rule catalog", () => {
  for (const rule of RULES) {
    describe(rule.id, () => {
      for (const fixture of rule.tests.positive) {
        it(`positive ${fixture} passes lax and strict`, () => {
          const wf = loadFixture(fixture);
          expect(() => validatorForFixture(fixture, false)(wf)).not.toThrow();
          expect(() => validatorForFixture(fixture, true)(wf)).not.toThrow();
        });
      }
      for (const fixture of rule.tests.negative) {
        const scope = rule.scope;
        it(`negative ${fixture} matches scope=${scope}`, () => {
          const wf = loadFixture(fixture);
          if (scope === "both" || scope === "strict") {
            expect(() => validatorForFixture(fixture, true)(wf)).toThrow();
          }
          if (scope === "strict") {
            expect(() => validatorForFixture(fixture, false)(wf)).not.toThrow();
          }
          if (scope === "both" || scope === "lax") {
            expect(() => validatorForFixture(fixture, false)(wf)).toThrow();
          }
          if (scope === "lax") {
            expect(() => validatorForFixture(fixture, true)(wf)).not.toThrow();
          }
        });
      }
    });
  }
});

describe("schema-rule catalog integrity", () => {
  it("every rule ships with at least one positive and one negative fixture", () => {
    for (const rule of RULES) {
      expect(rule.tests.positive, `${rule.id}: empty positive fixture list`).not.toHaveLength(0);
      expect(rule.tests.negative, `${rule.id}: empty negative fixture list`).not.toHaveLength(0);
    }
  });

  it("fixture extensions match rule applies_to", () => {
    for (const rule of RULES) {
      for (const fx of [...rule.tests.positive, ...rule.tests.negative]) {
        const fmt = fixtureAppliesTo(fx);
        expect(
          rule.applies_to.includes(fmt),
          `${rule.id}: fixture ${fx} is ${fmt} but rule applies_to=${JSON.stringify(rule.applies_to)}`,
        ).toBe(true);
      }
    }
  });

  it("every referenced fixture exists on disk", () => {
    const missing: string[] = [];
    for (const fx of referencedFixtures()) {
      const inF2 = fs.existsSync(path.join(FORMAT2_DIR, fx));
      const inNa = fs.existsSync(path.join(NATIVE_DIR, fx));
      if (!inF2 && !inNa) missing.push(fx);
    }
    expect(missing, `schema-rules.yml fixtures not on disk: ${missing.join(", ")}`).toHaveLength(0);
  });

  it("every referenced fixture is covered by the sync manifest", () => {
    const manifestPath = path.join(
      import.meta.dirname,
      "..",
      "..",
      "..",
      "scripts",
      "sync-manifest.json",
    );
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as {
      groups: Array<{ name: string; entries: Array<{ patterns?: string[]; files?: string[] }> }>;
    };
    const wfGroup = manifest.groups.find((g) => g.name === "workflow-fixtures");
    expect(wfGroup, "workflow-fixtures group missing from sync manifest").toBeDefined();

    const globToRegex = (p: string): RegExp =>
      new RegExp("^" + p.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*") + "$");

    const unmatched: string[] = [];
    for (const fx of referencedFixtures()) {
      const covered = wfGroup!.entries.some((e) => {
        if (e.files?.includes(fx)) return true;
        return (e.patterns ?? []).some((p) => globToRegex(p).test(fx));
      });
      if (!covered) unmatched.push(fx);
    }
    expect(
      unmatched,
      `schema-rules.yml fixtures not covered by sync-manifest: ${unmatched.join(", ")}`,
    ).toHaveLength(0);
  });
});
