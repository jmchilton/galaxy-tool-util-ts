/**
 * Declarative normalization tests driven by YAML expectation files.
 *
 * Port of gxformat2's test_declarative_normalized.py.
 * Expectation files live in test/fixtures/expectations/.
 * Each file contains named test cases with a fixture, operation, and assertions.
 */

import { describe, it, expect } from "vitest";
import * as yaml from "yaml";
import * as fs from "node:fs";
import * as path from "node:path";
import { Schema } from "effect";

import { loadExpectations, runAssertions } from "./declarative-test-utils.js";

import { normalizedFormat2 } from "../src/workflow/normalized/format2.js";
import { normalizedNative } from "../src/workflow/normalized/native.js";
import { toFormat2 } from "../src/workflow/normalized/toFormat2.js";
import { toNative } from "../src/workflow/normalized/toNative.js";
import { ensureFormat2, ensureNative } from "../src/workflow/normalized/ensure.js";
import { expandedFormat2, expandedNative } from "../src/workflow/normalized/expanded.js";
import {
  lintFormat2,
  lintNative,
  lintBestPracticesFormat2,
  lintBestPracticesNative,
} from "../src/workflow/lint.js";
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
  const result = "class" in obj ? { ...obj } : { ...obj, class: cls };

  // Recursively inject class into nested subworkflows in steps
  if (result.steps && typeof result.steps === "object" && !Array.isArray(result.steps)) {
    const steps = { ...(result.steps as Record<string, unknown>) };
    for (const [key, step] of Object.entries(steps)) {
      if (step && typeof step === "object") {
        const s = step as Record<string, unknown>;
        if (s.subworkflow && typeof s.subworkflow === "object") {
          steps[key] = { ...s, subworkflow: _withClass(s.subworkflow, cls) };
        }
      }
    }
    result.steps = steps;
  }

  return result;
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

type Operation = (raw: unknown) => unknown | Promise<unknown>;

const OPERATIONS: Record<string, Operation> = {
  normalized_format2: normalizedFormat2,
  normalized_native: normalizedNative,
  validate_format2: validateFormat2,
  validate_format2_strict: validateFormat2Strict,
  validate_native: validateNative,
  validate_native_strict: validateNativeStrict,
  to_format2: toFormat2,
  to_native: toNative,
  ensure_format2: ensureFormat2,
  ensure_native: ensureNative,
  expanded_format2: (raw: unknown) => expandedFormat2(raw),
  expanded_native: (raw: unknown) => expandedNative(raw),
  lint_format2: (raw: unknown) => lintFormat2(raw as Record<string, unknown>),
  lint_native: (raw: unknown) => lintNative(raw as Record<string, unknown>),
  lint_best_practices_format2: (raw: unknown) =>
    lintBestPracticesFormat2(raw as Record<string, unknown>),
  lint_best_practices_native: (raw: unknown) =>
    lintBestPracticesNative(raw as Record<string, unknown>),
};

const UNSUPPORTED_OPERATIONS = new Set<string>([]);

// Tests that fail due to YAML parser behavioral differences (JS coerces null keys
// to string "null", Python keeps None which fails dict[str, ...] validation)
const KNOWN_PARSER_DIVERGENCES = new Set<string>([
  "test_unlinted_best_practices_rejected_format2",
]);

// --- Fixture loading ---

function fixtureExists(name: string): boolean {
  return [FORMAT2_DIR, NATIVE_DIR].some((dir) => fs.existsSync(path.join(dir, name)));
}

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

// --- Test runner ---

const ALL_CASES = loadExpectations(EXPECTATIONS_DIR);

describe("declarative normalized workflow tests", () => {
  for (const [testId, testCase] of ALL_CASES) {
    const { fixture, operation } = testCase;
    const expectError = testCase.expect_error ?? false;
    const assertions = testCase.assertions ?? [];

    if (!fixtureExists(fixture)) {
      it.skip(`${testId} (fixture not synced: ${fixture})`, () => {});
      continue;
    }

    if (KNOWN_PARSER_DIVERGENCES.has(testId)) {
      it.skip(`${testId} (YAML parser divergence: JS null key → string)`, () => {});
      continue;
    }

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

    it(testId, async () => {
      const raw = loadWorkflow(fixture);

      if (expectError) {
        let result: unknown;
        try {
          result = OPERATIONS[operation](raw);
        } catch {
          // Sync throw — test passes
          return;
        }
        // If we got here, the operation didn't throw synchronously.
        // It might have returned a rejecting Promise.
        if (result instanceof Promise) {
          await expect(result).rejects.toThrow();
        } else {
          // Operation returned a value without throwing — fail the test
          expect.unreachable("Expected operation to throw");
        }
        return;
      }

      const wf = await Promise.resolve(OPERATIONS[operation](raw));

      runAssertions(wf, assertions);
    });
  }
});
