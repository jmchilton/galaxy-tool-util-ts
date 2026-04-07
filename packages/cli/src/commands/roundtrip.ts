/**
 * `gxwf roundtrip` — roundtrip-validate a native workflow through format2
 * and back, reporting per-step diffs and classifying them as benign or real.
 *
 * Exit codes:
 *   0  clean roundtrip (no diffs)
 *   1  benign diffs only (type coercions, stale keys, connection moves)
 *   2  real diffs or conversion errors
 */
import { ToolCache } from "@galaxy-tool-util/core";
import {
  roundtripValidate,
  type ExpansionOptions,
  type RoundtripResult,
  type StepDiff,
} from "@galaxy-tool-util/schema";
import { dirname } from "node:path";
import { loadToolInputsForWorkflow } from "./stateful-tool-inputs.js";
import { createDefaultResolver } from "./url-resolver.js";
import { resolveStrictOptions, type StrictOptions } from "./strict-options.js";
import { readWorkflowFile, resolveFormat } from "./workflow-io.js";

export interface RoundtripOptions extends StrictOptions {
  cacheDir?: string;
  format?: string;
  json?: boolean;
  /** Only show steps with error-severity diffs. */
  errorsOnly?: boolean;
  /** Only show steps with benign diffs (suppress clean + real-error steps). */
  benignOnly?: boolean;
  /** Suppress the per-diff list; show only per-step counts and summary. */
  brief?: boolean;
}

export async function runRoundtrip(filePath: string, opts: RoundtripOptions): Promise<void> {
  const data = await readWorkflowFile(filePath);
  if (!data) return;

  const sourceFormat = resolveFormat(data, opts.format);
  const strict = resolveStrictOptions(opts);

  if (sourceFormat !== "native") {
    console.error(
      `Roundtrip source must be a native (.ga) workflow; got ${sourceFormat}.` +
        ` Convert to native first or pass a .ga file.`,
    );
    process.exitCode = 2;
    return;
  }

  const cache = new ToolCache({ cacheDir: opts.cacheDir });
  await cache.index.load();
  if (cache.index.listAll().length === 0) {
    console.warn("Tool cache is empty — all steps will fall back (no roundtrip possible)");
  }

  const expansionOpts: ExpansionOptions = {
    resolver: createDefaultResolver({ workflowDirectory: dirname(filePath) }),
  };
  const { resolver, status: toolStatus } = await loadToolInputsForWorkflow(
    data,
    "native",
    cache,
    expansionOpts,
  );
  for (const s of toolStatus) {
    if (!s.loaded) {
      const ver = s.toolVersion ? `@${s.toolVersion}` : "";
      console.error(`  tool ${s.toolId}${ver}: ${s.error}`);
    }
  }

  const result = roundtripValidate(data, resolver, {
    strictEncoding: strict.strictEncoding,
    strictStructure: strict.strictStructure,
    strictState: strict.strictState,
  });

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    // Report strict errors before step-level results
    if (result.encodingErrors.length > 0) {
      console.error("Encoding errors:");
      for (const e of result.encodingErrors) console.error(`  ${e}`);
    }
    if (result.structureErrors.length > 0) {
      console.error("Structure errors (strict):");
      for (const e of result.structureErrors) console.error(`  ${e}`);
    }
    reportResult(filePath, result, opts);
  }

  let exitCode = exitCodeFor(result);

  // --strict-state: require all steps to roundtrip (no skips/failures)
  if (strict.strictState && result.stepResults.some((s) => !s.success)) {
    exitCode = 2;
  }

  process.exitCode = exitCode;
}

export interface ReportFilter {
  errorsOnly?: boolean;
  benignOnly?: boolean;
  brief?: boolean;
}

function reportResult(filePath: string, result: RoundtripResult, filter: ReportFilter): void {
  const total = result.stepResults.length;
  const failed = result.stepResults.filter((s) => !s.success).length;
  const benignCount = result.stepResults.reduce(
    (n, s) => n + s.diffs.filter((d) => d.severity === "benign").length,
    0,
  );
  const errorCount = result.stepResults.reduce(
    (n, s) => n + s.diffs.filter((d) => d.severity === "error").length,
    0,
  );

  console.log(`Roundtrip: ${filePath}`);
  console.log(
    `  ${total - failed}/${total} step(s) ok, ${benignCount} benign diff(s), ${errorCount} real diff(s)`,
  );

  // --brief short-circuits: skip the per-step detail entirely. Still prints
  // the one-line summary above, which is the whole point of --brief.
  if (filter.brief) return;

  for (const step of result.stepResults) {
    const hasError = step.diffs.some((d) => d.severity === "error");
    const hasBenign = step.diffs.some((d) => d.severity === "benign");

    if (filter.errorsOnly && !hasError && step.success) continue;
    if (filter.benignOnly) {
      // Show only steps with benign diffs and no errors and no failure.
      if (!hasBenign || hasError || !step.success) continue;
    }
    // Default: skip clean-passing tool steps but keep informational
    // subworkflow notes (failureClass set, success true) visible.
    if (
      !filter.errorsOnly &&
      !filter.benignOnly &&
      step.diffs.length === 0 &&
      step.success &&
      !step.failureClass
    ) {
      continue;
    }

    // Indent nested subworkflow steps (depth>0) so the hierarchy is visible.
    const indent = "  ".repeat(step.depth);
    const label = step.toolId ? `${step.stepId} (${step.toolId})` : step.stepId;
    if (!step.success) {
      console.error(
        `${indent}  step ${label}: ${step.failureClass ?? "failed"} — ${step.error ?? ""}`,
      );
    } else if (step.failureClass) {
      console.log(`${indent}  step ${label}: ${step.failureClass} (${step.error ?? ""})`);
    }
    const diffsToShow = filter.errorsOnly
      ? step.diffs.filter((d) => d.severity === "error")
      : filter.benignOnly
        ? step.diffs.filter((d) => d.severity === "benign")
        : step.diffs;
    for (const d of diffsToShow) {
      const tag = d.severity === "error" ? "ERROR" : `benign:${d.benign_artifact?.reason ?? "?"}`;
      const loc = d.key_path || "<root>";
      console.log(`${indent}    [${tag}] ${loc}: ${d.description}`);
    }
  }
}

/**
 * Exit code policy: 0 clean, 1 benign-only, 2 real diffs or errors.
 * Exposed for reuse by the tree command.
 */
export function exitCodeFor(result: RoundtripResult): number {
  if (!result.success) return 2;
  if (!result.clean) return 1;
  return 0;
}

/** Count diffs across a result by severity — reused by tree aggregation. */
export function countDiffs(result: RoundtripResult): {
  benign: number;
  error: number;
  failed: number;
} {
  const flat: StepDiff[] = result.stepResults.flatMap((s) => s.diffs);
  return {
    benign: flat.filter((d) => d.severity === "benign").length,
    error: flat.filter((d) => d.severity === "error").length,
    failed: result.stepResults.filter((s) => !s.success).length,
  };
}
