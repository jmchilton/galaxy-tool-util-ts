/**
 * Shared declarative test utilities for YAML-driven expectation tests.
 *
 * Used by both gxformat2 normalization tests and Galaxy workflow_state tests.
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
 *   - value_any_contains: any element in a list contains substring
 *   - value_set: unordered set comparison
 *   - value_type: type check (dict → object, list → array, str → string)
 *   - value_truthy: value is truthy
 *   - value_absent: value is undefined/null
 */

import { expect } from "vitest";
import * as yaml from "yaml";
import * as fs from "node:fs";
import * as path from "node:path";

// --- Python field alias mapping ---
// gxformat2/Galaxy expectations use in_ and type_ (Pydantic aliases for reserved words).
// In TS objects the actual keys are "in" and "type".
export const FIELD_ALIASES: Record<string, string> = {
  in_: "in",
  type_: "type",
  format_version: "format-version",
};

// --- Navigation ---

export function navigate(obj: unknown, pathElements: unknown[]): unknown {
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
      const found = current.find((item: Record<string, unknown>) => item[resolvedField] === value);
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

export function assertValue(actual: unknown, expected: unknown): void {
  expect(actual).toEqual(expected);
}

export function assertValueContains(actual: unknown, expected: string): void {
  expect(typeof actual).toBe("string");
  expect(actual as string).toContain(expected);
}

export function assertValueAnyContains(actual: unknown, expected: string): void {
  expect(Array.isArray(actual)).toBe(true);
  const arr = actual as unknown[];
  const found = arr.some((item) => typeof item === "string" && item.includes(expected));
  expect(found).toBe(true);
}

export function assertValueSet(actual: unknown, expectedItems: unknown[]): void {
  if (actual instanceof Set) {
    if (expectedItems.length === 0) {
      expect(actual.size).toBe(0);
      return;
    }
    const firstExpected = expectedItems[0];
    if (typeof firstExpected === "object" && firstExpected !== null) {
      const actualSet = new Set(
        [...actual].map((item) =>
          JSON.stringify(Object.entries(item as Record<string, unknown>).sort()),
        ),
      );
      const expectedSet = new Set(
        expectedItems.map((item) =>
          JSON.stringify(Object.entries(item as Record<string, unknown>).sort()),
        ),
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
        actual.map((item) =>
          JSON.stringify(Object.entries(item as Record<string, unknown>).sort()),
        ),
      );
      const expectedSet = new Set(
        expectedItems.map((item) =>
          JSON.stringify(Object.entries(item as Record<string, unknown>).sort()),
        ),
      );
      expect(actualSet).toEqual(expectedSet);
    } else {
      expect(new Set(actual)).toEqual(new Set(expectedItems));
    }
  } else {
    throw new Error(`assertValueSet: expected Set or Array, got ${typeof actual}`);
  }
}

const VALUE_TYPE_MAP: Record<string, string> = {
  dict: "object",
  list: "array",
  str: "string",
  int: "number",
  float: "number",
  bool: "boolean",
};

export function assertValueType(actual: unknown, expectedType: string): void {
  const mapped = VALUE_TYPE_MAP[expectedType];
  if (!mapped) {
    throw new Error(`Unknown value_type: ${expectedType}`);
  }
  if (mapped === "array") {
    expect(Array.isArray(actual)).toBe(true);
  } else {
    expect(typeof actual).toBe(mapped);
  }
}

export function assertValueTruthy(actual: unknown): void {
  expect(actual).toBeTruthy();
}

export function assertValueAbsent(actual: unknown): void {
  // Accept both null and undefined — Python None maps to either depending on context
  expect(actual == null).toBe(true);
}

// --- Types ---

export interface Assertion {
  path: unknown[];
  value?: unknown;
  value_contains?: string;
  value_any_contains?: string;
  value_set?: unknown[];
  value_type?: string;
  value_truthy?: boolean;
  value_absent?: boolean;
}

export interface TestCase {
  fixture: string;
  operation: string;
  assertions?: Assertion[];
  expect_error?: boolean;
}

// --- Expectation loading ---

export function loadExpectations(expectationsDir: string): [string, TestCase][] {
  const cases: [string, TestCase][] = [];
  const files = fs
    .readdirSync(expectationsDir)
    .filter((f) => f.endsWith(".yml"))
    .sort();
  for (const fname of files) {
    const content = fs.readFileSync(path.join(expectationsDir, fname), "utf-8");
    const suite = yaml.parse(content) as Record<string, TestCase>;
    for (const [testId, testCase] of Object.entries(suite)) {
      cases.push([testId, testCase]);
    }
  }
  return cases;
}

// --- Generic assertion runner ---

export function runAssertions(result: unknown, assertions: Assertion[]): void {
  for (const assertion of assertions) {
    if ("value_absent" in assertion) {
      let obj: unknown;
      try {
        obj = navigate(result, assertion.path);
      } catch {
        continue;
      }
      assertValueAbsent(obj);
      continue;
    }
    const obj = navigate(result, assertion.path);
    if ("value" in assertion) {
      assertValue(obj, assertion.value);
    } else if ("value_contains" in assertion) {
      assertValueContains(obj, assertion.value_contains!);
    } else if ("value_any_contains" in assertion) {
      assertValueAnyContains(obj, assertion.value_any_contains!);
    } else if ("value_set" in assertion) {
      assertValueSet(obj, assertion.value_set!);
    } else if ("value_type" in assertion) {
      assertValueType(obj, assertion.value_type!);
    } else if ("value_truthy" in assertion) {
      assertValueTruthy(obj);
    } else {
      throw new Error(`Assertion has no recognized mode: ${JSON.stringify(assertion)}`);
    }
  }
}
