/**
 * Structured report models for CLI and API output.
 *
 * These types mirror Python's `galaxy.tool_util.workflow_state._report_models`
 * exactly — field names are snake_case, status literals match, and JSON shape
 * is identical so that the same frontend rendering code works for both.
 *
 * Hierarchy:
 *   Step-level  →  Single-workflow wrappers  →  Tree-level reports
 */

// ── Status literals ──────────────────────────────────────────────────

export type StepStatus = "ok" | "fail" | "skip_tool_not_found" | "skip_replacement_params";

export const SKIP_STATUSES: ReadonlySet<StepStatus> = new Set([
  "skip_tool_not_found",
  "skip_replacement_params",
]);

// ── Step-level results ───────────────────────────────────────────────

export interface ValidationStepResult {
  step: string;
  tool_id: string | null;
  version: string | null;
  status: StepStatus;
  errors: string[];
}

export interface CleanStepResult {
  step: string;
  tool_id: string | null;
  version: string | null;
  removed_keys: string[];
  skipped: boolean;
  skip_reason: string;
  display_label: string;
}

// ── Connection validation types ──────────────────────────────────────

export interface ResolvedOutputType {
  name: string;
  collection_type: string | null;
}

export interface ConnectionResult {
  source_step: string;
  source_output: string;
  target_step: string;
  target_input: string;
  status: "ok" | "invalid" | "skip";
  mapping: string | null;
  errors: string[];
}

export interface ConnectionStepResult {
  step: string;
  tool_id: string | null;
  version: string | null;
  step_type: string;
  map_over: string | null;
  connections: ConnectionResult[];
  resolved_outputs: ResolvedOutputType[];
  errors: string[];
}

export interface ConnectionValidationReport {
  valid: boolean;
  step_results: ConnectionStepResult[];
  summary: Record<string, number>;
  has_details: boolean;
}

// ── Workflow discovery ───────────────────────────────────────────────

export interface WorkflowEntry {
  relative_path: string;
  format: string;
  category: string;
}

export interface WorkflowIndex {
  directory: string;
  workflows: WorkflowEntry[];
}

// ── Single-workflow wrappers ─────────────────────────────────────────

export interface SingleValidationReport {
  workflow: string;
  results: ValidationStepResult[];
  connection_report: ConnectionValidationReport | null;
  skipped_reason: SkipWorkflowReason | null;
  structure_errors: string[];
  encoding_errors: string[];
  summary: { ok: number; fail: number; skip: number };
  clean_report?: SingleCleanReport | null;
}

export interface SingleLintReport {
  workflow: string;
  lint_errors: number;
  lint_warnings: number;
  results: ValidationStepResult[];
  structure_errors: string[];
  encoding_errors: string[];
  summary: {
    lint_errors: number;
    lint_warnings: number;
    state_ok: number;
    state_fail: number;
    state_skip: number;
  };
}

export interface SingleCleanReport {
  workflow: string;
  results: CleanStepResult[];
  total_removed: number;
  steps_with_removals: number;
  before_content?: string | null;
  after_content?: string | null;
}

// ── Round-trip validation types ──────────────────────────────────────

export type DiffType =
  | "value_mismatch"
  | "missing_in_roundtrip"
  | "missing_in_original"
  | "connection_mismatch"
  | "position_mismatch"
  | "label_mismatch"
  | "annotation_mismatch"
  | "comment_mismatch"
  | "step_missing";

export type DiffSeverity = "error" | "benign";

export interface BenignArtifact {
  reason: string;
  proven_by: string[];
}

export interface StepDiff {
  step_path: string;
  key_path: string;
  diff_type: DiffType;
  severity: DiffSeverity;
  description: string;
  original_value: unknown;
  roundtrip_value: unknown;
  benign_artifact: BenignArtifact | null;
}

export type SkipWorkflowReason = "legacy_encoding";

export type FailureClass =
  | "tool_not_found"
  | "native_validation"
  | "conversion_error"
  | "type_not_handled"
  | "format2_validation"
  | "reimport_error"
  | "roundtrip_mismatch"
  | "subworkflow"
  | "parse_error"
  | "other";

export interface StepResult {
  step_id: string;
  tool_id: string | null;
  success: boolean;
  failure_class: FailureClass | null;
  error: string | null;
  diffs: StepDiff[];
  format2_state: Record<string, unknown> | null;
  format2_connections: Record<string, unknown> | null;
}

export interface RoundTripResult {
  workflow_name: string;
  direction: string;
  step_results: StepResult[];
}

export interface StepIdMappingResult {
  mapping: Record<string, string | null>;
  match_methods: Record<string, string>;
}

export interface RoundTripValidationResult {
  workflow_path: string;
  category: string;
  conversion_result: RoundTripResult | null;
  diffs: StepDiff[] | null;
  step_id_mapping: StepIdMappingResult | null;
  stale_clean_results: CleanStepResult[] | null;
  error: string | null;
  skipped_reason: SkipWorkflowReason | null;
  structure_errors: string[];
  encoding_errors: string[];
  // Server-computed readOnly fields — derived from diffs; present in API responses
  readonly error_diffs: StepDiff[];
  readonly benign_diffs: StepDiff[];
  readonly ok: boolean;
  readonly status: string;
  readonly conversion_failure_lines: string[];
  readonly summary_line: string;
}

export interface SingleRoundTripReport {
  workflow: string;
  result: RoundTripValidationResult;
  before_content?: string | null;
  after_content?: string | null;
}

// ── Export / to-native types ─────────────────────────────────────────

export interface SingleExportReport {
  workflow: string;
  ok: boolean;
  steps_converted: number;
  steps_fallback: number;
  // Server-computed readOnly field — derived; present in API responses
  readonly summary: Record<string, number>;
}

export interface StepEncodeStatus {
  step_id: string;
  step_label: string | null;
  tool_id: string | null;
  encoded: boolean;
  error: string | null;
}

export interface ToNativeResult {
  native_dict: Record<string, unknown>;
  steps: StepEncodeStatus[];
  // Server-computed readOnly fields — derived; present in API responses
  readonly all_encoded: boolean;
  readonly summary: string;
}

// ── Tree workflow-level results ──────────────────────────────────────
// Note: tree-level types intentionally omit structure_errors and encoding_errors.
// Those fields exist only on SingleValidationReport / SingleLintReport for
// single-workflow JSON output. Tree commands aggregate per-workflow summaries
// without running Effect Schema decode or legacy encoding detection per file.

export interface WorkflowValidationResult {
  path: string;
  category: string;
  name: string;
  error: string | null;
  skipped_reason: SkipWorkflowReason | null;
  results: ValidationStepResult[];
  connection_report: null;
  summary: { ok: number; fail: number; skip: number } | null;
  failures: { step: string; tool_id: string | null; message: string }[] | null;
}

export interface LintWorkflowResult {
  path: string;
  category: string;
  name: string;
  error: string | null;
  skipped_reason: SkipWorkflowReason | null;
  lint_errors: number;
  lint_warnings: number;
  results: ValidationStepResult[];
  step_counts: { ok: number; fail: number; skip: number } | null;
}

export interface WorkflowCleanResult {
  path: string;
  category: string;
  name: string;
  error: string | null;
  skipped_reason: SkipWorkflowReason | null;
  results: CleanStepResult[];
  total_removed: number;
  steps_affected: number;
}

// ── Tree-level reports ───────────────────────────────────────────────

export interface CategoryGroup<T> {
  name: string;
  results: T[];
}

export interface TreeValidationReport {
  root: string;
  workflows: WorkflowValidationResult[];
  categories: CategoryGroup<WorkflowValidationResult>[];
  all_failures: { workflow: string; step: string; tool_id: string | null; message: string }[];
  summary: {
    ok: number;
    fail: number;
    skip: number;
    error: number;
    skipped: number;
  };
}

export interface LintTreeReport {
  root: string;
  workflows: LintWorkflowResult[];
  categories: CategoryGroup<LintWorkflowResult>[];
  summary: {
    lint_errors: number;
    lint_warnings: number;
    state_ok: number;
    state_fail: number;
    state_skip: number;
    errors: number;
    skipped: number;
  };
}

export interface TreeCleanReport {
  root: string;
  workflows: WorkflowCleanResult[];
  categories: CategoryGroup<WorkflowCleanResult>[];
  summary: {
    total_keys: number;
    affected: number;
    clean: number;
    errors: number;
    skipped: number;
  };
}

// ── Builder helpers ──────────────────────────────────────────────────

/** Compute summary counts for a list of step results. */
export function validationSummary(results: ValidationStepResult[]): {
  ok: number;
  fail: number;
  skip: number;
} {
  let ok = 0;
  let fail = 0;
  let skip = 0;
  for (const r of results) {
    if (r.status === "ok") ok++;
    else if (r.status === "fail") fail++;
    else skip++;
  }
  return { ok, fail, skip };
}

/** Build flat failure list from step results (for template rendering). */
export function validationFailures(
  results: ValidationStepResult[],
): { step: string; tool_id: string | null; message: string }[] {
  const out: { step: string; tool_id: string | null; message: string }[] = [];
  for (const sr of results) {
    if (sr.status !== "fail") continue;
    for (const err of sr.errors) {
      out.push({ step: sr.step, tool_id: sr.tool_id, message: err });
    }
  }
  return out;
}

/** Compute display_label matching Python's CleanStepResult. */
export function cleanDisplayLabel(tool_id: string | null, version: string | null): string {
  let label = tool_id ?? "unknown";
  if (version) label += ` ${version}`;
  return label;
}

/** Compute category from a relative path (directory portion, or "(root)"). */
export function categoryOf(relativePath: string): string {
  const lastSlash = relativePath.lastIndexOf("/");
  if (lastSlash < 0) return "(root)";
  const dir = relativePath.slice(0, lastSlash);
  return dir || "(root)";
}

/** Extract basename from a path (portion after last slash). Avoids node:path for browser compat. */
function baseName(path: string): string {
  const lastSlash = path.lastIndexOf("/");
  return lastSlash < 0 ? path : path.slice(lastSlash + 1);
}

/** Group results by category, sorted by name. */
export function groupByCategory<T extends { category: string }>(results: T[]): CategoryGroup<T>[] {
  const groups = new Map<string, T[]>();
  for (const r of results) {
    const cat = r.category || "(root)";
    let list = groups.get(cat);
    if (!list) {
      list = [];
      groups.set(cat, list);
    }
    list.push(r);
  }
  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, results]) => ({ name, results }));
}

// ── Single-workflow report builders ──────────────────────────────────

export function buildSingleValidationReport(
  workflow: string,
  results: ValidationStepResult[],
  opts?: {
    skipped_reason?: SkipWorkflowReason | null;
    structure_errors?: string[];
    encoding_errors?: string[];
  },
): SingleValidationReport {
  return {
    workflow,
    results,
    connection_report: null,
    skipped_reason: opts?.skipped_reason ?? null,
    structure_errors: opts?.structure_errors ?? [],
    encoding_errors: opts?.encoding_errors ?? [],
    summary: validationSummary(results),
  };
}

export function buildSingleLintReport(
  workflow: string,
  lint_errors: number,
  lint_warnings: number,
  results: ValidationStepResult[],
  opts?: {
    structure_errors?: string[];
    encoding_errors?: string[];
  },
): SingleLintReport {
  const summary = validationSummary(results);
  return {
    workflow,
    lint_errors,
    lint_warnings,
    results,
    structure_errors: opts?.structure_errors ?? [],
    encoding_errors: opts?.encoding_errors ?? [],
    summary: {
      lint_errors,
      lint_warnings,
      state_ok: summary.ok,
      state_fail: summary.fail,
      state_skip: summary.skip,
    },
  };
}

export function buildSingleCleanReport(
  workflow: string,
  results: CleanStepResult[],
): SingleCleanReport {
  return {
    workflow,
    results,
    total_removed: results.reduce((n, r) => n + r.removed_keys.length, 0),
    steps_with_removals: results.filter((r) => r.removed_keys.length > 0).length,
  };
}

// ── Tree workflow-level result builders ──────────────────────────────

export function buildWorkflowValidationResult(
  relativePath: string,
  stepResults: ValidationStepResult[],
  opts?: {
    error?: string | null;
    skipped_reason?: SkipWorkflowReason | null;
  },
): WorkflowValidationResult {
  const hasError = !!(opts?.error || opts?.skipped_reason);
  return {
    path: relativePath,
    category: categoryOf(relativePath),
    name: baseName(relativePath),
    error: opts?.error ?? null,
    skipped_reason: opts?.skipped_reason ?? null,
    results: stepResults,
    connection_report: null,
    summary: hasError ? null : validationSummary(stepResults),
    failures: hasError ? null : validationFailures(stepResults),
  };
}

export function buildLintWorkflowResult(
  relativePath: string,
  lint_errors: number,
  lint_warnings: number,
  stepResults: ValidationStepResult[],
  opts?: {
    error?: string | null;
    skipped_reason?: SkipWorkflowReason | null;
  },
): LintWorkflowResult {
  const hasError = !!(opts?.error || opts?.skipped_reason);
  return {
    path: relativePath,
    category: categoryOf(relativePath),
    name: baseName(relativePath),
    error: opts?.error ?? null,
    skipped_reason: opts?.skipped_reason ?? null,
    lint_errors,
    lint_warnings,
    results: stepResults,
    step_counts: hasError ? null : validationSummary(stepResults),
  };
}

export function buildWorkflowCleanResult(
  relativePath: string,
  stepResults: CleanStepResult[],
  opts?: {
    error?: string | null;
    skipped_reason?: SkipWorkflowReason | null;
  },
): WorkflowCleanResult {
  return {
    path: relativePath,
    category: categoryOf(relativePath),
    name: baseName(relativePath),
    error: opts?.error ?? null,
    skipped_reason: opts?.skipped_reason ?? null,
    results: stepResults,
    total_removed: stepResults.reduce((n, r) => n + r.removed_keys.length, 0),
    steps_affected: stepResults.filter((r) => r.removed_keys.length > 0).length,
  };
}

// ── Export tree types ────────────────────────────────────────────────

export interface WorkflowExportResult {
  path: string;
  category: string;
  name: string;
  error: string | null;
  skipped_reason: string | null; // free-form in Python (not constrained to SkipWorkflowReason)
  ok: boolean;
  steps_converted: number;
  steps_fallback: number;
  // Server-computed readOnly field
  readonly status: "ok" | "partial" | "error" | "skipped";
}

export interface ExportTreeReport {
  root: string;
  output_dir: string;
  workflows: WorkflowExportResult[];
  // Server-computed readOnly field
  readonly summary: { ok: number; fail: number; skipped: number };
}

// ── To-native tree types ─────────────────────────────────────────────

export interface WorkflowToNativeResult {
  path: string;
  category: string;
  name: string;
  error: string | null;
  skipped_reason: string | null; // free-form in Python (not constrained to SkipWorkflowReason)
  ok: boolean;
  steps_encoded: number;
  steps_fallback: number;
  // Server-computed readOnly field
  readonly status: "ok" | "partial" | "error" | "skipped";
}

export interface ToNativeTreeReport {
  root: string;
  output_dir: string;
  workflows: WorkflowToNativeResult[];
  // Server-computed readOnly field
  readonly summary: { ok: number; fail: number; skipped: number };
}

// ── Round-trip tree types ────────────────────────────────────────────

export interface ToolFailureMode {
  tool_id: string | null;
  failure_class: string;
  count: number;
}

export interface RoundTripTreeReport {
  root: string;
  workflows: RoundTripValidationResult[];
  // Server-computed readOnly fields
  readonly total: number;
  readonly summary: {
    clean: number;
    benign_only: number;
    fail: number;
    error: number;
    skipped: number;
  };
  readonly tool_failure_modes: ToolFailureMode[];
}

// ── Tree report builders ─────────────────────────────────────────────

export function buildTreeValidationReport(
  root: string,
  workflows: WorkflowValidationResult[],
): TreeValidationReport {
  let ok = 0;
  let fail = 0;
  let skip = 0;
  let error = 0;
  let skipped = 0;
  const all_failures: TreeValidationReport["all_failures"] = [];

  for (const r of workflows) {
    if (r.skipped_reason) {
      skipped++;
      continue;
    }
    if (r.error) {
      error++;
      continue;
    }
    for (const sr of r.results) {
      if (sr.status === "ok") ok++;
      else if (sr.status === "fail") fail++;
      else skip++;
    }
    for (const f of r.failures ?? []) {
      all_failures.push({ workflow: r.path, ...f });
    }
  }

  return {
    root,
    workflows,
    categories: groupByCategory(workflows),
    all_failures,
    summary: { ok, fail, skip, error, skipped },
  };
}

export function buildLintTreeReport(root: string, workflows: LintWorkflowResult[]): LintTreeReport {
  let lint_errors = 0;
  let lint_warnings = 0;
  let state_ok = 0;
  let state_fail = 0;
  let state_skip = 0;
  let errors = 0;
  let skipped = 0;

  for (const r of workflows) {
    if (r.skipped_reason) {
      skipped++;
      continue;
    }
    if (r.error) {
      errors++;
      continue;
    }
    lint_errors += r.lint_errors;
    lint_warnings += r.lint_warnings;
    for (const sr of r.results) {
      if (sr.status === "ok") state_ok++;
      else if (sr.status === "fail") state_fail++;
      else state_skip++;
    }
  }

  return {
    root,
    workflows,
    categories: groupByCategory(workflows),
    summary: { lint_errors, lint_warnings, state_ok, state_fail, state_skip, errors, skipped },
  };
}

export function buildWorkflowExportResult(
  relativePath: string,
  opts: {
    ok?: boolean;
    steps_converted?: number;
    steps_fallback?: number;
    error?: string | null;
    skipped_reason?: SkipWorkflowReason | null;
  } = {},
): WorkflowExportResult {
  const {
    ok = false,
    steps_converted = 0,
    steps_fallback = 0,
    error = null,
    skipped_reason = null,
  } = opts;
  let status: WorkflowExportResult["status"];
  if (error) status = "error";
  else if (skipped_reason) status = "skipped";
  else if (ok) status = "ok";
  else status = "partial";
  return {
    path: relativePath,
    category: categoryOf(relativePath),
    name: baseName(relativePath),
    error,
    skipped_reason,
    ok,
    steps_converted,
    steps_fallback,
    status,
  };
}

export function buildExportTreeReport(
  root: string,
  output_dir: string,
  workflows: WorkflowExportResult[],
): ExportTreeReport {
  const ok = workflows.filter((r) => r.ok && !r.error && !r.skipped_reason).length;
  const fail = workflows.filter((r) => !!r.error).length;
  const skipped = workflows.filter((r) => !!r.skipped_reason).length;
  return { root, output_dir, workflows, summary: { ok, fail, skipped } };
}

export function buildWorkflowToNativeResult(
  relativePath: string,
  opts: {
    ok?: boolean;
    steps_encoded?: number;
    steps_fallback?: number;
    error?: string | null;
    skipped_reason?: SkipWorkflowReason | null;
  } = {},
): WorkflowToNativeResult {
  const {
    ok = false,
    steps_encoded = 0,
    steps_fallback = 0,
    error = null,
    skipped_reason = null,
  } = opts;
  let status: WorkflowToNativeResult["status"];
  if (error) status = "error";
  else if (skipped_reason) status = "skipped";
  else if (ok) status = "ok";
  else status = "partial";
  return {
    path: relativePath,
    category: categoryOf(relativePath),
    name: baseName(relativePath),
    error,
    skipped_reason,
    ok,
    steps_encoded,
    steps_fallback,
    status,
  };
}

export function buildToNativeTreeReport(
  root: string,
  output_dir: string,
  workflows: WorkflowToNativeResult[],
): ToNativeTreeReport {
  const ok = workflows.filter((r) => r.ok && !r.error && !r.skipped_reason).length;
  const fail = workflows.filter((r) => !!r.error).length;
  const skipped = workflows.filter((r) => !!r.skipped_reason).length;
  return { root, output_dir, workflows, summary: { ok, fail, skipped } };
}

export function buildRoundTripTreeReport(
  root: string,
  workflows: RoundTripValidationResult[],
): RoundTripTreeReport {
  let clean = 0,
    benign_only = 0,
    fail = 0,
    error = 0,
    skipped = 0;
  for (const r of workflows) {
    const status = r.status;
    if (status === "skipped") skipped++;
    else if (status === "error") error++;
    else if (status === "ok") {
      if (r.benign_diffs.length > 0) benign_only++;
      else clean++;
    } else fail++;
  }
  const tool_failure_modes: ToolFailureMode[] = [];
  return {
    root,
    workflows,
    total: workflows.length,
    summary: { clean, benign_only, fail, error, skipped },
    tool_failure_modes,
  };
}

export function buildTreeCleanReport(
  root: string,
  workflows: WorkflowCleanResult[],
): TreeCleanReport {
  let total_keys = 0;
  let affected = 0;
  let clean = 0;
  let errors = 0;
  let skipped = 0;

  for (const r of workflows) {
    if (r.skipped_reason) {
      skipped++;
      continue;
    }
    if (r.error) {
      errors++;
      continue;
    }
    total_keys += r.total_removed;
    if (r.total_removed > 0) affected++;
    else clean++;
  }

  return {
    root,
    workflows,
    categories: groupByCategory(workflows),
    summary: { total_keys, affected, clean, errors, skipped },
  };
}
