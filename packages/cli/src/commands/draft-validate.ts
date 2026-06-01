/**
 * `gxwf draft-validate` — validate a draft Galaxy workflow
 * (class: GalaxyWorkflowDraft).
 *
 * Wraps `validateDraft` from @galaxy-tool-util/schema. Single-file only; the
 * tree variant is deferred to workstream v2.
 *
 * With `--concrete`, additionally runs the `draft-extract` pipeline
 * (extractConcreteSubset + stripPlanFields + promoteFullyConcreteDrafts) and
 * runs the regular `gxwf validate` checks on the trimmed workflow:
 *   - structural decode (always)
 *   - --strict-structure / --strict-encoding (when the strict flags are set)
 *   - tool-state validation (default on, --no-tool-state to skip, --cache-dir
 *     selects the cache)
 *   - --strict-state (when set, escalates skipped tool-state steps to errors)
 *   - --connections (when set, runs connection-type compatibility)
 *
 * When the extracted subset is still a draft (not fully promoted), every
 * concrete-stage check is skipped, not failed. The concrete pass is also
 * skipped entirely when the draft has structural errors (the projection
 * isn't trustworthy in that case).
 *
 * Exit-code differences vs. `gxwf validate`: `gxwf validate` exits 2 on
 * strict-structure / strict-encoding failures; here, those roll into the
 * concrete report and escalate to exit 1 — the draft itself parsed; only the
 * projection failed.
 *
 * Exit codes (per workstream C):
 *   0 — clean draft (no structure/topology/semantic errors; warnings allowed)
 *   1 — draft validation errors (topology or semantic errors), OR --concrete
 *       checks surfaced any failure
 *   2 — parse failure, format mismatch, or structural decode failure
 *       (class !== GalaxyWorkflowDraft, schema decode error)
 */
import { dirname } from "node:path";
import { makeNodeToolCache } from "@galaxy-tool-util/core/node";
import {
  buildSingleDraftValidationReport,
  checkStrictEncoding,
  checkStrictStructure,
  extractConcreteSubset,
  promoteFullyConcreteDrafts,
  resolveFormat,
  stripPlanFields,
  validateDraft,
  type ConcreteValidationReport,
  type DraftValidationDiagnostic,
  type DraftValidationResult,
  type ExpansionOptions,
  type SingleDraftValidationReport,
  type ValidationStepResult,
} from "@galaxy-tool-util/schema";
import { decodeStructureErrors, validateFormat2Steps } from "./validate-workflow.js";
import { readWorkflowFile } from "./workflow-io.js";
import { findStdoutSinkConflict, writeReportHtml, writeReportOutput } from "./report-output.js";
import { resolveStrictOptions, type StrictOptions } from "./strict-options.js";
import { buildConnectionReport } from "./connection-validation.js";
import { createDefaultResolver } from "./url-resolver.js";

export interface DraftValidateOptions extends StrictOptions {
  format?: string;
  json?: boolean;
  reportHtml?: string | boolean;
  reportMarkdown?: string | boolean;
  concrete?: boolean;
  cacheDir?: string;
  toolState?: boolean;
  connections?: boolean;
}

export async function runDraftValidate(
  filePath: string,
  opts: DraftValidateOptions,
): Promise<void> {
  const conflict = findStdoutSinkConflict(opts);
  if (conflict) {
    console.error(conflict);
    process.exitCode = 2;
    return;
  }

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

  warnUnusedConcreteFlags(opts);

  const result = validateDraft(data);
  // Gate the concrete pass on draft-structure cleanliness — extractConcreteSubset
  // early-returns the input object verbatim when class != GalaxyWorkflowDraft,
  // and stripPlanFields would then mutate the original `data`. Skipping also
  // avoids running validate checks on a draft we know is structurally broken.
  const concrete =
    opts.concrete && result.structureErrors.length === 0
      ? await runConcretePass(filePath, data, opts)
      : undefined;
  const report = buildSingleDraftValidationReport(filePath, result, concrete);

  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printTextReport(report, result);
  }

  await writeReportOutput("draft_validate.md.j2", report, opts);
  await writeReportHtml("draft-validate", report, opts.reportHtml);

  process.exitCode = exitCodeFor(result, concrete);
}

function warnUnusedConcreteFlags(opts: DraftValidateOptions): void {
  if (opts.concrete) {
    if (opts.toolState === false && opts.strictState) {
      console.error(
        "Warning: --strict-state has no effect when tool-state validation is disabled (--no-tool-state)",
      );
    }
    return;
  }
  const ignored: string[] = [];
  if (opts.cacheDir) ignored.push("--cache-dir");
  if (opts.toolState === false) ignored.push("--no-tool-state");
  if (opts.connections) ignored.push("--connections");
  if (opts.strict || opts.strictStructure || opts.strictEncoding || opts.strictState) {
    ignored.push("--strict*");
  }
  if (ignored.length > 0) {
    console.error(`Warning: ${ignored.join(", ")} only apply with --concrete; ignoring`);
  }
}

async function runConcretePass(
  filePath: string,
  data: Record<string, unknown>,
  opts: DraftValidateOptions,
): Promise<ConcreteValidationReport> {
  const extract = extractConcreteSubset(data);
  stripPlanFields(extract.workflow);
  promoteFullyConcreteDrafts(extract.workflow);

  const trimmed: Record<string, unknown> =
    extract.workflow != null && typeof extract.workflow === "object"
      ? (extract.workflow as Record<string, unknown>)
      : {};
  const class_after: "GalaxyWorkflow" | "GalaxyWorkflowDraft" =
    trimmed.class === "GalaxyWorkflow" ? "GalaxyWorkflow" : "GalaxyWorkflowDraft";

  // Defense-in-depth: for any draft input the gate at the call site lets
  // through, extract+strip+promote always promotes the outer class. The only
  // way to hit this branch is an exotic shape (e.g. inline subworkflow draft
  // that itself fails promotion). Leaving the check here keeps the contract
  // explicit: never decode an unpromoted subset against GalaxyWorkflowSchema.
  if (class_after !== "GalaxyWorkflow") {
    return {
      class_after,
      skipped_reason: "extracted subset is still a draft — not fully promoted",
      structure_errors: [],
      // ok=null (not true) — concrete validation didn't run, so we cannot
      // claim the subset would have validated. Downstream readers must treat
      // null as "unknown," not as a pass.
      ok: null,
    };
  }

  const strict = resolveStrictOptions(opts);

  const report: ConcreteValidationReport = {
    class_after,
    skipped_reason: null,
    structure_errors: decodeStructureErrors(trimmed, "format2"),
    ok: true,
  };

  if (strict.strictStructure) {
    report.strict_structure_errors = checkStrictStructure(trimmed, "format2");
  }
  if (strict.strictEncoding) {
    report.strict_encoding_errors = checkStrictEncoding(trimmed, "format2");
  }

  // Tool-state defaults to ON (matches `gxwf validate`); --no-tool-state opts out.
  const toolStateEnabled = opts.toolState !== false;
  if (toolStateEnabled) {
    const cache = makeNodeToolCache({ cacheDir: opts.cacheDir });
    await cache.index.load();
    const expansionOpts: ExpansionOptions = {
      resolver: createDefaultResolver({ workflowDirectory: dirname(filePath) }),
    };
    const stepResults = await validateFormat2Steps(trimmed, cache, "", expansionOpts);
    report.tool_state = {
      results: stepResults,
      summary: summarize(stepResults),
    };
    if (strict.strictState) {
      const skipped = stepResults.filter((r) => r.status !== "ok" && r.status !== "fail");
      report.strict_state_errors = skipped.map(
        (r) => `${r.step} (${r.tool_id ?? "?"}): skipped (${r.status})`,
      );
    }

    if (opts.connections) {
      report.connection_report = await buildConnectionReport(trimmed, cache);
    }
  } else if (opts.connections) {
    // --connections without tool-state still needs a cache to look up tools.
    const cache = makeNodeToolCache({ cacheDir: opts.cacheDir });
    await cache.index.load();
    report.connection_report = await buildConnectionReport(trimmed, cache);
  }

  report.ok = isConcreteOk(report);
  return report;
}

function summarize(results: ValidationStepResult[]): { ok: number; fail: number; skip: number } {
  let ok = 0;
  let fail = 0;
  let skip = 0;
  for (const r of results) {
    if (r.status === "ok") ok++;
    else if (r.status === "fail") fail++;
    else skip++;
  }
  return { ok, fail, skip };
}

function isConcreteOk(c: ConcreteValidationReport): boolean | null {
  if (c.skipped_reason !== null) return null;
  if (c.structure_errors.length > 0) return false;
  if (c.strict_structure_errors && c.strict_structure_errors.length > 0) return false;
  if (c.strict_encoding_errors && c.strict_encoding_errors.length > 0) return false;
  if (c.strict_state_errors && c.strict_state_errors.length > 0) return false;
  if (c.tool_state && c.tool_state.summary.fail > 0) return false;
  if (c.connection_report && !c.connection_report.valid) return false;
  return true;
}

function exitCodeFor(
  result: DraftValidationResult,
  concrete: ConcreteValidationReport | undefined,
): number {
  if (result.structureErrors.length > 0) return 2;
  if (result.topologyErrors.length > 0 || result.semanticErrors.length > 0) return 1;
  // Only explicit `false` escalates — `null` (skipped) is informational.
  if (concrete && concrete.ok === false) return 1;
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
  if (report.concrete) printConcrete(report.concrete);
}

function printConcrete(concrete: ConcreteValidationReport): void {
  if (concrete.skipped_reason) {
    console.log(`  Concrete: SKIPPED (${concrete.skipped_reason})`);
    return;
  }
  console.log(`  Concrete: ${concrete.ok === true ? "OK" : "FAIL"}`);
  printList("    Structure errors", concrete.structure_errors);
  if (concrete.strict_structure_errors)
    printList("    Strict-structure errors", concrete.strict_structure_errors);
  if (concrete.strict_encoding_errors)
    printList("    Strict-encoding errors", concrete.strict_encoding_errors);
  if (concrete.strict_state_errors)
    printList("    Strict-state errors", concrete.strict_state_errors);
  if (concrete.tool_state) {
    const { ok, fail, skip } = concrete.tool_state.summary;
    console.log(`    Tool state: ${ok} ok, ${fail} fail, ${skip} skip`);
    for (const r of concrete.tool_state.results) {
      if (r.status === "ok") continue;
      const tag = r.tool_id ? `${r.step} (${r.tool_id})` : r.step;
      console.log(`      ${tag} [${r.status}]`);
      for (const e of r.errors) console.log(`        ${e}`);
    }
  }
  if (concrete.connection_report) {
    const cr = concrete.connection_report;
    const { ok = 0, invalid = 0, skip = 0 } = cr.summary;
    console.log(
      `    Connections: ${cr.valid ? "OK" : "INVALID"} — ${ok} ok, ${invalid} invalid, ${skip} skip`,
    );
  }
}

function printList(label: string, lines: string[]): void {
  if (lines.length === 0) return;
  console.log(`${label} (${lines.length}):`);
  for (const line of lines) console.log(`      ${line}`);
}

function printBucket(label: string, diagnostics: DraftValidationDiagnostic[]): void {
  if (diagnostics.length === 0) return;
  console.log(`  ${label} (${diagnostics.length}):`);
  for (const d of diagnostics) {
    const where = d.path.length === 0 ? "<workflow>" : d.path.join("/");
    console.log(`    ${where}: ${d.message}`);
  }
}
