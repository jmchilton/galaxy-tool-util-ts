/**
 * `gxwf convert-tree` — batch convert all workflows under a directory.
 */
import { ToolCache } from "@galaxy-tool-util/core";
import {
  toFormat2,
  toFormat2Stateful,
  toNative,
  toNativeStateful,
  checkStrictEncoding,
  checkStrictStructure,
  type ExpansionOptions,
  type StepConversionStatus,
  type WorkflowFormat,
} from "@galaxy-tool-util/schema";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, basename } from "node:path";
import { loadToolInputsForWorkflow, type ToolLoadStatus } from "./stateful-tool-inputs.js";
import { createDefaultResolver } from "./url-resolver.js";
import { resolveStrictOptions, type StrictOptions } from "./strict-options.js";
import { resolveFormat, serializeWorkflow } from "./workflow-io.js";
import { collectTree, summarizeOutcomes, type TreeResult, type TreeSummary } from "./tree.js";

export interface ConvertTreeOptions extends StrictOptions {
  to?: string;
  outputDir?: string;
  compact?: boolean;
  yaml?: boolean;
  format?: string;
  json?: boolean;
  reportJson?: boolean;
  stateful?: boolean;
  cacheDir?: string;
}

export interface WorkflowConvertResult {
  relativePath: string;
  sourceFormat: string;
  targetFormat: string;
  statefulSteps?: StepConversionStatus[];
  toolLoadErrors?: ToolLoadStatus[];
}

export interface ConvertTreeReport {
  root: string;
  results: (WorkflowConvertResult | { relativePath: string; error: string })[];
  summary: TreeSummary;
}

export async function runConvertTree(dir: string, opts: ConvertTreeOptions): Promise<void> {
  const outputDir = opts.outputDir;
  if (!outputDir) {
    console.error("--output-dir is required for convert-tree");
    process.exitCode = 1;
    return;
  }

  // Shared tool cache for stateful mode (loaded once per run)
  let cache: ToolCache | null = null;
  if (opts.stateful) {
    cache = new ToolCache({ cacheDir: opts.cacheDir });
    await cache.index.load();
    if ((await cache.index.listAll()).length === 0) {
      console.warn("Tool cache is empty — stateful conversion will fall back for every step");
    }
  }

  const strict = resolveStrictOptions(opts);

  const treeResult = await collectTree(dir, async (info, data) => {
    const sourceFormat = resolveFormat(data, opts.format);
    const targetFormat = resolveTargetFormat(sourceFormat, opts.to);

    // Per-file strict checks on input
    if (strict.strictEncoding) {
      const encErrors = checkStrictEncoding(data, sourceFormat);
      if (encErrors.length > 0) {
        throw new Error(`Encoding: ${encErrors.join("; ")}`);
      }
    }
    if (strict.strictStructure) {
      const structErrors = checkStrictStructure(data, sourceFormat);
      if (structErrors.length > 0) {
        throw new Error(`Structure: ${structErrors.join("; ")}`);
      }
    }

    if (sourceFormat === targetFormat) {
      return {
        relativePath: info.relativePath,
        sourceFormat,
        targetFormat,
      } satisfies WorkflowConvertResult;
    }

    let result: Record<string, unknown>;
    let statefulSteps: StepConversionStatus[] | undefined;
    let toolLoadErrors: ToolLoadStatus[] | undefined;

    if (opts.stateful && cache) {
      const expansionOpts: ExpansionOptions = {
        resolver: createDefaultResolver({
          workflowDirectory: dirname(join(dir, info.relativePath)),
        }),
      };
      const { resolver, status: toolStatus } = await loadToolInputsForWorkflow(
        data,
        sourceFormat,
        cache,
        expansionOpts,
      );
      const failedLoads = toolStatus.filter((s) => !s.loaded);
      if (failedLoads.length > 0) toolLoadErrors = failedLoads;
      if (targetFormat === "format2") {
        const r = toFormat2Stateful(data, resolver);
        result = r.workflow as unknown as Record<string, unknown>;
        statefulSteps = r.steps;
        if (opts.compact) stripPositionInfo(result);
      } else {
        const r = toNativeStateful(data, resolver);
        result = r.workflow as unknown as Record<string, unknown>;
        statefulSteps = r.steps;
      }
    } else if (targetFormat === "format2") {
      result = toFormat2(data) as unknown as Record<string, unknown>;
      if (opts.compact) {
        stripPositionInfo(result);
      }
    } else {
      result = toNative(data) as unknown as Record<string, unknown>;
    }

    const serialized = serializeWorkflow(result, targetFormat, {
      json: opts.json,
      yaml: opts.yaml,
    });

    // Write to output dir, adjusting extension for target format
    const outName = renameForFormat(info.relativePath, targetFormat);
    const outPath = join(outputDir, outName);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, serialized, "utf-8");

    // --strict-state: require all stateful steps to convert successfully
    if (strict.strictState && statefulSteps?.some((s) => !s.converted)) {
      throw new Error("Strict state: all steps must convert successfully");
    }

    return {
      relativePath: info.relativePath,
      sourceFormat,
      targetFormat,
      statefulSteps,
      toolLoadErrors,
    } satisfies WorkflowConvertResult;
  });

  const report = buildConvertReport(treeResult);

  // Aggregate stateful step counts across files
  let statefulFallbacks = 0;
  if (opts.stateful) {
    for (const r of report.results) {
      if ("statefulSteps" in r && r.statefulSteps) {
        statefulFallbacks += r.statefulSteps.filter((s) => !s.converted).length;
      }
    }
  }

  if (opts.reportJson) {
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.summary.error > 0 || statefulFallbacks > 0 ? 1 : 0;
    return;
  }

  // Text output
  for (const outcome of treeResult.outcomes) {
    if (outcome.error) {
      console.error(`  ${outcome.info.relativePath}: ERROR (${outcome.error})`);
      continue;
    }
    const r = outcome.result!;
    if (r.sourceFormat === r.targetFormat) {
      console.warn(`  ${r.relativePath}: already ${r.targetFormat}, skipped`);
    } else {
      let line = `  ${r.relativePath}: ${r.sourceFormat} → ${r.targetFormat}`;
      if (r.statefulSteps) {
        const converted = r.statefulSteps.filter((s) => s.converted).length;
        line += ` [stateful ${converted}/${r.statefulSteps.length}]`;
      }
      console.log(line);
      if (r.toolLoadErrors) {
        for (const t of r.toolLoadErrors) {
          const ver = t.toolVersion ? `@${t.toolVersion}` : "";
          console.error(`    tool ${t.toolId}${ver}: ${t.error}`);
        }
      }
    }
  }

  const s = report.summary;
  console.log(`\nSummary: ${s.total} workflows converted (written to ${outputDir})`);
  if (opts.stateful) {
    console.log(`Stateful: ${statefulFallbacks} step(s) fell back to schema-free`);
    // Aggregate failure classes across all files
    const byClass = new Map<string, number>();
    for (const r of report.results) {
      if ("statefulSteps" in r && r.statefulSteps) {
        for (const step of r.statefulSteps) {
          if (!step.converted) {
            const cls = step.failureClass ?? "unknown";
            byClass.set(cls, (byClass.get(cls) ?? 0) + 1);
          }
        }
      }
    }
    if (byClass.size > 0) {
      const summary = Array.from(byClass.entries())
        .map(([k, v]) => `${k}=${v}`)
        .join(", ");
      console.log(`  fallback breakdown: ${summary}`);
    }
  }
  process.exitCode = s.error > 0 || statefulFallbacks > 0 ? 1 : 0;
}

function resolveTargetFormat(sourceFormat: WorkflowFormat, toOpt?: string): WorkflowFormat {
  if (toOpt === "native" || toOpt === "format2") return toOpt;
  return sourceFormat === "native" ? "format2" : "native";
}

/** Rename a relative path's extension for the target format. */
function renameForFormat(relPath: string, targetFormat: WorkflowFormat): string {
  const dir = dirname(relPath);
  let name = basename(relPath);

  // Strip known workflow extensions
  if (name.endsWith(".gxwf.yml")) name = name.slice(0, -9);
  else if (name.endsWith(".gxwf.yaml")) name = name.slice(0, -10);
  else if (name.endsWith(".ga")) name = name.slice(0, -3);
  else if (name.endsWith(".json")) name = name.slice(0, -5);
  else if (name.endsWith(".yml")) name = name.slice(0, -4);
  else if (name.endsWith(".yaml")) name = name.slice(0, -5);

  const ext = targetFormat === "format2" ? ".gxwf.yml" : ".ga";
  const newName = name + ext;
  return dir === "." ? newName : join(dir, newName);
}

/** Recursively remove position-related keys from format2 output. */
function stripPositionInfo(obj: Record<string, unknown>): void {
  delete obj.position;
  for (const val of Object.values(obj)) {
    if (Array.isArray(val)) {
      for (const item of val) {
        if (item && typeof item === "object") {
          stripPositionInfo(item as Record<string, unknown>);
        }
      }
    } else if (val && typeof val === "object") {
      stripPositionInfo(val as Record<string, unknown>);
    }
  }
}

function buildConvertReport(treeResult: TreeResult<WorkflowConvertResult>): ConvertTreeReport {
  const results: ConvertTreeReport["results"] = [];
  for (const o of treeResult.outcomes) {
    if (o.error) {
      results.push({ relativePath: o.info.relativePath, error: o.error });
      continue;
    }
    if (o.skipped) {
      results.push({ relativePath: o.info.relativePath, error: `SKIPPED: ${o.skipReason}` });
      continue;
    }
    results.push(o.result!);
  }

  const wfSummary = summarizeOutcomes(treeResult.outcomes);
  return { root: treeResult.root, results, summary: wfSummary };
}
