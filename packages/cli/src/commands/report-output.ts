/**
 * Helpers for writing Markdown/HTML rendered reports from CLI commands.
 */
import { writeFile } from "node:fs/promises";
import { renderReport, type ReportFormat } from "../workflow/report-templates.js";

// Pin to a specific published gxwf-report-shell version.
// Bump when a new shell version with user-visible changes is released to npm.
const SHELL_CDN_VERSION = "0.1.0";
const SHELL_CDN_BASE = `https://cdn.jsdelivr.net/npm/@galaxy-tool-util/gxwf-report-shell@${SHELL_CDN_VERSION}/dist`;

export type SingleReportType = "validate" | "lint" | "clean";

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

/**
 * Generate a standalone HTML page that loads the gxwf-report-shell IIFE
 * bundle from CDN and renders the given report data.
 *
 * The resulting HTML is self-contained (aside from the CDN network request).
 * Use this for --report-html on single-workflow commands.
 */
export function buildSingleReportHtml(
  type: SingleReportType,
  data: unknown,
  title = "gxwf Report",
): string {
  const payload = JSON.stringify({ type, data });
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <link rel="stylesheet" href="${SHELL_CDN_BASE}/shell.css">
</head>
<body>
  <div id="gxwf-report"></div>
  <script>window.__GXWF_REPORT__ = ${payload};</script>
  <script src="${SHELL_CDN_BASE}/shell.iife.js"></script>
</body>
</html>`;
}

/**
 * Write a single-workflow HTML report to the given destination if set.
 * dest follows the same string | boolean convention as reportHtml/reportMarkdown.
 */
export async function writeSingleReportHtml(
  type: SingleReportType,
  data: unknown,
  dest: string | boolean | undefined,
  title?: string,
): Promise<void> {
  if (!dest) return;
  const content = buildSingleReportHtml(type, data, title);
  if (dest === true || dest === "-") {
    process.stdout.write(content);
  } else {
    await writeFile(dest as string, content, "utf-8");
  }
}
