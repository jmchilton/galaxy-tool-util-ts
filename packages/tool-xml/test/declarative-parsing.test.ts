/**
 * Declarative tool-parsing tests driven by shared YAML expectation files.
 *
 * Port of Galaxy's `test/unit/tool_util/tool_parsing/test_declarative_parsing.py`.
 * The SAME expectation files (`expectations/*.yml`) and the SAME functional-tool
 * fixtures (`tools/*.xml|*.yml`) are asserted on both the Python `parse_tool`
 * and this TS parser, so the two paths cannot silently drift.
 *
 * Fixtures resolve by the same convention as `functional_test_tool_source`:
 *   - explicit `.xml`/`.yml` suffix → that file
 *   - trailing `_y` → `<stem>.yml`
 *   - otherwise → `<name>.xml`
 * XML fixtures parse via `loadXmlToolSource`; YAML tools via `parseYamlTool`.
 *
 * The assertion engine is shared with the workflow declarative suites — imported
 * from the schema package's test helpers rather than duplicated. `parse_tool`
 * already emits snake_case (`ParsedTool`), so results feed the runner directly.
 */
import { describe, expect, it } from "vitest";
import * as yaml from "yaml";
import * as fs from "node:fs";
import * as path from "node:path";

import { parseYamlTool } from "@galaxy-tool-util/schema";

import { loadExpectations, runAssertions } from "../../schema/test/declarative-test-utils.js";

import { loadXmlToolSource } from "../src/index.js";

const FIXTURES_DIR = path.join(import.meta.dirname, "fixtures", "tool_parsing");
const EXPECTATIONS_DIR = path.join(FIXTURES_DIR, "expectations");
const TOOLS_DIR = path.join(FIXTURES_DIR, "tools");

// Cases whose expectation reflects Python behavior the TS port hasn't mirrored
// yet — skip locally rather than editing the shared golden expectation file.
const KNOWN_BEHAVIOR_DIVERGENCES = new Set<string>([]);

/** Resolve a fixture basename to its on-disk path (see file header). */
function resolveFixturePath(name: string): string {
  let file: string;
  if (name.endsWith(".xml") || name.endsWith(".yml")) {
    file = name;
  } else if (name.endsWith("_y")) {
    file = `${name.slice(0, -2)}.yml`;
  } else {
    file = `${name}.xml`;
  }
  return path.join(TOOLS_DIR, file);
}

/** Assemble the `ParsedTool`-shaped fields an XML tool source exposes. */
function parseXmlFixture(filePath: string): unknown {
  const src = loadXmlToolSource(filePath);
  return {
    id: src.parseId(),
    version: src.parseVersion(),
    name: src.parseName(),
    description: src.parseDescription() || null,
    profile: src.parseProfile(),
    license: src.parseLicense(),
    edam_operations: src.parseEdamOperations(),
    edam_topics: src.parseEdamTopics(),
    xrefs: src.parseXrefs(),
    citations: src.parseCitations(),
    help: src.parseHelp(),
    inputs: src.parseInputs(),
    outputs: src.parseOutputs(),
  };
}

/** Parse a YAML tool document, preserving the declared version's source token. */
function parseYamlFixture(filePath: string): unknown {
  const text = fs.readFileSync(filePath, "utf-8");
  const repr = yaml.parse(text) as Record<string, unknown>;
  // PyYAML renders a float version (`1.0`) as "1.0"; JS collapses it to the
  // number 1, so `String(version)` would yield "1". Recover the written token.
  if (repr && typeof repr === "object" && typeof repr.version === "number") {
    const node = yaml.parseDocument(text).get("version", true) as { source?: unknown } | undefined;
    if (node && typeof node.source === "string") repr.version = node.source;
  }
  return parseYamlTool(repr);
}

function parseFixture(name: string): unknown {
  const filePath = resolveFixturePath(name);
  return filePath.endsWith(".yml") ? parseYamlFixture(filePath) : parseXmlFixture(filePath);
}

const ALL_CASES = loadExpectations(EXPECTATIONS_DIR);

describe("declarative tool-parsing tests", () => {
  for (const [testId, testCase] of ALL_CASES) {
    const { fixture, operation } = testCase;
    const expectError = testCase.expect_error ?? false;
    const assertions = testCase.assertions ?? [];

    if (!fs.existsSync(resolveFixturePath(fixture))) {
      it.skip(`${testId} (fixture not synced: ${fixture})`, () => {});
      continue;
    }

    if (KNOWN_BEHAVIOR_DIVERGENCES.has(testId)) {
      it.skip(`${testId} (behavior divergence: TS port lags Galaxy)`, () => {});
      continue;
    }

    if (operation !== "parse") {
      it.fails(`${testId} (unsupported operation: ${operation})`, () => {
        throw new Error(`Operation "${operation}" is not supported by the tool-parsing suite`);
      });
      continue;
    }

    it(testId, () => {
      if (expectError) {
        expect(() => parseFixture(fixture)).toThrow();
        return;
      }
      runAssertions(parseFixture(fixture), assertions);
    });
  }
});
