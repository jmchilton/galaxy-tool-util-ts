/**
 * Post-extract cleanup for draft workflows.
 *
 * `stripPlanFields` removes the four `_plan_*` planning fields from every
 * step (recursively into inline draft subworkflows) and from the workflow
 * root. `promoteFullyConcreteDrafts` flips `class: GalaxyWorkflowDraft` →
 * `class: GalaxyWorkflow` on any (sub)workflow that is now fully concrete
 * — zero TODO sentinels, zero `_plan_*` fields anywhere — recursively.
 *
 * Both functions mutate the workflow dict in place (matching the
 * `cleanWorkflow` style) and return arrays of paths describing what
 * changed, for sidecar reporting.
 */
import {
  DRAFT_CLASS,
  PLAN_FIELDS,
  detectDraft,
  isDraftWorkflow,
  type StepPath,
} from "./draft-checks.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Path of a stripped `_plan_*` field. `path: []` means the workflow root
 * (or, when recursing, the inner subworkflow's root reached via `prefix`).
 */
export interface StrippedPlanField {
  /** Step path to the carrier; `[]` for the workflow root. */
  path: StepPath;
  /** Which `_plan_*` field was removed. */
  field: (typeof PLAN_FIELDS)[number];
}

export interface StripPlanFieldsResult {
  workflow: unknown;
  removedPaths: StrippedPlanField[];
}

/**
 * Strip `_plan_state` / `_plan_context` / `_plan_in` / `_plan_out` from
 * every step and from the workflow root. Recurses into inline draft
 * subworkflow `run:` blocks; leaves string-form `run:` and concrete
 * `class: GalaxyWorkflow` `run:` untouched.
 *
 * Mutates the workflow dict in place. Pure on non-records (passes
 * through unchanged with empty `removedPaths`).
 */
export function stripPlanFields(workflow: unknown): StripPlanFieldsResult {
  const removed: StrippedPlanField[] = [];
  if (!isRecord(workflow)) {
    return { workflow, removedPaths: removed };
  }
  stripPlanFieldsIn(workflow, [], removed);
  return { workflow, removedPaths: removed };
}

function stripPlanFieldsIn(
  workflow: Record<string, unknown>,
  prefix: StepPath,
  removed: StrippedPlanField[],
): void {
  // Root-level _plan_* (only meaningful on draft workflows, but we strip
  // unconditionally — root _plan_* on a non-draft is dead weight too).
  for (const field of PLAN_FIELDS) {
    if (field in workflow) {
      delete workflow[field];
      removed.push({ path: [...prefix], field });
    }
  }

  // Step-level _plan_* + recurse into draft subworkflows.
  for (const [label, step] of iterateStepEntries(workflow.steps)) {
    if (!isRecord(step)) continue;
    const path = [...prefix, label];
    for (const field of PLAN_FIELDS) {
      if (field in step) {
        delete step[field];
        removed.push({ path: [...path], field });
      }
    }
    if (isDraftWorkflow(step.run)) {
      stripPlanFieldsIn(step.run as Record<string, unknown>, path, removed);
    }
  }
}

export interface PromoteFullyConcreteDraftsResult {
  workflow: unknown;
  /** Step paths whose inner workflow was flipped to `GalaxyWorkflow`. `[]` = the outermost workflow itself. */
  promotedPaths: StepPath[];
}

/**
 * Flip `class: GalaxyWorkflowDraft` → `class: GalaxyWorkflow` on any
 * (sub)workflow that is now fully concrete: zero TODO sentinels, zero
 * `_plan_*` fields anywhere in steps / root. Recurses into inline draft
 * subworkflows; still-drafty inner workflows are left alone.
 *
 * Mutates in place. Pure on non-records.
 */
export function promoteFullyConcreteDrafts(workflow: unknown): PromoteFullyConcreteDraftsResult {
  const promoted: StepPath[] = [];
  if (!isRecord(workflow)) {
    return { workflow, promotedPaths: promoted };
  }
  promoteFullyConcreteDraftsIn(workflow, [], promoted);
  return { workflow, promotedPaths: promoted };
}

function promoteFullyConcreteDraftsIn(
  workflow: Record<string, unknown>,
  prefix: StepPath,
  promoted: StepPath[],
): void {
  // Recurse first — flipping an outer draft before its inner drafts get
  // a chance would mask still-drafty inner workflows under a now-concrete
  // outer.
  for (const [label, step] of iterateStepEntries(workflow.steps)) {
    if (!isRecord(step)) continue;
    if (isDraftWorkflow(step.run)) {
      promoteFullyConcreteDraftsIn(
        step.run as Record<string, unknown>,
        [...prefix, label],
        promoted,
      );
    }
  }

  if (workflow.class !== DRAFT_CLASS) return;
  if (!isFullyConcrete(workflow)) return;

  workflow.class = "GalaxyWorkflow";
  promoted.push([...prefix]);
}

function isFullyConcrete(workflow: Record<string, unknown>): boolean {
  // detectDraft's step-walk covers TODOs + step-level _plan_*. We also
  // check workflow root + step roots for any lingering _plan_* (detectDraft
  // intentionally skips workflow-root _plan_*).
  const survey = detectDraft(workflow);
  if (survey.todos.length > 0) return false;
  if (survey.planFields.length > 0) return false;
  for (const field of PLAN_FIELDS) {
    if (field in workflow) return false;
  }
  // An inner draft `run:` still carrying its own work blocks promotion of
  // the outer (we don't flip while one of our subworkflow steps is still
  // a GalaxyWorkflowDraft).
  for (const [, step] of iterateStepEntries(workflow.steps)) {
    if (!isRecord(step)) continue;
    if (isRecord(step.run) && step.run.class === DRAFT_CLASS) return false;
  }
  return true;
}

function* iterateStepEntries(steps: unknown): Iterable<[string, unknown]> {
  if (Array.isArray(steps)) {
    for (const step of steps) {
      if (isRecord(step)) {
        const label =
          typeof step.label === "string" ? step.label : typeof step.id === "string" ? step.id : "";
        yield [label, step];
      }
    }
  } else if (isRecord(steps)) {
    for (const [key, value] of Object.entries(steps)) {
      yield [key, value];
    }
  }
}
