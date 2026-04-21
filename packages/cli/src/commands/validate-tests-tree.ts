/**
 * ``gxwf validate-tests-tree`` — batch-validate every workflow-test file
 * (``*-tests.yml``, ``*-tests.yaml``, ``*.gxwf-tests.yml``, ``*.gxwf-tests.yaml``)
 * under a directory against the ``galaxy.tool_util_models.Tests`` JSON Schema.
 *
 * Unlike ``validate-tree`` this uses its own discovery pass because test
 * documents don't carry a ``class: GalaxyWorkflow`` / ``a_galaxy_workflow``
 * marker — classification is filename-based.
 *
 * With ``--auto-workflow``, each test file is paired with a sibling workflow
 * by suffix convention and cross-checked. Silent no-op when no sibling is
 * found.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { parse as parseYaml } from "yaml";
import {
  checkTestsAgainstWorkflow,
  extractWorkflowInputs,
  extractWorkflowOutputs,
  resolveFormat,
  validateTestsFile,
  type TestFormatDiagnostic,
  type WorkflowShape,
} from "@galaxy-tool-util/schema";

export interface ValidateTestsTreeOptions {
  json?: boolean;
  autoWorkflow?: boolean;
}

export interface TestsTreeFileReport {
  path: string;
  valid: boolean;
  errors: TestFormatDiagnostic[];
  workflow?: string;
}

export interface ValidateTestsTreeReport {
  root: string;
  files: TestsTreeFileReport[];
  summary: { total: number; ok: number; fail: number; error: number };
}

const EXCLUDE_DIRS = new Set([".git", ".hg", ".venv", "node_modules", "__pycache__", ".snakemake"]);
const TEST_SUFFIXES = [".gxwf-tests.yml", ".gxwf-tests.yaml", "-tests.yml", "-tests.yaml"];
const WORKFLOW_EXTS = [".gxwf.yml", ".gxwf.yaml", ".yml", ".yaml", ".ga"];

function isTestFile(name: string): boolean {
  return TEST_SUFFIXES.some((s) => name.endsWith(s));
}

/**
 * Derive the workflow basename a given tests file pairs with.
 * `foo.gxwf-tests.yml` → `foo`; `bar-tests.yml` → `bar`.
 */
function stripTestsSuffix(name: string): string | undefined {
  for (const suffix of TEST_SUFFIXES) {
    if (name.endsWith(suffix)) return name.slice(0, -suffix.length);
  }
  return undefined;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    const s = await stat(path);
    return s.isFile();
  } catch {
    return false;
  }
}

/**
 * Locate a sibling workflow for a tests file. Returns the first existing
 * candidate in suffix-priority order, or undefined if none found.
 */
async function findSiblingWorkflow(testsPath: string): Promise<string | undefined> {
  const base = stripTestsSuffix(testsPath.split("/").pop() ?? "");
  if (!base) return undefined;
  const dir = dirname(testsPath);
  for (const ext of WORKFLOW_EXTS) {
    const candidate = join(dir, `${base}${ext}`);
    if (await fileExists(candidate)) return candidate;
  }
  return undefined;
}

async function loadWorkflowShape(path: string): Promise<WorkflowShape> {
  const raw = await readFile(path, "utf-8");
  const parsed: unknown =
    path.endsWith(".ga") || path.endsWith(".json") ? JSON.parse(raw) : parseYaml(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Workflow ${path} did not parse to an object.`);
  }
  const dict = parsed as Record<string, unknown>;
  const format = resolveFormat(dict);
  return {
    inputs: extractWorkflowInputs(dict, format),
    outputs: extractWorkflowOutputs(dict, format),
  };
}

async function discoverTestFiles(root: string): Promise<string[]> {
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
    if (entry.isFile() && isTestFile(entry.name)) {
      out.push(join(dir, entry.name));
    }
  }
}

async function validateOne(
  path: string,
  root: string,
  autoWorkflow: boolean,
): Promise<TestsTreeFileReport & { loadError?: boolean }> {
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
  const { valid: schemaValid, errors } = validateTestsFile(parsed);
  const allErrors: TestFormatDiagnostic[] = [...errors];
  let pairedWorkflow: string | undefined;
  if (autoWorkflow) {
    const sibling = await findSiblingWorkflow(path);
    if (sibling) {
      pairedWorkflow = relative(root, sibling);
      try {
        const shape = await loadWorkflowShape(sibling);
        allErrors.push(...checkTestsAgainstWorkflow(parsed, shape));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        allErrors.push({
          path: "(root)",
          message: `Failed to load workflow ${pairedWorkflow}: ${msg}`,
          keyword: "workflow_load_error",
          params: { workflow: pairedWorkflow },
        });
      }
    }
  }
  const valid = schemaValid && allErrors.length === 0;
  const report: TestsTreeFileReport = { path: rel, valid, errors: allErrors };
  if (pairedWorkflow) report.workflow = pairedWorkflow;
  return report;
}

export async function runValidateTestsTree(
  dir: string,
  opts: ValidateTestsTreeOptions = {},
): Promise<void> {
  const paths = await discoverTestFiles(dir);
  const files: (TestsTreeFileReport & { loadError?: boolean })[] = [];
  for (const p of paths) {
    files.push(await validateOne(p, dir, opts.autoWorkflow === true));
  }

  const summary = {
    total: files.length,
    ok: files.filter((f) => f.valid).length,
    fail: files.filter((f) => !f.valid && !f.loadError).length,
    error: files.filter((f) => f.loadError).length,
  };

  const report: ValidateTestsTreeReport = {
    root: dir,
    files: files.map(({ path, valid, errors, workflow }) => {
      const entry: TestsTreeFileReport = { path, valid, errors };
      if (workflow) entry.workflow = workflow;
      return entry;
    }),
    summary,
  };

  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    for (const f of files) {
      const wfNote = f.workflow ? ` [workflow: ${f.workflow}]` : "";
      if (f.loadError) {
        console.error(`  ${f.path}: ERROR (${f.errors[0]?.message ?? "load failed"})`);
      } else if (f.valid) {
        console.log(`  ${f.path}: OK${wfNote}`);
      } else {
        console.error(`  ${f.path}: ${f.errors.length} validation error(s)${wfNote}`);
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
