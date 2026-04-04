/**
 * `gxwf validate-tree` — batch validate all workflows under a directory.
 */
import { ToolCache } from "@galaxy-tool-util/core";
import type { ExpansionOptions } from "@galaxy-tool-util/schema";
import { dirname } from "node:path";
import { createDefaultResolver } from "./url-resolver.js";
import { resolveFormat } from "./workflow-io.js";
import {
  validateNativeSteps,
  validateFormat2Steps,
  type StepValidationResult,
  type ValidationMode,
} from "./validate-workflow.js";
import { collectTree, summarizeOutcomes, type TreeResult, type TreeSummary } from "./tree.js";

export interface ValidateTreeOptions {
  format?: string;
  toolState?: boolean;
  cacheDir?: string;
  mode?: string;
  toolSchemaDir?: string;
  json?: boolean;
}

export interface WorkflowValidateResult {
  relativePath: string;
  format: string;
  steps: StepValidationResult[];
}

export interface ValidateTreeReport {
  root: string;
  results: (WorkflowValidateResult | { relativePath: string; error: string })[];
  summary: TreeSummary & { stepOk: number; stepFail: number; stepSkip: number };
}

export async function runValidateTree(dir: string, opts: ValidateTreeOptions): Promise<void> {
  const mode: ValidationMode = opts.mode === "json-schema" ? "json-schema" : "effect";

  // Load tool cache once for all files
  let cache: ToolCache | undefined;
  if (opts.toolState !== false) {
    try {
      cache = new ToolCache({ cacheDir: opts.cacheDir });
      await cache.index.load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`Failed to load tool cache: ${msg}`);
    }
  }

  // Lazy-load json-schema validators to avoid importing ajv when not needed
  let validateNativeStepsJsonSchema: typeof validateNativeSteps | undefined;
  let validateFormat2StepsJsonSchema: typeof validateFormat2Steps | undefined;
  if (mode === "json-schema") {
    const mod = await import("./validate-workflow-json-schema.js");
    validateNativeStepsJsonSchema = (data, cache, prefix, expansionOpts) =>
      mod.validateNativeStepsJsonSchema(data, cache, opts.toolSchemaDir, prefix, expansionOpts);
    validateFormat2StepsJsonSchema = (data, cache, prefix, expansionOpts) =>
      mod.validateFormat2StepsJsonSchema(data, cache, opts.toolSchemaDir, prefix, expansionOpts);
  }

  const treeResult = await collectTree(dir, async (info, data) => {
    const format = resolveFormat(data, opts.format);
    const expansionOpts: ExpansionOptions = {
      resolver: createDefaultResolver({ workflowDirectory: dirname(info.path) }),
    };

    let steps: StepValidationResult[] = [];
    if (cache && opts.toolState !== false) {
      const validateNative = validateNativeStepsJsonSchema ?? validateNativeSteps;
      const validateF2 = validateFormat2StepsJsonSchema ?? validateFormat2Steps;
      steps =
        format === "native"
          ? await validateNative(data, cache, "", expansionOpts)
          : await validateF2(data, cache, "", expansionOpts);
    }

    return { relativePath: info.relativePath, format, steps } satisfies WorkflowValidateResult;
  });

  const report = buildValidateReport(treeResult);

  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = computeValidateExitCode(report);
    return;
  }

  // Text output
  for (const outcome of treeResult.outcomes) {
    if (outcome.error) {
      console.error(`  ${outcome.info.relativePath}: ERROR (${outcome.error})`);
      continue;
    }
    if (outcome.skipped) {
      console.warn(`  ${outcome.info.relativePath}: SKIPPED (${outcome.skipReason})`);
      continue;
    }
    const r = outcome.result!;
    const ok = r.steps.filter((s) => s.status === "ok").length;
    const fail = r.steps.filter((s) => s.status === "fail").length;
    const skip = r.steps.filter((s) => s.status === "skip").length;
    const total = r.steps.length;

    if (fail > 0) {
      console.error(`  ${r.relativePath}: ${total} steps (${ok} OK, ${fail} FAIL, ${skip} SKIP)`);
      for (const s of r.steps.filter((s) => s.status === "fail")) {
        for (const err of s.errors) {
          console.error(`    Step ${s.stepLabel} (${s.toolId}): ${err}`);
        }
      }
    } else {
      console.log(`  ${r.relativePath}: ${total} steps (${ok} OK, ${skip} SKIP)`);
    }
  }

  const s = report.summary;
  console.log(
    `\nSummary: ${s.total} workflows | ${s.stepOk} OK, ${s.stepFail} FAIL, ${s.stepSkip} SKIP`,
  );
  process.exitCode = computeValidateExitCode(report);
}

function buildValidateReport(treeResult: TreeResult<WorkflowValidateResult>): ValidateTreeReport {
  const results: ValidateTreeReport["results"] = [];
  let stepOk = 0;
  let stepFail = 0;
  let stepSkip = 0;

  for (const o of treeResult.outcomes) {
    if (o.error) {
      results.push({ relativePath: o.info.relativePath, error: o.error });
      continue;
    }
    if (o.skipped) {
      results.push({ relativePath: o.info.relativePath, error: `SKIPPED: ${o.skipReason}` });
      continue;
    }
    const r = o.result!;
    results.push(r);
    stepOk += r.steps.filter((s) => s.status === "ok").length;
    stepFail += r.steps.filter((s) => s.status === "fail").length;
    stepSkip += r.steps.filter((s) => s.status === "skip").length;
  }

  const wfSummary = summarizeOutcomes(treeResult.outcomes, (r) =>
    r.steps.some((s) => s.status === "fail"),
  );

  return {
    root: treeResult.root,
    results,
    summary: { ...wfSummary, stepOk, stepFail, stepSkip },
  };
}

function computeValidateExitCode(report: ValidateTreeReport): number {
  const s = report.summary;
  if (s.stepFail > 0 || s.error > 0) return 1;
  return 0;
}
