/**
 * Workflow linting — structural checks and best-practice warnings.
 *
 * Port of gxformat2's lint.py + linting.py. Checks workflow structure,
 * output labels, step errors, tool references, output source resolution,
 * input default types, and report markdown.
 */

import { normalizedFormat2 } from "./normalized/format2.js";
import { normalizedNative } from "./normalized/native.js";
import { ensureFormat2 } from "./normalized/ensure.js";
import type { NormalizedFormat2Workflow, NormalizedFormat2Step } from "./normalized/format2.js";
import type { NormalizedNativeWorkflow, NormalizedNativeStep } from "./normalized/native.js";
import { detectFormat } from "./detect-format.js";

// ---------------------------------------------------------------------------
// LintContext — tracks errors and warnings during linting
// ---------------------------------------------------------------------------

export class LintContext {
  errors: string[] = [];
  warnings: string[] = [];
  private _prefix: string;

  constructor(prefix = "") {
    this._prefix = prefix;
  }

  error(message: string): void {
    this.errors.push(`${this._prefix}${message}`);
  }

  warn(message: string): void {
    this.warnings.push(`${this._prefix}${message}`);
  }

  child(prefix: string): LintContext {
    const fullPrefix = this._prefix
      ? `${this._prefix.slice(0, -1)} > ${prefix}] `
      : `[${prefix}] `;
    const ctx = new LintContext();
    ctx._prefix = fullPrefix;
    // Share message arrays with parent
    ctx.errors = this.errors;
    ctx.warnings = this.warnings;
    return ctx;
  }
}

// ---------------------------------------------------------------------------
// LintResult — the return type for lint operations
// ---------------------------------------------------------------------------

export interface LintResult {
  errors: string[];
  warnings: string[];
  error_count: number;
  warn_count: number;
}

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

  for (const [orderIndex, step] of Object.entries(nnw.steps)) {
    if (!/^\d+$/.test(orderIndex)) {
      ctx.error(`expected step_key to be integer not [${orderIndex}]`);
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
        lintNativeWorkflow(ctx, step.subworkflow);
      }
    }

    lintStepErrors(ctx, step.errors);
    lintToolIfPresent(ctx, step.tool_id);
  }

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
    if (inp.default == null) continue;
    const inputType: GalaxyInputType = inp.type as GalaxyInputType;
    if (Array.isArray(inputType)) continue; // array types — skip

    if (inputType === "int" || inputType === "integer") {
      if (typeof inp.default !== "number" || !Number.isInteger(inp.default)) {
        ctx.error("Input default is of invalid type");
      }
    } else if (inputType === "float" || inputType === "double") {
      if (typeof inp.default !== "number") {
        ctx.error("Input default is of invalid type");
      }
    } else if (inputType === "string" || inputType === "text") {
      if (typeof inp.default !== "string") {
        ctx.error("Input default is of invalid type");
      }
    }
  }
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

const UNTYPED_PARAM_RE = /\$\{.+?\}/;

function checkJsonForUntypedParams(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(checkJsonForUntypedParams);
  }
  if (value !== null && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some(checkJsonForUntypedParams);
  }
  if (typeof value === "string") {
    return UNTYPED_PARAM_RE.test(value);
  }
  return false;
}

const SKIP_DISCONNECTED_NATIVE_TYPES = new Set([
  "data_input",
  "data_collection_input",
  "parameter_input",
  "pause",
]);

function lintStepBestPractices(ctx: LintContext, step: NormalizedFormat2Step): void {
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

  // untyped params in state
  const toolState = step.state || step.tool_state;
  if (toolState && checkJsonForUntypedParams(toolState)) {
    ctx.warn(`Workflow step ${stepId} specifies an untyped parameter as an input.`);
  }

  // untyped params in outputs (PJA equivalents)
  if (step.out && step.out.length > 0 && checkJsonForUntypedParams(step.out)) {
    ctx.warn(
      `Workflow step ${stepId} specifies an untyped parameter in the post-job actions.`,
    );
  }
}

function lintNativeStepBestPractices(ctx: LintContext, step: NormalizedNativeStep): void {
  const stepId = step.label || step.annotation || String(step.id);

  // disconnected inputs
  if (!step.type || !SKIP_DISCONNECTED_NATIVE_TYPES.has(step.type)) {
    for (const inputDef of step.inputs) {
      if (inputDef.name && !(inputDef.name in step.input_connections)) {
        ctx.warn(`Input ${inputDef.name} of workflow step ${stepId} is disconnected.`);
      }
    }
  }

  // untyped params in post_job_actions
  if (step.post_job_actions && Object.keys(step.post_job_actions).length > 0) {
    if (checkJsonForUntypedParams(step.post_job_actions)) {
      ctx.warn(
        `Workflow step with ID ${step.id} specifies an untyped parameter in the post-job actions.`,
      );
    }
  }
}

function lintBestPractices(
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

  // step-level
  for (const step of nf2.steps) {
    lintStepBestPractices(ctx, step);
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
    lintBestPractices(ctx, nf2, workflowDict);
  }
  return toLintResult(ctx);
}

/**
 * Lint best practices for a native Galaxy workflow.
 * Runs shared format2 best practices plus native-specific checks.
 */
export function lintBestPracticesNative(workflowDict: Record<string, unknown>): LintResult {
  const ctx = new LintContext();
  // Shared best practices on format2 view
  let nf2: NormalizedFormat2Workflow | null;
  try {
    nf2 = ensureFormat2(workflowDict) as NormalizedFormat2Workflow;
  } catch {
    nf2 = null;
  }
  if (nf2) {
    lintBestPractices(ctx, nf2, workflowDict);
  }
  // Native-specific checks
  let nnw: NormalizedNativeWorkflow | null;
  try {
    nnw = normalizedNative(workflowDict);
  } catch {
    nnw = null;
  }
  if (nnw) {
    for (const step of Object.values(nnw.steps)) {
      lintNativeStepBestPractices(ctx, step);
    }
  }
  return toLintResult(ctx);
}
