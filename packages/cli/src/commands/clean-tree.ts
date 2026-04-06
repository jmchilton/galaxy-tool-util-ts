/**
 * `gxwf clean-tree` — batch clean all workflows under a directory.
 */
import { cleanWorkflow } from "@galaxy-tool-util/schema";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { resolveFormat, serializeWorkflow } from "./workflow-io.js";
import { collectTree, summarizeOutcomes, type TreeResult, type TreeSummary } from "./tree.js";

export interface CleanTreeOptions {
  outputDir?: string;
  format?: string;
  json?: boolean;
}

export interface WorkflowCleanResult {
  relativePath: string;
  changed: boolean;
}

export interface CleanTreeReport {
  root: string;
  results: (WorkflowCleanResult | { relativePath: string; error: string })[];
  summary: TreeSummary & { changed: number; unchanged: number };
}

export async function runCleanTree(dir: string, opts: CleanTreeOptions): Promise<void> {
  const outputDir = opts.outputDir;

  const treeResult = await collectTree(dir, async (info, data) => {
    const format = resolveFormat(data, opts.format);
    const before = JSON.stringify(data);
    const { results: _cleanResults } = cleanWorkflow(data);
    const changed = JSON.stringify(data) !== before;

    if (outputDir) {
      const outPath = join(outputDir, info.relativePath);
      await mkdir(dirname(outPath), { recursive: true });
      const serialized = serializeWorkflow(data, format);
      await writeFile(outPath, serialized, "utf-8");
    }

    return { relativePath: info.relativePath, changed } satisfies WorkflowCleanResult;
  });

  const report = buildCleanReport(treeResult);

  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.summary.changed > 0 ? 1 : 0;
    return;
  }

  // Text output
  for (const outcome of treeResult.outcomes) {
    if (outcome.error) {
      console.error(`  ${outcome.info.relativePath}: ERROR (${outcome.error})`);
      continue;
    }
    const r = outcome.result!;
    console.log(`  ${r.relativePath}: ${r.changed ? "CHANGED" : "clean"}`);
  }

  const s = report.summary;
  const suffix = outputDir ? ` (written to ${outputDir})` : "";
  console.log(
    `\nSummary: ${s.total} workflows | ${s.changed} changed, ${s.unchanged} unchanged${suffix}`,
  );
  // Exit 1 if any workflows had stale keys (like Python's clean-tree)
  process.exitCode = s.changed > 0 ? 1 : 0;
}

function buildCleanReport(treeResult: TreeResult<WorkflowCleanResult>): CleanTreeReport {
  const results: CleanTreeReport["results"] = [];
  let changed = 0;
  let unchanged = 0;

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
    if (r.changed) changed++;
    else unchanged++;
  }

  const wfSummary = summarizeOutcomes(treeResult.outcomes, (r) => r.changed);
  return { root: treeResult.root, results, summary: { ...wfSummary, changed, unchanged } };
}
