/**
 * Nunjucks renderer for workflow_state tree-level Markdown/HTML reports.
 *
 * Mirrors Python's `_report_templates.py`. Templates are the synced `.md.j2`
 * files under `templates/reports/`. Two Nunjucks environments exist — one per
 * output format — each aliasing `_macros.md.j2` to the format-appropriate
 * macro file so body templates remain unchanged.
 *
 * Nunjucks/Jinja2 compatibility note:
 * The synced `_macros.md.j2` uses `summary.items()` in `kv_summary`. This is
 * valid Jinja2 but NOT Nunjucks — use plain `for k, v in obj` in Nunjucks.
 * `kv_summary` is currently unused by all body templates, so this is latent.
 * If a future sync adds a template that calls `kv_summary`, the `.items()` call
 * will fail at render time. Fix in `_macros.html.j2` (TS-side) by using plain
 * iteration; for `_macros.md.j2` file the issue upstream with Python first.
 */
import nunjucks from "nunjucks";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export interface ReportMeta {
  generated_at?: string;
  tool_util_version?: string;
}

export type ReportFormat = "markdown" | "html";

// ── Template loader ──────────────────────────────────────────────────

/**
 * Custom Nunjucks loader that resolves templates from an in-memory map
 * (bundled mode) with a filesystem fallback (dev/test mode).
 *
 * The `macroAlias` option lets the HTML environment intercept every
 * `_macros.md.j2` request and serve `_macros.html.j2` instead, so body
 * templates can stay format-agnostic.
 */
class ReportTemplateLoader extends nunjucks.Loader {
  async = false as const;
  private bundled: Record<string, string>;
  private fsDir: string;
  private macroAlias: string | undefined;

  constructor(bundled: Record<string, string>, fsDir: string, macroAlias?: string) {
    super();
    this.bundled = bundled;
    this.fsDir = fsDir;
    this.macroAlias = macroAlias;
  }

  getSource(name: string): nunjucks.LoaderSource {
    const resolved = name === "_macros.md.j2" && this.macroAlias ? this.macroAlias : name;
    if (this.bundled[resolved] !== undefined) {
      return { src: this.bundled[resolved], path: resolved, noCache: false };
    }
    // Filesystem fallback (dev/test without a prior build)
    const fsPath = join(this.fsDir, resolved);
    const src = readFileSync(fsPath, "utf-8");
    return { src, path: fsPath, noCache: true };
  }
}

// ── Lazy singleton environments ──────────────────────────────────────

let _mdEnv: nunjucks.Environment | undefined;
let _htmlEnv: nunjucks.Environment | undefined;

/** Path to `templates/reports/` resolved relative to this source file. */
function getTemplatesDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "templates/reports");
}

async function loadBundled(): Promise<Record<string, string>> {
  try {
    // Dynamic import so the module is optional (not present before `pnpm build`)
    const mod = await import("./_templates-bundled.js");
    return mod.BUNDLED_TEMPLATES as Record<string, string>;
  } catch {
    return {};
  }
}

async function getMdEnv(): Promise<nunjucks.Environment> {
  if (_mdEnv) return _mdEnv;
  const bundled = await loadBundled();
  const loader = new ReportTemplateLoader(bundled, getTemplatesDir());
  _mdEnv = new nunjucks.Environment(loader, {
    autoescape: false,
    trimBlocks: true,
    lstripBlocks: true,
  });
  return _mdEnv;
}

async function getHtmlEnv(): Promise<nunjucks.Environment> {
  if (_htmlEnv) return _htmlEnv;
  const bundled = await loadBundled();
  const loader = new ReportTemplateLoader(bundled, getTemplatesDir(), "_macros.html.j2");
  _htmlEnv = new nunjucks.Environment(loader, {
    autoescape: false,
    trimBlocks: true,
    lstripBlocks: true,
  });
  return _htmlEnv;
}

// ── Public API ───────────────────────────────────────────────────────

/**
 * Render a report template by name.
 *
 * @param templateName - e.g. `"validate_tree.md.j2"`
 * @param report - the tree report object (plain JSON-serialisable value)
 * @param meta - optional metadata (generated_at, tool_util_version)
 * @param format - `"markdown"` (default) or `"html"`
 */
export async function renderReport(
  templateName: string,
  report: unknown,
  meta?: ReportMeta,
  format: ReportFormat = "markdown",
): Promise<string> {
  const env = format === "html" ? await getHtmlEnv() : await getMdEnv();
  return new Promise<string>((resolve, reject) => {
    env.render(templateName, { report, meta }, (err, result) => {
      if (err) reject(err);
      else resolve(result ?? "");
    });
  });
}

/**
 * Returns a thunk that renders the given template with the given format.
 * Suitable for plugging into CLI output pipelines.
 */
export function makeRenderer<T>(
  templateName: string,
  format: ReportFormat = "markdown",
): (report: T) => Promise<string> {
  return (report: T) => renderReport(templateName, report, undefined, format);
}
