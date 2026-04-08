/**
 * Workflow discovery and per-workflow operations for the gxwf-web HTTP server.
 *
 * Discovery mirrors Python's `discover_workflows` in workflow_tree.py:
 *   - scans for .ga, .gxwf.yml, .gxwf.yaml files
 *   - validates content (a_galaxy_workflow / class: GalaxyWorkflow)
 *   - category = first parent directory of relative path, or "" for root
 *
 * Operations delegate to @galaxy-tool-util/schema and @galaxy-tool-util/cli.
 *
 * ## Parity status vs Python server
 *
 * | Endpoint    | Python params                          | TS status                        |
 * |-------------|----------------------------------------|----------------------------------|
 * | validate    | strict, connections, mode, allow, deny | strict wired; rest accepted (no-op) |
 * | lint        | strict, allow, deny                   | strict wired; allow/deny accepted (no-op) |
 * | clean       | preserve, strip                       | accepted (no-op; needs StaleKeyPolicy) |
 * | to-format2  | (none beyond path)                    | full parity                      |
 * | to-native   | (none beyond path)                    | full parity                      |
 * | roundtrip   | (none beyond path)                    | full parity                      |
 *
 * TS extension not in Python spec: GET /api/schemas/structural?format=...
 * mode=pydantic (Python default) maps to effect (TS default); mode=json-schema accepted (no-op).
 * allow/deny/preserve/strip require StaleKeyPolicy — tracked as future work in stale-keys.ts.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { parse as parseYaml } from "yaml";
import type { ToolCache } from "@galaxy-tool-util/core";
import {
  cleanWorkflow,
  roundtripValidate,
  toFormat2Stateful,
  toNativeStateful,
  buildSingleValidationReport,
  buildSingleLintReport,
  buildSingleCleanReport,
  detectFormat,
  type WorkflowFormat,
  type WorkflowIndex,
  type WorkflowEntry,
  type SingleValidationReport,
  type SingleLintReport,
  type SingleCleanReport,
  type SingleExportReport,
  type ToNativeResult,
  type SingleRoundTripReport,
  type StepEncodeStatus,
  type RoundTripValidationResult,
  type StepResult,
  type FailureClass,
  type StepDiff,
  type ExpansionOptions,
  type ValidationStepResult,
  type RoundtripFailureClass,
} from "@galaxy-tool-util/schema";
import {
  validateNativeSteps,
  validateFormat2Steps,
  decodeStructureErrors,
  detectEncodingErrors,
  loadToolInputsForWorkflow,
  createDefaultResolver,
  lintWorkflowReport,
} from "@galaxy-tool-util/cli";
import { HttpError } from "./contents.js";

// ── Discovery ────────────────────────────────────────────────────────────────

const EXCLUDE_DIRS = new Set([
  ".git",
  ".hg",
  ".venv",
  "node_modules",
  "__pycache__",
  ".snakemake",
  ".checkpoints",
  ".pytest_cache",
  ".mypy_cache",
  ".tox",
  ".ruff_cache",
]);

type WorkflowFileFormat = "native" | "format2";

function classifyFilename(filename: string): WorkflowFileFormat | null {
  if (filename.endsWith(".gxwf.yml") || filename.endsWith(".gxwf.yaml")) return "format2";
  if (filename.endsWith(".ga")) return "native";
  return null;
}

function isWorkflowContent(filePath: string, format: WorkflowFileFormat): boolean {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    if (format === "native") {
      const data = JSON.parse(content) as Record<string, unknown>;
      return data?.a_galaxy_workflow === "true";
    } else {
      const data = parseYaml(content) as Record<string, unknown>;
      return data?.class === "GalaxyWorkflow";
    }
  } catch {
    return false;
  }
}

function categoryOf(relPath: string): string {
  const sep = "/";
  const idx = relPath.indexOf(sep);
  return idx > 0 ? relPath.slice(0, idx) : "";
}

function walkDir(dirPath: string, root: string, entries: WorkflowEntry[]): void {
  let names: string[];
  try {
    names = fs.readdirSync(dirPath);
  } catch {
    return;
  }
  for (const name of names) {
    if (EXCLUDE_DIRS.has(name)) continue;
    const fullPath = path.join(dirPath, name);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(fullPath);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      walkDir(fullPath, root, entries);
    } else if (stat.isFile()) {
      const format = classifyFilename(name);
      if (!format) continue;
      if (!isWorkflowContent(fullPath, format)) continue;
      // Always use forward slashes in relative paths
      const relPath = path.relative(root, fullPath).split(path.sep).join("/");
      entries.push({
        relative_path: relPath,
        format,
        category: categoryOf(relPath),
      });
    }
  }
}

/** Scan directory for workflow files, returning a WorkflowIndex (matches Python's discover_workflows). */
export function discoverWorkflows(directory: string): WorkflowIndex {
  const root = path.resolve(directory);
  const entries: WorkflowEntry[] = [];
  walkDir(root, root, entries);
  entries.sort((a, b) => a.relative_path.localeCompare(b.relative_path));
  return { directory: root, workflows: entries };
}

// ── Workflow file loading ────────────────────────────────────────────────────

export interface WorkflowFile {
  absPath: string;
  data: Record<string, unknown>;
  format: WorkflowFormat;
}

/**
 * Resolve a relative workflow path within a directory and load its data.
 * Throws HttpError 404 if not found, 400 if unreadable.
 */
export function loadWorkflowFile(directory: string, relPath: string): WorkflowFile {
  const root = path.resolve(directory);
  const abs = path.resolve(root, relPath);

  // Prevent path traversal
  if (abs !== root && !abs.startsWith(root + path.sep)) {
    throw new HttpError(403, "Path escapes configured directory");
  }

  if (!fs.existsSync(abs)) {
    throw new HttpError(404, `Workflow not found: ${relPath}`);
  }

  let data: Record<string, unknown>;
  try {
    const content = fs.readFileSync(abs, "utf-8");
    if (abs.endsWith(".ga")) {
      data = JSON.parse(content) as Record<string, unknown>;
    } else {
      data = parseYaml(content) as Record<string, unknown>;
    }
  } catch (e) {
    throw new HttpError(400, `Cannot read workflow file: ${String(e)}`);
  }

  const format = detectFormat(data);
  if (!format) {
    throw new HttpError(422, `Cannot detect workflow format for: ${relPath}`);
  }

  return { absPath: abs, data, format };
}

// ── Operations ───────────────────────────────────────────────────────────────

export interface ValidateOptions {
  /** Treat encoding/structure issues as errors (mirrors Python strict=True). */
  strict?: boolean;
  /**
   * Validate connections between steps. Not yet implemented in TS — accepted
   * for API parity but silently ignored.
   */
  connections?: boolean;
  /**
   * Validation mode. Python default "pydantic" maps to TS default "effect".
   * "json-schema" is accepted but currently treated as "effect".
   */
  mode?: string;
  /**
   * Tool IDs whose stale keys are allowed. Accepted for API parity; requires
   * StaleKeyPolicy (future work) — currently ignored.
   */
  allow?: string[];
  /**
   * Tool IDs whose stale keys are denied. Accepted for API parity; requires
   * StaleKeyPolicy (future work) — currently ignored.
   */
  deny?: string[];
}

/** Validate a workflow's tool state. */
export async function operateValidate(
  wf: WorkflowFile,
  cache: ToolCache,
  opts: ValidateOptions = {},
): Promise<SingleValidationReport> {
  const { absPath, data, format } = wf;
  const structureErrors = opts.strict ? decodeStructureErrors(data, format) : [];
  const expansionOpts: ExpansionOptions = {
    resolver: createDefaultResolver({ workflowDirectory: path.dirname(absPath) }),
  };

  let results: ValidationStepResult[] = [];
  const encodingErrors: string[] = [];

  try {
    if (format === "native") {
      results = await validateNativeSteps(data, cache, "", expansionOpts);
    } else {
      results = await validateFormat2Steps(data, cache, "", expansionOpts);
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes("legacy parameter encoding")) {
      encodingErrors.push(e.message);
    } else {
      throw e;
    }
  }

  return buildSingleValidationReport(absPath, results, {
    structure_errors: structureErrors,
    encoding_errors: encodingErrors,
  });
}

export interface LintOptions {
  strict?: boolean;
  /**
   * Tool IDs whose stale keys are allowed. Accepted for API parity; requires
   * StaleKeyPolicy (future work) — currently ignored.
   */
  allow?: string[];
  /**
   * Tool IDs whose stale keys are denied. Accepted for API parity; requires
   * StaleKeyPolicy (future work) — currently ignored.
   */
  deny?: string[];
}

/** Lint a workflow — structural checks, best practices, tool state validation. */
export async function operateLint(
  wf: WorkflowFile,
  cache: ToolCache,
  opts: LintOptions = {},
): Promise<SingleLintReport> {
  const { absPath, data, format } = wf;
  const strict = opts.strict
    ? { strictEncoding: true, strictStructure: true, strictState: false }
    : { strictEncoding: false, strictStructure: false, strictState: false };

  const report = await lintWorkflowReport(absPath, data, format, { cache, strict });

  const lintErrors = report.structural.error_count + (report.bestPractices?.error_count ?? 0);
  const lintWarnings = report.structural.warn_count + (report.bestPractices?.warn_count ?? 0);

  // Always compute structure_errors from Effect Schema decode (matches CLI JSON mode)
  const structureErrors = decodeStructureErrors(data, format);

  // Detect legacy encoding errors (when cache is available)
  let encodingErrors: string[] = [];
  if (cache.index.listAll().length > 0) {
    const expansionOpts: ExpansionOptions = {
      resolver: createDefaultResolver({ workflowDirectory: path.dirname(absPath) }),
    };
    encodingErrors = await detectEncodingErrors(data, cache, format, expansionOpts);
  }

  return buildSingleLintReport(absPath, lintErrors, lintWarnings, report.stateValidation ?? [], {
    structure_errors: structureErrors,
    encoding_errors: encodingErrors,
  });
}

export interface CleanOptions {
  /**
   * Keys to preserve (not strip). Accepted for API parity; requires
   * StaleKeyPolicy (future work) — currently ignored.
   */
  preserve?: string[];
  /**
   * Keys to always strip. Accepted for API parity; requires
   * StaleKeyPolicy (future work) — currently ignored.
   */
  strip?: string[];
}

/** Report stale keys in a workflow (no tool cache needed). */
export async function operateClean(
  wf: WorkflowFile,
  _opts: CleanOptions = {},
): Promise<SingleCleanReport> {
  const { absPath, data } = wf;
  const { results } = await cleanWorkflow(data);
  return buildSingleCleanReport(absPath, results);
}

/** Convert native → format2 with schema-aware state re-encoding. */
export async function operateToFormat2(
  wf: WorkflowFile,
  cache: ToolCache,
): Promise<SingleExportReport> {
  const { absPath, data, format } = wf;
  if (format !== "native") {
    throw new HttpError(422, "to-format2 requires a native (.ga) workflow");
  }

  const expansionOpts: ExpansionOptions = {
    resolver: createDefaultResolver({ workflowDirectory: path.dirname(absPath) }),
  };
  const { resolver } = await loadToolInputsForWorkflow(data, "native", cache, expansionOpts);
  const result = toFormat2Stateful(data, resolver);

  const converted = result.steps.filter((s) => s.converted).length;
  const fallback = result.steps.length - converted;

  return {
    workflow: absPath,
    ok: fallback === 0,
    steps_converted: converted,
    steps_fallback: fallback,
    summary: { converted, fallback },
  };
}

/** Convert format2 → native with schema-aware state re-encoding. */
export async function operateToNative(wf: WorkflowFile, cache: ToolCache): Promise<ToNativeResult> {
  const { absPath, data, format } = wf;
  if (format !== "format2") {
    throw new HttpError(422, "to-native requires a format2 (.gxwf.yml) workflow");
  }

  const expansionOpts: ExpansionOptions = {
    resolver: createDefaultResolver({ workflowDirectory: path.dirname(absPath) }),
  };
  const { resolver } = await loadToolInputsForWorkflow(data, "format2", cache, expansionOpts);
  const result = toNativeStateful(data, resolver);

  const steps: StepEncodeStatus[] = result.steps.map((s) => ({
    step_id: s.stepId,
    step_label: null,
    tool_id: s.toolId ?? null,
    encoded: s.converted,
    error: s.error ?? null,
  }));

  const allEncoded = steps.every((s) => s.encoded);
  const encodedCount = steps.filter((s) => s.encoded).length;

  return {
    native_dict: result.workflow as unknown as Record<string, unknown>,
    steps,
    all_encoded: allEncoded,
    summary: `${encodedCount}/${steps.length} steps encoded`,
  };
}

/** Run roundtrip validation (native → format2 → native). */
export async function operateRoundtrip(
  wf: WorkflowFile,
  cache: ToolCache,
): Promise<SingleRoundTripReport> {
  const { absPath, data, format } = wf;
  if (format !== "native") {
    throw new HttpError(422, "roundtrip requires a native (.ga) workflow");
  }

  const expansionOpts: ExpansionOptions = {
    resolver: createDefaultResolver({ workflowDirectory: path.dirname(absPath) }),
  };
  const { resolver } = await loadToolInputsForWorkflow(data, "native", cache, expansionOpts);
  const result = roundtripValidate(data, resolver, {});

  // Convert TS-internal RoundtripResult → Python-API RoundTripValidationResult
  const allDiffs: StepDiff[] = result.stepResults.flatMap((s) => s.diffs);
  const errorDiffs = allDiffs.filter((d) => d.severity === "error");
  const benignDiffs = allDiffs.filter((d) => d.severity === "benign");

  // Build a Python-shape RoundTripResult for conversion_result.
  // Direction "forward+reverse" covers the full TS roundtrip.
  const conversionStepResults: StepResult[] = result.stepResults.map((s) => ({
    step_id: s.stepId,
    tool_id: s.toolId ?? null,
    success: s.success,
    failure_class: _mapRoundtripFailureClass(s.failureClass ?? null),
    error: s.error ?? null,
    diffs: s.diffs,
    format2_state: null,
    format2_connections: null,
  }));

  // Build conversion failure lines from forward/reverse step statuses
  const conversionFailureLines: string[] = [
    ...result.forwardSteps
      .filter((s) => !s.converted)
      .map((s) => `forward step ${s.stepId}: ${s.error ?? s.failureClass ?? "unknown"}`),
    ...result.reverseSteps
      .filter((s) => !s.converted)
      .map((s) => `reverse step ${s.stepId}: ${s.error ?? s.failureClass ?? "unknown"}`),
  ];

  const ok = result.success && result.clean;
  const status = ok ? "ok" : errorDiffs.length > 0 ? "error" : "benign";
  const summaryLine = `${ok ? "ok" : "fail"}: ${errorDiffs.length} error diff(s), ${benignDiffs.length} benign diff(s)`;

  const validationResult: RoundTripValidationResult = {
    workflow_path: absPath,
    category: "",
    conversion_result: {
      workflow_name: result.workflowName ?? absPath,
      direction: "forward+reverse",
      step_results: conversionStepResults,
    },
    diffs: allDiffs,
    step_id_mapping: { mapping: {}, match_methods: {} },
    stale_clean_results: null,
    error: null,
    skipped_reason: null,
    structure_errors: result.structureErrors,
    encoding_errors: result.encodingErrors,
    error_diffs: errorDiffs,
    benign_diffs: benignDiffs,
    ok,
    status,
    conversion_failure_lines: conversionFailureLines,
    summary_line: summaryLine,
  };

  return { workflow: absPath, result: validationResult };
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function _mapRoundtripFailureClass(cls: RoundtripFailureClass | null): FailureClass | null {
  if (cls === null) return null;
  // "subworkflow_external_ref" is TS-specific; map to Python's "subworkflow"
  if (cls === "subworkflow_external_ref") return "subworkflow";
  // All other TS failure classes happen to match Python FailureClass literals
  return cls as FailureClass;
}
