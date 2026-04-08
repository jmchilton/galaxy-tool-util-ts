/**
 * `gxwf clean-tree` — batch clean all workflows under a directory.
 */
import {
  cleanWorkflow,
  type CleanWorkflowOptions,
  type WorkflowCleanResult,
  type TreeCleanReport,
  buildWorkflowCleanResult,
  buildTreeCleanReport,
} from "@galaxy-tool-util/schema";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { resolveFormat, serializeWorkflow } from "./workflow-io.js";
import { collectTree, type TreeResult } from "./tree.js";
import { writeReportOutput, writeReportHtml, type ReportOutputOptions } from "./report-output.js";

export interface CleanTreeOptions extends ReportOutputOptions {
  outputDir?: string;
  format?: string;
  json?: boolean;
  skipUuid?: boolean;
}

export async function runCleanTree(dir: string, opts: CleanTreeOptions): Promise<void> {
  const outputDir = opts.outputDir;

  const treeResult = await collectTree<WorkflowCleanResult>(dir, async (info, data) => {
    const format = resolveFormat(data, opts.format);
    const cleanOpts: CleanWorkflowOptions = { skipUuid: opts.skipUuid };
    const { results: stepResults } = await cleanWorkflow(data, cleanOpts);

    if (outputDir) {
      const outPath = join(outputDir, info.relativePath);
      await mkdir(dirname(outPath), { recursive: true });
      const serialized = serializeWorkflow(data, format);
      await writeFile(outPath, serialized, "utf-8");
    }

    return buildWorkflowCleanResult(info.relativePath, stepResults);
  });

  const report = buildReport(treeResult);

  await writeReportOutput("clean_tree.md.j2", report, { reportMarkdown: opts.reportMarkdown });
  await writeReportHtml("clean-tree", report, opts.reportHtml);

  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.summary.affected > 0 ? 1 : 0;
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
    const changed = wf.total_removed > 0;
    console.log(`  ${wf.path}: ${changed ? "CHANGED" : "clean"}`);
  }

  const s = report.summary;
  const total = report.workflows.length;
  const suffix = outputDir ? ` (written to ${outputDir})` : "";
  console.log(
    `\nSummary: ${total} workflows | ${s.affected} changed, ${s.clean} unchanged${suffix}`,
  );
  // Exit 1 if any workflows had stale keys (like Python's clean-tree)
  process.exitCode = s.affected > 0 ? 1 : 0;
}

function buildReport(treeResult: TreeResult<WorkflowCleanResult>): TreeCleanReport {
  const workflows: WorkflowCleanResult[] = [];

  for (const o of treeResult.outcomes) {
    if (o.error) {
      workflows.push(buildWorkflowCleanResult(o.info.relativePath, [], { error: o.error }));
      continue;
    }
    if (o.skipped) {
      workflows.push(
        buildWorkflowCleanResult(o.info.relativePath, [], {
          skipped_reason: (o.skipReason as "legacy_encoding") ?? null,
        }),
      );
      continue;
    }
    workflows.push(o.result!);
  }

  return buildTreeCleanReport(treeResult.root, workflows);
}
