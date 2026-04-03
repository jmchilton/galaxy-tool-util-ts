/**
 * `gxwf lint` — unified lint combining structural checks, best practices,
 * and tool state validation.
 */
import { ToolCache } from "@galaxy-tool-util/core";
import {
  lintWorkflow,
  lintBestPracticesNative,
  lintBestPracticesFormat2,
  type LintResult,
  type ExpansionOptions,
} from "@galaxy-tool-util/schema";
import { dirname } from "node:path";
import { readWorkflowFile, resolveFormat } from "./workflow-io.js";
import { createDefaultResolver } from "./url-resolver.js";
import {
  validateNativeSteps,
  validateFormat2Steps,
  type StepValidationResult,
} from "./validate-workflow.js";

export interface LintOptions {
  format?: string;
  skipBestPractices?: boolean;
  skipStateValidation?: boolean;
  cacheDir?: string;
  json?: boolean;
}

export interface LintReport {
  structural: LintResult;
  bestPractices: LintResult | null;
  stateValidation: StepValidationResult[] | null;
  stateSkipped: boolean;
  exitCode: number;
}

function mergeLintResults(...results: (LintResult | null)[]): LintResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  for (const r of results) {
    if (!r) continue;
    errors.push(...r.errors);
    warnings.push(...r.warnings);
  }
  return { errors, warnings, error_count: errors.length, warn_count: warnings.length };
}

export async function runLint(filePath: string, opts: LintOptions): Promise<void> {
  const data = await readWorkflowFile(filePath);
  if (!data) return;

  const format = resolveFormat(data, opts.format);
  const report = await lintWorkflowFull(filePath, data, format, opts);

  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.exitCode;
    return;
  }

  // Structural lint
  const { structural } = report;
  if (structural.error_count > 0) {
    console.error("Structural lint errors:");
    for (const e of structural.errors) console.error(`  ${e}`);
  }
  if (structural.warn_count > 0) {
    console.warn("Structural lint warnings:");
    for (const w of structural.warnings) console.warn(`  ${w}`);
  }
  if (structural.error_count === 0 && structural.warn_count === 0) {
    console.log("Structural lint: OK");
  }

  // Best practices
  if (report.bestPractices) {
    const bp = report.bestPractices;
    if (bp.error_count > 0) {
      console.error("Best practices errors:");
      for (const e of bp.errors) console.error(`  ${e}`);
    }
    if (bp.warn_count > 0) {
      console.warn("Best practices warnings:");
      for (const w of bp.warnings) console.warn(`  ${w}`);
    }
    if (bp.error_count === 0 && bp.warn_count === 0) {
      console.log("Best practices: OK");
    }
  }

  // Tool state validation
  if (report.stateValidation) {
    const results = report.stateValidation;
    let validated = 0;
    let skipped = 0;
    for (const r of results) {
      if (r.status === "skip") {
        skipped++;
        console.warn(`  [${r.stepLabel}] skipped — ${r.errors[0] ?? "unknown"}`);
      } else if (r.status === "fail") {
        validated++;
        console.error(`  [${r.stepLabel}] tool_state errors (${r.toolId}):`);
        for (const line of r.errors) console.error(`    ${line}`);
      } else {
        validated++;
        console.log(`  [${r.stepLabel}] tool_state: OK`);
      }
    }
    if (results.length > 0) {
      console.log(`\nTool state: ${validated} validated, ${skipped} skipped`);
    }
  } else if (report.stateSkipped) {
    console.log("Tool state validation: skipped");
  }

  process.exitCode = report.exitCode;
}

async function lintWorkflowFull(
  filePath: string,
  data: Record<string, unknown>,
  format: string,
  opts: LintOptions,
): Promise<LintReport> {
  // Phase 1: Structural lint (always runs)
  const structural = lintWorkflow(data);

  // Phase 2: Best practices
  let bestPractices: LintResult | null = null;
  if (!opts.skipBestPractices) {
    bestPractices =
      format === "native" ? lintBestPracticesNative(data) : lintBestPracticesFormat2(data);
  }

  // Phase 3: Tool state validation
  let stateValidation: StepValidationResult[] | null = null;
  let stateSkipped = !!opts.skipStateValidation;
  if (!opts.skipStateValidation) {
    try {
      const cache = new ToolCache({ cacheDir: opts.cacheDir });
      await cache.index.load();
      const isEmpty = cache.index.listAll().length === 0;
      if (isEmpty) {
        console.warn("Tool cache is empty — skipping tool state validation");
        stateSkipped = true;
      } else {
        const workflowDirectory = dirname(filePath);
        const expansionOpts: ExpansionOptions = {
          resolver: createDefaultResolver({ workflowDirectory }),
        };
        if (format === "native") {
          stateValidation = await validateNativeSteps(data, cache, "", expansionOpts);
        } else {
          stateValidation = await validateFormat2Steps(data, cache, "", expansionOpts);
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`Tool state validation failed: ${msg}`);
      stateSkipped = true;
    }
  }

  // Compute exit code: 0 = clean, 1 = warnings only, 2 = errors
  const merged = mergeLintResults(structural, bestPractices);
  const hasStateErrors = stateValidation?.some((r) => r.status === "fail") ?? false;
  const hasErrors = merged.error_count > 0 || hasStateErrors;
  const hasWarnings = merged.warn_count > 0;

  const exitCode = hasErrors ? 2 : hasWarnings ? 1 : 0;

  return { structural, bestPractices, stateValidation, stateSkipped, exitCode };
}
