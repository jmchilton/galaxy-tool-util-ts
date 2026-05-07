/**
 * ``gxwf validate-tool-source-tree`` — batch-validate every user-defined tool
 * source YAML under a directory. Discovery parses each candidate YAML and
 * checks for ``class: GalaxyUserTool`` / ``class: GalaxyTool`` rather than
 * relying on a filename suffix (UDTs don't have an established convention).
 */

import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { parse as parseYaml } from "yaml";
import { validateUserToolSource, type UserToolSourceDiagnostic } from "@galaxy-tool-util/schema";

export interface ValidateToolSourceTreeOptions {
  json?: boolean;
  schemaOnly?: boolean;
}

export interface ToolSourceTreeFileReport {
  path: string;
  valid: boolean;
  errors: UserToolSourceDiagnostic[];
}

export interface ValidateToolSourceTreeReport {
  root: string;
  files: ToolSourceTreeFileReport[];
  summary: { total: number; ok: number; fail: number; error: number };
}

const EXCLUDE_DIRS = new Set([".git", ".hg", ".venv", "node_modules", "__pycache__", ".snakemake"]);
const YAML_EXTS = [".yml", ".yaml"];
const TOOL_CLASSES = new Set(["GalaxyUserTool", "GalaxyTool"]);

function isYamlFile(name: string): boolean {
  return YAML_EXTS.some((e) => name.endsWith(e));
}

async function discoverYamlFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  await walk(root, out);
  out.sort();
  return out;
}

async function walk(dir: string, out: string[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!EXCLUDE_DIRS.has(entry.name)) {
        await walk(join(dir, entry.name), out);
      }
      continue;
    }
    if (entry.isFile() && isYamlFile(entry.name)) {
      out.push(join(dir, entry.name));
    }
  }
}

async function validateOne(
  path: string,
  root: string,
  schemaOnly: boolean,
): Promise<(ToolSourceTreeFileReport & { loadError?: boolean; skipped?: boolean }) | undefined> {
  const rel = relative(root, path);
  let parsed: unknown;
  try {
    const raw = await readFile(path, "utf-8");
    parsed = parseYaml(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      path: rel,
      valid: false,
      loadError: true,
      errors: [
        { path: "(root)", message: `YAML parse error: ${msg}`, keyword: "yaml", params: {} },
      ],
    };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return undefined;
  }
  const cls = (parsed as Record<string, unknown>)["class"];
  if (typeof cls !== "string" || !TOOL_CLASSES.has(cls)) {
    return undefined;
  }
  const { valid, errors } = validateUserToolSource(parsed, { schemaOnly });
  return { path: rel, valid, errors };
}

export async function runValidateToolSourceTree(
  dir: string,
  opts: ValidateToolSourceTreeOptions = {},
): Promise<void> {
  const paths = await discoverYamlFiles(dir);
  const files: (ToolSourceTreeFileReport & { loadError?: boolean })[] = [];
  for (const p of paths) {
    const result = await validateOne(p, dir, opts.schemaOnly === true);
    if (result) files.push(result);
  }

  const summary = {
    total: files.length,
    ok: files.filter((f) => f.valid).length,
    fail: files.filter((f) => !f.valid && !f.loadError).length,
    error: files.filter((f) => f.loadError).length,
  };

  const report: ValidateToolSourceTreeReport = {
    root: dir,
    files: files.map(({ path, valid, errors }) => ({ path, valid, errors })),
    summary,
  };

  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    for (const f of files) {
      if (f.loadError) {
        console.error(`  ${f.path}: ERROR (${f.errors[0]?.message ?? "load failed"})`);
      } else if (f.valid) {
        console.log(`  ${f.path}: OK`);
      } else {
        console.error(`  ${f.path}: ${f.errors.length} validation error(s)`);
        for (const e of f.errors) {
          console.error(`    ${e.path}: ${e.message} [${e.keyword}]`);
        }
      }
    }
    const s = summary;
    console.log(`\nSummary: ${s.total} files | ${s.ok} OK, ${s.fail} FAIL, ${s.error} ERROR`);
  }

  process.exitCode = summary.fail > 0 || summary.error > 0 ? 1 : 0;
}
