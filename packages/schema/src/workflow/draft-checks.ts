/**
 * Pure logic for Galaxy draft workflows (`class: GalaxyWorkflowDraft`).
 *
 * Substrate for the `gxwf draft-validate`, `gxwf draft-next-step`, and
 * `gxwf _draft-extract` CLI commands. No I/O.
 *
 * The sentinel constants mirror `gxformat2/draft.py`. Drift is enforced by
 * `make check-sync-draft-sentinel` against the JSON snapshot in
 * `schema-sources/v19_09/draft_constants.json`.
 */

export const TODO_SENTINEL_PATTERN = /^TODO(_[a-z0-9_]+)?$/;

export const PLAN_FIELDS = ["_plan_state", "_plan_context", "_plan_in", "_plan_out"] as const;
export type PlanField = (typeof PLAN_FIELDS)[number];

export const DRAFT_CLASS = "GalaxyWorkflowDraft";

export function isTodoSentinel(value: unknown): value is string {
  return typeof value === "string" && TODO_SENTINEL_PATTERN.test(value);
}

export function isDraftWorkflow(doc: unknown): boolean {
  return isRecord(doc) && doc.class === DRAFT_CLASS;
}

export type StepPath = string[];

export type TodoLocation =
  | { kind: "tool_id" }
  | { kind: "tool_version" }
  | { kind: "in_key"; key: string }
  | { kind: "out_id"; id: string }
  | { kind: "output_source"; output_label: string; port: string };

export interface TodoHit {
  path: StepPath;
  location: TodoLocation;
  sentinel: string;
}

export interface PlanHit {
  path: StepPath;
  field: PlanField;
  value: string;
}

export interface DraftSurvey {
  /** True iff `doc.class === "GalaxyWorkflowDraft"`. */
  isDraft: boolean;
  /** TODO sentinel hits in declaration order across the (sub)workflow tree. */
  todos: TodoHit[];
  /** `_plan_*` field hits on draft steps across the (sub)workflow tree. */
  planFields: PlanHit[];
}

/**
 * Walk a draft workflow once, returning every TODO sentinel and `_plan_*`
 * field with its step path. Non-draft documents return `{ isDraft: false }`
 * with empty arrays.
 *
 * Step paths are `[outerLabel, ..., innerStepLabel]`. Subworkflows recurse
 * only when the inner `run:` block also carries `class: GalaxyWorkflowDraft`.
 */
export function detectDraft(workflow: unknown): DraftSurvey {
  const todos: TodoHit[] = [];
  const planFields: PlanHit[] = [];
  if (!isRecord(workflow) || workflow.class !== DRAFT_CLASS) {
    return { isDraft: false, todos, planFields };
  }
  walkDraftSteps(workflow, [], todos, planFields);
  return { isDraft: true, todos, planFields };
}

function walkDraftSteps(
  workflow: Record<string, unknown>,
  prefix: StepPath,
  todos: TodoHit[],
  planFields: PlanHit[],
): void {
  for (const [label, step] of iterateSteps(workflow.steps)) {
    if (!isRecord(step)) continue;
    const path = [...prefix, label];

    collectStepTodos(step, path, todos);
    collectStepPlanFields(step, path, planFields);

    const inner = step.run;
    if (isDraftWorkflow(inner)) {
      walkDraftSteps(inner as Record<string, unknown>, path, todos, planFields);
    }
  }

  // Workflow-level outputs: outputSource may contain a TODO port reference.
  for (const [label, output] of iterateOutputs(workflow.outputs)) {
    const ref = readOutputSource(output);
    if (ref == null) continue;
    const [, port] = splitSourceRef(ref);
    if (port != null && isTodoSentinel(port)) {
      todos.push({
        path: prefix,
        location: { kind: "output_source", output_label: label, port },
        sentinel: port,
      });
    }
  }
}

function collectStepTodos(step: Record<string, unknown>, path: StepPath, todos: TodoHit[]): void {
  if (isTodoSentinel(step.tool_id)) {
    todos.push({ path, location: { kind: "tool_id" }, sentinel: step.tool_id });
  }
  if (isTodoSentinel(step.tool_version)) {
    todos.push({
      path,
      location: { kind: "tool_version" },
      sentinel: step.tool_version,
    });
  }
  if (isRecord(step.in)) {
    for (const key of Object.keys(step.in)) {
      if (isTodoSentinel(key)) {
        todos.push({ path, location: { kind: "in_key", key }, sentinel: key });
      }
    }
  }
  for (const id of iterateStepOutIds(step.out)) {
    if (isTodoSentinel(id)) {
      todos.push({ path, location: { kind: "out_id", id }, sentinel: id });
    }
  }
}

function collectStepPlanFields(
  step: Record<string, unknown>,
  path: StepPath,
  planFields: PlanHit[],
): void {
  for (const field of PLAN_FIELDS) {
    const value = step[field];
    if (typeof value === "string" && value.length > 0) {
      planFields.push({ path, field, value });
    }
  }
}

function* iterateSteps(steps: unknown): Iterable<[string, unknown]> {
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

function* iterateOutputs(outputs: unknown): Iterable<[string, unknown]> {
  if (Array.isArray(outputs)) {
    for (const out of outputs) {
      if (isRecord(out)) {
        const label = typeof out.id === "string" ? out.id : "";
        yield [label, out];
      }
    }
  } else if (isRecord(outputs)) {
    for (const [key, value] of Object.entries(outputs)) {
      yield [key, value];
    }
  }
}

function readOutputSource(output: unknown): string | null {
  if (typeof output === "string") return output;
  if (!isRecord(output)) return null;
  const src = output.outputSource ?? output.source;
  return typeof src === "string" ? src : null;
}

function splitSourceRef(ref: string): [string, string | null] {
  const slash = ref.indexOf("/");
  if (slash < 0) return [ref, null];
  return [ref.slice(0, slash), ref.slice(slash + 1)];
}

function* iterateStepOutIds(out: unknown): Iterable<string> {
  if (Array.isArray(out)) {
    for (const entry of out) {
      if (typeof entry === "string") {
        yield entry;
      } else if (isRecord(entry) && typeof entry.id === "string") {
        yield entry.id;
      }
    }
  } else if (isRecord(out)) {
    for (const key of Object.keys(out)) {
      yield key;
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
