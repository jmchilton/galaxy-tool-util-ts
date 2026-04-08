/**
 * Helpers for writing Markdown/HTML rendered reports from CLI commands.
 */
import { writeFile } from "node:fs/promises";
import { renderReport } from "../workflow/report-templates.js";

// Pin to a specific published gxwf-report-shell version.
// Bump when a new shell version with user-visible changes is released to npm.
const SHELL_CDN_VERSION = "0.1.0";
const SHELL_CDN_BASE = `https://cdn.jsdelivr.net/npm/@galaxy-tool-util/gxwf-report-shell@${SHELL_CDN_VERSION}/dist`;

export type ReportType =
  | "validate"
  | "lint"
  | "clean"
  | "validate-tree"
  | "lint-tree"
  | "clean-tree"
  | "roundtrip-tree";

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
  const dest = opts.reportMarkdown;
  if (!dest) return;
  const content = await renderReport(templateName, report);
  // Commander sets dest = true when flag is passed without a filename argument
  if (dest === true || dest === "-") {
    process.stdout.write(content);
  } else {
    await writeFile(dest, content, "utf-8");
  }
}

/**
 * Generate a standalone HTML page that loads the gxwf-report-shell IIFE
 * bundle from CDN and renders the given report data.
 *
 * The resulting HTML is self-contained (aside from the CDN network request).
 * Use this for --report-html on single-workflow and tree commands.
 */
export function buildReportHtml(type: ReportType, data: unknown, title = "gxwf Report"): string {
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
 * Write an HTML report to the given destination if set.
 * dest follows the same string | boolean convention as reportHtml/reportMarkdown.
 */
export async function writeReportHtml(
  type: ReportType,
  data: unknown,
  dest: string | boolean | undefined,
  title?: string,
): Promise<void> {
  if (!dest) return;
  const content = buildReportHtml(type, data, title);
  if (dest === true || dest === "-") {
    process.stdout.write(content);
  } else {
    await writeFile(dest as string, content, "utf-8");
  }
}
