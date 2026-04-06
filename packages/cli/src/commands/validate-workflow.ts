import { ToolCache } from "@galaxy-tool-util/core";
import {
  createFieldModel,
  GalaxyWorkflowSchema,
  NativeGalaxyWorkflowSchema,
  expandedNative,
  expandedFormat2,
  injectConnectionsIntoState,
  stripConnectedValues,
  scanForReplacements,
  checkStrictEncoding,
  checkStrictStructure,
  buildSingleValidationReport,
  type NormalizedNativeStep,
  type NormalizedNativeWorkflow,
  type NormalizedFormat2Step,
  type NormalizedFormat2Workflow,
  type ToolParameterBundleModel,
  type ExpansionOptions,
  type WorkflowFormat,
} from "@galaxy-tool-util/schema";
import * as ParseResult from "effect/ParseResult";
import * as S from "effect/Schema";
import { dirname } from "node:path";
import { isResolveError, loadCachedTool } from "./resolve-tool.js";
import { createDefaultResolver } from "./url-resolver.js";
import { renderStepResults } from "./render-results.js";
import { readWorkflowFile, resolveFormat } from "./workflow-io.js";
import { resolveStrictOptions, type StrictOptions } from "./strict-options.js";

export type { WorkflowFormat } from "@galaxy-tool-util/schema";

export type ValidationMode = "effect" | "json-schema";

export interface ValidateWorkflowOptions extends StrictOptions {
  format?: string;
  toolState?: boolean;
  cacheDir?: string;
  mode?: ValidationMode;
  toolSchemaDir?: string;
  json?: boolean;
}

function formatIssues(error: ParseResult.ParseError): string[] {
  const issues = ParseResult.ArrayFormatter.formatErrorSync(error);
  return issues.map((i) => `${i.path.join(".")}: ${i.message}`);
}

export type { ValidationStepResult as StepValidationResult } from "@galaxy-tool-util/schema";

// Re-import locally for use in this file
import type { ValidationStepResult as StepValidationResult } from "@galaxy-tool-util/schema";

export async function runValidateWorkflow(
  filePath: string,
  opts: ValidateWorkflowOptions,
): Promise<void> {
  const data = await readWorkflowFile(filePath);
  if (!data) return;

  const format: WorkflowFormat = resolveFormat(data, opts.format);

  const mode: ValidationMode = opts.mode === "json-schema" ? "json-schema" : "effect";
  if (!opts.json) console.log(`Detected format: ${format}, mode: ${mode}`);

  // Build expansion options for resolving external subworkflow references
  const workflowDirectory = dirname(filePath);
  const expansionOpts: ExpansionOptions = {
    resolver: createDefaultResolver({ workflowDirectory }),
  };

  if (mode === "json-schema") {
    const { runValidateWorkflowJsonSchema } = await import("./validate-workflow-json-schema.js");
    return runValidateWorkflowJsonSchema(filePath, data, format, opts, expansionOpts);
  }

  const strict = resolveStrictOptions(opts);

  // --- strict encoding check (pre-normalization) ---
  if (strict.strictEncoding) {
    const encErrors = checkStrictEncoding(data, format);
    if (encErrors.length > 0) {
      console.error("Encoding errors:");
      for (const e of encErrors) console.error(`  ${e}`);
      process.exitCode = 2;
      return;
    }
  }

  // --- strict structure check (pre-normalization) ---
  if (strict.strictStructure) {
    const structErrors = checkStrictStructure(data, format);
    if (structErrors.length > 0) {
      console.error("Structure errors (strict):");
      for (const e of structErrors) console.error(`  ${e}`);
      process.exitCode = 2;
      return;
    }
  }

  // --- structural validation (effect mode) ---
  const validationData = { ...data };
  if (format === "native" && !("class" in validationData)) {
    validationData.class = "NativeGalaxyWorkflow";
  } else if (format === "format2" && !("class" in validationData)) {
    validationData.class = "GalaxyWorkflow";
  }

  const schema: S.Schema<any> =
    format === "native" ? NativeGalaxyWorkflowSchema : GalaxyWorkflowSchema;
  const decode = S.decodeUnknownEither(schema, { onExcessProperty: "ignore" });
  const structResult = decode(validationData);

  const structureErrors: string[] = [];
  let structOk = true;
  if (structResult._tag === "Left") {
    structOk = false;
    const issues = formatIssues(structResult.left);
    structureErrors.push(...issues);
    if (!opts.json) {
      console.error(`\nStructural validation errors:`);
      for (const line of issues) {
        console.error(`  ${line}`);
      }
    }
  } else {
    if (!opts.json) console.log(`Structural validation: OK`);
  }

  // --- tool state validation (effect mode) ---
  if (opts.toolState === false) {
    if (opts.json) {
      const report = buildSingleValidationReport(filePath, [], {
        structure_errors: structureErrors,
      });
      console.log(JSON.stringify(report, null, 2));
    }
    process.exitCode = structOk ? 0 : 1;
    return;
  }

  const cache = new ToolCache({ cacheDir: opts.cacheDir });
  await cache.index.load();

  let results: StepValidationResult[];
  if (format === "native") {
    results = await validateNativeSteps(data, cache, "", expansionOpts);
  } else {
    results = await validateFormat2Steps(data, cache, "", expansionOpts);
  }

  const stateOk = !results.some((r) => r.status === "fail");

  if (opts.json) {
    const report = buildSingleValidationReport(filePath, results, {
      structure_errors: structureErrors,
    });
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = structOk && stateOk ? 0 : 1;
    return;
  }

  if (results.length === 0) {
    console.log("No tool steps to validate state for.");
    process.exitCode = structOk ? 0 : 1;
    return;
  }

  const { validated, skipped } = renderStepResults(results);

  console.log(`\nTool state: ${validated} validated, ${skipped} skipped`);

  // --- strict state: promote skips to failures ---
  if (strict.strictState && results.some((r) => r.status === "skip")) {
    console.error("Strict state: skipped steps not allowed");
    process.exitCode = 2;
    return;
  }

  process.exitCode = structOk && stateOk ? 0 : 1;
}

// --- Native validation ---

export async function validateNativeSteps(
  data: Record<string, unknown>,
  cache: ToolCache,
  prefix = "",
  expansionOpts?: ExpansionOptions,
): Promise<StepValidationResult[]> {
  const expanded = await expandedNative(data, expansionOpts);
  return _validateNativeWorkflow(expanded, cache, prefix);
}

async function _validateNativeWorkflow(
  wf: NormalizedNativeWorkflow,
  cache: ToolCache,
  prefix: string,
): Promise<StepValidationResult[]> {
  const results: StepValidationResult[] = [];

  for (const [key, step] of Object.entries(wf.steps)) {
    const stepLabel = prefix ? `${prefix}${key}` : key;

    // Recurse into subworkflows
    if (step.type === "subworkflow" && step.subworkflow) {
      const subResults = await _validateNativeWorkflow(step.subworkflow, cache, `${stepLabel}.`);
      results.push(...subResults);
      continue;
    }

    const toolId = step.tool_id;
    if (!toolId) continue;
    const toolVersion = step.tool_version ?? null;

    const result = await _validateNativeStep(step, stepLabel, toolId, toolVersion, cache);
    results.push(result);
  }

  return results;
}

async function _validateNativeStep(
  step: NormalizedNativeStep,
  stepLabel: string,
  toolId: string,
  toolVersion: string | null,
  cache: ToolCache,
): Promise<StepValidationResult> {
  const resolved = await loadCachedTool(cache, toolId, toolVersion);
  if (isResolveError(resolved)) {
    const skippedReason = resolved.kind === "no_version" ? "no_version" : "not_in_cache";
    const reason =
      resolved.kind === "no_version" ? `no version for ${toolId}` : `${toolId} not in cache`;
    return {
      step: stepLabel,
      tool_id: toolId,
      version: toolVersion,
      status: "skip_tool_not_found",
      errors: [reason],
    };
  }

  const bundle: ToolParameterBundleModel = {
    parameters: resolved.tool.inputs as ToolParameterBundleModel["parameters"],
  };

  // Skip validation if replacement parameters (${...}) are present in typed fields
  const replacementScan = scanForReplacements(
    bundle.parameters,
    step.tool_state as Record<string, unknown>,
  );
  if (replacementScan === "yes") {
    return {
      step: stepLabel,
      tool_id: toolId,
      version: toolVersion,
      status: "skip_replacement_params",
      errors: ["replacement parameters detected"],
      skippedReason: "replacement_params",
    };
  }

  // Deep copy state and inject connection markers
  const state = structuredClone(step.tool_state) as Record<string, unknown>;
  const connections: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(step.input_connections)) {
    connections[key] = val;
  }
  injectConnectionsIntoState(bundle.parameters, state, connections);

  // Validate against workflow_step_native schema
  const fieldModel = createFieldModel(bundle, "workflow_step_native");
  if (!fieldModel) {
    return {
      step: stepLabel,
      tool_id: toolId,
      version: toolVersion,
      status: "skip_tool_not_found",
      errors: ["unsupported parameter types"],
      skippedReason: "unsupported_params",
    };
  }

  const validate = S.decodeUnknownEither(fieldModel as S.Schema<any>, {
    onExcessProperty: "ignore",
  });
  const result = validate(state);

  if (result._tag === "Left") {
    return {
      step: stepLabel,
      tool_id: toolId,
      version: toolVersion,
      status: "fail",
      errors: formatIssues(result.left),
    };
  }
  return { step: stepLabel, tool_id: toolId, version: toolVersion, status: "ok", errors: [] };
}

// --- Format2 validation ---

export async function validateFormat2Steps(
  data: Record<string, unknown>,
  cache: ToolCache,
  prefix = "",
  expansionOpts?: ExpansionOptions,
): Promise<StepValidationResult[]> {
  const expanded = await expandedFormat2(data, expansionOpts);
  return _validateFormat2Workflow(expanded, cache, prefix);
}

async function _validateFormat2Workflow(
  wf: NormalizedFormat2Workflow,
  cache: ToolCache,
  prefix: string,
): Promise<StepValidationResult[]> {
  const results: StepValidationResult[] = [];

  for (let i = 0; i < wf.steps.length; i++) {
    const step = wf.steps[i];
    const stepLabel = prefix ? `${prefix}${i}` : String(i);

    // Recurse into inline subworkflows
    if (step.run && typeof step.run === "object") {
      const subResults = await _validateFormat2Workflow(
        step.run as NormalizedFormat2Workflow,
        cache,
        `${stepLabel}.`,
      );
      results.push(...subResults);
      continue;
    }

    const toolId = step.tool_id;
    if (!toolId) continue;
    const toolVersion = step.tool_version ?? null;

    const result = await _validateFormat2Step(step, stepLabel, toolId, toolVersion, cache);
    results.push(result);
  }

  return results;
}

async function _validateFormat2Step(
  step: NormalizedFormat2Step,
  stepLabel: string,
  toolId: string,
  toolVersion: string | null,
  cache: ToolCache,
): Promise<StepValidationResult> {
  const resolved = await loadCachedTool(cache, toolId, toolVersion);
  if (isResolveError(resolved)) {
    const skippedReason = resolved.kind === "no_version" ? "no_version" : "not_in_cache";
    const reason =
      resolved.kind === "no_version" ? `no version for ${toolId}` : `${toolId} not in cache`;
    return {
      step: stepLabel,
      tool_id: toolId,
      version: toolVersion,
      status: "skip_tool_not_found",
      errors: [reason],
    };
  }

  const bundle: ToolParameterBundleModel = {
    parameters: resolved.tool.inputs as ToolParameterBundleModel["parameters"],
  };

  // Get state from step.state or step.tool_state.
  // Deep-copy and strip ConnectedValue markers left by $link normalization —
  // these are captured in step.in and will be injected during linked validation.
  const state = structuredClone((step.state ?? step.tool_state ?? {}) as Record<string, unknown>);
  stripConnectedValues(bundle.parameters, state);

  // Level 1: Validate base state against workflow_step
  const baseModel = createFieldModel(bundle, "workflow_step");
  if (!baseModel) {
    return {
      step: stepLabel,
      tool_id: toolId,
      version: toolVersion,
      status: "skip_tool_not_found",
      errors: ["unsupported parameter types"],
      skippedReason: "unsupported_params",
    };
  }

  const baseValidate = S.decodeUnknownEither(baseModel as S.Schema<any>, {
    onExcessProperty: "ignore",
  });
  const baseResult = baseValidate(state);
  if (baseResult._tag === "Left") {
    return {
      step: stepLabel,
      tool_id: toolId,
      version: toolVersion,
      status: "fail",
      errors: formatIssues(baseResult.left),
    };
  }

  // Build connections dict from step.in entries
  const connections: Record<string, unknown> = {};
  for (const stepInput of step.in) {
    if (stepInput.id && stepInput.source) {
      const src = stepInput.source;
      connections[stepInput.id] = Array.isArray(src) ? src : [src];
    }
  }

  // Level 2: Validate with connections injected against workflow_step_linked
  if (Object.keys(connections).length > 0) {
    const linkedState = structuredClone(state);
    const remaining = injectConnectionsIntoState(bundle.parameters, linkedState, connections);

    const unmatchedKeys = Object.keys(remaining);
    if (unmatchedKeys.length > 0) {
      return {
        step: stepLabel,
        tool_id: toolId,
        version: toolVersion,
        status: "fail",
        errors: unmatchedKeys.map((k) => `No parameter definition matching connection key "${k}"`),
      };
    }

    const linkedModel = createFieldModel(bundle, "workflow_step_linked");
    if (!linkedModel) {
      return {
        step: stepLabel,
        tool_id: toolId,
        version: toolVersion,
        status: "skip_tool_not_found",
        errors: ["unsupported parameter types"],
        skippedReason: "unsupported_params",
      };
    }

    const linkedValidate = S.decodeUnknownEither(linkedModel as S.Schema<any>, {
      onExcessProperty: "ignore",
    });
    const linkedResult = linkedValidate(linkedState);
    if (linkedResult._tag === "Left") {
      return {
        step: stepLabel,
        tool_id: toolId,
        version: toolVersion,
        status: "fail",
        errors: formatIssues(linkedResult.left),
      };
    }
  }

  return { step: stepLabel, tool_id: toolId, version: toolVersion, status: "ok", errors: [] };
}
