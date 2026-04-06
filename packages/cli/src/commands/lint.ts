/**
 * `gxwf lint` — unified lint combining structural checks, best practices,
 * and tool state validation.
 */
import { ToolCache } from "@galaxy-tool-util/core";
import {
  lintWorkflow,
  lintBestPracticesNative,
  lintBestPracticesFormat2,
  checkStrictEncoding,
  checkStrictStructure,
  buildSingleLintReport,
  type LintResult,
  type ExpansionOptions,
  type WorkflowFormat,
  type ValidationStepResult as StepValidationResult,
} from "@galaxy-tool-util/schema";
import { dirname } from "node:path";
import { renderStepResults } from "./render-results.js";
import { readWorkflowFile, resolveFormat } from "./workflow-io.js";
import { createDefaultResolver } from "./url-resolver.js";
import {
  resolveStrictOptions,
  type StrictOptions,
  type ResolvedStrictOptions,
} from "./strict-options.js";
import { validateNativeSteps, validateFormat2Steps } from "./validate-workflow.js";

export interface LintOptions extends StrictOptions {
  format?: string;
  skipBestPractices?: boolean;
  skipStateValidation?: boolean;
  cacheDir?: string;
  json?: boolean;
}

export interface LintReportOptions {
  skipBestPractices?: boolean;
  skipStateValidation?: boolean;
  cache?: ToolCache;
  strict?: ResolvedStrictOptions;
}

export interface LintReport {
  structural: LintResult;
  bestPractices: LintResult | null;
  stateValidation: StepValidationResult[] | null;
  stateSkipped: boolean;
  encodingErrors: string[];
  structureErrors: string[];
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

  // Build or load tool cache for state validation
  let cache: ToolCache | undefined;
  if (!opts.skipStateValidation) {
    try {
      cache = new ToolCache({ cacheDir: opts.cacheDir });
      await cache.index.load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`Failed to load tool cache: ${msg}`);
    }
  }

  const strict = resolveStrictOptions(opts);
  const report = await lintWorkflowReport(filePath, data, format, {
    skipBestPractices: opts.skipBestPractices,
    skipStateValidation: opts.skipStateValidation,
    cache,
    strict,
  });

  if (opts.json) {
    const lintErrors = report.structural.error_count + (report.bestPractices?.error_count ?? 0);
    const lintWarnings = report.structural.warn_count + (report.bestPractices?.warn_count ?? 0);
    const singleReport = buildSingleLintReport(
      filePath,
      lintErrors,
      lintWarnings,
      report.stateValidation ?? [],
    );
    console.log(JSON.stringify(singleReport, null, 2));
    process.exitCode = report.exitCode;
    return;
  }

  // Strict checks
  if (report.encodingErrors.length > 0) {
    console.error("Encoding errors:");
    for (const e of report.encodingErrors) console.error(`  ${e}`);
  }
  if (report.structureErrors.length > 0) {
    console.error("Structure errors (strict):");
    for (const e of report.structureErrors) console.error(`  ${e}`);
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
    const { validated, skipped } = renderStepResults(report.stateValidation);
    if (report.stateValidation.length > 0) {
      console.log(`\nTool state: ${validated} validated, ${skipped} skipped`);
    }
  } else if (report.stateSkipped) {
    console.log("Tool state validation: skipped");
  }

  process.exitCode = report.exitCode;
}

/** Lint a workflow, returning a structured report. Pure logic — no CLI I/O. */
export async function lintWorkflowReport(
  filePath: string,
  data: Record<string, unknown>,
  format: string,
  opts: LintReportOptions,
): Promise<LintReport> {
  const strict = opts.strict ?? {
    strictStructure: false,
    strictEncoding: false,
    strictState: false,
  };
  const fmt = format as WorkflowFormat;

  // Strict encoding check
  const encodingErrors = strict.strictEncoding ? checkStrictEncoding(data, fmt) : [];

  // Strict structure check
  const structureErrors = strict.strictStructure ? checkStrictStructure(data, fmt) : [];

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
    const cache = opts.cache;
    if (!cache) {
      stateSkipped = true;
    } else {
      try {
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
  }

  // Compute exit code: 0 = clean, 1 = warnings only, 2 = errors
  const merged = mergeLintResults(structural, bestPractices);
  const hasStateErrors = stateValidation?.some((r) => r.status === "fail") ?? false;
  const hasStrictErrors = encodingErrors.length > 0 || structureErrors.length > 0;
  const hasStrictStateSkips =
    strict.strictState && (stateValidation?.some((r) => r.status === "skip") ?? false);
  const hasErrors =
    merged.error_count > 0 || hasStateErrors || hasStrictErrors || hasStrictStateSkips;
  const hasWarnings = merged.warn_count > 0;

  const exitCode = hasErrors ? 2 : hasWarnings ? 1 : 0;

  return {
    structural,
    bestPractices,
    stateValidation,
    stateSkipped,
    encodingErrors,
    structureErrors,
    exitCode,
  };
}
