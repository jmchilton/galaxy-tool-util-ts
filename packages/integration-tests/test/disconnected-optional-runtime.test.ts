/**
 * Real-corpus integration test for the disconnected-optional RuntimeValue drop.
 *
 * Converts the IWC `average-bigwig-between-replicates` workflow via
 * `toFormat2Stateful` and asserts the optional, disconnected
 * `advancedOpt|blackListFileName` RuntimeValue leaves no trace — neither a
 * state key nor a phantom `in:` connection (`source: "runtime_value"`). Mirrors
 * Galaxy's Phase 1 converter change. Skips when the local ToolShed tool cache
 * (`~/.galaxy/tool_info_cache`) lacks the deeptools tool, matching the
 * skip-if-no-cache convention of the declarative wfstate tests.
 */

import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

import { toFormat2Stateful, type ToolInputsResolver } from "@galaxy-tool-util/schema";
import { getCacheDir, makeNodeToolCache } from "@galaxy-tool-util/core/node";

// Vendored IWC source lives under the gxwf-e2e workspace seed; reuse it rather
// than duplicating the workflow. Loud failure if it moves is intentional.
const WORKFLOW_PATH = join(
  import.meta.dirname,
  "..",
  "..",
  "gxwf-e2e",
  "fixtures",
  "workspace-seed",
  "iwc",
  "average-bigwig-between-replicates.ga",
);

const DEEPTOOLS_FRAGMENT = "deeptools_bigwig_average";

function toolCacheAvailable(): boolean {
  const dir = getCacheDir();
  return fs.existsSync(dir) && fs.readdirSync(dir).some((f) => f.endsWith(".json"));
}

/** Sync resolver backed by the node tool cache (mirrors declarative-wfstate). */
function makeResolver(): ToolInputsResolver {
  const cache = makeNodeToolCache();
  const cacheDir = getCacheDir();
  return (toolId: string, toolVersion: string | null) => {
    const coords = cache.resolveToolCoordinates(toolId, toolVersion);
    const version = coords.version ?? "_default_";
    const key = createHash("sha256")
      .update(`${coords.toolshedUrl}/${coords.trsToolId}/${version}`)
      .digest("hex");
    const filePath = join(cacheDir, `${key}.json`);
    if (!fs.existsSync(filePath)) return undefined;
    try {
      return JSON.parse(fs.readFileSync(filePath, "utf-8")).inputs ?? [];
    } catch {
      return undefined;
    }
  };
}

describe("disconnected-optional RuntimeValue (real IWC corpus)", () => {
  it.skipIf(!toolCacheAvailable())(
    "drops advancedOpt|blackListFileName with no state key and no phantom in:",
    () => {
      const raw = JSON.parse(fs.readFileSync(WORKFLOW_PATH, "utf-8"));
      const result = toFormat2Stateful(raw, makeResolver());

      const deeptools = result.workflow.steps.find((s) => s.tool_id?.includes(DEEPTOOLS_FRAGMENT));
      expect(deeptools, "deeptools_bigwig_average step present").toBeDefined();

      // The step must have converted statefully (no fallback to raw tool_state).
      const status = result.steps.find((s) => s.toolId?.includes(DEEPTOOLS_FRAGMENT));
      expect(status?.converted).toBe(true);
      expect(status?.failureClass).toBeUndefined();

      const inBlock = (deeptools?.in ?? []) as Array<{ id: string; source: string }>;
      // No phantom runtime placeholder connection survived the conversion.
      expect(inBlock.some((e) => e.source === "runtime_value")).toBe(false);
      // The optional disconnected leaf is gone from the `in:` block entirely.
      expect(inBlock.some((e) => e.id.includes("blackListFileName"))).toBe(false);
      // ...and from format2 state.
      const advancedOpt = (deeptools?.state?.advancedOpt ?? {}) as Record<string, unknown>;
      expect("blackListFileName" in advancedOpt).toBe(false);

      // Sanity: the real connections in the same step are preserved.
      expect(inBlock.some((e) => e.id === "advancedOpt|binSize")).toBe(true);
      expect(inBlock.some((e) => e.id === "bigwigs")).toBe(true);
    },
  );
});
