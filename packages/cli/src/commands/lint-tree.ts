/**
 * `gxwf lint-tree` — batch lint all workflows under a directory.
 */
import { ToolCache } from "@galaxy-tool-util/core";
import { resolveFormat } from "./workflow-io.js";
import { resolveStrictOptions, type StrictOptions } from "./strict-options.js";
import { lintWorkflowReport, type LintReport } from "./lint.js";
import { collectTree, summarizeOutcomes, type TreeResult, type TreeSummary } from "./tree.js";

export interface LintTreeOptions extends StrictOptions {
  format?: string;
  skipBestPractices?: boolean;
  skipStateValidation?: boolean;
  cacheDir?: string;
  json?: boolean;
}

export interface WorkflowLintResult {
  relativePath: string;
  report: LintReport;
}

export interface LintTreeReport {
  root: string;
  results: (WorkflowLintResult | { relativePath: string; error: string })[];
  summary: TreeSummary & { lintErrors: number; lintWarnings: number; stateFail: number };
}

export async function runLintTree(dir: string, opts: LintTreeOptions): Promise<void> {
  // Load tool cache once for all files
  let cache: ToolCache | undefined;
  if (!opts.skipStateValidation) {
    try {
      cache = new ToolCache({ cacheDir: opts.cacheDir });
      await cache.index.load();
      if (cache.index.listAll().length === 0) {
        console.warn("Tool cache is empty — skipping tool state validation for all files");
        cache = undefined;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`Failed to load tool cache: ${msg}`);
    }
  }

  const strict = resolveStrictOptions(opts);

  const treeResult = await collectTree(dir, async (info, data) => {
    const format = resolveFormat(data, opts.format);
    const report = await lintWorkflowReport(info.path, data, format, {
      skipBestPractices: opts.skipBestPractices,
      skipStateValidation: opts.skipStateValidation,
      cache,
      strict,
    });
    return { relativePath: info.relativePath, report } satisfies WorkflowLintResult;
  });

  const report = buildLintTreeReport(treeResult);

  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = computeLintExitCode(report);
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
    const lr = r.report;
    const errors = lr.structural.error_count + (lr.bestPractices?.error_count ?? 0);
    const warnings = lr.structural.warn_count + (lr.bestPractices?.warn_count ?? 0);
    const stateFails = lr.stateValidation?.filter((s) => s.status === "fail").length ?? 0;

    if (errors > 0 || stateFails > 0) {
      console.error(
        `  ${r.relativePath}: ${errors} errors, ${warnings} warnings, ${stateFails} state failures`,
      );
      for (const e of lr.structural.errors) console.error(`    [structural] ${e}`);
      if (lr.bestPractices) {
        for (const e of lr.bestPractices.errors) console.error(`    [best-practices] ${e}`);
      }
      if (lr.stateValidation) {
        for (const s of lr.stateValidation.filter((s) => s.status === "fail")) {
          for (const err of s.errors)
            console.error(`    [state] Step ${s.stepLabel} (${s.toolId}): ${err}`);
        }
      }
    } else if (warnings > 0) {
      console.warn(`  ${r.relativePath}: ${warnings} warnings`);
    } else {
      console.log(`  ${r.relativePath}: OK`);
    }
  }

  const s = report.summary;
  console.log(
    `\nSummary: ${s.total} workflows | ${s.lintErrors} errors, ${s.lintWarnings} warnings, ${s.stateFail} state failures`,
  );
  process.exitCode = computeLintExitCode(report);
}

function buildLintTreeReport(treeResult: TreeResult<WorkflowLintResult>): LintTreeReport {
  const results: LintTreeReport["results"] = [];
  let lintErrors = 0;
  let lintWarnings = 0;
  let stateFail = 0;

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
    lintErrors += r.report.structural.error_count + (r.report.bestPractices?.error_count ?? 0);
    lintWarnings += r.report.structural.warn_count + (r.report.bestPractices?.warn_count ?? 0);
    stateFail += r.report.stateValidation?.filter((s) => s.status === "fail").length ?? 0;
  }

  const wfSummary = summarizeOutcomes(treeResult.outcomes, (r) => r.report.exitCode >= 2);

  return {
    root: treeResult.root,
    results,
    summary: { ...wfSummary, lintErrors, lintWarnings, stateFail },
  };
}

function computeLintExitCode(report: LintTreeReport): number {
  const s = report.summary;
  if (s.lintErrors > 0 || s.stateFail > 0 || s.error > 0) return 2;
  if (s.lintWarnings > 0) return 1;
  return 0;
}
