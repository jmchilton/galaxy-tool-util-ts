// Fixture-based connection validation tests.
// Mirrors test_connection_workflows.py — auto-discovers gxformat2 fixtures,
// validates them with the TS port, asserts ok_/fail_ prefix matches valid,
// and runs sidecar target/value expectations through dictVerifyEach.

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, it, expect } from "vitest";

import {
  loadConnectionFixtures,
  type ConnectionFixture,
} from "../../core/test/helpers/load-connection-fixtures.js";
import { dictVerifyEach } from "../../core/test/helpers/dict-verify-each.js";
import { loadParsedToolCache } from "../../core/test/helpers/parsed-tool-cache.js";

import { validateConnectionsReport } from "../src/report-builder.js";
import type { GetToolInfo } from "../src/get-tool-info.js";

const FIXTURES_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "core",
  "test",
  "fixtures",
  "connection_workflows",
);
const PARSED_TOOLS_DIR = join(FIXTURES_DIR, "parsed_tools");

const fixtures: ConnectionFixture[] = loadConnectionFixtures(FIXTURES_DIR);
const tools = loadParsedToolCache(PARSED_TOOLS_DIR);
const getToolInfo: GetToolInfo = {
  getToolInfo: (toolId) => tools.get(toolId),
};

function collectErrors(report: ReturnType<typeof validateConnectionsReport>): string[] {
  const out: string[] = [];
  for (const sr of report.step_results) {
    out.push(...sr.errors);
    for (const cr of sr.connections) {
      out.push(...cr.errors);
    }
  }
  return out;
}

describe("connection_workflows fixture corpus", () => {
  for (const f of fixtures) {
    it(f.stem, () => {
      const report = validateConnectionsReport(f.workflow, getToolInfo);

      if (f.stem.startsWith("ok_")) {
        expect(report.valid, `errors: ${JSON.stringify(collectErrors(report))}`).toBe(true);
      } else if (f.stem.startsWith("fail_")) {
        expect(report.valid).toBe(false);
      }

      if (f.expected) {
        dictVerifyEach(report as unknown as Record<string, unknown>, f.expected);
      }
    });
  }
});
