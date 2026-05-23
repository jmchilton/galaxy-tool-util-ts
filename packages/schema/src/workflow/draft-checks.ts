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

import { Either, ParseResult, Schema } from "effect";

import { GalaxyWorkflowDraftSchema } from "./raw/gxformat2-draft.effect.js";

export const TODO_SENTINEL_PATTERN = /^TODO(_[a-z0-9_]+)?$/;
// Heuristic for TODO-shaped strings — flags malformed sentinels (TODO-foo,
// TODOfoo, TODO_, TODO_Foo with uppercase) that the canonical pattern misses.
const TODO_LIKE = /^TODO/;

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

// -----------------------------------------------------------------------------
// validateDraft
// -----------------------------------------------------------------------------

export interface DraftValidationDiagnostic {
  /** Step path; empty array for workflow-level diagnostics. */
  path: StepPath;
  message: string;
}

export interface DraftValidationResult {
  ok: boolean;
  structureErrors: DraftValidationDiagnostic[];
  topologyErrors: DraftValidationDiagnostic[];
  semanticErrors: DraftValidationDiagnostic[];
  warnings: DraftValidationDiagnostic[];
  survey: DraftSurvey;
}

/**
 * Validate a draft Galaxy workflow. Collects all diagnostics — does not throw.
 *
 *   structureErrors  Effect Schema decode failures.
 *   topologyErrors   Concrete-topology must hold even in drafts: workflow
 *                    input labels, output labels, step labels, and step types
 *                    cannot be TODO sentinels. Step/port edge refs must
 *                    resolve to a declared step + declared port (TODO_*
 *                    ports count if declared in the step's `out:`).
 *   semanticErrors   TODO-shaped strings (start with `TODO`) that don't
 *                    match the canonical sentinel form (e.g. `TODO-foo`,
 *                    `TODOfoo`, `TODO_` trailing).
 *   warnings         Bare `TODO` in port position; top-level `_plan_*`.
 *
 * The returned `survey` is the same shape detectDraft() returns and is
 * usable by downstream nextDraftStep / extractConcreteSubset callers.
 */
export function validateDraft(workflow: unknown): DraftValidationResult {
  const structureErrors: DraftValidationDiagnostic[] = [];
  const topologyErrors: DraftValidationDiagnostic[] = [];
  const semanticErrors: DraftValidationDiagnostic[] = [];
  const warnings: DraftValidationDiagnostic[] = [];

  if (!isRecord(workflow) || workflow.class !== DRAFT_CLASS) {
    structureErrors.push({
      path: [],
      message: `not a draft workflow (class must be "${DRAFT_CLASS}")`,
    });
    return {
      ok: false,
      structureErrors,
      topologyErrors,
      semanticErrors,
      warnings,
      survey: { isDraft: false, todos: [], planFields: [] },
    };
  }

  const decode = Schema.decodeUnknownEither(GalaxyWorkflowDraftSchema, {
    onExcessProperty: "ignore",
  });
  const decodeResult = decode(workflow);
  if (Either.isLeft(decodeResult)) {
    structureErrors.push({
      path: [],
      message: ParseResult.TreeFormatter.formatErrorSync(decodeResult.left),
    });
  }

  const survey = detectDraft(workflow);

  walkDraftValidation(workflow, [], topologyErrors, semanticErrors, warnings);

  for (const todo of survey.todos) {
    if (
      todo.sentinel === "TODO" &&
      todo.location.kind !== "tool_id" &&
      todo.location.kind !== "tool_version"
    ) {
      warnings.push({
        path: todo.path,
        message: `bare \`TODO\` in port position (location: ${formatTodoLocation(todo.location)}); prefer \`TODO_<hint>\``,
      });
    }
  }

  for (const field of PLAN_FIELDS) {
    const value = (workflow as Record<string, unknown>)[field];
    if (typeof value === "string" && value.length > 0) {
      warnings.push({
        path: [],
        message: `top-level \`${field}\` is not part of the draft contract; planning fields belong on individual steps`,
      });
    }
  }

  const ok =
    structureErrors.length === 0 && topologyErrors.length === 0 && semanticErrors.length === 0;

  return { ok, structureErrors, topologyErrors, semanticErrors, warnings, survey };
}

function walkDraftValidation(
  workflow: Record<string, unknown>,
  prefix: StepPath,
  topologyErrors: DraftValidationDiagnostic[],
  semanticErrors: DraftValidationDiagnostic[],
  warnings: DraftValidationDiagnostic[],
): void {
  // Workflow inputs: labels and types must be concrete.
  const inputLabels = new Set<string>();
  for (const [label, input] of iterateMapOrArrayLabeled(workflow.inputs)) {
    inputLabels.add(label);
    if (isTodoSentinel(label)) {
      topologyErrors.push({
        path: prefix,
        message: `workflow input label cannot be a TODO sentinel: "${label}"`,
      });
    } else {
      checkTodoLike(label, prefix, `workflow input label "${label}"`, semanticErrors);
    }
    if (isRecord(input) && isTodoSentinel(input.type)) {
      topologyErrors.push({
        path: prefix,
        message: `workflow input "${label}" type cannot be a TODO sentinel`,
      });
    }
  }

  // Workflow outputs: labels must be concrete; outputSource resolves.
  const stepIndex = buildStepIndex(workflow.steps);
  for (const [label, output] of iterateMapOrArrayLabeled(workflow.outputs)) {
    if (isTodoSentinel(label)) {
      topologyErrors.push({
        path: prefix,
        message: `workflow output label cannot be a TODO sentinel: "${label}"`,
      });
    } else {
      checkTodoLike(label, prefix, `workflow output label "${label}"`, semanticErrors);
    }
    const ref = readOutputSource(output);
    if (ref != null) {
      checkEdgeRef(
        ref,
        prefix,
        `workflow output "${label}"`,
        stepIndex,
        inputLabels,
        topologyErrors,
        semanticErrors,
      );
    }
  }

  // Steps: labels, types, edge refs, sentinel-form on every TODO-shaped string.
  for (const [label, step] of iterateSteps(workflow.steps)) {
    if (!isRecord(step)) continue;
    if (isTodoSentinel(label)) {
      topologyErrors.push({
        path: prefix,
        message: `step label cannot be a TODO sentinel: "${label}"`,
      });
    } else {
      checkTodoLike(label, prefix, `step label "${label}"`, semanticErrors);
    }
    const stepPath = [...prefix, label];

    if (isTodoSentinel(step.type)) {
      topologyErrors.push({
        path: stepPath,
        message: `step type cannot be a TODO sentinel`,
      });
    }

    // Sentinel form on TODO-shaped strings the schema would otherwise pass through.
    if (typeof step.tool_id === "string") {
      checkTodoLike(step.tool_id, stepPath, `tool_id "${step.tool_id}"`, semanticErrors);
    }
    if (typeof step.tool_version === "string") {
      checkTodoLike(
        step.tool_version,
        stepPath,
        `tool_version "${step.tool_version}"`,
        semanticErrors,
      );
    }
    if (isRecord(step.in)) {
      for (const key of Object.keys(step.in)) {
        checkTodoLike(key, stepPath, `in: key "${key}"`, semanticErrors);
      }
    }
    for (const id of iterateStepOutIds(step.out)) {
      checkTodoLike(id, stepPath, `out: id "${id}"`, semanticErrors);
    }

    // Step input edges.
    for (const [inKey, inValue] of iterateStepInputEntries(step.in)) {
      for (const ref of extractSourceRefs(inValue)) {
        checkEdgeRef(
          ref,
          stepPath,
          `step input "${inKey}"`,
          stepIndex,
          inputLabels,
          topologyErrors,
          semanticErrors,
        );
      }
    }

    // Recurse into draft subworkflows.
    if (isRecord(step.run) && step.run.class === DRAFT_CLASS) {
      walkDraftValidation(step.run, stepPath, topologyErrors, semanticErrors, warnings);
    }
  }
}

function checkTodoLike(
  value: string,
  path: StepPath,
  context: string,
  semanticErrors: DraftValidationDiagnostic[],
): void {
  if (TODO_LIKE.test(value) && !TODO_SENTINEL_PATTERN.test(value)) {
    semanticErrors.push({
      path,
      message: `${context} is TODO-shaped but malformed (must match ${TODO_SENTINEL_PATTERN.source})`,
    });
  }
}

interface StepIndexEntry {
  outPorts: Set<string>;
}

function buildStepIndex(steps: unknown): Map<string, StepIndexEntry> {
  const index = new Map<string, StepIndexEntry>();
  for (const [label, step] of iterateSteps(steps)) {
    if (!isRecord(step)) continue;
    const outPorts = new Set<string>(iterateStepOutIds(step.out));
    index.set(label, { outPorts });
  }
  return index;
}

function checkEdgeRef(
  ref: string,
  path: StepPath,
  context: string,
  stepIndex: Map<string, StepIndexEntry>,
  inputLabels: Set<string>,
  topologyErrors: DraftValidationDiagnostic[],
  semanticErrors: DraftValidationDiagnostic[],
): void {
  checkTodoLike(ref, path, `${context} source "${ref}"`, semanticErrors);
  const slash = ref.indexOf("/");
  if (slash < 0) {
    if (!inputLabels.has(ref)) {
      topologyErrors.push({
        path,
        message: `${context} source "${ref}" does not match any declared workflow input`,
      });
    }
    return;
  }
  const stepLabel = ref.slice(0, slash);
  const port = ref.slice(slash + 1);
  const entry = stepIndex.get(stepLabel);
  if (entry == null) {
    topologyErrors.push({
      path,
      message: `${context} source "${ref}" references unknown step "${stepLabel}"`,
    });
    return;
  }
  if (!entry.outPorts.has(port)) {
    topologyErrors.push({
      path,
      message: `${context} source "${ref}" references unknown port "${port}" on step "${stepLabel}"`,
    });
  }
}

function* iterateStepInputEntries(input: unknown): Iterable<[string, unknown]> {
  if (Array.isArray(input)) {
    for (const entry of input) {
      if (isRecord(entry) && typeof entry.id === "string") {
        yield [entry.id, entry];
      }
    }
  } else if (isRecord(input)) {
    for (const [key, value] of Object.entries(input)) {
      yield [key, value];
    }
  }
}

function extractSourceRefs(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) {
    return value.flatMap(extractSourceRefs);
  }
  if (isRecord(value)) {
    if (value.source != null) return extractSourceRefs(value.source);
    // Step inputs without a source: are not an edge (e.g. `default:` only entries).
    return [];
  }
  return [];
}

function iterateMapOrArrayLabeled(value: unknown): Iterable<[string, unknown]> {
  return iterateOutputs(value);
}

function formatTodoLocation(loc: TodoLocation): string {
  switch (loc.kind) {
    case "tool_id":
    case "tool_version":
      return loc.kind;
    case "in_key":
      return `in.${loc.key}`;
    case "out_id":
      return `out.${loc.id}`;
    case "output_source":
      return `outputs.${loc.output_label} (port ${loc.port})`;
  }
}
