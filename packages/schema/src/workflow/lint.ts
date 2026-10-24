/**
 * Workflow linting — structural checks and best-practice warnings.
 *
 * Port of gxformat2's lint.py. Emission primitives live in `linting.ts`
 * (LintContext / LintMessage / Linter base); rule classes in `lint-rules.ts`.
 */

import { normalizedFormat2 } from "./normalized/format2.js";
import { normalizedNative } from "./normalized/native.js";
import { ensureFormat2 } from "./normalized/ensure.js";
import type { NormalizedFormat2Workflow, NormalizedFormat2Step } from "./normalized/format2.js";
import type { NormalizedNativeWorkflow, NormalizedNativeStep } from "./normalized/native.js";
import { detectFormat } from "./detect-format.js";
import { LintContext, type LintResult } from "./linting.js";
import { format2InputStepType, nativeInputLabel, nativeStepLabel } from "./normalized/toNative.js";
import { resolveSourceReference } from "./normalized/labels.js";
import { nativeInputToFormat2Type } from "./normalized/toFormat2.js";
import { NativeStepKeyNotInteger, StepLabelNotUnique } from "./lint-rules.js";

export {
  LintContext,
  LintMessage,
  Linter,
  LEVEL_ERROR,
  LEVEL_WARN,
  type LintLevel,
  type LintResult,
  type LinterRef,
  type EmitOptions,
} from "./linting.js";

function toLintResult(ctx: LintContext): LintResult {
  return {
    errors: ctx.errors,
    warnings: ctx.warnings,
    error_count: ctx.errors.length,
    warn_count: ctx.warnings.length,
  };
}

// ---------------------------------------------------------------------------
// Shared lint helpers
// ---------------------------------------------------------------------------

function lintStepErrors(ctx: LintContext, errors: string | null | undefined): void {
  if (errors != null) {
    ctx.warn(`tool step contains error indicated during Galaxy export - ${errors}`);
  }
}

function lintToolIfPresent(ctx: LintContext, toolId: string | null | undefined): void {
  if (toolId && toolId.includes("testtoolshed")) {
    ctx.warn(
      "Step references a tool from the test tool shed, this should be replaced with a production tool",
    );
  }
}

function validateReport(
  ctx: LintContext,
  report: Record<string, unknown> | null | undefined,
): void {
  if (report == null) return;
  const markdown = report.markdown;
  if (typeof markdown !== "string") {
    ctx.error(`expected value [${String(markdown)}] with key [markdown] to be of class string`);
  }
  // Note: Galaxy markdown validation (```galaxy directives) not yet ported
}

function nativeStepContext(ctx: LintContext, stepKey: string): LintContext {
  return ctx.child("steps").child(stepKey);
}

/**
 * Error on step labels shared by more than one step, as Galaxy rejects these at import.
 *
 * `labeledSteps` holds `[label, description, labelContext]` for each step of one
 * workflow level (subworkflows have their own label namespace); `labelContext`
 * locates the label, or `undefined` to report at `ctx`. Empty labels are
 * ignored, matching Galaxy.
 */
function lintDuplicateStepLabels(
  ctx: LintContext,
  labeledSteps: Iterable<[string | null | undefined, string, LintContext | undefined]>,
): void {
  const stepsByLabel = new Map<string, [string, LintContext | undefined][]>();
  for (const [label, description, labelContext] of labeledSteps) {
    if (!label) continue;
    const steps = stepsByLabel.get(label);
    if (steps) steps.push([description, labelContext]);
    else stepsByLabel.set(label, [[description, labelContext]]);
  }
  for (const [label, steps] of stepsByLabel) {
    if (steps.length < 2) continue;
    (steps[1][1] ?? ctx).error(
      `Duplicated step label '${label}' (${steps.map(([d]) => d).join(", ")})`,
      { linter: StepLabelNotUnique },
    );
  }
}

// ---------------------------------------------------------------------------
// Native workflow linting
// ---------------------------------------------------------------------------

function lintNativeWorkflow(
  ctx: LintContext,
  nnw: NormalizedNativeWorkflow,
  rawDict?: Record<string, unknown>,
): void {
  // Raw-dict presence checks (fields that normalized models default-fill)
  if (rawDict != null) {
    if (!("a_galaxy_workflow" in rawDict)) {
      ctx.error("expected to find key [a_galaxy_workflow] but absent");
    } else if (rawDict.a_galaxy_workflow !== "true") {
      ctx.error(
        `expected value [${String(rawDict.a_galaxy_workflow)}] with key [a_galaxy_workflow] to be true`,
      );
    }
    if (!("format-version" in rawDict)) {
      ctx.error("expected to find key [format-version] but absent");
    } else if (rawDict["format-version"] !== "0.1") {
      ctx.error(
        `expected value [${String(rawDict["format-version"])}] with key [format-version] to be 0.1`,
      );
    }
    if (!("steps" in rawDict)) {
      ctx.error("expected to find key [steps] but absent");
      return;
    }
  }

  let foundOutputs = false;
  let foundOutputWithoutLabel = false;

  lintDuplicateStepLabels(
    ctx,
    Object.entries(nnw.steps).map(([key, step]) => [
      step.label,
      `step ${key}`,
      nativeStepContext(ctx, key).child("label"),
    ]),
  );

  for (const [orderIndex, step] of Object.entries(nnw.steps)) {
    const stepContext = nativeStepContext(ctx, orderIndex);
    if (!/^\d+$/.test(orderIndex)) {
      stepContext.error(`expected step_key to be integer not [${orderIndex}]`, {
        linter: NativeStepKeyNotInteger,
      });
    }

    for (const wo of step.workflow_outputs) {
      foundOutputs = true;
      if (!wo.label) {
        foundOutputWithoutLabel = true;
      }
    }

    // Recurse into subworkflows
    if (step.type === "subworkflow" && step.subworkflow) {
      if (!step.subworkflow.steps || Object.keys(step.subworkflow.steps).length === 0) {
        ctx.error("subworkflow is missing steps or steps are empty");
      } else {
        lintNativeWorkflow(stepContext.child("subworkflow"), step.subworkflow);
      }
    }

    lintStepErrors(ctx, step.errors);
    lintToolIfPresent(ctx, step.tool_id);
  }

  lintNativeInputDefaults(ctx, nnw);
  validateReport(ctx, (nnw as Record<string, unknown>).report as Record<string, unknown> | null);

  if (!foundOutputs) {
    ctx.warn("Workflow contained no outputs");
  }
  if (foundOutputWithoutLabel) {
    ctx.warn("Workflow contained output without a label");
  }
}

// ---------------------------------------------------------------------------
// Format2 workflow linting
// ---------------------------------------------------------------------------

function validateOutputSources(ctx: LintContext, nf2: NormalizedFormat2Workflow): void {
  if (!nf2.outputs || nf2.outputs.length === 0) return;

  // Collect known labels: step labels/ids + input ids
  const knownLabels = new Set<string>();
  for (const inp of nf2.inputs) {
    if (inp.id) knownLabels.add(inp.id);
    if (inp.label) knownLabels.add(inp.label);
  }
  for (const step of nf2.steps) {
    if (step.id) knownLabels.add(step.id);
    if (step.label) knownLabels.add(step.label);
  }

  for (const output of nf2.outputs) {
    const outputSource = output.outputSource;
    if (!outputSource || typeof outputSource !== "string") continue;

    // outputSource is "step_label/output_name" — extract step ref
    const slashIdx = outputSource.indexOf("/");
    const stepRef = slashIdx >= 0 ? outputSource.slice(0, slashIdx) : outputSource;
    if (!knownLabels.has(stepRef)) {
      const outputId = output.id || "?";
      ctx.error(
        `Output '${outputId}' references step '${stepRef}' via outputSource ` +
          `'${outputSource}', but no step or input with that label exists`,
      );
    }
  }
}

type GalaxyInputType = string | string[] | null | undefined;

function validateInputTypes(ctx: LintContext, nf2: NormalizedFormat2Workflow): void {
  for (const inp of nf2.inputs) {
    lintInputDefault(ctx, inp.id, inp.type as GalaxyInputType, inp.default);
  }
}

function lintNativeInputDefaults(ctx: LintContext, nnw: NormalizedNativeWorkflow): void {
  for (const [key, step] of Object.entries(nnw.steps)) {
    if (step.type !== "parameter_input") continue;
    const inputType = nativeInputToFormat2Type(step.type, step.tool_state);
    lintInputDefault(
      nativeStepContext(ctx, key),
      step.label || key,
      inputType,
      step.tool_state.default,
    );
  }
}

interface DefaultCheck {
  typeName: string;
  expected: string;
  expectedList: string;
  isValid: (value: unknown) => boolean;
}

const STRING_DEFAULT: DefaultCheck = {
  typeName: "string",
  expected: "a string",
  expectedList: "a string or a list of strings",
  isValid: (value) => typeof value === "string",
};
const INTEGER_DEFAULT: DefaultCheck = {
  typeName: "int",
  expected: "an integer",
  expectedList: "an integer or a list of integers",
  isValid: (value) => typeof value === "number" && Number.isInteger(value),
};
const FLOAT_DEFAULT: DefaultCheck = {
  typeName: "float",
  expected: "a number",
  expectedList: "a number or a list of numbers",
  isValid: (value) => typeof value === "number",
};
const DEFAULT_CHECKS: Record<string, DefaultCheck> = {
  string: STRING_DEFAULT,
  text: STRING_DEFAULT,
  int: INTEGER_DEFAULT,
  integer: INTEGER_DEFAULT,
  float: FLOAT_DEFAULT,
  double: FLOAT_DEFAULT,
  color: { ...STRING_DEFAULT, typeName: "color" },
  directory_uri: { ...STRING_DEFAULT, typeName: "directory_uri" },
};

function defaultCheck(inputType: string): DefaultCheck | undefined {
  return Object.hasOwn(DEFAULT_CHECKS, inputType) ? DEFAULT_CHECKS[inputType] : undefined;
}

function lintInputDefault(
  ctx: LintContext,
  label: string | null | undefined,
  inputType: GalaxyInputType,
  defaultValue: unknown,
): void {
  if (defaultValue == null || inputType == null) return;
  if (Array.isArray(inputType)) {
    // Galaxy wraps a bare default for multiple parameter inputs.
    const check = inputType.length === 1 ? defaultCheck(inputType[0]) : undefined;
    const values = Array.isArray(defaultValue) ? defaultValue : [defaultValue];
    if (check && !values.every(check.isValid)) {
      invalidDefault(ctx, label, `[${check.typeName}]`, check.expectedList);
    }
    return;
  }
  const check = defaultCheck(inputType);
  if (check && !check.isValid(defaultValue)) {
    invalidDefault(ctx, label, check.typeName, check.expected);
  }
}

function invalidDefault(
  ctx: LintContext,
  label: string | null | undefined,
  inputType: string,
  expected: string,
): void {
  ctx.error(
    `Input default is of invalid type. Input ${label} is ${inputType}; its default must be ${expected}.`,
  );
}

function lintFormat2Workflow(
  ctx: LintContext,
  nf2: NormalizedFormat2Workflow,
  rawDict?: Record<string, unknown>,
): void {
  if (rawDict != null) {
    if (!("steps" in rawDict)) {
      ctx.error("expected to find key [steps] but absent");
    }
    if (!("class" in rawDict)) {
      ctx.error("expected to find key [class] but absent");
    }
  }

  // Check the labels conversion will assign to the native steps.
  lintDuplicateStepLabels(ctx, [
    ...nf2.inputs.map((inp, i): [string | null, string, undefined] => [
      nativeInputLabel(inp, i),
      `input ${inp.id || i}`,
      undefined,
    ]),
    ...nf2.steps.map((step): [string | null | undefined, string, undefined] => [
      nativeStepLabel(step),
      `step ${step.id}`,
      undefined,
    ]),
  ]);

  for (const step of nf2.steps) {
    lintStepErrors(ctx, step.errors);
    lintToolIfPresent(ctx, step.tool_id);

    if (
      step.run &&
      typeof step.run === "object" &&
      (step.run as Record<string, unknown>).class === "GalaxyWorkflow"
    ) {
      const subWf = step.run as NormalizedFormat2Workflow;
      if (!subWf.steps || subWf.steps.length === 0) {
        ctx.error("subworkflow is missing steps or steps are empty");
      } else {
        lintFormat2Workflow(ctx, subWf);
      }
    }
  }

  validateOutputSources(ctx, nf2);
  validateInputTypes(ctx, nf2);
  validateReport(ctx, nf2.report);
}

// ---------------------------------------------------------------------------
// Public API — lint operations returning LintResult
// ---------------------------------------------------------------------------

/**
 * Lint a native Galaxy workflow (.ga format).
 * Returns structured lint results with errors and warnings.
 */
export function lintNative(workflowDict: Record<string, unknown>): LintResult {
  const ctx = new LintContext();
  let nnw: NormalizedNativeWorkflow;
  try {
    nnw = normalizedNative(workflowDict);
  } catch {
    nnw = { steps: {} } as NormalizedNativeWorkflow;
  }
  lintNativeWorkflow(ctx, nnw, workflowDict);
  return toLintResult(ctx);
}

/**
 * Lint a Format2 Galaxy workflow (.gxwf.yml format).
 * Returns structured lint results with errors and warnings.
 */
export function lintFormat2(workflowDict: Record<string, unknown>): LintResult {
  const ctx = new LintContext();
  let nf2: NormalizedFormat2Workflow;
  try {
    nf2 = normalizedFormat2(workflowDict) as NormalizedFormat2Workflow;
  } catch {
    nf2 = { steps: [], inputs: [], outputs: [] } as unknown as NormalizedFormat2Workflow;
  }
  lintFormat2Workflow(ctx, nf2, workflowDict);
  return toLintResult(ctx);
}

/**
 * Lint a workflow, auto-detecting format.
 * Returns structured lint results with errors and warnings.
 */
export function lintWorkflow(workflowDict: Record<string, unknown>): LintResult {
  const format = detectFormat(workflowDict);
  return format === "native" ? lintNative(workflowDict) : lintFormat2(workflowDict);
}

// ---------------------------------------------------------------------------
// Best practices linting
// ---------------------------------------------------------------------------

// Galaxy's informal replacement parameter syntax (`get_informal_replacement_parameters`).
const UNTYPED_PARAMETER_PATTERN = /\$\{(.+?)\}/g;
const RENAME_ACTION = "RenameDatasetAction";
const DATA_INPUT_STEP_TYPES = new Set(["data_input", "data_collection_input"]);

/** What a step's `${name}` references can resolve against. */
interface ReplacementScope {
  parameterLabels: ReadonlySet<string>;
  dataLabels: ReadonlySet<string>;
  /** source input label -> `#{...}` reference to the step input it connects to */
  connectedInputs: ReadonlyMap<string, string>;
}

/** Rename `#{...}` reference for a step input; Galaxy reads nested `a|b` as `a.b`. */
function inputReference(inputName: string): string {
  return inputName.replaceAll("|", ".");
}

/** Distinct `${name}` references anywhere in a JSON-like value, in order. */
function untypedParameterNames(value: unknown): string[] {
  if (typeof value === "string") {
    return Array.from(value.matchAll(UNTYPED_PARAMETER_PATTERN), (m) => m[1] as string);
  }
  const items = Array.isArray(value)
    ? value
    : value !== null && typeof value === "object"
      ? Object.values(value)
      : [];
  return [...new Set(items.flatMap(untypedParameterNames))];
}

function lintUntypedToolState(ctx: LintContext, stepId: string, toolState: unknown): void {
  for (const name of untypedParameterNames(toolState)) {
    ctx.warn(
      `Workflow step ${stepId} specifies an untyped parameter as an input. \${${name}} is filled only by ` +
        "the expanded run form, never via the API; connect a workflow parameter input instead.",
    );
  }
}

/** Warn for `${name}` references Galaxy won't fill from a declared parameter input. */
function lintUntypedPja(
  ctx: LintContext,
  stepId: string,
  outputName: string | null | undefined,
  action: string,
  value: unknown,
  isRename: boolean,
  scope: ReplacementScope,
): void {
  const target = outputName ? `output ${outputName}` : "all outputs";
  for (const name of untypedParameterNames(value)) {
    let detail: string;
    if (!isRename) {
      detail = "stays literal; Galaxy substitutes parameters only in renames.";
    } else if (scope.parameterLabels.has(name)) {
      continue;
    } else if (scope.dataLabels.has(name)) {
      const ref = scope.connectedInputs.get(name) ?? "input_name";
      detail =
        "names a data input, but Galaxy fills ${...} only from parameter inputs; " +
        `use #{${ref}} for that dataset's name.`;
    } else {
      detail =
        "is not a parameter input label, so Galaxy prompts for it at run time and leaves it literal via " +
        `the API; add a parameter input labelled ${name}, or use #{input_name} for an input dataset's name.`;
    }
    ctx.warn(
      `Workflow step ${stepId} specifies an untyped parameter in the post-job actions. ` +
        `\${${name}} in ${action} of ${target} ${detail}`,
    );
  }
}

const SKIP_DISCONNECTED_NATIVE_TYPES = new Set([
  "data_input",
  "data_collection_input",
  "parameter_input",
  "pause",
]);

function lintStepBestPractices(
  ctx: LintContext,
  step: NormalizedFormat2Step,
  scope: ReplacementScope,
): void {
  const stepId = step.label || step.id;

  // disconnected inputs
  for (const stepInput of step.in) {
    if (stepInput.source == null && stepInput.default == null) {
      ctx.warn(`Input ${stepInput.id} of workflow step ${stepId} is disconnected.`);
    }
  }

  // missing doc
  if (!step.doc) {
    ctx.warn(`Workflow step ${stepId} has no annotation.`);
  }

  // missing label
  if (!step.label) {
    ctx.warn(`Workflow step ${stepId} has no label.`);
  }

  lintUntypedToolState(ctx, stepId, step.state || step.tool_state);

  // format2 step outputs carry the post-job actions as fields
  for (const out of step.out ?? []) {
    for (const [field, value] of Object.entries(out)) {
      if (field !== "id" && value != null) {
        lintUntypedPja(ctx, stepId, out.id, field, value, field === "rename", scope);
      }
    }
  }
}

/**
 * Native step best-practice checks on native fields, so messages reference
 * native ids / labels rather than format2 sentinels like `_unlabeled_step_1`.
 */
function lintNativeStepBestPractices(
  ctx: LintContext,
  step: NormalizedNativeStep,
  scope: ReplacementScope,
): void {
  const stepId = step.label || step.annotation || String(step.id);

  // disconnected inputs
  if (!step.type || !SKIP_DISCONNECTED_NATIVE_TYPES.has(step.type)) {
    for (const inputDef of step.inputs) {
      if (inputDef.name && !(inputDef.name in step.input_connections)) {
        ctx.warn(`Input ${inputDef.name} of workflow step ${stepId} is disconnected.`);
      }
    }
  }

  // missing metadata
  if (!step.annotation) {
    ctx.warn(`Workflow step ${stepId} has no annotation.`);
  }
  if (!step.label) {
    ctx.warn(`Workflow step ${stepId} has no label.`);
  }

  let toolState: unknown = step.tool_state;
  if (typeof toolState === "string") {
    try {
      toolState = JSON.parse(toolState);
    } catch {
      toolState = {};
    }
  }
  lintUntypedToolState(ctx, stepId, toolState);

  for (const pja of Object.values(step.post_job_actions ?? {})) {
    for (const [argument, value] of Object.entries(pja.action_arguments ?? {})) {
      const isRename = pja.action_type === RENAME_ACTION && argument === "newname";
      const action = isRename ? "rename" : pja.action_type;
      lintUntypedPja(ctx, stepId, pja.output_name, action, value, isRename, scope);
    }
  }
}

function lintWorkflowTopLevel(
  ctx: LintContext,
  nf2: NormalizedFormat2Workflow,
  rawDict: Record<string, unknown>,
): void {
  // annotation/doc
  if (!nf2.doc || !nf2.doc.trim()) {
    ctx.warn("Workflow is not annotated.");
  }

  // creator — access from raw dict since normalization may strip it
  const nf2Creators = (nf2 as Record<string, unknown>).creator;
  const creators = (nf2Creators ?? rawDict.creator) as unknown[] | null | undefined;
  if (!creators || !Array.isArray(creators) || creators.length === 0) {
    ctx.warn("Workflow does not specify a creator.");
  } else {
    for (const creator of creators) {
      if (creator && typeof creator === "object") {
        const c = creator as Record<string, unknown>;
        if (c.class === "Person" && c.identifier && typeof c.identifier === "string") {
          // Check for URI scheme (e.g. https:, orcid:)
          if (!/^[a-zA-Z][a-zA-Z0-9+\-.]*:/.test(c.identifier)) {
            ctx.warn(
              `Creator identifier "${c.identifier}" should be a fully qualified URI, ` +
                `for example "https://orcid.org/0000-0002-1825-0097".`,
            );
          }
        }
      }
    }
  }

  // license
  if (!nf2.license) {
    ctx.warn("Workflow does not specify a license.");
  }
}

/**
 * Lint best practices for a Format2 Galaxy workflow.
 * Returns structured lint results with warnings about missing annotations,
 * creators, licenses, step labels, and disconnected inputs.
 */
export function lintBestPracticesFormat2(workflowDict: Record<string, unknown>): LintResult {
  const ctx = new LintContext();
  let nf2: NormalizedFormat2Workflow | null;
  try {
    nf2 = ensureFormat2(workflowDict) as NormalizedFormat2Workflow;
  } catch {
    nf2 = null;
  }
  if (nf2) {
    lintWorkflowTopLevel(ctx, nf2, workflowDict);
    const inputTypes = nf2.inputs
      .filter((inp) => inp.id)
      .map((inp) => [inp.id as string, format2InputStepType(inp)] as const);
    const parameterLabels = new Set(
      inputTypes.filter(([, t]) => t === "parameter_input").map(([label]) => label),
    );
    const dataLabels = new Set(
      inputTypes.filter(([, t]) => t && DATA_INPUT_STEP_TYPES.has(t)).map(([label]) => label),
    );
    for (const step of nf2.steps) {
      const connectedInputs = new Map<string, string>();
      for (const stepInput of step.in) {
        const sources = stepInput.source == null ? [] : [stepInput.source].flat();
        for (const source of sources) {
          connectedInputs.set(
            resolveSourceReference(source, dataLabels)[0],
            inputReference(stepInput.id),
          );
        }
      }
      lintStepBestPractices(ctx, step, { parameterLabels, dataLabels, connectedInputs });
    }
  }
  return toLintResult(ctx);
}

/**
 * Lint best practices for a native Galaxy workflow.
 * Runs top-level checks on the format2 view and step checks on native steps.
 */
export function lintBestPracticesNative(workflowDict: Record<string, unknown>): LintResult {
  const ctx = new LintContext();
  let nf2: NormalizedFormat2Workflow | null;
  try {
    nf2 = ensureFormat2(workflowDict) as NormalizedFormat2Workflow;
  } catch {
    nf2 = null;
  }
  if (nf2) {
    lintWorkflowTopLevel(ctx, nf2, workflowDict);
  }
  let nnw: NormalizedNativeWorkflow | null;
  try {
    nnw = normalizedNative(workflowDict);
  } catch {
    nnw = null;
  }
  if (nnw) {
    const steps = Object.values(nnw.steps);
    const labels = new Map(steps.filter((s) => s.label).map((s) => [s.id, s.label as string]));
    const parameterLabels = new Set(
      steps.filter((s) => s.type === "parameter_input" && s.label).map((s) => s.label as string),
    );
    const dataLabels = new Set(
      steps
        .filter((s) => DATA_INPUT_STEP_TYPES.has(s.type) && s.label)
        .map((s) => s.label as string),
    );
    for (const step of steps) {
      const connectedInputs = new Map<string, string>();
      for (const [inputName, connections] of Object.entries(step.input_connections)) {
        for (const connection of connections as { id?: number }[]) {
          const label = connection.id == null ? undefined : labels.get(connection.id);
          if (label) connectedInputs.set(label, inputReference(inputName));
        }
      }
      lintNativeStepBestPractices(ctx, step, { parameterLabels, dataLabels, connectedInputs });
    }
  }
  return toLintResult(ctx);
}
