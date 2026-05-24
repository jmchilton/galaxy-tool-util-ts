/**
 * `gxwf draft-validate` — validate a draft Galaxy workflow
 * (class: GalaxyWorkflowDraft).
 *
 * Wraps `validateDraft` from @galaxy-tool-util/schema. Single-file only; the
 * tree variant is deferred to workstream v2.
 *
 * Exit codes (per workstream C):
 *   0 — clean draft (no structure/topology/semantic errors; warnings allowed)
 *   1 — draft validation errors (topology or semantic errors)
 *   2 — parse failure, format mismatch, or structural decode failure
 *       (class !== GalaxyWorkflowDraft, schema decode error)
 */
import {
  buildSingleDraftValidationReport,
  resolveFormat,
  validateDraft,
  type DraftValidationDiagnostic,
  type DraftValidationResult,
  type SingleDraftValidationReport,
} from "@galaxy-tool-util/schema";
import { readWorkflowFile } from "./workflow-io.js";
import { writeReportHtml, writeReportOutput } from "./report-output.js";

export interface DraftValidateOptions {
  format?: string;
  json?: boolean;
  reportHtml?: string | boolean;
  reportMarkdown?: string | boolean;
}

export async function runDraftValidate(
  filePath: string,
  opts: DraftValidateOptions,
): Promise<void> {
  const data = await readWorkflowFile(filePath);
  if (!data) {
    process.exitCode = 2;
    return;
  }

  const format = resolveFormat(data, opts.format);
  if (format === "native") {
    console.error("draft-validate requires format2 — native workflows cannot be drafts");
    process.exitCode = 2;
    return;
  }

  const result = validateDraft(data);
  const report = buildSingleDraftValidationReport(filePath, result);

  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printTextReport(report, result);
  }

  await writeReportOutput("draft_validate.md.j2", report, opts);
  await writeReportHtml("draft-validate", report, opts.reportHtml);

  process.exitCode = exitCodeFor(result);
}

function exitCodeFor(result: DraftValidationResult): number {
  if (result.structureErrors.length > 0) return 2;
  if (result.topologyErrors.length > 0 || result.semanticErrors.length > 0) return 1;
  return 0;
}

function printTextReport(report: SingleDraftValidationReport, result: DraftValidationResult): void {
  console.log(`Draft validation: ${report.workflow}`);
  console.log(`  ${report.summary}`);
  printBucket("Structure errors", result.structureErrors);
  printBucket("Topology errors", result.topologyErrors);
  printBucket("Semantic errors", result.semanticErrors);
  printBucket("Warnings", result.warnings);
  const survey = report.survey;
  console.log(
    `  Survey: ${survey.todo_count} TODO sentinel${survey.todo_count === 1 ? "" : "s"}` +
      ` across ${survey.todo_paths.length} step path${survey.todo_paths.length === 1 ? "" : "s"};` +
      ` ${survey.plan_step_paths.length} step${survey.plan_step_paths.length === 1 ? "" : "s"} with _plan_* fields`,
  );
}

function printBucket(label: string, diagnostics: DraftValidationDiagnostic[]): void {
  if (diagnostics.length === 0) return;
  console.log(`  ${label} (${diagnostics.length}):`);
  for (const d of diagnostics) {
    const where = d.path.length === 0 ? "<workflow>" : d.path.join("/");
    console.log(`    ${where}: ${d.message}`);
  }
}
