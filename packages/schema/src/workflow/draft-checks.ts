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

export const TODO_SENTINEL_PATTERN = /^TODO(_[a-zA-Z0-9_]+)?$/;
// Heuristic for TODO-shaped strings — flags malformed sentinels (TODO-foo,
// TODOfoo, TODO_) that the canonical pattern misses. Mixed-case suffixes
// (TODO_Trimmed, TODO_TRIMMED) are valid sentinels.
// Anchored: only TODO followed by `_`, `-`, or end-of-string counts; this
// avoids false positives on unrelated identifiers that happen to start with
// TODO (e.g. TODOLIST, TODONE).
const TODO_LIKE = /^TODO([_-]|$)/;

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
 *
 * Note: this survey is step-focused — it intentionally does NOT report
 * top-level `_plan_*` fields on a draft workflow root. Those are flagged
 * by `validateDraft` (a rules-focused walker); `detectDraft` exists to
 * drive `nextDraftStep` / `extractConcreteSubset`, which only act on
 * per-step state.
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
  // For inner draft subworkflows (recursive call), `prefix` is the path to
  // reach this workflow (i.e. the outer step's path); inner outputs collect
  // at that prefix. For the outermost call `prefix` is [], so outer outputs
  // collect at path [].
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
  // Use the shared iterator so dict-form (`in: { TODO_x: ... }`) and list-form
  // (`in: [{ id: TODO_x, source: ... }]`) draft inputs are covered uniformly.
  for (const [key] of iterateStepInputEntries(step.in)) {
    if (isTodoSentinel(key)) {
      todos.push({ path, location: { kind: "in_key", key }, sentinel: key });
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
  // Plan fields belong on individual steps, never at a draft root — applies
  // to the outer document AND any nested draft subworkflow root reached via
  // recursion below.
  for (const field of PLAN_FIELDS) {
    const value = workflow[field];
    if (typeof value === "string" && value.length > 0) {
      warnings.push({
        path: prefix,
        message: `top-level \`${field}\` is not part of the draft contract; planning fields belong on individual steps`,
      });
    }
  }

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

    // _plan_* on a fully-resolved tool step is a contract violation: planning
    // context must be cleaned up before the step is treated as ready. Non-tool
    // steps (subworkflow / pause / pick_value) are allowed in v1 — the locked
    // decision keeps modeling simple until usage shows we need to tighten.
    if (isToolStep(step) && !stepHasAnyTodo(step)) {
      const planFieldsPresent = PLAN_FIELDS.filter(
        (f) => typeof step[f] === "string" && (step[f] as string).length > 0,
      );
      if (planFieldsPresent.length > 0) {
        semanticErrors.push({
          path: stepPath,
          message: `tool step has no TODO sentinels but still carries planning fields (${planFieldsPresent.join(", ")}); strip planning state before treating the step as resolved`,
        });
      }
    }

    // Recurse into draft subworkflows.
    if (isRecord(step.run) && step.run.class === DRAFT_CLASS) {
      walkDraftValidation(step.run, stepPath, topologyErrors, semanticErrors, warnings);
    }
  }
}

function stepHasAnyTodo(step: Record<string, unknown>): boolean {
  if (isTodoSentinel(step.tool_id)) return true;
  if (isTodoSentinel(step.tool_version)) return true;
  for (const [key] of iterateStepInputEntries(step.in)) {
    if (isTodoSentinel(key)) return true;
  }
  for (const id of iterateStepOutIds(step.out)) {
    if (isTodoSentinel(id)) return true;
  }
  return false;
}

function isToolStep(step: Record<string, unknown>): boolean {
  return step.type == null || step.type === "tool";
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

// -----------------------------------------------------------------------------
// nextDraftStep
// -----------------------------------------------------------------------------

export type NextStepResult = { draft: false } | { draft: true; step: StepPath; work: string[] };

/**
 * Pick the next step a downstream agent should work on. Pure function;
 * idempotent — same input → same output, byte-for-byte.
 *
 * Walks steps in topological order (steps with no draft-step source deps
 * first), tie-breaking by alphabetical step label. The first step that
 * carries any TODO sentinel or `_plan_*` field is returned with a
 * prompt-shaped `work[]` array. Subworkflows (draft inner `run:`) are
 * descended only after their outer step is itself fully concrete.
 *
 * Returns `{ draft: false }` when the workflow has no remaining work
 * (this includes non-draft documents — there is nothing to do).
 */
export function nextDraftStep(workflow: unknown): NextStepResult {
  if (!isRecord(workflow) || workflow.class !== DRAFT_CLASS) {
    return { draft: false };
  }
  return nextDraftStepIn(workflow, []);
}

function nextDraftStepIn(workflow: Record<string, unknown>, prefix: StepPath): NextStepResult {
  const ordered = topoOrderedSteps(workflow.steps);
  const outputRefs = collectOutputRefs(workflow.outputs);

  for (const [label, step] of ordered) {
    if (!isRecord(step)) continue;
    const stepPath = [...prefix, label];

    const work = stepWorkItems(step, label, outputRefs);
    if (work.length > 0) {
      return { draft: true, step: stepPath, work };
    }

    // Step is fully concrete + carries no _plan_*. If it's a draft
    // subworkflow with work inside, drill in.
    if (isRecord(step.run) && step.run.class === DRAFT_CLASS) {
      const inner = nextDraftStepIn(step.run, stepPath);
      if (inner.draft) return inner;
    }
  }

  return { draft: false };
}

/**
 * Topological order of steps in this workflow. Tie-break by label
 * alphabetically. Steps that depend on a missing or non-step source
 * (e.g. workflow input refs) are level 0.
 *
 * Returns `[label, step]` tuples preserving the iteration shape that
 * iterateSteps would have yielded.
 */
function topoOrderedSteps(steps: unknown): Array<[string, unknown]> {
  const entries: Array<[string, unknown]> = [];
  const stepLabels = new Set<string>();
  for (const entry of iterateSteps(steps)) {
    entries.push(entry);
    stepLabels.add(entry[0]);
  }

  // step label -> in-degree count (only counting deps on other declared steps)
  const inDegree = new Map<string, number>();
  const deps = new Map<string, Set<string>>();
  for (const [label, step] of entries) {
    if (!isRecord(step)) {
      inDegree.set(label, 0);
      deps.set(label, new Set());
      continue;
    }
    const seen = new Set<string>();
    for (const [, inValue] of iterateStepInputEntries(step.in)) {
      for (const ref of extractSourceRefs(inValue)) {
        const slash = ref.indexOf("/");
        if (slash < 0) continue;
        const depLabel = ref.slice(0, slash);
        if (depLabel !== label && stepLabels.has(depLabel)) {
          seen.add(depLabel);
        }
      }
    }
    inDegree.set(label, seen.size);
    deps.set(label, seen);
  }

  // Stable: process levels by alphabetical label order.
  const ordered: Array<[string, unknown]> = [];
  const byLabel = new Map(entries);
  const remaining = new Set(entries.map(([l]) => l));
  while (remaining.size > 0) {
    const ready = [...remaining].filter((l) => (inDegree.get(l) ?? 0) === 0).sort();
    if (ready.length === 0) {
      // Cycle (or unresolvable refs). Drain the rest in alphabetical order
      // so the function stays total — validateDraft is responsible for
      // surfacing cycle/dangling-edge errors separately.
      for (const label of [...remaining].sort()) {
        ordered.push([label, byLabel.get(label)]);
      }
      break;
    }
    for (const label of ready) {
      ordered.push([label, byLabel.get(label)]);
      remaining.delete(label);
      for (const [other, otherDeps] of deps) {
        if (otherDeps.has(label)) {
          otherDeps.delete(label);
          inDegree.set(other, (inDegree.get(other) ?? 0) - 1);
        }
      }
    }
  }
  return ordered;
}

interface OutputRefIndex {
  /** stepLabel -> port -> set of workflow output labels referencing it. */
  byStepPort: Map<string, Map<string, Set<string>>>;
}

function collectOutputRefs(outputs: unknown): OutputRefIndex {
  const byStepPort = new Map<string, Map<string, Set<string>>>();
  for (const [label, output] of iterateOutputs(outputs)) {
    const ref = readOutputSource(output);
    if (ref == null) continue;
    const [stepLabel, port] = splitSourceRef(ref);
    if (port == null) continue;
    let perPort = byStepPort.get(stepLabel);
    if (perPort == null) {
      perPort = new Map();
      byStepPort.set(stepLabel, perPort);
    }
    let set = perPort.get(port);
    if (set == null) {
      set = new Set();
      perPort.set(port, set);
    }
    set.add(label);
  }
  return { byStepPort };
}

function stepWorkItems(
  step: Record<string, unknown>,
  stepLabel: string,
  outputRefs: OutputRefIndex,
): string[] {
  const work: string[] = [];

  if (isTodoSentinel(step.tool_id)) {
    work.push("TODO[tool_id]: pick a Galaxy Tool Shed wrapper for this step");
  }
  if (isTodoSentinel(step.tool_version)) {
    work.push("TODO[tool_version]: pick the wrapper version");
  }

  if (isRecord(step.in)) {
    for (const key of Object.keys(step.in)) {
      if (!isTodoSentinel(key)) continue;
      const hint = sentinelHint(key);
      const hintFragment = hint != null ? ` (semantic hint: '${hint}')` : "";
      work.push(`TODO[in.${key}]: assign the real wrapper input port name${hintFragment}`);
    }
  }

  const stepOutputRefs = outputRefs.byStepPort.get(stepLabel);
  for (const id of iterateStepOutIds(step.out)) {
    if (!isTodoSentinel(id)) continue;
    const hint = sentinelHint(id);
    const refs = stepOutputRefs?.get(id);
    const parts: string[] = [];
    if (hint != null) parts.push(`semantic hint: '${hint}'`);
    if (refs != null && refs.size > 0) {
      const labels = [...refs].sort();
      const refStr = labels.map((l) => `'${l}'`).join(", ");
      const word = labels.length === 1 ? "output" : "outputs";
      parts.push(`referenced by workflow ${word} ${refStr}`);
    }
    const hintFragment = parts.length > 0 ? ` (${parts.join("; ")})` : "";
    work.push(`TODO[out.${id}]: assign the real wrapper output port name${hintFragment}`);
  }

  for (const field of PLAN_FIELDS) {
    const value = step[field];
    if (typeof value === "string" && value.length > 0) {
      work.push(`${field}: ${value.trim()}`);
    }
  }

  return work;
}

function sentinelHint(sentinel: string): string | null {
  if (sentinel === "TODO") return null;
  return sentinel.slice("TODO_".length);
}

// -----------------------------------------------------------------------------
// extractConcreteSubset
// -----------------------------------------------------------------------------

export type DropReason =
  | { kind: "step_has_todo"; locations: TodoLocation[] }
  | { kind: "step_has_plan_field"; fields: PlanField[] }
  | { kind: "cascade"; depends_on: StepPath[] };

export interface DroppedStep {
  path: StepPath;
  reason: DropReason;
}

export interface DroppedOutput {
  /**
   * Step path of the workflow the output lives in. `[]` for the top-level
   * document; `[outerStep, ...]` for inner subworkflow outputs.
   */
  path: StepPath;
  label: string;
  reason: DropReason;
}

export interface RewrittenStepInput {
  path: StepPath;
  in_key: string;
  /** Dropped step/port refs removed from this input's `source:`. */
  removed_refs: string[];
  /** Surviving step/port refs after the rewrite. Empty when only a `default:` keeps the entry alive. */
  surviving_refs: string[];
}

export interface ExtractResult {
  /**
   * Trimmed workflow dict. Still carries `class: GalaxyWorkflowDraft` —
   * promoting to `GalaxyWorkflow` is the CLI command's call, not B's.
   * `_plan_*` fields are preserved verbatim (including top-level fields and
   * any survivor steps — though by construction survivor steps never have
   * `_plan_*`, since carrying one is itself a drop trigger). Stripping lives
   * in the `clean` module (E).
   */
  workflow: unknown;
  /**
   * Dropped steps across the (sub)workflow tree. Ordering within a single
   * workflow level: by cascade round (round 0 = direct TODO/_plan_* drops;
   * rounds 1+ = cascade drops), then by alphabetical step-path within a
   * round. Across levels: a level's drops come first, then for each
   * surviving subworkflow step (in source iteration order) its drops
   * follow, recursively. Cascade rounds are local to a workflow level — not
   * compared across nesting.
   *
   * `cascade.depends_on` paths point at the steps cited in the dead `in:`.
   * In the common case these appear in `dropped_steps` themselves; in the
   * subworkflow-port-loss case the cited path may be a *surviving* outer
   * subworkflow step whose inner workflow lost the referenced port — look
   * under that step's recursed inner drops for the underlying cause.
   */
  dropped_steps: DroppedStep[];
  /**
   * Workflow outputs dropped because their source step / port went away.
   * Carries `path` to distinguish top-level outputs (`path: []`) from inner
   * subworkflow outputs (`path: [outerStep, ...]`). Ordered alphabetically
   * by label within a level; across levels, top-level first, then per
   * surviving subworkflow step in iteration order.
   */
  dropped_outputs: DroppedOutput[];
  /**
   * Per-input rewrites where the source survived in part. Two cases:
   *   - Multi-source input lost some refs but kept others (rewritten to the
   *     surviving subset; string form if 1 left, list form if >1).
   *   - Single-source input lost its only ref but the input has a `default:`
   *     so the entry stays alive — `surviving_refs` is empty, the rewritten
   *     value retains the default and drops the `source:` key.
   */
  rewritten_step_inputs: RewrittenStepInput[];
}

/**
 * Trim a draft workflow down to its concrete subset: drop any step that
 * carries a TODO sentinel or `_plan_*` field, then cascade-drop steps whose
 * `in:` becomes dead, then drop workflow outputs whose source went away.
 * Multi-source inputs are rewritten in place to the surviving ref subset.
 *
 * Pure + idempotent. The result always carries `class: GalaxyWorkflowDraft`
 * — promotion to concrete is a CLI-layer decision (E).
 *
 * Non-draft inputs pass through unchanged with empty drop / rewrite arrays.
 */
export function extractConcreteSubset(workflow: unknown): ExtractResult {
  if (!isRecord(workflow) || workflow.class !== DRAFT_CLASS) {
    return {
      workflow,
      dropped_steps: [],
      dropped_outputs: [],
      rewritten_step_inputs: [],
    };
  }

  const result = extractLevel(workflow, []);

  return {
    workflow: result.workflow,
    dropped_steps: result.droppedSteps.map(({ path, reason }) => ({ path, reason })),
    dropped_outputs: result.droppedOutputs,
    rewritten_step_inputs: result.rewrittenStepInputs,
  };
}

interface InternalDroppedStep extends DroppedStep {
  round: number;
}

interface ExtractLevelResult {
  workflow: Record<string, unknown>;
  droppedSteps: InternalDroppedStep[];
  droppedOutputs: DroppedOutput[];
  rewrittenStepInputs: RewrittenStepInput[];
  /** Surviving step-label -> set of surviving output port labels. */
  livePorts: Map<string, Set<string>>;
}

function extractLevel(workflow: Record<string, unknown>, prefix: StepPath): ExtractLevelResult {
  // Collect step entries in original iteration order. Same shape as
  // iterateSteps so we keep dict-form / list-form distinguishable later.
  const stepEntries: Array<[string, Record<string, unknown>]> = [];
  for (const [label, step] of iterateSteps(workflow.steps)) {
    if (isRecord(step)) stepEntries.push([label, step]);
  }
  const stepLabels = new Set(stepEntries.map(([l]) => l));

  // Round 0: directly-drafty steps.
  const drops = new Map<string, InternalDroppedStep>();
  for (const [label, step] of stepEntries) {
    const reason = directDropReason(step);
    if (reason != null) {
      drops.set(label, { path: [...prefix, label], reason, round: 0 });
    }
  }

  // Recurse into surviving subworkflow steps (inline draft `run:` only).
  // String-form `run:` and concrete (`class: GalaxyWorkflow`) `run:` are
  // opaque — no descent.
  const innerResults = new Map<string, ExtractLevelResult>();
  for (const [label, step] of stepEntries) {
    if (drops.has(label)) continue;
    const innerWf = step.run;
    if (isDraftWorkflow(innerWf)) {
      const sub = extractLevel(innerWf as Record<string, unknown>, [...prefix, label]);
      innerResults.set(label, sub);
    }
  }

  // Cascade rounds.
  let round = 1;
  while (true) {
    const livePorts = computeLivePorts(stepEntries, drops, innerResults);
    let changed = false;
    for (const [label, step] of stepEntries) {
      if (drops.has(label)) continue;
      const cascade = checkStepCascade(step, prefix, drops, livePorts, stepLabels);
      if (cascade != null) {
        drops.set(label, {
          path: [...prefix, label],
          reason: { kind: "cascade", depends_on: cascade.depsOnDropped },
          round,
        });
        changed = true;
      }
    }
    if (!changed) break;
    round++;
  }

  // Final live ports after all drops settled.
  const livePorts = computeLivePorts(stepEntries, drops, innerResults);

  // Compute rewrites for surviving steps.
  const rewrittenStepInputs: RewrittenStepInput[] = [];
  for (const [label, step] of stepEntries) {
    if (drops.has(label)) continue;
    for (const rewrite of computeInputRewrites(step, [...prefix, label], drops, livePorts)) {
      rewrittenStepInputs.push(rewrite);
    }
  }

  // Build the trimmed workflow dict; collect this level's output drops.
  const trimmed = trimWorkflow(workflow, stepEntries, drops, innerResults, livePorts, prefix);

  // Sort this level's step drops: by round, then alphabetical step-path.
  const levelDrops: InternalDroppedStep[] = [...drops.values()];
  levelDrops.sort((a, b) => {
    if (a.round !== b.round) return a.round - b.round;
    return pathKey(a.path).localeCompare(pathKey(b.path));
  });

  // Concatenate inner-level results in source iteration order. Each inner
  // level is already sorted by its own recursive call; we don't re-sort
  // across levels (cascade rounds are not comparable across nesting).
  const droppedSteps: InternalDroppedStep[] = [...levelDrops];
  const droppedOutputs: DroppedOutput[] = [...trimmed.droppedOutputs];
  for (const [label, inner] of innerResults) {
    if (drops.has(label)) continue;
    droppedSteps.push(...inner.droppedSteps);
    droppedOutputs.push(...inner.droppedOutputs);
    rewrittenStepInputs.push(...inner.rewrittenStepInputs);
  }

  return {
    workflow: trimmed.workflow,
    droppedSteps,
    droppedOutputs,
    rewrittenStepInputs,
    livePorts,
  };
}

/** TODO sentinels first, then plan fields; mirrors the planning ordering. */
function directDropReason(step: Record<string, unknown>): DropReason | null {
  const locations: TodoLocation[] = [];
  if (isTodoSentinel(step.tool_id)) locations.push({ kind: "tool_id" });
  if (isTodoSentinel(step.tool_version)) locations.push({ kind: "tool_version" });
  for (const [key] of iterateStepInputEntries(step.in)) {
    if (isTodoSentinel(key)) locations.push({ kind: "in_key", key });
  }
  for (const id of iterateStepOutIds(step.out)) {
    if (isTodoSentinel(id)) locations.push({ kind: "out_id", id });
  }
  if (locations.length > 0) return { kind: "step_has_todo", locations };

  const fields: PlanField[] = [];
  for (const field of PLAN_FIELDS) {
    const value = step[field];
    if (typeof value === "string" && value.length > 0) fields.push(field);
  }
  if (fields.length > 0) return { kind: "step_has_plan_field", fields };
  return null;
}

/**
 * For each surviving step, compute its currently-live output ports:
 *   - Non-subworkflow steps: all declared `out:` ids.
 *   - Inline-draft subworkflow steps: keys of the recursed inner workflow's
 *     surviving outputs (so outer refs that referenced now-dropped inner
 *     outputs evaluate as dead).
 *   - String-form `run:` / concrete-class `run:`: opaque; all declared
 *     `out:` ids are live.
 */
function computeLivePorts(
  stepEntries: Array<[string, Record<string, unknown>]>,
  drops: Map<string, InternalDroppedStep>,
  innerResults: Map<string, ExtractLevelResult>,
): Map<string, Set<string>> {
  const livePorts = new Map<string, Set<string>>();
  for (const [label, step] of stepEntries) {
    if (drops.has(label)) {
      livePorts.set(label, new Set());
      continue;
    }
    const inner = innerResults.get(label);
    if (inner != null) {
      const surviving = new Set<string>();
      for (const [outLabel] of iterateOutputs(inner.workflow.outputs)) {
        surviving.add(outLabel);
      }
      livePorts.set(label, surviving);
    } else {
      livePorts.set(label, new Set(iterateStepOutIds(step.out)));
    }
  }
  return livePorts;
}

interface CascadeOutcome {
  depsOnDropped: StepPath[];
}

function checkStepCascade(
  step: Record<string, unknown>,
  prefix: StepPath,
  drops: Map<string, InternalDroppedStep>,
  livePorts: Map<string, Set<string>>,
  stepLabels: Set<string>,
): CascadeOutcome | null {
  const depsOnDropped = new Map<string, StepPath>();
  let cascade = false;
  for (const [, inValue] of iterateStepInputEntries(step.in)) {
    const refs = extractSourceRefs(inValue);
    if (refs.length === 0) continue;
    let anyAlive = false;
    const localDeps: Array<[string, StepPath]> = [];
    for (const ref of refs) {
      const [refStep, refPort] = splitSourceRef(ref);
      if (refPort == null) {
        // Workflow input ref — always alive (workflow inputs are preserved verbatim).
        anyAlive = true;
        continue;
      }
      if (!stepLabels.has(refStep)) {
        // Dangling ref — validateDraft owns the diagnostic; treat as alive
        // here so extract doesn't double-fail on the same issue.
        anyAlive = true;
        continue;
      }
      const drop = drops.get(refStep);
      if (drop != null) {
        localDeps.push([refStep, drop.path]);
        continue;
      }
      const ports = livePorts.get(refStep);
      if (ports == null || !ports.has(refPort)) {
        // Step survives but the port doesn't (inner-workflow shrink).
        localDeps.push([refStep, [...prefix, refStep]]);
        continue;
      }
      anyAlive = true;
    }
    if (!anyAlive) {
      if (inputHasDefault(inValue)) continue; // default fallback — not dead
      cascade = true;
      for (const [key, path] of localDeps) {
        if (!depsOnDropped.has(key)) depsOnDropped.set(key, path);
      }
    }
  }
  if (!cascade) return null;
  const paths = [...depsOnDropped.values()].sort((a, b) => pathKey(a).localeCompare(pathKey(b)));
  return { depsOnDropped: paths };
}

function inputHasDefault(value: unknown): boolean {
  if (isRecord(value) && "default" in value) return true;
  return false;
}

interface InputSourceShape {
  /** Original source refs, in order. */
  refs: string[];
  /** True iff the value is a dict carrying a `default:` field. */
  hasDefault: boolean;
  /** Carrier shape for emitting the rewrite back. */
  carrier:
    | { kind: "string" }
    | { kind: "object_source_string"; original: Record<string, unknown> }
    | { kind: "object_source_list"; original: Record<string, unknown> }
    | { kind: "list_of_refs" }
    | { kind: "object_no_source"; original: Record<string, unknown> };
}

function readInputShape(value: unknown): InputSourceShape | null {
  if (typeof value === "string") {
    return { refs: [value], hasDefault: false, carrier: { kind: "string" } };
  }
  if (Array.isArray(value)) {
    // Bare list of refs / sub-objects: `in: { x: ["a/out", "b/out"] }` or
    // `in: { x: [{ source: "a/out" }, "b/out"] }`. No defaults at this level.
    const refs: string[] = [];
    for (const entry of value) {
      if (typeof entry === "string") refs.push(entry);
      else if (isRecord(entry) && typeof entry.source === "string") refs.push(entry.source);
      else if (isRecord(entry) && Array.isArray(entry.source)) {
        for (const s of entry.source) if (typeof s === "string") refs.push(s);
      }
    }
    return { refs, hasDefault: false, carrier: { kind: "list_of_refs" } };
  }
  if (isRecord(value)) {
    const hasDefault = "default" in value;
    const src = value.source;
    if (typeof src === "string") {
      return {
        refs: [src],
        hasDefault,
        carrier: { kind: "object_source_string", original: value },
      };
    }
    if (Array.isArray(src)) {
      const refs = src.filter((s): s is string => typeof s === "string");
      return {
        refs,
        hasDefault,
        carrier: { kind: "object_source_list", original: value },
      };
    }
    return { refs: [], hasDefault, carrier: { kind: "object_no_source", original: value } };
  }
  return null;
}

function computeInputRewrites(
  step: Record<string, unknown>,
  stepPath: StepPath,
  drops: Map<string, InternalDroppedStep>,
  livePorts: Map<string, Set<string>>,
): RewrittenStepInput[] {
  const out: RewrittenStepInput[] = [];
  for (const [inKey, value] of iterateStepInputEntries(step.in)) {
    const shape = readInputShape(value);
    if (shape == null || shape.refs.length === 0) continue;
    const removed: string[] = [];
    const surviving: string[] = [];
    for (const ref of shape.refs) {
      if (refIsDead(ref, drops, livePorts)) removed.push(ref);
      else surviving.push(ref);
    }
    if (removed.length === 0) continue;
    out.push({ path: stepPath, in_key: inKey, removed_refs: removed, surviving_refs: surviving });
  }
  return out;
}

function refIsDead(
  ref: string,
  drops: Map<string, InternalDroppedStep>,
  livePorts: Map<string, Set<string>>,
): boolean {
  const [refStep, refPort] = splitSourceRef(ref);
  if (refPort == null) return false;
  if (drops.has(refStep)) return true;
  const ports = livePorts.get(refStep);
  // Unknown step → defer to validateDraft; treat as live here.
  if (ports == null) return false;
  return !ports.has(refPort);
}

interface TrimResult {
  workflow: Record<string, unknown>;
  droppedOutputs: DroppedOutput[];
}

function trimWorkflow(
  workflow: Record<string, unknown>,
  stepEntries: Array<[string, Record<string, unknown>]>,
  drops: Map<string, InternalDroppedStep>,
  innerResults: Map<string, ExtractLevelResult>,
  livePorts: Map<string, Set<string>>,
  prefix: StepPath,
): TrimResult {
  // Iterate steps in source order; replace dropped + inner-shrunk inline; preserve list/dict shape.
  const trimmedSteps = trimStepsContainer(workflow.steps, drops, innerResults, livePorts);
  const trimmedOutputsResult = trimOutputsContainer(workflow.outputs, drops, livePorts, prefix);

  // Build the result dict — preserve key iteration order from the source.
  const trimmed: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(workflow)) {
    if (k === "steps") trimmed[k] = trimmedSteps;
    else if (k === "outputs") trimmed[k] = trimmedOutputsResult.outputs;
    else trimmed[k] = v;
  }
  // If the source had no `outputs:` key originally, don't synthesize one.
  // (Object.entries above handles that — the key only appears if it existed.)

  // Always carry the draft class — the caller may flip later.
  trimmed.class = DRAFT_CLASS;

  return { workflow: trimmed, droppedOutputs: trimmedOutputsResult.droppedOutputs };
}

function trimStepsContainer(
  steps: unknown,
  drops: Map<string, InternalDroppedStep>,
  innerResults: Map<string, ExtractLevelResult>,
  livePorts: Map<string, Set<string>>,
): unknown {
  if (Array.isArray(steps)) {
    const out: unknown[] = [];
    for (const entry of steps) {
      if (!isRecord(entry)) continue;
      const label =
        typeof entry.label === "string"
          ? entry.label
          : typeof entry.id === "string"
            ? entry.id
            : "";
      if (drops.has(label)) continue;
      out.push(trimStep(entry, label, drops, innerResults, livePorts));
    }
    return out;
  }
  if (isRecord(steps)) {
    const out: Record<string, unknown> = {};
    for (const [label, step] of Object.entries(steps)) {
      if (drops.has(label)) continue;
      if (!isRecord(step)) {
        out[label] = step;
        continue;
      }
      out[label] = trimStep(step, label, drops, innerResults, livePorts);
    }
    return out;
  }
  return steps;
}

function trimStep(
  step: Record<string, unknown>,
  label: string,
  drops: Map<string, InternalDroppedStep>,
  innerResults: Map<string, ExtractLevelResult>,
  livePorts: Map<string, Set<string>>,
): Record<string, unknown> {
  const trimmed: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(step)) {
    if (k === "in") {
      trimmed[k] = rewriteStepIn(v, drops, livePorts);
    } else if (k === "run" && innerResults.has(label)) {
      trimmed[k] = innerResults.get(label)!.workflow;
    } else {
      trimmed[k] = v;
    }
  }
  return trimmed;
}

function rewriteStepIn(
  input: unknown,
  drops: Map<string, InternalDroppedStep>,
  livePorts: Map<string, Set<string>>,
): unknown {
  if (Array.isArray(input)) {
    return input.map((entry) => {
      if (!isRecord(entry)) return entry;
      return rewriteStepInputEntry(entry, drops, livePorts);
    });
  }
  if (isRecord(input)) {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      out[key] = rewriteStepInputValue(value, drops, livePorts);
    }
    return out;
  }
  return input;
}

function rewriteStepInputEntry(
  entry: Record<string, unknown>,
  drops: Map<string, InternalDroppedStep>,
  livePorts: Map<string, Set<string>>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(entry)) {
    if (k === "source") {
      const rewritten = rewriteSourceField(v, drops, livePorts);
      if (rewritten === DROP_SOURCE_KEY) continue;
      out[k] = rewritten;
    } else {
      out[k] = v;
    }
  }
  return out;
}

function rewriteStepInputValue(
  value: unknown,
  drops: Map<string, InternalDroppedStep>,
  livePorts: Map<string, Set<string>>,
): unknown {
  const shape = readInputShape(value);
  if (shape == null) return value;
  if (shape.refs.length === 0) return value;
  const surviving = shape.refs.filter((r) => !refIsDead(r, drops, livePorts));
  if (surviving.length === shape.refs.length) return value;

  switch (shape.carrier.kind) {
    case "string": {
      // Single-ref string form. If it survives, value unchanged.
      // If dead and dict-style with default isn't applicable (string form has no default),
      // the consuming step would have cascaded — we shouldn't be here.
      // If we are here with 0 survivors and no default, return value untouched
      // (defensive — should be unreachable).
      return surviving.length > 0 ? surviving[0] : value;
    }
    case "object_source_string":
    case "object_source_list": {
      const original = shape.carrier.original;
      if (surviving.length === 0) {
        // default-fallback: drop source key, keep default + the rest.
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(original)) {
          if (k !== "source") out[k] = v;
        }
        return out;
      }
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(original)) {
        if (k === "source") out[k] = surviving.length === 1 ? surviving[0] : surviving;
        else out[k] = v;
      }
      return out;
    }
    case "list_of_refs": {
      if (surviving.length === 0) return value; // unreachable; would've cascaded
      if (surviving.length === 1) return surviving[0];
      return surviving;
    }
    case "object_no_source":
      return value;
  }
}

const DROP_SOURCE_KEY = Symbol("drop");

function rewriteSourceField(
  source: unknown,
  drops: Map<string, InternalDroppedStep>,
  livePorts: Map<string, Set<string>>,
): unknown | typeof DROP_SOURCE_KEY {
  if (typeof source === "string") {
    return refIsDead(source, drops, livePorts) ? DROP_SOURCE_KEY : source;
  }
  if (Array.isArray(source)) {
    const surviving = source.filter(
      (r): r is string => typeof r === "string" && !refIsDead(r, drops, livePorts),
    );
    if (surviving.length === 0) return DROP_SOURCE_KEY;
    if (surviving.length === 1) return surviving[0];
    return surviving;
  }
  return source;
}

interface TrimOutputsResult {
  outputs: unknown;
  droppedOutputs: DroppedOutput[];
}

function trimOutputsContainer(
  outputs: unknown,
  drops: Map<string, InternalDroppedStep>,
  livePorts: Map<string, Set<string>>,
  prefix: StepPath,
): TrimOutputsResult {
  const dropped: DroppedOutput[] = [];
  const keep = (label: string, value: unknown): boolean => {
    const ref = readOutputSource(value);
    if (ref == null) return true;
    if (!refIsDead(ref, drops, livePorts)) return true;
    const [refStep] = splitSourceRef(ref);
    const drop = drops.get(refStep);
    const reason: DropReason =
      drop != null
        ? { kind: "cascade", depends_on: [drop.path] }
        : { kind: "cascade", depends_on: [[...prefix, refStep]] };
    dropped.push({ path: prefix, label, reason });
    return false;
  };

  let trimmed: unknown;
  if (Array.isArray(outputs)) {
    const out: unknown[] = [];
    for (const entry of outputs) {
      const label = isRecord(entry) && typeof entry.id === "string" ? entry.id : "";
      if (keep(label, entry)) out.push(entry);
    }
    trimmed = out;
  } else if (isRecord(outputs)) {
    const out: Record<string, unknown> = {};
    for (const [label, value] of Object.entries(outputs)) {
      if (keep(label, value)) out[label] = value;
    }
    trimmed = out;
  } else {
    trimmed = outputs;
  }

  dropped.sort((a, b) => a.label.localeCompare(b.label));
  return { outputs: trimmed, droppedOutputs: dropped };
}

function pathKey(path: StepPath): string {
  return path.join("/");
}
