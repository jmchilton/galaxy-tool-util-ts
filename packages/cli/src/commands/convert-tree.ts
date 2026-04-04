/**
 * `gxwf convert-tree` — batch convert all workflows under a directory.
 */
import { toFormat2, toNative, type WorkflowFormat } from "@galaxy-tool-util/schema";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, basename } from "node:path";
import { resolveFormat, serializeWorkflow } from "./workflow-io.js";
import { collectTree, summarizeOutcomes, type TreeResult, type TreeSummary } from "./tree.js";

export interface ConvertTreeOptions {
  to?: string;
  outputDir?: string;
  compact?: boolean;
  yaml?: boolean;
  format?: string;
  json?: boolean;
  reportJson?: boolean;
}

export interface WorkflowConvertResult {
  relativePath: string;
  sourceFormat: string;
  targetFormat: string;
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

  const treeResult = await collectTree(dir, async (info, data) => {
    const sourceFormat = resolveFormat(data, opts.format);
    const targetFormat = resolveTargetFormat(sourceFormat, opts.to);

    if (sourceFormat === targetFormat) {
      return {
        relativePath: info.relativePath,
        sourceFormat,
        targetFormat,
      } satisfies WorkflowConvertResult;
    }

    let result: Record<string, unknown>;
    if (targetFormat === "format2") {
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

    return {
      relativePath: info.relativePath,
      sourceFormat,
      targetFormat,
    } satisfies WorkflowConvertResult;
  });

  const report = buildConvertReport(treeResult);

  if (opts.reportJson) {
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.summary.error > 0 ? 1 : 0;
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
      console.log(`  ${r.relativePath}: ${r.sourceFormat} → ${r.targetFormat}`);
    }
  }

  const s = report.summary;
  console.log(`\nSummary: ${s.total} workflows converted (written to ${outputDir})`);
  process.exitCode = s.error > 0 ? 1 : 0;
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
