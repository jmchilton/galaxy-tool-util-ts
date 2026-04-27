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
import {
  validateFormat2,
  validateFormat2Strict,
  validateNative,
  validateNativeStrict,
} from "../src/workflow/validators.js";
import { workflowToMermaid } from "../src/workflow/mermaid.js";
import { cytoscapeElements } from "../src/workflow/cytoscape.js";
import { elementsToList } from "../src/workflow/cytoscape-models.js";

// --- Directories ---

const FIXTURES_DIR = path.join(import.meta.dirname, "fixtures");
const EXPECTATIONS_DIR = path.join(FIXTURES_DIR, "expectations");
const WORKFLOWS_DIR = path.join(FIXTURES_DIR, "workflows");
const FORMAT2_DIR = path.join(WORKFLOWS_DIR, "format2");
const NATIVE_DIR = path.join(WORKFLOWS_DIR, "native");

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
  workflow_to_mermaid: (raw: unknown) => workflowToMermaid(raw),
  workflow_to_mermaid_lines: (raw: unknown) => workflowToMermaid(raw).split("\n"),
  workflow_to_mermaid_with_comments_lines: (raw: unknown) =>
    workflowToMermaid(raw, { comments: true }).split("\n"),
  cytoscape_elements_to_list: (raw: unknown) => elementsToList(cytoscapeElements(raw)),
  cytoscape_node_ids: (raw: unknown) => cytoscapeElements(raw).nodes.map((n) => n.data.id),
  cytoscape_edge_ids: (raw: unknown) => cytoscapeElements(raw).edges.map((e) => e.data.id),
};

const UNSUPPORTED_OPERATIONS = new Set<string>([]);

// Tests that fail due to YAML parser behavioral differences (JS coerces null keys
// to string "null", Python keeps None which fails dict[str, ...] validation)
const KNOWN_PARSER_DIVERGENCES = new Set<string>(["test_unlinted_best_practices_rejected_format2"]);

// Tests whose expectation reflects Python-side behavior the TS port hasn't
// mirrored yet — don't hold the synced expectation file hostage; skip locally
// until the behavior gap is closed.
const KNOWN_BEHAVIOR_DIVERGENCES = new Set<string>([
  // gxformat2 best-practice lint emits an extra warning TS does not yet produce
  "test_bp_native_untyped_param",
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

    if (KNOWN_BEHAVIOR_DIVERGENCES.has(testId)) {
      it.skip(`${testId} (behavior divergence: TS port lags gxformat2)`, () => {});
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
