/**
 * Sweep tests: validate real IWC workflows against the TS validation code.
 *
 * Gated on GALAXY_TEST_IWC_DIRECTORY — skipped unless set.
 * Uses the default tool cache (~/.galaxy/tool_info_cache/) — skips steps
 * whose tools aren't cached (no auto-population from ToolShed).
 */

import { describe, it, expect, beforeAll } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { ToolCache } from "@galaxy-tool-util/core";
import { makeNodeToolCache } from "@galaxy-tool-util/core/node";
import { checkStrictEncoding, checkStrictStructure } from "@galaxy-tool-util/schema";
import {
  validateNativeSteps,
  type StepValidationResult,
} from "../src/commands/validate-workflow.js";
import { validateNativeStepsJsonSchema } from "../src/commands/validate-workflow-json-schema.js";

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

function runSweep(
  label: string,
  validateFn: (data: Record<string, unknown>, cache: ToolCache) => Promise<StepValidationResult[]>,
) {
  describe.skipIf(!IWC_DIR)(`IWC sweep: ${label}`, { timeout: 300_000 }, () => {
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

    it(`validates all native workflows (${label})`, async () => {
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

        const results = await validateFn(data, cache);

        for (const r of results) {
          if (r.status === "skip_tool_not_found" || r.status === "skip_replacement_params") {
            skipped++;
          } else if (r.status === "fail") {
            failures.push({ workflow: workflowId(wfPath), step: r });
          } else {
            validated++;
          }
        }
      }

      console.log(
        `\nIWC sweep (${label}): ${validated} steps validated, ${skipped} skipped, ${failures.length} failed`,
      );
      console.log(
        `  across ${workflows.length} workflows${parseErrors ? `, ${parseErrors} parse errors` : ""}`,
      );

      if (failures.length > 0) {
        const details = failures
          .map(
            (f) =>
              `  ${f.workflow} [${f.step.step}] ${f.step.tool_id}: ${f.step.errors.join("; ")}`,
          )
          .join("\n");
        expect.fail(`${failures.length} validation failures:\n${details}`);
      }
    });
  });
}

runSweep("native validation", validateNativeSteps);
runSweep("native JSON Schema validation", validateNativeStepsJsonSchema);

// --- Strict sweep suites ---

describe.skipIf(!IWC_DIR)("IWC sweep: strict-encoding", { timeout: 300_000 }, () => {
  let workflows: string[];

  beforeAll(async () => {
    workflows = await discoverNativeWorkflows(join(IWC_DIR!, "workflows"));
  });

  it("all IWC native workflows pass strict-encoding", () => {
    const failures: Array<{ workflow: string; errors: string[] }> = [];
    for (const wfPath of workflows) {
      const raw = readFileSync(wfPath, "utf-8");
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(raw);
      } catch {
        continue;
      }
      const errors = checkStrictEncoding(data, "native");
      if (errors.length > 0) {
        failures.push({ workflow: workflowId(wfPath), errors });
      }
    }

    if (failures.length > 0) {
      const details = failures.map((f) => `  ${f.workflow}: ${f.errors.join("; ")}`).join("\n");
      expect.fail(`${failures.length} encoding failures:\n${details}`);
    }
  });
});

describe.skipIf(!IWC_DIR)("IWC sweep: strict-structure", { timeout: 300_000 }, () => {
  let workflows: string[];

  beforeAll(async () => {
    workflows = await discoverNativeWorkflows(join(IWC_DIR!, "workflows"));
  });

  it("all IWC native workflows pass strict-structure", () => {
    const failures: Array<{ workflow: string; errors: string[] }> = [];
    for (const wfPath of workflows) {
      const raw = readFileSync(wfPath, "utf-8");
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(raw);
      } catch {
        continue;
      }
      const errors = checkStrictStructure(data, "native");
      if (errors.length > 0) {
        failures.push({ workflow: workflowId(wfPath), errors });
      }
    }

    if (failures.length > 0) {
      const details = failures.map((f) => `  ${f.workflow}: ${f.errors.join("; ")}`).join("\n");
      expect.fail(`${failures.length} structure failures:\n${details}`);
    }
  });
});

describe.skipIf(!IWC_DIR)("IWC sweep: strict (all)", { timeout: 300_000 }, () => {
  let workflows: string[];
  let cache: ToolCache;

  beforeAll(async () => {
    workflows = await discoverNativeWorkflows(join(IWC_DIR!, "workflows"));
    cache = makeNodeToolCache();
    await cache.index.load();
  });

  it("all IWC native workflows pass strict validation", async () => {
    const failures: Array<{ workflow: string; phase: string; errors: string[] }> = [];
    let skippedSteps = 0;

    for (const wfPath of workflows) {
      const raw = readFileSync(wfPath, "utf-8");
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(raw);
      } catch {
        continue;
      }

      // Encoding
      const encErrors = checkStrictEncoding(data, "native");
      if (encErrors.length > 0) {
        failures.push({ workflow: workflowId(wfPath), phase: "encoding", errors: encErrors });
        continue;
      }

      // Structure
      const structErrors = checkStrictStructure(data, "native");
      if (structErrors.length > 0) {
        failures.push({ workflow: workflowId(wfPath), phase: "structure", errors: structErrors });
        continue;
      }

      // State: check for skips (strict-state would reject these)
      const results = await validateNativeSteps(data, cache);
      const skips = results.filter((r) => r.status === "skip");
      skippedSteps += skips.length;
    }

    console.log(`\nIWC strict sweep: ${skippedSteps} steps would be skipped by strict-state`);

    if (failures.length > 0) {
      const details = failures
        .map((f) => `  ${f.workflow} [${f.phase}]: ${f.errors.join("; ")}`)
        .join("\n");
      expect.fail(`${failures.length} strict failures:\n${details}`);
    }
  });
});
