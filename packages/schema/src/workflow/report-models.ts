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

// ── Single-workflow wrappers ─────────────────────────────────────────

export interface SingleValidationReport {
  workflow: string;
  results: ValidationStepResult[];
  connection_report: null; // placeholder — connection validation out of scope
  skipped_reason: string | null;
  structure_errors: string[];
  encoding_errors: string[];
  summary: { ok: number; fail: number; skip: number };
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
}

// ── Tree workflow-level results ──────────────────────────────────────

export interface WorkflowValidationResult {
  path: string;
  category: string;
  name: string;
  error: string | null;
  skipped_reason: string | null;
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
  skipped_reason: string | null;
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
  skipped_reason: string | null;
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

/** Extract basename from a path (portion after last slash). */
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
    skipped_reason?: string | null;
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
    skipped_reason?: string | null;
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
    skipped_reason?: string | null;
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
    skipped_reason?: string | null;
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
