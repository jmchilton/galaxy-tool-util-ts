/**
 * Sweep test: stateful convert + roundtrip against real IWC workflows.
 *
 * Gated on GALAXY_TEST_IWC_DIRECTORY — skipped unless set. Uses the default
 * tool cache (~/.galaxy/tool_info_cache/); tools missing from the cache
 * produce `unknown_tool` fallbacks (reported, not failed).
 *
 * Purpose: regression harness for `roundtripValidate` against real-world
 * workflows that synthetic fixtures can't exercise (deep conditionals,
 * multi-version tools, odd parameter combinations). Fails on
 * error-severity diffs and thrown conversion errors; tolerates benign
 * diffs and unknown-tool fallbacks.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import type { ToolCache } from "@galaxy-tool-util/core";
import { makeNodeToolCache } from "@galaxy-tool-util/core/node";
import {
  roundtripValidate,
  type BenignArtifactKind,
  type ExpansionOptions,
  type RoundtripResult,
  type StepConversionFailureClass,
} from "@galaxy-tool-util/schema";
import { loadToolInputsForWorkflow } from "../src/commands/stateful-tool-inputs.js";
import { createDefaultResolver } from "../src/commands/url-resolver.js";

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

interface WorkflowOutcome {
  workflow: string;
  crashed: boolean;
  crashError?: string;
  result?: RoundtripResult;
}

describe.skipIf(!IWC_DIR)("IWC stateful sweep: convert + roundtrip", { timeout: 600_000 }, () => {
  let workflows: string[];
  let cache: ToolCache;

  beforeAll(async () => {
    workflows = await discoverNativeWorkflows(join(IWC_DIR!, "workflows"));
    cache = makeNodeToolCache();
    await cache.index.load();
  });

  it("discovers IWC workflows", () => {
    expect(workflows.length).toBeGreaterThan(0);
  });

  it("roundtrips all native workflows without errors", async () => {
    const outcomes: WorkflowOutcome[] = [];
    let parseErrors = 0;

    for (const wfPath of workflows) {
      const id = workflowId(wfPath);
      let data: Record<string, unknown>;
      try {
        const raw = await readFile(wfPath, "utf-8");
        data = JSON.parse(raw);
      } catch {
        parseErrors++;
        continue;
      }

      try {
        const expansionOpts: ExpansionOptions = {
          resolver: createDefaultResolver({
            workflowDirectory: join(wfPath, ".."),
          }),
        };
        const { resolver } = await loadToolInputsForWorkflow(data, "native", cache, expansionOpts);
        const result = roundtripValidate(data, resolver);
        outcomes.push({ workflow: id, crashed: false, result });
      } catch (err) {
        outcomes.push({
          workflow: id,
          crashed: true,
          crashError: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // --- Aggregate stats ---
    const totalWorkflows = outcomes.length;
    const crashes = outcomes.filter((o) => o.crashed);
    const succeeded = outcomes.filter((o) => !o.crashed && o.result);

    let totalSteps = 0;
    let cleanWorkflows = 0;
    let benignWorkflows = 0;
    let errorWorkflows = 0;
    let totalBenignDiffs = 0;
    let totalErrorDiffs = 0;

    const forwardFailureClass: Record<StepConversionFailureClass, number> = {
      unknown_tool: 0,
      precheck: 0,
      pre_validation: 0,
      conversion: 0,
      post_validation: 0,
    };
    const reverseFailureClass: Record<StepConversionFailureClass, number> = {
      unknown_tool: 0,
      precheck: 0,
      pre_validation: 0,
      conversion: 0,
      post_validation: 0,
    };
    const benignKinds: Record<string, number> = {};
    const workflowsWithErrorDiffs: Array<{
      workflow: string;
      errors: string[];
    }> = [];

    for (const o of succeeded) {
      const r = o.result!;
      totalSteps += r.stepResults.length;
      if (r.clean) cleanWorkflows++;
      else if (r.success) benignWorkflows++;
      else errorWorkflows++;

      const errorMessages: string[] = [];
      for (const step of r.stepResults) {
        for (const d of step.diffs) {
          if (d.severity === "error") {
            totalErrorDiffs++;
            errorMessages.push(`step ${step.stepId} ${d.path || "<root>"}: ${d.message}`);
          } else {
            totalBenignDiffs++;
            const kind: BenignArtifactKind | "unclassified" = d.kind ?? "unclassified";
            benignKinds[kind] = (benignKinds[kind] ?? 0) + 1;
          }
        }
      }
      if (errorMessages.length > 0) {
        workflowsWithErrorDiffs.push({ workflow: o.workflow, errors: errorMessages });
      }

      for (const s of r.forwardSteps) {
        if (!s.converted && s.failureClass) forwardFailureClass[s.failureClass]++;
      }
      for (const s of r.reverseSteps) {
        if (!s.converted && s.failureClass) reverseFailureClass[s.failureClass]++;
      }
    }

    // --- Report ---
    const fmt = (obj: Record<string, number>): string =>
      Object.entries(obj)
        .filter(([, v]) => v > 0)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ") || "(none)";

    console.log(`\nIWC stateful sweep: ${totalWorkflows} workflows, ${totalSteps} tool steps`);
    if (parseErrors > 0) console.log(`  parse errors: ${parseErrors}`);
    console.log(
      `  verdicts: ${cleanWorkflows} clean, ${benignWorkflows} benign-only, ${errorWorkflows} with real errors, ${crashes.length} crashed`,
    );
    console.log(`  forward fallbacks: ${fmt(forwardFailureClass)}`);
    console.log(`  reverse fallbacks: ${fmt(reverseFailureClass)}`);
    console.log(`  benign diffs (${totalBenignDiffs}): ${fmt(benignKinds)}`);
    console.log(`  error diffs: ${totalErrorDiffs}`);

    // --- Assertions ---
    if (crashes.length > 0) {
      const details = crashes.map((c) => `  ${c.workflow}: ${c.crashError}`).join("\n");
      expect.fail(`${crashes.length} workflow(s) crashed:\n${details}`);
    }

    if (workflowsWithErrorDiffs.length > 0) {
      const details = workflowsWithErrorDiffs
        .slice(0, 20)
        .map((w) => `  ${w.workflow}:\n    ${w.errors.slice(0, 5).join("\n    ")}`)
        .join("\n");
      const truncated =
        workflowsWithErrorDiffs.length > 20
          ? `\n  ... and ${workflowsWithErrorDiffs.length - 20} more`
          : "";
      expect.fail(
        `${workflowsWithErrorDiffs.length} workflow(s) had error-severity roundtrip diffs:\n${details}${truncated}`,
      );
    }
  });
});
