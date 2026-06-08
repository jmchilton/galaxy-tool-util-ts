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
  toFormat2Stateful,
  SKIP_STATUSES,
  type BenignArtifactKind,
  type ExpansionOptions,
  type RoundtripResult,
  type StepConversionFailureClass,
} from "@galaxy-tool-util/schema";
import { loadToolInputsForWorkflow } from "../src/commands/stateful-tool-inputs.js";
import {
  decodeStructureErrorsJsonSchema,
  validateFormat2StepsJsonSchema,
} from "../src/commands/validate-workflow-json-schema.js";
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

// Workflows with known error-severity roundtrip diffs, excluded so the sweep
// flags only NEW regressions. Python's reference roundtrip_validate also fails
// these (not a TS-only issue). Prune as the upstream conversion bugs are fixed.
const KNOWN_ROUNDTRIP_FAILURES: ReadonlySet<string> = new Set([
  // jmchilton/galaxy-tool-util-ts#117 — peptideshaker step drop + dbbuilder
  // `source` conditional mis-selection on the reverse pass.
  "proteomics/clinicalmp/clinicalmp-discovery/iwc-clinicalmp-discovery-workflow.ga",
]);

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

    let knownFailing = 0;
    for (const wfPath of workflows) {
      const id = workflowId(wfPath);
      if (KNOWN_ROUNDTRIP_FAILURES.has(id)) {
        knownFailing++;
        continue;
      }
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
            errorMessages.push(`step ${step.stepId} ${d.key_path || "<root>"}: ${d.description}`);
          } else {
            totalBenignDiffs++;
            const kind: BenignArtifactKind | "unclassified" =
              d.benign_artifact?.reason ?? "unclassified";
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
    if (knownFailing > 0) console.log(`  known-failing (excluded): ${knownFailing}`);
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

// --- Format2 two-level JSON Schema sweep ---

// Export each native IWC workflow to format2, then run two-level JSON Schema
// validation on the result (structural + per-step tool state). Mirrors Python
// TestIWCSweepJsonSchema. Uncached tools produce skips (not failures); a
// structural error or a per-step `fail` is a real regression.
describe.skipIf(!IWC_DIR)("IWC stateful sweep: format2 JSON Schema", { timeout: 600_000 }, () => {
  let workflows: string[];
  let cache: ToolCache;

  beforeAll(async () => {
    workflows = await discoverNativeWorkflows(join(IWC_DIR!, "workflows"));
    cache = makeNodeToolCache();
    await cache.index.load();
  });

  it("exported format2 passes two-level JSON Schema validation", async () => {
    const failures: Array<{ workflow: string; errors: string[] }> = [];
    let structuralOk = 0;
    let stepsValidated = 0;
    let stepsSkipped = 0;

    for (const wfPath of workflows) {
      const id = workflowId(wfPath);
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(await readFile(wfPath, "utf-8"));
      } catch {
        continue;
      }

      const expansionOpts: ExpansionOptions = {
        resolver: createDefaultResolver({ workflowDirectory: join(wfPath, "..") }),
      };
      let fmt2: Record<string, unknown>;
      try {
        const { resolver } = await loadToolInputsForWorkflow(data, "native", cache, expansionOpts);
        fmt2 = toFormat2Stateful(data, resolver).workflow as unknown as Record<string, unknown>;
      } catch (err) {
        failures.push({
          workflow: id,
          errors: [
            `export to format2 crashed: ${err instanceof Error ? err.message : String(err)}`,
          ],
        });
        continue;
      }

      const errors: string[] = [];
      const structErrors = decodeStructureErrorsJsonSchema(fmt2, "format2");
      if (structErrors.length > 0) {
        errors.push(...structErrors.map((e) => `structural: ${e}`));
      } else {
        structuralOk++;
      }

      const stepResults = await validateFormat2StepsJsonSchema(
        fmt2,
        cache,
        undefined,
        "",
        expansionOpts,
      );
      for (const r of stepResults) {
        if (SKIP_STATUSES.has(r.status)) stepsSkipped++;
        else if (r.status === "fail") {
          errors.push(`step ${r.step} (${r.tool_id}): ${r.errors.join("; ")}`);
        } else stepsValidated++;
      }

      if (errors.length > 0) failures.push({ workflow: id, errors });
    }

    console.log(
      `\nIWC format2 JSON Schema sweep: ${structuralOk}/${workflows.length} structurally valid`,
    );
    console.log(`  steps: ${stepsValidated} validated, ${stepsSkipped} skipped`);

    if (failures.length > 0) {
      const details = failures
        .slice(0, 20)
        .map((f) => `  ${f.workflow}:\n    ${f.errors.slice(0, 5).join("\n    ")}`)
        .join("\n");
      const truncated = failures.length > 20 ? `\n  ... and ${failures.length - 20} more` : "";
      expect.fail(
        `${failures.length} workflow(s) failed format2 JSON Schema validation:\n${details}${truncated}`,
      );
    }
  });
});

// --- Roundtrip strict-encoding sweep ---

// Roundtrip each workflow with strict-encoding on, asserting the format2
// (`forward:`) and reimported-native (`reverse:`) outputs both satisfy
// strict-encoding (tool_state is a parsed dict, not a per-key JSON string).
// Mirrors Python TestIWCSweepRoundtripStrictEncoding. `input:` errors are
// excluded — raw .ga stores tool_state as a JSON string, so strict-encoding is
// only meaningful on the conversion outputs (which is what Python checks).
describe.skipIf(!IWC_DIR)(
  "IWC stateful sweep: roundtrip strict-encoding",
  { timeout: 600_000 },
  () => {
    let workflows: string[];
    let cache: ToolCache;

    beforeAll(async () => {
      workflows = await discoverNativeWorkflows(join(IWC_DIR!, "workflows"));
      cache = makeNodeToolCache();
      await cache.index.load();
    });

    it("roundtrip outputs satisfy strict-encoding", async () => {
      const failures: Array<{ workflow: string; errors: string[] }> = [];

      for (const wfPath of workflows) {
        const id = workflowId(wfPath);
        let data: Record<string, unknown>;
        try {
          data = JSON.parse(await readFile(wfPath, "utf-8"));
        } catch {
          continue;
        }

        const expansionOpts: ExpansionOptions = {
          resolver: createDefaultResolver({ workflowDirectory: join(wfPath, "..") }),
        };
        try {
          const { resolver } = await loadToolInputsForWorkflow(
            data,
            "native",
            cache,
            expansionOpts,
          );
          const result = roundtripValidate(data, resolver, { strictEncoding: true });
          const outputErrors = result.encodingErrors.filter((e) => !e.startsWith("input:"));
          if (outputErrors.length > 0) {
            failures.push({ workflow: id, errors: outputErrors });
          }
        } catch (err) {
          failures.push({
            workflow: id,
            errors: [`roundtrip crashed: ${err instanceof Error ? err.message : String(err)}`],
          });
        }
      }

      if (failures.length > 0) {
        const details = failures
          .slice(0, 20)
          .map((f) => `  ${f.workflow}:\n    ${f.errors.slice(0, 5).join("\n    ")}`)
          .join("\n");
        const truncated = failures.length > 20 ? `\n  ... and ${failures.length - 20} more` : "";
        expect.fail(
          `${failures.length} workflow(s) had roundtrip strict-encoding errors:\n${details}${truncated}`,
        );
      }
    });
  },
);
