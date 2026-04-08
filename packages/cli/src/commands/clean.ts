/**
 * `gxwf clean` — strip stale keys and decode legacy tool_state encoding.
 */
import {
  cleanWorkflow,
  buildSingleCleanReport,
  type CleanWorkflowOptions,
} from "@galaxy-tool-util/schema";
import {
  readWorkflowFile,
  resolveFormat,
  serializeWorkflow,
  writeWorkflowOutput,
} from "./workflow-io.js";
import { writeReportHtml } from "./report-output.js";

export interface CleanOptions {
  output?: string;
  diff?: boolean;
  format?: string;
  json?: boolean;
  reportHtml?: string | boolean;
  skipUuid?: boolean;
}

export async function runClean(filePath: string, opts: CleanOptions): Promise<void> {
  const data = await readWorkflowFile(filePath);
  if (!data) return;

  const format = resolveFormat(data, opts.format);
  const before = opts.diff ? JSON.stringify(data, null, 2) : null;

  const cleanOpts: CleanWorkflowOptions = { skipUuid: opts.skipUuid };
  const { results } = await cleanWorkflow(data, cleanOpts);

  if (opts.json || opts.reportHtml) {
    const report = buildSingleCleanReport(filePath, results);
    if (opts.json) {
      console.log(JSON.stringify(report, null, 2));
    }
    await writeReportHtml("clean", report, opts.reportHtml);
    return;
  }

  if (opts.diff) {
    const after = JSON.stringify(data, null, 2);
    if (before === after) {
      console.log("No changes.");
      return;
    }
    // Simple line-by-line diff
    const beforeLines = before!.split("\n");
    const afterLines = after.split("\n");
    const maxLen = Math.max(beforeLines.length, afterLines.length);
    for (let i = 0; i < maxLen; i++) {
      const bLine = beforeLines[i];
      const aLine = afterLines[i];
      if (bLine !== aLine) {
        if (bLine !== undefined) console.log(`- ${bLine}`);
        if (aLine !== undefined) console.log(`+ ${aLine}`);
      }
    }
    return;
  }

  const output = serializeWorkflow(data, format);
  await writeWorkflowOutput(output, opts.output, "Cleaned workflow");
}
