/**
 * `gxwf roundtrip-tree` — batch roundtrip validation across a directory.
 * Mirrors the patterns in convert-tree.ts.
 */
import { ToolCache } from "@galaxy-tool-util/core";
import {
  roundtripValidate,
  type ExpansionOptions,
  type RoundtripResult,
  type RoundTripValidationResult,
  buildRoundTripTreeReport,
  categoryOf,
} from "@galaxy-tool-util/schema";
import { dirname, join } from "node:path";
import { loadToolInputsForWorkflow, type ToolLoadStatus } from "./stateful-tool-inputs.js";
import { createDefaultResolver } from "./url-resolver.js";
import { resolveStrictOptions, type StrictOptions } from "./strict-options.js";
import { resolveFormat } from "./workflow-io.js";
import { collectTree, skipWorkflow } from "./tree.js";
import { countDiffs } from "./roundtrip.js";
import { writeReportOutput, writeReportHtml, type ReportOutputOptions } from "./report-output.js";

export interface RoundtripTreeOptions extends StrictOptions, ReportOutputOptions {
  cacheDir?: string;
  format?: string;
  json?: boolean;
  /** Only list files with error-severity diffs or failures. */
  errorsOnly?: boolean;
  /** Only list files with benign diffs (no errors, no failures). */
  benignOnly?: boolean;
  /** Suppress per-file lines; print only the aggregate summary. */
  brief?: boolean;
}

interface FileOutcome {
  relativePath: string;
  result: RoundtripResult;
  toolLoadErrors?: ToolLoadStatus[];
}

export async function runRoundtripTree(dir: string, opts: RoundtripTreeOptions): Promise<void> {
  const cache = new ToolCache({ cacheDir: opts.cacheDir });
  await cache.index.load();
  if ((await cache.index.listAll()).length === 0) {
    console.warn("Tool cache is empty — all steps will fall back (no roundtrip possible)");
  }

  const strict = resolveStrictOptions(opts);

  // Only native workflows are eligible; format2 files are skipped.
  const treeResult = await collectTree<FileOutcome>(
    dir,
    async (info, data) => {
      const sourceFormat = resolveFormat(data, opts.format);

      if (sourceFormat !== "native") {
        skipWorkflow(`not a native workflow (${sourceFormat})`);
      }
      const expansionOpts: ExpansionOptions = {
        resolver: createDefaultResolver({
          workflowDirectory: dirname(join(dir, info.relativePath)),
        }),
      };
      const { resolver, status: toolStatus } = await loadToolInputsForWorkflow(
        data,
        "native",
        cache,
        expansionOpts,
      );
      const failedLoads = toolStatus.filter((s) => !s.loaded);
      const result = roundtripValidate(data, resolver, {
        strictEncoding: strict.strictEncoding,
        strictStructure: strict.strictStructure,
        strictState: strict.strictState,
      });
      if (result.encodingErrors.length > 0 || result.structureErrors.length > 0) {
        const allErrors = [...result.encodingErrors, ...result.structureErrors];
        throw new Error(`Strict: ${allErrors.join("; ")}`);
      }
      return {
        relativePath: info.relativePath,
        result,
        toolLoadErrors: failedLoads.length > 0 ? failedLoads : undefined,
      };
    },
    false, // native only — skip format2 discovery
  );

  // Aggregate
  let totalBenign = 0;
  let totalErrors = 0;
  let filesClean = 0;
  let filesBenignOnly = 0;
  let filesFailed = 0;
  const fileResults: FileOutcome[] = [];
  for (const o of treeResult.outcomes) {
    if (o.error || o.skipped || !o.result) continue;
    fileResults.push(o.result);
    const counts = countDiffs(o.result.result);
    totalBenign += counts.benign;
    totalErrors += counts.error;
    if (!o.result.result.success) filesFailed++;
    else if (o.result.result.clean) filesClean++;
    else filesBenignOnly++;
  }

  // Build RoundTripTreeReport for Markdown/HTML rendering
  const roundtripWorkflows: RoundTripValidationResult[] = treeResult.outcomes.map((o) => {
    const relPath = o.info.relativePath;
    if (o.error) return makeRoundTripResult(relPath, null, o.error, null);
    if (o.skipped) return makeRoundTripResult(relPath, null, null, "legacy_encoding");
    return makeRoundTripResult(relPath, o.result!.result, null, null);
  });
  const roundtripReport = buildRoundTripTreeReport(treeResult.root, roundtripWorkflows);
  await writeReportOutput("roundtrip_tree.md.j2", roundtripReport, {
    reportMarkdown: opts.reportMarkdown,
  });
  await writeReportHtml("roundtrip-tree", roundtripReport, opts.reportHtml);

  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          root: treeResult.root,
          files: fileResults,
          summary: {
            total: fileResults.length,
            clean: filesClean,
            benignOnly: filesBenignOnly,
            failed: filesFailed,
            benignDiffs: totalBenign,
            errorDiffs: totalErrors,
          },
        },
        null,
        2,
      ),
    );
  } else {
    if (!opts.brief) {
      for (const o of treeResult.outcomes) {
        if (o.error) {
          // File-level errors always shown unless --benign-only.
          if (!opts.benignOnly) {
            console.error(`  ${o.info.relativePath}: ERROR (${o.error})`);
          }
          continue;
        }
        if (o.skipped) continue;
        const r = o.result!;
        const c = countDiffs(r.result);
        const isFail = !r.result.success;
        const isClean = r.result.clean;
        const isBenign = !isFail && !isClean;

        if (opts.errorsOnly && !isFail) continue;
        if (opts.benignOnly && !isBenign) continue;

        const status = isFail ? "FAIL" : isClean ? "clean" : "benign";
        console.log(
          `  ${r.relativePath}: ${status} (${c.benign} benign, ${c.error} real diff, ${c.failed} conversion failure)`,
        );
        if (r.toolLoadErrors) {
          for (const t of r.toolLoadErrors) {
            const ver = t.toolVersion ? `@${t.toolVersion}` : "";
            console.error(`    tool ${t.toolId}${ver}: ${t.error}`);
          }
        }
      }
    }
    console.log(
      `\nSummary: ${fileResults.length} file(s): ${filesClean} clean, ${filesBenignOnly} benign-only, ${filesFailed} failed`,
    );
    console.log(`Diffs: ${totalBenign} benign, ${totalErrors} real`);
  }

  // Exit code: 2 if any failure, 1 if benign-only, 0 if all clean
  if (filesFailed > 0 || totalErrors > 0) process.exitCode = 2;
  else if (totalBenign > 0) process.exitCode = 1;
  else process.exitCode = 0;
}

/** Map the TS-internal RoundtripResult to the report-model shape for template rendering. */
function makeRoundTripResult(
  relPath: string,
  result: RoundtripResult | null,
  error: string | null,
  skippedReason: "legacy_encoding" | null,
): RoundTripValidationResult {
  const allDiffs = result?.stepResults.flatMap((s) => s.diffs) ?? [];
  const errorDiffs = allDiffs.filter((d) => d.severity === "error");
  const benignDiffs = allDiffs.filter((d) => d.severity === "benign");
  const ok = result ? result.success : false;
  let status: string;
  if (error) status = "error";
  else if (skippedReason) status = "skipped";
  else if (ok) status = "ok";
  else status = "roundtrip_mismatch";
  const conversionFailureLines =
    result?.stepResults
      .filter((s) => !s.success)
      .map((s) => s.error ?? `Step ${s.stepId} failed`) ?? [];
  return {
    workflow_path: relPath,
    category: categoryOf(relPath),
    conversion_result: null,
    diffs: allDiffs,
    step_id_mapping: null,
    stale_clean_results: null,
    error,
    skipped_reason: skippedReason,
    structure_errors: result?.structureErrors ?? [],
    encoding_errors: result?.encodingErrors ?? [],
    error_diffs: errorDiffs,
    benign_diffs: benignDiffs,
    ok,
    status,
    conversion_failure_lines: conversionFailureLines,
    summary_line: status.toUpperCase(),
  };
}
