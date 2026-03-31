/**
 * Sweep tests: validate real IWC workflows against the TS validation code.
 *
 * Gated on GALAXY_TEST_IWC_DIRECTORY — skipped unless set.
 * Uses the default tool cache (~/.galaxy/tool_info_cache/) — skips steps
 * whose tools aren't cached (no auto-population from ToolShed).
 */

import { describe, it, expect, beforeAll } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { ToolCache } from "@galaxy-tool-util/core";
import { validateNativeSteps, type StepValidationResult } from "../src/commands/validate-workflow.js";

const IWC_DIR = process.env.GALAXY_TEST_IWC_DIRECTORY;

async function discoverNativeWorkflows(dir: string): Promise<string[]> {
  const results: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(".ga")) {
      results.push(join(entry.parentPath ?? entry.path, entry.name));
    }
  }
  return results.sort();
}

function workflowId(path: string): string {
  return relative(`${IWC_DIR}/workflows`, path);
}

describe.skipIf(!IWC_DIR)("IWC sweep: native validation", { timeout: 300_000 }, () => {
  let workflows: string[];
  let cache: ToolCache;

  beforeAll(async () => {
    workflows = await discoverNativeWorkflows(join(IWC_DIR!, "workflows"));
    cache = new ToolCache();
    await cache.index.load();
  });

  it("discovers IWC workflows", () => {
    expect(workflows.length).toBeGreaterThan(0);
  });

  it("validates all native workflows", async () => {
    const failures: Array<{ workflow: string; step: StepValidationResult }> = [];
    let validated = 0;
    let skipped = 0;
    let parseErrors = 0;

    for (const wfPath of workflows) {
      const raw = await readFile(wfPath, "utf-8");
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(raw);
      } catch {
        parseErrors++;
        continue;
      }

      const results = await validateNativeSteps(data, cache);

      for (const r of results) {
        if (r.status === "skip") {
          skipped++;
        } else if (r.status === "fail") {
          failures.push({ workflow: workflowId(wfPath), step: r });
        } else {
          validated++;
        }
      }
    }

    console.log(`\nIWC sweep: ${validated} steps validated, ${skipped} skipped, ${failures.length} failed`);
    console.log(`  across ${workflows.length} workflows${parseErrors ? `, ${parseErrors} parse errors` : ""}`);

    if (failures.length > 0) {
      const details = failures
        .map((f) => `  ${f.workflow} [${f.step.stepLabel}] ${f.step.toolId}: ${f.step.errors.join("; ")}`)
        .join("\n");
      expect.fail(`${failures.length} validation failures:\n${details}`);
    }
  });
});
