/**
 * `gxwf lint-tree` — batch lint all workflows under a directory.
 */
import { ToolCache } from "@galaxy-tool-util/core";
import type {
  LintWorkflowResult,
  LintTreeReport as SchemaLintTreeReport,
} from "@galaxy-tool-util/schema";
import {
  buildLintWorkflowResult,
  buildLintTreeReport as schemaBuildLintTreeReport,
} from "@galaxy-tool-util/schema";
import { resolveFormat } from "./workflow-io.js";
import { resolveStrictOptions, type StrictOptions } from "./strict-options.js";
import { lintWorkflowReport, type LintReport } from "./lint.js";
import { collectTree, type TreeResult } from "./tree.js";
import { writeReportOutput, type ReportOutputOptions } from "./report-output.js";

export interface LintTreeOptions extends StrictOptions, ReportOutputOptions {
  format?: string;
  skipBestPractices?: boolean;
  skipStateValidation?: boolean;
  cacheDir?: string;
  json?: boolean;
}

/** Map internal LintReport to schema's flat LintWorkflowResult fields. */
function toLintWorkflowResult(relativePath: string, lr: LintReport): LintWorkflowResult {
  const lint_errors = lr.structural.error_count + (lr.bestPractices?.error_count ?? 0);
  const lint_warnings = lr.structural.warn_count + (lr.bestPractices?.warn_count ?? 0);
  const stepResults = lr.stateValidation ?? [];
  return buildLintWorkflowResult(relativePath, lint_errors, lint_warnings, stepResults);
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

  const treeResult = await collectTree<LintWorkflowResult>(dir, async (info, data) => {
    const format = resolveFormat(data, opts.format);
    const lr = await lintWorkflowReport(info.path, data, format, {
      skipBestPractices: opts.skipBestPractices,
      skipStateValidation: opts.skipStateValidation,
      cache,
      strict,
    });
    return toLintWorkflowResult(info.relativePath, lr);
  });

  const report = buildReport(treeResult);

  await writeReportOutput("lint_tree.md.j2", report, opts);

  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = computeLintExitCode(report);
    return;
  }

  // Text output
  for (const wf of report.workflows) {
    if (wf.error) {
      console.error(`  ${wf.path}: ERROR (${wf.error})`);
      continue;
    }
    if (wf.skipped_reason) {
      console.warn(`  ${wf.path}: SKIPPED (${wf.skipped_reason})`);
      continue;
    }

    const stateFails = wf.results.filter((s) => s.status === "fail").length;

    if (wf.lint_errors > 0 || stateFails > 0) {
      console.error(
        `  ${wf.path}: ${wf.lint_errors} errors, ${wf.lint_warnings} warnings, ${stateFails} state failures`,
      );
      // Detailed error output would require the internal LintReport;
      // for tree output we show the summary counts per workflow.
    } else if (wf.lint_warnings > 0) {
      console.warn(`  ${wf.path}: ${wf.lint_warnings} warnings`);
    } else {
      console.log(`  ${wf.path}: OK`);
    }
  }

  const s = report.summary;
  const total = report.workflows.length;
  console.log(
    `\nSummary: ${total} workflows | ${s.lint_errors} errors, ${s.lint_warnings} warnings, ${s.state_fail} state failures`,
  );
  process.exitCode = computeLintExitCode(report);
}

function buildReport(treeResult: TreeResult<LintWorkflowResult>): SchemaLintTreeReport {
  const workflows: LintWorkflowResult[] = [];

  for (const o of treeResult.outcomes) {
    if (o.error) {
      workflows.push(buildLintWorkflowResult(o.info.relativePath, 0, 0, [], { error: o.error }));
      continue;
    }
    if (o.skipped) {
      workflows.push(
        buildLintWorkflowResult(o.info.relativePath, 0, 0, [], {
          skipped_reason: (o.skipReason as "legacy_encoding") ?? null,
        }),
      );
      continue;
    }
    workflows.push(o.result!);
  }

  return schemaBuildLintTreeReport(treeResult.root, workflows);
}

function computeLintExitCode(report: SchemaLintTreeReport): number {
  const s = report.summary;
  if (s.lint_errors > 0 || s.state_fail > 0 || s.errors > 0) return 2;
  if (s.lint_warnings > 0) return 1;
  return 0;
}
