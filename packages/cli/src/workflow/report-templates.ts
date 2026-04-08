/**
 * Nunjucks renderer for workflow_state tree-level Markdown reports.
 *
 * Mirrors Python's `_report_templates.py`. Templates are the synced `.md.j2`
 * files under `templates/reports/`. The Nunjucks environment aliases
 * `_macros.md.j2` to the bundled macro file so body templates remain unchanged.
 *
 * Nunjucks/Jinja2 compatibility note:
 * The synced `_macros.md.j2` uses `summary.items()` in `kv_summary`. This is
 * valid Jinja2 but NOT Nunjucks — use plain `for k, v in obj` in Nunjucks.
 * `kv_summary` is currently unused by all body templates, so this is latent.
 * If a future sync adds a template that calls `kv_summary`, the `.items()` call
 * will fail at render time. Fix in `_macros.md.j2` (TS-side) by using plain
 * iteration; for the Python-side file the issue upstream with Python first.
 */
import nunjucks from "nunjucks";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export interface ReportMeta {
  generated_at?: string;
  tool_util_version?: string;
}

// ── Template loader ──────────────────────────────────────────────────

/**
 * Custom Nunjucks loader that resolves templates from an in-memory map
 * (bundled mode) with a filesystem fallback (dev/test mode).
 */
class ReportTemplateLoader extends nunjucks.Loader {
  async = false as const;
  private bundled: Record<string, string>;
  private fsDir: string;

  constructor(bundled: Record<string, string>, fsDir: string) {
    super();
    this.bundled = bundled;
    this.fsDir = fsDir;
  }

  getSource(name: string): nunjucks.LoaderSource {
    if (this.bundled[name] !== undefined) {
      return { src: this.bundled[name], path: name, noCache: false };
    }
    // Filesystem fallback (dev/test without a prior build)
    const fsPath = join(this.fsDir, name);
    const src = readFileSync(fsPath, "utf-8");
    return { src, path: fsPath, noCache: true };
  }
}

// ── Lazy singleton environment ───────────────────────────────────────

let _mdEnv: nunjucks.Environment | undefined;

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

// ── Public API ───────────────────────────────────────────────────────

/**
 * Render a Markdown report template by name.
 *
 * @param templateName - e.g. `"validate_tree.md.j2"`
 * @param report - the tree report object (plain JSON-serialisable value)
 * @param meta - optional metadata (generated_at, tool_util_version)
 */
export async function renderReport(
  templateName: string,
  report: unknown,
  meta?: ReportMeta,
): Promise<string> {
  const env = await getMdEnv();
  return new Promise<string>((resolve, reject) => {
    env.render(templateName, { report, meta }, (err, result) => {
      if (err) reject(err);
      else resolve(result ?? "");
    });
  });
}
