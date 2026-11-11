/**
 * Structural diff of two Format2 workflows (either may be a `GalaxyWorkflowDraft`).
 *
 * Port of `gxformat2.diff`; the shared cases live in `expectations/diff.yml`.
 * Steps match on their step key ({@link iterateSteps}). `_plan_*` fields never
 * count as changes. Only the top level is compared.
 */

import {
  isDraftWorkflow,
  iterateSteps,
  presentPlanFields,
  type PlanField,
} from "./draft-checks.js";
import {
  inferredStepType,
  normalizedFormat2,
  NormalizedFormat2StepOutputSchema,
  type NormalizedFormat2Input,
  type NormalizedFormat2Step,
} from "./normalized/format2.js";
import { resolveSourceReference } from "./normalized/labels.js";

const INPUT_FIELDS = [
  "type",
  "collection_type",
  "optional",
  "format",
  "default",
  "min",
  "max",
  "restrictions",
  "suggestions",
  "restrictOnConnections",
  "validators",
  "fields",
  "column_definitions",
] as const;
// A missing value for these input fields means this value.
const INPUT_FIELD_ABSENT_VALUES: Record<string, unknown> = {
  optional: false,
  restrictOnConnections: false,
};
// Lists of pydantic models in Python, whose dumps fill unset keys with null (an explicit null key is unset)
// or with these model defaults, which the TS schemas don't carry.
const INPUT_MODEL_DEFAULTS = new Map<string, Record<string, unknown>>([
  ["restrictions", {}],
  ["suggestions", {}],
  ["validators", { type: "regex" }],
  ["fields", { type: "File" }],
  ["column_definitions", { type: "string" }],
]);
// Declared `out` fields other than `id`; undeclared extras (e.g. `_plan_*`) are not actions.
const OUTPUT_ACTIONS = Object.keys(NormalizedFormat2StepOutputSchema.fields).filter(
  (field) => field !== "id",
);
const STATE_SEPARATOR = "|";
const INPUT_PORT = "output";

// --- Result shape -------------------------------------------------------------

/** A value that differs between BEFORE and AFTER. */
type PlanFields = Partial<Record<PlanField, string>>;

export interface ValueChange {
  before: unknown;
  after: unknown;
}

/** A state leaf that was added, removed or changed. */
export interface StateChange extends ValueChange {
  kind: "added" | "removed" | "changed";
}

/** Members only in AFTER (`added`) or only in BEFORE (`removed`), sorted. */
export interface SetChange {
  added: string[];
  removed: string[];
}

export interface InputsDiff {
  added: string[];
  removed: string[];
  changed: Record<string, Record<string, ValueChange>>;
}

export interface OutputsDiff {
  added: string[];
  removed: string[];
  changed: Record<string, ValueChange>;
}

/** An added or removed step, with its edges on the side it exists on. */
export interface StepSummary {
  label: string | null;
  type: string;
  tool_id: string | null;
  tool_version: string | null;
  plan_fields: PlanFields;
  upstream: string[];
  downstream: string[];
  workflow_outputs: string[];
  connections: string[];
}

/** A step on both sides whose fields, state, input defaults, output actions or edges differ. */
export interface StepChange {
  label: string | null;
  fields: Record<string, ValueChange>;
  state: Record<string, StateChange>;
  in_defaults: Record<string, ValueChange>;
  out_actions: Record<string, ValueChange>;
  connections_in: SetChange;
  connections_out: SetChange;
  upstream: SetChange;
  downstream: SetChange;
  plan_fields_before: PlanFields;
  plan_fields_after: PlanFields;
}

/**
 * Steps keyed by step key: added and changed in AFTER order, removed in BEFORE
 * order (integer-like keys iterate numerically in JS objects).
 */
export interface StepsDiff {
  added: Record<string, StepSummary>;
  removed: Record<string, StepSummary>;
  changed: Record<string, StepChange>;
}

/** Result of {@link diffWorkflows}; mirrors `gxformat2.diff.WorkflowDiff`. */
export interface WorkflowDiff {
  before_is_draft: boolean;
  after_is_draft: boolean;
  inputs: InputsDiff;
  outputs: OutputsDiff;
  steps: StepsDiff;
  unwired_inputs: string[];
  warnings: string[];
  /** Whether anything differs; `unwired_inputs` and `warnings` don't count. */
  has_changes: boolean;
}

// --- Workflow view ------------------------------------------------------------

/** A step key and port, or an input id with `port: null`. */
interface Ref {
  node: string;
  port: string | null;
}

interface Edge {
  source: Ref;
  target: string;
  targetPort: string;
}

interface Neighborhood {
  connectionsIn: Set<string>;
  connectionsOut: Set<string>;
  upstream: Set<string>;
  downstream: Set<string>;
}

/** One step reduced to the values the diff compares. */
interface StepView {
  fields: Map<string, unknown>;
  state: Map<string, unknown>;
  inDefaults: Map<string, unknown>;
  outActions: Map<string, Record<string, unknown>>;
  planFields: PlanFields;
}

/** One workflow reduced to what the diff compares; maps keep workflow order. */
interface Side {
  isDraft: boolean;
  inputs: Map<string, Map<string, unknown>>;
  outputs: Map<string, Ref | null>;
  steps: Map<string, StepView>;
  edges: Edge[];
  unlabeledSteps: string[];
}

function refText(ref: Ref | null): string | null {
  if (ref == null) return null;
  return ref.port == null ? ref.node : `${ref.node}/${ref.port}`;
}

function edgeText(edge: Edge): string {
  return `${refText(edge.source)} -> ${edge.target}/${edge.targetPort}`;
}

function isFromInput(edge: Edge): boolean {
  return edge.source.port == null;
}

function neighborhood(side: Side, key: string): Neighborhood {
  const edgesIn = side.edges.filter((edge) => edge.target === key);
  const edgesOut = side.edges.filter((edge) => edge.source.node === key && !isFromInput(edge));
  return {
    connectionsIn: new Set(edgesIn.map(edgeText)),
    connectionsOut: new Set(edgesOut.map(edgeText)),
    upstream: new Set(edgesIn.map((edge) => edge.source.node)),
    downstream: new Set(edgesOut.map((edge) => edge.target)),
  };
}

function outputsFrom(side: Side, key: string): string[] {
  return [...side.outputs].filter(([, ref]) => ref != null && ref.node === key).map(([id]) => id);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function loadWorkflow(workflow: unknown): Record<string, unknown> {
  if (!isRecord(workflow)) throw new TypeError("expected a Format2 workflow mapping");
  if (workflow.a_galaxy_workflow === "true") {
    throw new Error("diffWorkflows received a native Galaxy workflow; convert it to Format2 first");
  }
  if ("$graph" in workflow && !("class" in workflow)) {
    throw new Error("$graph documents are not supported by diffWorkflows");
  }
  return workflow;
}

function buildSide(raw: Record<string, unknown>): Side {
  const nf2 = normalizedFormat2(raw);
  const rawSteps = [...iterateSteps(raw)];
  const nf2Steps = nf2.steps as readonly NormalizedFormat2Step[];
  if (rawSteps.length !== nf2Steps.length) {
    throw new Error("could not align raw steps with normalized steps");
  }
  const listForm = Array.isArray(raw.steps);
  const inputIds = new Set(nf2.inputs.map((inp) => inp.id).filter((id) => id));
  const resolve = sourceResolver(rawSteps, nf2Steps, inputIds);

  const steps = new Map<string, StepView>();
  const edges: Edge[] = [];
  rawSteps.forEach(([key, rawStep], index) => {
    const step = nf2Steps[index];
    steps.set(key, stepView(step, rawStep));
    for (const stepInput of step.in) {
      if (stepInput.source == null || stepInput.id == null) continue;
      const sources = Array.isArray(stepInput.source) ? stepInput.source : [stepInput.source];
      for (const source of sources) {
        edges.push({ source: resolve(String(source)), target: key, targetPort: stepInput.id });
      }
    }
  });

  const inputs = new Map<string, Map<string, unknown>>();
  for (const inp of nf2.inputs) {
    if (inp.id) inputs.set(inp.id, inputFields(inp));
  }
  const outputs = new Map<string, Ref | null>();
  for (const output of nf2.outputs) {
    if (output.id == null) continue;
    outputs.set(output.id, output.outputSource == null ? null : resolve(output.outputSource));
  }
  return {
    isDraft: isDraftWorkflow(raw),
    inputs,
    outputs,
    steps,
    edges,
    unlabeledSteps: listForm
      ? rawSteps.filter(([, rawStep]) => !hasIdentity(rawStep)).map(([key]) => key)
      : [],
  };
}

function hasIdentity(rawStep: unknown): boolean {
  if (!isRecord(rawStep)) return false;
  return (["label", "id"] as const).some((field) => {
    const value = rawStep[field];
    return typeof value === "string" && value.length > 0;
  });
}

/** A step's own id: its raw `id` (TS normalization replaces a dict-form one with the key), else the normalized id. */
function stepId(rawStep: unknown, step: NormalizedFormat2Step): string {
  return isRecord(rawStep) && typeof rawStep.id === "string" ? rawStep.id : step.id;
}

/** Resolve a source to a step key and port, or an input id with no port; longest label first. */
function sourceResolver(
  rawSteps: Array<[string, unknown]>,
  nf2Steps: readonly NormalizedFormat2Step[],
  inputIds: Set<string>,
): (source: string) => Ref {
  const aliases = new Map<string, string>();
  const setDefault = (alias: string, key: string) => {
    if (!aliases.has(alias)) aliases.set(alias, key);
  };
  rawSteps.forEach(([key, rawStep], index) => {
    const step = nf2Steps[index];
    setDefault(stepId(rawStep, step), key);
    if (step.label) setDefault(step.label, key);
    aliases.set(key, key);
  });
  const knownLabels = new Set([...aliases.keys(), ...inputIds]);

  return (source: string): Ref => {
    const [label, port] = resolveSourceReference(source, knownLabels);
    // An input's only port is `output`; `<input>/output` means `<input>`.
    if (inputIds.has(label) && port === INPUT_PORT) return { node: label, port: null };
    return { node: aliases.get(label) ?? label, port };
  };
}

function inputFields(inp: NormalizedFormat2Input): Map<string, unknown> {
  const raw = inp as Record<string, unknown>;
  const fields = new Map<string, unknown>();
  for (const field of INPUT_FIELDS) {
    const value = raw[field] ?? INPUT_FIELD_ABSENT_VALUES[field] ?? null;
    const defaults = INPUT_MODEL_DEFAULTS.get(field);
    fields.set(
      field,
      defaults && Array.isArray(value)
        ? value.map((item) => withModelDefaults(item, defaults))
        : value,
    );
  }
  const format = fields.get("format");
  if (typeof format === "string") fields.set("format", [format]);
  return fields;
}

function withModelDefaults(item: unknown, defaults: Record<string, unknown>): unknown {
  if (!isRecord(item)) return item;
  return {
    ...defaults,
    ...Object.fromEntries(Object.entries(item).filter(([, value]) => value != null)),
  };
}

function stepView(step: NormalizedFormat2Step, rawStep: unknown): StepView {
  const raw = isRecord(rawStep) ? rawStep : {};
  const fields = new Map<string, unknown>([
    ["label", step.label ?? null],
    ["type", inferredStepType(step)],
    ["tool_id", step.tool_id ?? null],
    ["tool_version", step.tool_version ?? null],
    ["when", step.when ?? null],
    ["run", runReference(raw.run)],
  ]);
  const inDefaults = new Map<string, unknown>();
  for (const inp of step.in) {
    if (inp.id != null && inp.default != null) inDefaults.set(inp.id, inp.default);
  }
  const planFields: PlanFields = {};
  for (const field of presentPlanFields(raw)) planFields[field] = raw[field] as string;
  const state = step.state != null ? step.state : step.tool_state;
  return {
    fields,
    state: flattenState(state ?? {}),
    inDefaults,
    outActions: outActions(step),
    planFields,
  };
}

/** Leaf paths of a state dict, nested keys joined by `|`; lists and markers are leaves. */
function flattenState(
  value: unknown,
  prefix = "",
  flat = new Map<string, unknown>(),
): Map<string, unknown> {
  if (isRecord(value) && Object.keys(value).length > 0 && !("__class__" in value)) {
    for (const [key, child] of Object.entries(value)) {
      flattenState(child, prefix ? `${prefix}${STATE_SEPARATOR}${key}` : key, flat);
    }
  } else if (prefix) {
    flat.set(prefix, value);
  }
  return flat;
}

/** A linked run's URL or path, or its `@import`; `null` for inline runs. */
function runReference(run: unknown): string | Record<string, string> | null {
  if (typeof run === "string") return run;
  if (isRecord(run) && typeof run["@import"] === "string") return { "@import": run["@import"] };
  return null;
}

/** Python truthiness: `null`, `false`, `0`, `""`, `[]` and `{}` are falsy. */
function isTruthy(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (isRecord(value)) return Object.keys(value).length > 0;
  return Boolean(value);
}

/** Set output actions per declared `out` port; false and empty values mean no action. */
function outActions(step: NormalizedFormat2Step): Map<string, Record<string, unknown>> {
  const actions = new Map<string, Record<string, unknown>>();
  for (const out of step.out) {
    const raw = out as Record<string, unknown>;
    const set: Record<string, unknown> = {};
    for (const action of OUTPUT_ACTIONS) {
      if (isTruthy(raw[action])) set[action] = raw[action];
    }
    if (out.id != null && Object.keys(set).length > 0) actions.set(out.id, set);
  }
  return actions;
}

// --- Comparison ---------------------------------------------------------------

function canonical(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortKeys(value[key])]),
    );
  }
  return value ?? null;
}

/** Keys one side lacks or whose values differ, BEFORE keys first. */
function differingKeys(before: Map<string, unknown>, after: Map<string, unknown>): string[] {
  const keys = [...before.keys(), ...[...after.keys()].filter((key) => !before.has(key))];
  return keys.filter(
    (key) =>
      !before.has(key) ||
      !after.has(key) ||
      canonical(before.get(key)) !== canonical(after.get(key)),
  );
}

/** A record from entries; unlike assignment, `fromEntries` keeps a `__proto__` key as an own key. */
function keyed<T>(entries: Iterable<readonly [string, T]>): Record<string, T> {
  return Object.fromEntries(entries);
}

function valueChanges(
  before: Map<string, unknown>,
  after: Map<string, unknown>,
): Record<string, ValueChange> {
  return keyed(
    differingKeys(before, after).map((key) => [
      key,
      { before: before.get(key) ?? null, after: after.get(key) ?? null },
    ]),
  );
}

function stateChanges(
  before: Map<string, unknown>,
  after: Map<string, unknown>,
): Record<string, StateChange> {
  return keyed(
    differingKeys(before, after).map((path) => [
      path,
      {
        before: before.get(path) ?? null,
        after: after.get(path) ?? null,
        kind: !before.has(path) ? "added" : !after.has(path) ? "removed" : "changed",
      },
    ]),
  );
}

function setChange(before: Set<string>, after: Set<string>): SetChange {
  return {
    added: [...after].filter((member) => !before.has(member)).sort(),
    removed: [...before].filter((member) => !after.has(member)).sort(),
  };
}

function isEmptySetChange(change: SetChange): boolean {
  return change.added.length === 0 && change.removed.length === 0;
}

function onlyIn<T>(keys: Iterable<T>, other: { has(key: T): boolean }): T[] {
  return [...keys].filter((key) => !other.has(key));
}

function summary(side: Side, key: string): StepSummary {
  const view = side.steps.get(key)!;
  const edges = neighborhood(side, key);
  return {
    label: view.fields.get("label") as string | null,
    type: view.fields.get("type") as string,
    tool_id: view.fields.get("tool_id") as string | null,
    tool_version: view.fields.get("tool_version") as string | null,
    plan_fields: view.planFields,
    upstream: [...edges.upstream].sort(),
    downstream: [...edges.downstream].sort(),
    workflow_outputs: outputsFrom(side, key),
    connections: [...new Set([...edges.connectionsIn, ...edges.connectionsOut])].sort(),
  };
}

function stepChange(before: Side, after: Side, key: string): StepChange | null {
  const bView = before.steps.get(key)!;
  const aView = after.steps.get(key)!;
  const bEdges = neighborhood(before, key);
  const aEdges = neighborhood(after, key);
  const change: StepChange = {
    label: aView.fields.get("label") as string | null,
    fields: valueChanges(bView.fields, aView.fields),
    state: stateChanges(bView.state, aView.state),
    in_defaults: valueChanges(bView.inDefaults, aView.inDefaults),
    out_actions: valueChanges(bView.outActions, aView.outActions),
    connections_in: setChange(bEdges.connectionsIn, aEdges.connectionsIn),
    connections_out: setChange(bEdges.connectionsOut, aEdges.connectionsOut),
    upstream: setChange(bEdges.upstream, aEdges.upstream),
    downstream: setChange(bEdges.downstream, aEdges.downstream),
    plan_fields_before: bView.planFields,
    plan_fields_after: aView.planFields,
  };
  // upstream/downstream are node-level views of the port-level edges, so they never decide membership.
  const differs = [change.fields, change.state, change.in_defaults, change.out_actions].some(
    (section) => Object.keys(section).length > 0,
  );
  if (
    !differs &&
    isEmptySetChange(change.connections_in) &&
    isEmptySetChange(change.connections_out)
  ) {
    return null;
  }
  return change;
}

function sameRef(a: Ref | null, b: Ref | null): boolean {
  if (a == null || b == null) return a === b;
  return a.node === b.node && a.port === b.port;
}

// --- Diff ---------------------------------------------------------------------

/** Compare two parsed Format2 workflows; either may be a draft. */
export function diffWorkflows(before: unknown, after: unknown): WorkflowDiff {
  const bSide = buildSide(loadWorkflow(before));
  const aSide = buildSide(loadWorkflow(after));

  const inputChanges: Array<[string, Record<string, ValueChange>]> = [];
  for (const [inputId, bFields] of bSide.inputs) {
    const aFields = aSide.inputs.get(inputId);
    if (aFields == null) continue;
    const changed = valueChanges(bFields, aFields);
    if (Object.keys(changed).length > 0) inputChanges.push([inputId, changed]);
  }
  const inputs: InputsDiff = {
    added: onlyIn(aSide.inputs.keys(), bSide.inputs),
    removed: onlyIn(bSide.inputs.keys(), aSide.inputs),
    changed: keyed(inputChanges),
  };

  const outputChanges: Array<[string, ValueChange]> = [];
  // Refs compare structurally: step `a/b` and port `b` of step `a` render alike.
  for (const [outputId, ref] of bSide.outputs) {
    if (!aSide.outputs.has(outputId)) continue;
    const aRef = aSide.outputs.get(outputId)!;
    if (!sameRef(ref, aRef))
      outputChanges.push([outputId, { before: refText(ref), after: refText(aRef) }]);
  }
  const outputs: OutputsDiff = {
    added: onlyIn(aSide.outputs.keys(), bSide.outputs),
    removed: onlyIn(bSide.outputs.keys(), aSide.outputs),
    changed: keyed(outputChanges),
  };

  const stepChanges: Array<[string, StepChange]> = [];
  for (const key of aSide.steps.keys()) {
    if (!bSide.steps.has(key)) continue;
    const change = stepChange(bSide, aSide, key);
    if (change != null) stepChanges.push([key, change]);
  }
  const steps: StepsDiff = {
    added: keyed(onlyIn(aSide.steps.keys(), bSide.steps).map((key) => [key, summary(aSide, key)])),
    removed: keyed(
      onlyIn(bSide.steps.keys(), aSide.steps).map((key) => [key, summary(bSide, key)]),
    ),
    changed: keyed(stepChanges),
  };

  const fed = new Set(aSide.edges.filter(isFromInput).map((edge) => edge.source.node));
  const warnings: string[] = [];
  for (const [label, side] of [
    ["BEFORE", bSide],
    ["AFTER", aSide],
  ] as const) {
    if (side.unlabeledSteps.length > 0) {
      warnings.push(
        `${label} has unlabeled steps matched by position: ${side.unlabeledSteps.join(", ")}`,
      );
    }
  }
  const hasChanges = [inputs, outputs, steps].some(
    (section) =>
      Object.keys(section.added).length > 0 ||
      Object.keys(section.removed).length > 0 ||
      Object.keys(section.changed).length > 0,
  );
  return {
    before_is_draft: bSide.isDraft,
    after_is_draft: aSide.isDraft,
    inputs,
    outputs,
    steps,
    unwired_inputs: onlyIn(aSide.inputs.keys(), fed),
    warnings,
    has_changes: hasChanges,
  };
}

// --- Rendering ----------------------------------------------------------------

/** `JSON.stringify` with Python `json.dumps` separators (`", "`, `": "`). */
function pyJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(pyJson).join(", ")}]`;
  if (isRecord(value)) {
    const entries = Object.entries(value).map(
      ([key, child]) => `${JSON.stringify(key)}: ${pyJson(child)}`,
    );
    return `{${entries.join(", ")}}`;
  }
  return JSON.stringify(value ?? null);
}

function displayValue(value: unknown): string {
  if (value == null) return "(none)";
  return typeof value === "string" ? value : pyJson(value);
}

/** Like {@link displayValue}, but a present leaf shows `null` and `""` as such. */
function stateValue(value: unknown): string {
  return value == null || value === "" ? pyJson(value) : displayValue(value);
}

function stepHeading(key: string, label: string | null): string {
  return !label || label === key ? key : `${key} (${label})`;
}

function summaryLines(verb: string, key: string, step: StepSummary): string[] {
  const toolParts = [step.tool_id, step.tool_version].filter((part) => part);
  const tool = toolParts.length > 0 ? ` [${toolParts.join(" ")}]` : "";
  const lines = [`Step ${verb}: ${stepHeading(key, step.label)}${tool}`];
  for (const [name, members] of [
    ["upstream", step.upstream],
    ["downstream", step.downstream],
    ["workflow outputs", step.workflow_outputs],
  ] as const) {
    if (members.length > 0) lines.push(`    ${name}: ${members.join(", ")}`);
  }
  for (const field of Object.keys(step.plan_fields)) lines.push(`    has ${field}`);
  return lines;
}

function stateLine(path: string, change: StateChange): string {
  if (change.kind === "added") return `    state ${path}: added ${stateValue(change.after)}`;
  if (change.kind === "removed") {
    return `    state ${path}: removed (was ${stateValue(change.before)})`;
  }
  return `    state ${path}: ${stateValue(change.before)} -> ${stateValue(change.after)}`;
}

function changeLine(prefix: string, change: ValueChange): string {
  return `${prefix}: ${displayValue(change.before)} -> ${displayValue(change.after)}`;
}

function stepChangeLines(key: string, change: StepChange): string[] {
  const lines = [`Step changed: ${stepHeading(key, change.label)}`];
  for (const [field, v] of Object.entries(change.fields)) lines.push(changeLine(`    ${field}`, v));
  for (const [path, v] of Object.entries(change.state)) lines.push(stateLine(path, v));
  for (const [port, v] of Object.entries(change.in_defaults)) {
    lines.push(changeLine(`    in ${port} default`, v));
  }
  for (const [port, v] of Object.entries(change.out_actions)) {
    lines.push(changeLine(`    out ${port} actions`, v));
  }
  for (const edge of [...change.connections_in.removed, ...change.connections_out.removed]) {
    lines.push(`    - ${edge}`);
  }
  for (const edge of [...change.connections_in.added, ...change.connections_out.added]) {
    lines.push(`    + ${edge}`);
  }
  return lines;
}

/** Render a {@link WorkflowDiff} as plain text, as `gxformat2.diff.render_text` does. */
export function renderWorkflowDiff(diff: WorkflowDiff): string {
  const lines = diff.warnings.map((warning) => `warning: ${warning}`);
  if (!diff.has_changes) lines.push("No differences.");
  for (const [noun, section] of [
    ["Input", diff.inputs],
    ["Output", diff.outputs],
  ] as const) {
    for (const item of section.added) lines.push(`${noun} added: ${item}`);
    for (const item of section.removed) lines.push(`${noun} removed: ${item}`);
  }
  for (const [inputId, fields] of Object.entries(diff.inputs.changed)) {
    for (const [field, v] of Object.entries(fields)) {
      lines.push(changeLine(`Input changed: ${inputId} ${field}`, v));
    }
  }
  for (const [outputId, v] of Object.entries(diff.outputs.changed)) {
    lines.push(changeLine(`Output changed: ${outputId} source`, v));
  }
  for (const [key, step] of Object.entries(diff.steps.removed)) {
    lines.push(...summaryLines("removed", key, step));
  }
  for (const [key, step] of Object.entries(diff.steps.added)) {
    lines.push(...summaryLines("added", key, step));
  }
  for (const [key, change] of Object.entries(diff.steps.changed)) {
    lines.push(...stepChangeLines(key, change));
  }
  if (diff.unwired_inputs.length > 0) {
    lines.push(`AFTER inputs feeding no step: ${diff.unwired_inputs.join(", ")}`);
  }
  return lines.join("\n");
}
