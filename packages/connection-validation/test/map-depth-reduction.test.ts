// TS-only assertions on the new map_depth / reduction fields surfaced from
// the connection validator. Synced expectations from Galaxy don't yet cover
// these (Python parity issue tracked in plan); these tests pin the TS
// behavior independently.

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { loadConnectionFixtures } from "../../core/test/helpers/load-connection-fixtures.js";
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

const fixtures = loadConnectionFixtures(FIXTURES_DIR);
const tools = loadParsedToolCache(join(FIXTURES_DIR, "parsed_tools"));
const getToolInfo: GetToolInfo = { getToolInfo: (id) => tools.get(id) };

function fixture(stem: string) {
  const f = fixtures.find((f) => f.stem === stem);
  if (!f) throw new Error(`fixture missing: ${stem}`);
  return f.workflow;
}

describe("map_depth / reduction surfacing", () => {
  it("ok_list_to_multi_data: list → multiple-data marks reduction=true", () => {
    const report = validateConnectionsReport(fixture("ok_list_to_multi_data"), getToolInfo);
    const stepWithReduction = report.step_results.find((sr) =>
      sr.connections.some((c) => c.reduction),
    );
    expect(stepWithReduction).toBeDefined();
    const cr = stepWithReduction!.connections.find((c) => c.reduction)!;
    expect(cr.reduction).toBe(true);
    expect(cr.map_depth).toBe(0);
  });

  it("ok_list_to_paired_or_unpaired: list → paired_or_unpaired maps over with depth 1", () => {
    const report = validateConnectionsReport(fixture("ok_list_to_paired_or_unpaired"), getToolInfo);
    const mapped = report.step_results
      .flatMap((sr) => sr.connections)
      .find((c) => c.map_depth && c.map_depth >= 1);
    expect(mapped).toBeDefined();
    expect(mapped!.mapping).toBe("list");
    expect(mapped!.map_depth).toBe(1);
    expect(mapped!.reduction).toBe(false);
  });

  it("ok_dataset_to_dataset: scalar passthrough has depth 0 and no reduction", () => {
    const report = validateConnectionsReport(fixture("ok_dataset_to_dataset"), getToolInfo);
    const c = report.step_results.flatMap((sr) => sr.connections).find((c) => c.status === "ok");
    expect(c).toBeDefined();
    expect(c!.map_depth).toBe(0);
    expect(c!.reduction).toBe(false);
  });
});
