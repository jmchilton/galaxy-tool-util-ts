/**
 * Helpers for writing Markdown/HTML rendered reports from tree commands.
 */
import { writeFile } from "node:fs/promises";
import { renderReport, type ReportFormat } from "../workflow/report-templates.js";

export interface ReportOutputOptions {
  /**
   * Path to write Markdown report to. Commander sets this to `true` (boolean)
   * when `--report-markdown` is passed without a filename — treat as stdout.
   * Use `"-"` explicitly to write to stdout.
   */
  reportMarkdown?: string | boolean;
  /** Same semantics as reportMarkdown but for HTML output. */
  reportHtml?: string | boolean;
}

/**
 * Render and write report output if --report-markdown / --report-html flags
 * were passed. Both can be specified simultaneously.
 *
 * @param templateName - e.g. "validate_tree.md.j2"
 * @param report - the tree report object
 * @param opts - parsed CLI options
 */
export async function writeReportOutput(
  templateName: string,
  report: unknown,
  opts: ReportOutputOptions,
): Promise<void> {
  async function emit(format: ReportFormat, dest: string | boolean | undefined): Promise<void> {
    if (!dest) return;
    const content = await renderReport(templateName, report, undefined, format);
    // Commander sets dest = true when flag is passed without a filename argument
    if (dest === true || dest === "-") {
      process.stdout.write(content);
    } else {
      await writeFile(dest, content, "utf-8");
    }
  }
  await emit("markdown", opts.reportMarkdown);
  await emit("html", opts.reportHtml);
}
