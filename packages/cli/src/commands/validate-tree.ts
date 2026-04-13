/**
 * `gxwf validate-tree` — batch validate all workflows under a directory.
 */
import type { ToolCache } from "@galaxy-tool-util/core";
import { makeNodeToolCache } from "@galaxy-tool-util/core/node";
import {
  checkStrictEncoding,
  checkStrictStructure,
  buildWorkflowValidationResult,
  buildTreeValidationReport,
  type ExpansionOptions,
  type ValidationStepResult,
  type WorkflowValidationResult,
  type TreeValidationReport,
} from "@galaxy-tool-util/schema";
import { dirname } from "node:path";
import { createDefaultResolver } from "./url-resolver.js";
import { resolveStrictOptions, type StrictOptions } from "./strict-options.js";
import { resolveFormat } from "./workflow-io.js";
import {
  validateNativeSteps,
  validateFormat2Steps,
  type ValidationMode,
} from "./validate-workflow.js";
import { collectTree, type TreeResult } from "./tree.js";
import { writeReportOutput, writeReportHtml, type ReportOutputOptions } from "./report-output.js";

export interface ValidateTreeOptions extends StrictOptions, ReportOutputOptions {
  format?: string;
  toolState?: boolean;
  cacheDir?: string;
  mode?: string;
  toolSchemaDir?: string;
  json?: boolean;
}

export async function runValidateTree(dir: string, opts: ValidateTreeOptions): Promise<void> {
  const mode: ValidationMode = opts.mode === "json-schema" ? "json-schema" : "effect";

  // Load tool cache once for all files
  let cache: ToolCache | undefined;
  if (opts.toolState !== false) {
    try {
      cache = makeNodeToolCache({ cacheDir: opts.cacheDir });
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

  const strict = resolveStrictOptions(opts);

  const treeResult = await collectTree<WorkflowValidationResult>(dir, async (info, data) => {
    const format = resolveFormat(data, opts.format);

    // Per-file strict checks
    if (strict.strictEncoding) {
      const encErrors = checkStrictEncoding(data, format);
      if (encErrors.length > 0) {
        throw new Error(`Encoding: ${encErrors.join("; ")}`);
      }
    }
    if (strict.strictStructure) {
      const structErrors = checkStrictStructure(data, format);
      if (structErrors.length > 0) {
        throw new Error(`Structure: ${structErrors.join("; ")}`);
      }
    }

    const expansionOpts: ExpansionOptions = {
      resolver: createDefaultResolver({ workflowDirectory: dirname(info.path) }),
    };

    let stepResults: ValidationStepResult[] = [];
    if (cache && opts.toolState !== false) {
      const validateNative = validateNativeStepsJsonSchema ?? validateNativeSteps;
      const validateF2 = validateFormat2StepsJsonSchema ?? validateFormat2Steps;
      stepResults =
        format === "native"
          ? await validateNative(data, cache, "", expansionOpts)
          : await validateF2(data, cache, "", expansionOpts);
    }

    // --strict-state: promote skips to failures
    if (strict.strictState && stepResults.some((s) => s.status !== "ok" && s.status !== "fail")) {
      throw new Error("Strict state: skipped steps not allowed");
    }

    return buildWorkflowValidationResult(info.relativePath, stepResults);
  });

  const report = buildReport(treeResult);

  await writeReportOutput("validate_tree.md.j2", report, { reportMarkdown: opts.reportMarkdown });
  await writeReportHtml("validate-tree", report, opts.reportHtml);

  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = computeValidateExitCode(report);
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
    const s = wf.summary!;
    const total = s.ok + s.fail + s.skip;

    if (s.fail > 0) {
      console.error(`  ${wf.path}: ${total} steps (${s.ok} OK, ${s.fail} FAIL, ${s.skip} SKIP)`);
      for (const f of wf.failures ?? []) {
        console.error(`    Step ${f.step} (${f.tool_id}): ${f.message}`);
      }
    } else {
      console.log(`  ${wf.path}: ${total} steps (${s.ok} OK, ${s.skip} SKIP)`);
    }
  }

  const s = report.summary;
  const total = report.workflows.length;
  console.log(`\nSummary: ${total} workflows | ${s.ok} OK, ${s.fail} FAIL, ${s.skip} SKIP`);
  process.exitCode = computeValidateExitCode(report);
}

function buildReport(treeResult: TreeResult<WorkflowValidationResult>): TreeValidationReport {
  const workflows: WorkflowValidationResult[] = [];

  for (const o of treeResult.outcomes) {
    if (o.error) {
      workflows.push(buildWorkflowValidationResult(o.info.relativePath, [], { error: o.error }));
      continue;
    }
    if (o.skipped) {
      workflows.push(
        buildWorkflowValidationResult(o.info.relativePath, [], {
          skipped_reason: (o.skipReason as "legacy_encoding") ?? null,
        }),
      );
      continue;
    }
    workflows.push(o.result!);
  }

  return buildTreeValidationReport(treeResult.root, workflows);
}

function computeValidateExitCode(report: TreeValidationReport): number {
  const s = report.summary;
  if (s.fail > 0 || s.error > 0) return 1;
  return 0;
}
