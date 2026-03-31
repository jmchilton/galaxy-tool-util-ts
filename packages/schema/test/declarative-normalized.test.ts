/**
 * Declarative normalization tests driven by YAML expectation files.
 *
 * Port of gxformat2's test_declarative_normalized.py.
 * Expectation files live in test/fixtures/expectations/.
 * Each file contains named test cases with a fixture, operation, and assertions.
 *
 * Path element types:
 *   - string: property access (dict key)
 *   - number: list index
 *   - "$length": terminal, returns length of current object
 *   - {field: value}: find first list item where item[field] === value
 *
 * Assertion modes:
 *   - value: exact equality
 *   - value_contains: substring containment
 *   - value_set: unordered set comparison
 *
 * Special case:
 *   - assertions may be omitted or empty: operation succeeding is the test
 *   - expect_error: true: operation must raise an exception
 */

import { describe, it, expect } from "vitest";
import * as yaml from "yaml";
import * as fs from "node:fs";
import * as path from "node:path";
import { Schema } from "effect";

import { normalizedFormat2 } from "../src/workflow/normalized/format2.js";
import { normalizedNative } from "../src/workflow/normalized/native.js";
import { GalaxyWorkflowSchema } from "../src/workflow/raw/gxformat2.effect.js";
import { NativeGalaxyWorkflowSchema } from "../src/workflow/raw/native.effect.js";

// --- Directories ---

const FIXTURES_DIR = path.join(import.meta.dirname, "fixtures");
const EXPECTATIONS_DIR = path.join(FIXTURES_DIR, "expectations");
const WORKFLOWS_DIR = path.join(FIXTURES_DIR, "workflows");
const FORMAT2_DIR = path.join(WORKFLOWS_DIR, "format2");
const NATIVE_DIR = path.join(WORKFLOWS_DIR, "native");

// --- Validation helpers ---
// Schema-salad schemas require a `class` discriminator that real files may omit.
// Inject it when missing, matching the CLI validate-workflow behavior.

function _withClass(raw: unknown, cls: string): unknown {
  const obj = raw as Record<string, unknown>;
  if ("class" in obj) return obj;
  return { ...obj, class: cls };
}

function validateFormat2(raw: unknown): unknown {
  return Schema.decodeUnknownSync(GalaxyWorkflowSchema, { onExcessProperty: "ignore" })(
    _withClass(raw, "GalaxyWorkflow"),
  );
}

function validateFormat2Strict(raw: unknown): unknown {
  return Schema.decodeUnknownSync(GalaxyWorkflowSchema, { onExcessProperty: "error" })(
    _withClass(raw, "GalaxyWorkflow"),
  );
}

function validateNative(raw: unknown): unknown {
  return Schema.decodeUnknownSync(NativeGalaxyWorkflowSchema, { onExcessProperty: "ignore" })(
    _withClass(raw, "NativeGalaxyWorkflow"),
  );
}

function validateNativeStrict(raw: unknown): unknown {
  return Schema.decodeUnknownSync(NativeGalaxyWorkflowSchema, { onExcessProperty: "error" })(
    _withClass(raw, "NativeGalaxyWorkflow"),
  );
}

// --- Operations ---

type Operation = (raw: unknown) => unknown;

const OPERATIONS: Record<string, Operation> = {
  normalized_format2: normalizedFormat2,
  normalized_native: normalizedNative,
  validate_format2: validateFormat2,
  validate_format2_strict: validateFormat2Strict,
  validate_native: validateNative,
  validate_native_strict: validateNativeStrict,
};

const UNSUPPORTED_OPERATIONS = new Set([
  "expanded_format2",
  "expanded_native",
  "to_format2",
  "to_native",
  "ensure_format2",
  "ensure_native",
]);

// --- Python field alias mapping ---
// gxformat2 expectations use in_ and type_ (Pydantic aliases for reserved words).
// In TS objects the actual keys are "in" and "type".
const FIELD_ALIASES: Record<string, string> = {
  in_: "in",
  type_: "type",
};

// --- Fixture loading ---

function loadWorkflow(name: string): unknown {
  for (const dir of [FORMAT2_DIR, NATIVE_DIR]) {
    const filePath = path.join(dir, name);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf-8");
      if (name.endsWith(".ga")) {
        return JSON.parse(content);
      }
      return yaml.parse(content);
    }
  }
  throw new Error(`Fixture not found: ${name}`);
}

// --- Navigation ---

function navigate(obj: unknown, pathElements: unknown[]): unknown {
  let current = obj;
  for (const element of pathElements) {
    if (element === "$length") {
      if (Array.isArray(current)) return current.length;
      if (current instanceof Set) return current.size;
      if (typeof current === "object" && current !== null) {
        return Object.keys(current).length;
      }
      throw new Error(`Cannot get $length of ${typeof current}`);
    } else if (typeof element === "object" && element !== null && !Array.isArray(element)) {
      // {field: value} — find in list
      const [field, value] = Object.entries(element)[0];
      const resolvedField = FIELD_ALIASES[field] ?? field;
      if (!Array.isArray(current)) {
        throw new Error(`Expected array for find-in-list, got ${typeof current}`);
      }
      const found = current.find(
        (item: Record<string, unknown>) => item[resolvedField] === value,
      );
      if (found === undefined) {
        throw new Error(
          `No item with ${resolvedField}=${JSON.stringify(value)} in array of ${current.length}`,
        );
      }
      current = found;
    } else if (typeof element === "number") {
      if (!Array.isArray(current)) {
        throw new Error(`Expected array for index ${element}, got ${typeof current}`);
      }
      current = current[element];
    } else if (typeof element === "string") {
      const resolvedKey = FIELD_ALIASES[element] ?? element;
      if (typeof current !== "object" || current === null) {
        throw new Error(`Cannot access property ${resolvedKey} on ${typeof current}`);
      }
      current = (current as Record<string, unknown>)[resolvedKey];
    } else {
      throw new Error(`Unexpected path element: ${JSON.stringify(element)}`);
    }
  }
  return current;
}

// --- Assertions ---

function assertValue(actual: unknown, expected: unknown): void {
  expect(actual).toEqual(expected);
}

function assertValueContains(actual: unknown, expected: string): void {
  expect(typeof actual).toBe("string");
  expect(actual as string).toContain(expected);
}

function assertValueSet(actual: unknown, expectedItems: unknown[]): void {
  if (actual instanceof Set) {
    if (expectedItems.length === 0) {
      expect(actual.size).toBe(0);
      return;
    }
    // Check if items are objects (like ToolReference) or primitives
    const firstExpected = expectedItems[0];
    if (typeof firstExpected === "object" && firstExpected !== null) {
      // Compare as sets of sorted key-value tuples
      const actualSet = new Set(
        [...actual].map((item) => JSON.stringify(Object.entries(item as Record<string, unknown>).sort())),
      );
      const expectedSet = new Set(
        expectedItems.map((item) => JSON.stringify(Object.entries(item as Record<string, unknown>).sort())),
      );
      expect(actualSet).toEqual(expectedSet);
    } else {
      expect(actual).toEqual(new Set(expectedItems));
    }
  } else if (Array.isArray(actual)) {
    if (expectedItems.length === 0) {
      expect(actual.length).toBe(0);
      return;
    }
    const firstExpected = expectedItems[0];
    if (typeof firstExpected === "object" && firstExpected !== null) {
      const actualSet = new Set(
        actual.map((item) => JSON.stringify(Object.entries(item as Record<string, unknown>).sort())),
      );
      const expectedSet = new Set(
        expectedItems.map((item) => JSON.stringify(Object.entries(item as Record<string, unknown>).sort())),
      );
      expect(actualSet).toEqual(expectedSet);
    } else {
      expect(new Set(actual)).toEqual(new Set(expectedItems));
    }
  } else {
    throw new Error(`assertValueSet: expected Set or Array, got ${typeof actual}`);
  }
}

// --- Load expectations ---

interface Assertion {
  path: unknown[];
  value?: unknown;
  value_contains?: string;
  value_set?: unknown[];
}

interface TestCase {
  fixture: string;
  operation: string;
  assertions?: Assertion[];
  expect_error?: boolean;
}

function loadExpectations(): [string, TestCase][] {
  const cases: [string, TestCase][] = [];
  const files = fs.readdirSync(EXPECTATIONS_DIR).filter((f) => f.endsWith(".yml")).sort();
  for (const fname of files) {
    const content = fs.readFileSync(path.join(EXPECTATIONS_DIR, fname), "utf-8");
    const suite = yaml.parse(content) as Record<string, TestCase>;
    for (const [testId, testCase] of Object.entries(suite)) {
      cases.push([testId, testCase]);
    }
  }
  return cases;
}

// --- Test runner ---

const ALL_CASES = loadExpectations();

describe("declarative normalized workflow tests", () => {
  for (const [testId, testCase] of ALL_CASES) {
    const { fixture, operation } = testCase;
    const expectError = testCase.expect_error ?? false;
    const assertions = testCase.assertions ?? [];

    if (UNSUPPORTED_OPERATIONS.has(operation)) {
      it.skip(`${testId} (unsupported operation: ${operation})`, () => {});
      continue;
    }

    if (!(operation in OPERATIONS)) {
      it.fails(`${testId} (unknown operation: ${operation})`, () => {
        throw new Error(`Operation "${operation}" is not in OPERATIONS or UNSUPPORTED_OPERATIONS`);
      });
      continue;
    }

    it(testId, () => {
      const raw = loadWorkflow(fixture);

      if (expectError) {
        expect(() => OPERATIONS[operation](raw)).toThrow();
        return;
      }

      const wf = OPERATIONS[operation](raw);

      for (const assertion of assertions) {
        const obj = navigate(wf, assertion.path);
        if ("value" in assertion) {
          assertValue(obj, assertion.value);
        } else if ("value_contains" in assertion) {
          assertValueContains(obj, assertion.value_contains!);
        } else if ("value_set" in assertion) {
          assertValueSet(obj, assertion.value_set!);
        } else {
          throw new Error(`Assertion has no recognized mode: ${JSON.stringify(assertion)}`);
        }
      }
    });
  }
});
