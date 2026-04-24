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
 * All six operation endpoints are POST. clean/export/convert are mutating by
 * default — dry_run=true returns the would-be content without touching disk.
 * validate/lint/roundtrip are read-only regardless.
 *
 * ## Parity status vs Python server
 *
 * | Endpoint  | Python params                          | TS status                                |
 * |-----------|----------------------------------------|------------------------------------------|
 * | validate  | strict, connections, mode, allow, deny | strict wired; rest accepted (no-op)      |
 * | lint      | strict, allow, deny                    | strict wired; allow/deny accepted (no-op)|
 * | clean     | preserve, strip, dry_run               | writes back; dry_run wired; preserve/strip no-op |
 * | export    | dry_run                                | full parity                              |
 * | convert   | dry_run                                | full parity                              |
 * | roundtrip | strict_structure, strict_encoding, strict_state, include_content | full parity |
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
  serializeWorkflow,
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
  type CleanStepResult,
} from "@galaxy-tool-util/schema";
import {
  validateNativeSteps,
  validateFormat2Steps,
  decodeStructureErrors,
  detectEncodingErrors,
  loadToolInputsForWorkflow,
  createDefaultResolver,
  lintWorkflowReport,
  validateNativeStepsJsonSchema,
  validateFormat2StepsJsonSchema,
  decodeStructureErrorsJsonSchema,
} from "@galaxy-tool-util/cli";
import { HttpError } from "./contents.js";
import type { ConvertResult, ExportResult } from "./models.js";

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
  /** Reject unknown keys at envelope/step level (mirrors Python strict_structure). */
  strict_structure?: boolean;
  /** Reject JSON-string tool_state and format2 field misuse (mirrors Python strict_encoding). */
  strict_encoding?: boolean;
  /**
   * Validate connections between steps. Not yet implemented in TS — accepted
   * for API parity but silently ignored.
   */
  connections?: boolean;
  /**
   * Validation mode: "effect" (default) uses Effect Schema decode;
   * "json-schema" uses AJV against the generated JSON Schema (mirrors Python --mode json-schema).
   * Python default "pydantic" is treated as "effect".
   */
  mode?: string;
  /**
   * Run clean in-memory before validating. Results are embedded in the
   * returned report as clean_report.
   */
  clean_first?: boolean;
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
  const { absPath, format } = wf;
  let { data } = wf;
  const useJsonSchema = opts.mode === "json-schema";
  const expansionOpts: ExpansionOptions = {
    resolver: createDefaultResolver({ workflowDirectory: path.dirname(absPath) }),
  };

  // Optional clean-first pass: run clean in-memory, validate on cleaned dict
  let clean_report: SingleCleanReport | null = null;
  if (opts.clean_first) {
    const cleanResult = await cleanWorkflow(data);
    const cleanResults = cleanResult.results as CleanStepResult[];
    clean_report = buildSingleCleanReport(absPath, cleanResults);
    data = cleanResult.workflow as Record<string, unknown>;
  }

  // Structural validation
  const structureErrors = useJsonSchema
    ? decodeStructureErrorsJsonSchema(data, format)
    : opts.strict_structure
      ? decodeStructureErrors(data, format)
      : [];

  // Encoding errors (only in strict_encoding mode via Effect path)
  const encodingErrors: string[] = [];
  if (opts.strict_encoding && !useJsonSchema) {
    // decodeStructureErrors covers encoding signals; encoding errors surfaced via detectEncodingErrors
    if ((await cache.index.listAll()).length > 0) {
      const encErrors = await detectEncodingErrors(data, cache, format, expansionOpts);
      encodingErrors.push(...encErrors);
    }
  }

  let results: ValidationStepResult[] = [];

  try {
    if (useJsonSchema) {
      if (format === "native") {
        results = await validateNativeStepsJsonSchema(data, cache, undefined, "", expansionOpts);
      } else {
        results = await validateFormat2StepsJsonSchema(data, cache, undefined, "", expansionOpts);
      }
    } else {
      if (format === "native") {
        results = await validateNativeSteps(data, cache, "", expansionOpts);
      } else {
        results = await validateFormat2Steps(data, cache, "", expansionOpts);
      }
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes("legacy parameter encoding")) {
      encodingErrors.push(e.message);
    } else {
      throw e;
    }
  }

  const report = buildSingleValidationReport(absPath, results, {
    structure_errors: structureErrors,
    encoding_errors: encodingErrors,
  });
  if (clean_report !== null) {
    (report as SingleValidationReport).clean_report = clean_report;
  }
  return report;
}

export interface LintOptions {
  strict_structure?: boolean;
  strict_encoding?: boolean;
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
  const strict = {
    strictEncoding: opts.strict_encoding ?? false,
    strictStructure: opts.strict_structure ?? false,
    strictState: false,
  };

  const report = await lintWorkflowReport(absPath, data, format, { cache, strict });

  const lintErrors = report.structural.error_count + (report.bestPractices?.error_count ?? 0);
  const lintWarnings = report.structural.warn_count + (report.bestPractices?.warn_count ?? 0);
  const lintErrorMessages = [
    ...report.structural.errors.map((m) => m.message),
    ...(report.bestPractices?.errors.map((m) => m.message) ?? []),
  ];
  const lintWarningMessages = [
    ...report.structural.warnings.map((m) => m.message),
    ...(report.bestPractices?.warnings.map((m) => m.message) ?? []),
  ];

  // Always compute structure_errors from Effect Schema decode (matches CLI JSON mode)
  const structureErrors = decodeStructureErrors(data, format);

  // Detect legacy encoding errors (when cache is available)
  let encodingErrors: string[] = [];
  if ((await cache.index.listAll()).length > 0) {
    const expansionOpts: ExpansionOptions = {
      resolver: createDefaultResolver({ workflowDirectory: path.dirname(absPath) }),
    };
    encodingErrors = await detectEncodingErrors(data, cache, format, expansionOpts);
  }

  return buildSingleLintReport(absPath, lintErrors, lintWarnings, report.stateValidation ?? [], {
    structure_errors: structureErrors,
    encoding_errors: encodingErrors,
    lint_error_messages: lintErrorMessages,
    lint_warning_messages: lintWarningMessages,
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
  /** When true, return the cleaned content without writing it back to disk. */
  dry_run?: boolean;
}

/** Clean stale tool state keys in a workflow; writes back to disk unless dry_run. */
export async function operateClean(
  wf: WorkflowFile,
  opts: CleanOptions = {},
): Promise<SingleCleanReport> {
  const { absPath, data, format } = wf;
  const before_content = fs.readFileSync(absPath, "utf-8");
  const cleanResult = await cleanWorkflow(data);
  // Match Python clean_single's after_content: indent=2, no trailing newline.
  const after_content = serializeWorkflow(cleanResult.workflow as Record<string, unknown>, format, {
    indent: 2,
    trailingNewline: false,
  });
  if (!opts.dry_run) {
    fs.writeFileSync(absPath, after_content);
  }
  const base = buildSingleCleanReport(absPath, cleanResult.results);
  return {
    ...base,
    before_content,
    after_content,
  };
}

// ── Export / Convert ─────────────────────────────────────────────────────────

interface ExportOutcome {
  output_path: string;
  content: string;
  report: SingleExportReport | ToNativeResult;
  source_format: "native" | "format2";
  target_format: "native" | "format2";
}

/**
 * Compute the output path for an export/convert.
 * Native `.ga` → `.gxwf.yml`; format2 `.gxwf.yml`/`.gxwf.yaml` → `.ga`.
 */
function computeOutputPath(absPath: string, sourceFormat: "native" | "format2"): string {
  if (sourceFormat === "native") {
    // foo.ga → foo.gxwf.yml
    const base = absPath.endsWith(".ga") ? absPath.slice(0, -".ga".length) : absPath;
    return `${base}.gxwf.yml`;
  }
  // foo.gxwf.yml / foo.gxwf.yaml → foo.ga
  const dir = path.dirname(absPath);
  const name = path.basename(absPath);
  const stem = name.endsWith(".gxwf.yml")
    ? name.slice(0, -".gxwf.yml".length)
    : name.endsWith(".gxwf.yaml")
      ? name.slice(0, -".gxwf.yaml".length)
      : name.replace(/\.[^.]+$/, "");
  return path.join(dir, `${stem}.ga`);
}

async function performExport(wf: WorkflowFile, cache: ToolCache): Promise<ExportOutcome> {
  const { absPath, data, format } = wf;
  const expansionOpts: ExpansionOptions = {
    resolver: createDefaultResolver({ workflowDirectory: path.dirname(absPath) }),
  };

  if (format === "native") {
    const { resolver } = await loadToolInputsForWorkflow(data, "native", cache, expansionOpts);
    const result = toFormat2Stateful(data, resolver);
    const converted = result.steps.filter((s) => s.converted).length;
    const fallback = result.steps.length - converted;
    const report: SingleExportReport = {
      workflow: absPath,
      ok: fallback === 0,
      steps_converted: converted,
      steps_fallback: fallback,
      summary: { converted, fallback },
    };
    return {
      output_path: computeOutputPath(absPath, "native"),
      content: serializeWorkflow(result.workflow as Record<string, unknown>, "format2"),
      report,
      source_format: "native",
      target_format: "format2",
    };
  }

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
  const nativeDict = result.workflow as unknown as Record<string, unknown>;
  const report: ToNativeResult = {
    native_dict: nativeDict,
    steps,
    all_encoded: allEncoded,
    summary: `${encodedCount}/${steps.length} steps encoded`,
  };
  return {
    output_path: computeOutputPath(absPath, "format2"),
    // Match Python format_native_json: JSON indent=4 + trailing newline.
    content: serializeWorkflow(nativeDict, "native", { indent: 4 }),
    report,
    source_format: "format2",
    target_format: "native",
  };
}

export interface ExportConvertOptions {
  dry_run?: boolean;
}

/** Export: write converted workflow alongside the original (or return content on dry_run). */
export async function operateExport(
  wf: WorkflowFile,
  cache: ToolCache,
  opts: ExportConvertOptions = {},
): Promise<ExportResult> {
  const outcome = await performExport(wf, cache);
  if (!opts.dry_run) {
    fs.writeFileSync(outcome.output_path, outcome.content);
  }
  return {
    source_path: wf.absPath,
    output_path: outcome.output_path,
    source_format: outcome.source_format,
    target_format: outcome.target_format,
    report: outcome.report,
    dry_run: !!opts.dry_run,
    content: opts.dry_run ? outcome.content : null,
  };
}

/** Convert: like export, but also removes the original file. */
export async function operateConvert(
  wf: WorkflowFile,
  cache: ToolCache,
  opts: ExportConvertOptions = {},
): Promise<ConvertResult> {
  const outcome = await performExport(wf, cache);
  if (!opts.dry_run) {
    fs.writeFileSync(outcome.output_path, outcome.content);
    fs.unlinkSync(wf.absPath);
  }
  return {
    source_path: wf.absPath,
    output_path: outcome.output_path,
    removed_path: wf.absPath,
    source_format: outcome.source_format,
    target_format: outcome.target_format,
    report: outcome.report,
    dry_run: !!opts.dry_run,
    content: opts.dry_run ? outcome.content : null,
  };
}

export interface RoundtripOptions {
  strict_structure?: boolean;
  strict_encoding?: boolean;
  strict_state?: boolean;
  include_content?: boolean;
}

/** Run roundtrip validation (native → format2 → native). */
export async function operateRoundtrip(
  wf: WorkflowFile,
  cache: ToolCache,
  opts: RoundtripOptions = {},
): Promise<SingleRoundTripReport> {
  const { absPath, data, format } = wf;
  if (format !== "native") {
    throw new HttpError(422, "roundtrip requires a native (.ga) workflow");
  }

  const expansionOpts: ExpansionOptions = {
    resolver: createDefaultResolver({ workflowDirectory: path.dirname(absPath) }),
  };
  const { resolver } = await loadToolInputsForWorkflow(data, "native", cache, expansionOpts);
  const result = roundtripValidate(data, resolver, {
    strictStructure: opts.strict_structure,
    strictEncoding: opts.strict_encoding,
    strictState: opts.strict_state,
  });

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

  const before_content = opts.include_content ? JSON.stringify(data, null, 2) : undefined;
  const after_content =
    opts.include_content && result.reimportedWorkflow != null
      ? JSON.stringify(result.reimportedWorkflow, null, 2)
      : undefined;

  return {
    workflow: absPath,
    result: validationResult,
    before_content: before_content ?? null,
    after_content: after_content ?? null,
  };
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function _mapRoundtripFailureClass(cls: RoundtripFailureClass | null): FailureClass | null {
  if (cls === null) return null;
  // "subworkflow_external_ref" is TS-specific; map to Python's "subworkflow"
  if (cls === "subworkflow_external_ref") return "subworkflow";
  // All other TS failure classes happen to match Python FailureClass literals
  return cls as FailureClass;
}
