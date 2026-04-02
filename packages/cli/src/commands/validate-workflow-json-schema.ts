/**
 * JSON Schema-based workflow validation.
 *
 * Two-level validation using AJV Draft 2020-12:
 *   Level 1 (structural): validates workflow dict against generated JSON Schema
 *   Level 2 (per-step tool state): validates each step's state against tool-specific JSON Schema
 *
 * Mirrors Galaxy's validation_json_schema.py.
 */

import { ToolCache } from "@galaxy-tool-util/core";
import {
  createFieldModel,
  GalaxyWorkflowSchema,
  NativeGalaxyWorkflowSchema,
  expandedNative,
  expandedFormat2,
  injectConnectionsIntoState,
  scanForReplacements,
  type NormalizedNativeStep,
  type NormalizedNativeWorkflow,
  type NormalizedFormat2Step,
  type NormalizedFormat2Workflow,
  type ToolParameterBundleModel,
  type StateRepresentation,
  type ExpansionOptions,
} from "@galaxy-tool-util/schema";
import * as JSONSchema from "effect/JSONSchema";
import Ajv2020 from "ajv/dist/2020.js";
import type { ValidateFunction } from "ajv";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { ValidateWorkflowOptions, WorkflowFormat, StepValidationResult } from "./validate-workflow.js";
import { isResolveError, loadCachedTool } from "./resolve-tool.js";

const Ajv = (Ajv2020 as any).default ?? Ajv2020;
const ajv = new Ajv({ allErrors: true, strict: false }) as any;

// --- structural schema cache (generated once) ---

let _nativeStructValidator: ValidateFunction | undefined;
let _format2StructValidator: ValidateFunction | undefined;

function nativeStructuralValidator(): ValidateFunction {
  if (!_nativeStructValidator) {
    const schema = JSONSchema.make(NativeGalaxyWorkflowSchema, { target: "jsonSchema2020-12" });
    _nativeStructValidator = ajv.compile(schema as object) as ValidateFunction;
  }
  return _nativeStructValidator!;
}

function format2StructuralValidator(): ValidateFunction {
  if (!_format2StructValidator) {
    const schema = JSONSchema.make(GalaxyWorkflowSchema, { target: "jsonSchema2020-12" });
    _format2StructValidator = ajv.compile(schema as object) as ValidateFunction;
  }
  return _format2StructValidator!;
}

// --- tool state validator cache ---

const _toolStateCache = new Map<string, ValidateFunction | null>();

// Recursively strip additionalProperties from a JSON Schema to match
// the Effect decode behavior of onExcessProperty: "ignore".
// Until we implement stale key cleaning (jmchilton/galaxy-tool-util-ts#5),
// real workflows have extra keys that would fail strict validation.
function stripAdditionalProperties(schema: unknown): unknown {
  if (schema === null || typeof schema !== "object") return schema;
  if (Array.isArray(schema)) return schema.map(stripAdditionalProperties);
  const obj = schema as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key === "additionalProperties") continue;
    result[key] = stripAdditionalProperties(value);
  }
  return result;
}

function toolStateCacheKey(toolId: string, toolVersion: string | null, representation: string): string {
  return `${toolId}@${toolVersion ?? ""}@${representation}`;
}

function buildToolStateValidator(
  bundle: ToolParameterBundleModel,
  representation: StateRepresentation,
): ValidateFunction | null {
  const effectSchema = createFieldModel(bundle, representation);
  if (!effectSchema) return null;
  try {
    const jsonSchema = JSONSchema.make(effectSchema, { target: "jsonSchema2020-12" });
    const relaxed = stripAdditionalProperties(jsonSchema);
    return ajv.compile(relaxed as object) as ValidateFunction;
  } catch {
    return null;
  }
}

function loadToolStateValidatorFromDir(
  toolId: string,
  toolVersion: string | null,
  schemaDir: string,
): ValidateFunction | null {
  const safeId = toolId.replace(/\//g, "~");
  const version = toolVersion ?? "_default_";
  const toolDir = join(schemaDir, safeId);
  let schemaPath = join(toolDir, `${version}.json`);
  if (!existsSync(schemaPath)) {
    schemaPath = join(toolDir, "_default_.json");
  }
  if (!existsSync(schemaPath)) return null;
  try {
    const raw = JSON.parse(readFileSync(schemaPath, "utf-8"));
    return ajv.compile(raw);
  } catch {
    return null;
  }
}

function getOrBuildValidator(
  toolId: string,
  toolVersion: string | null,
  bundle: ToolParameterBundleModel,
  representation: StateRepresentation,
  toolSchemaDir?: string,
): ValidateFunction | null {
  const key = toolStateCacheKey(toolId, toolVersion, representation);
  if (_toolStateCache.has(key)) return _toolStateCache.get(key)!;

  let validator: ValidateFunction | null = null;
  if (toolSchemaDir) {
    validator = loadToolStateValidatorFromDir(toolId, toolVersion, toolSchemaDir);
  }
  if (!validator) {
    validator = buildToolStateValidator(bundle, representation);
  }
  _toolStateCache.set(key, validator);
  return validator;
}

// --- AJV error formatting ---

function formatAjvErrors(validate: ValidateFunction): string[] {
  if (!validate.errors) return [];
  return validate.errors.map((e) => {
    const path = e.instancePath ? e.instancePath.replace(/\//g, ".").slice(1) : "(root)";
    return `${path}: ${e.message ?? "unknown error"}`;
  });
}

// --- main entry point ---

export async function runValidateWorkflowJsonSchema(
  data: Record<string, unknown>,
  format: WorkflowFormat,
  opts: ValidateWorkflowOptions,
  expansionOpts?: ExpansionOptions,
): Promise<void> {
  // --- structural validation ---
  const validationData = { ...data };
  if (format === "native" && !("class" in validationData)) {
    validationData.class = "NativeGalaxyWorkflow";
  } else if (format === "format2" && !("class" in validationData)) {
    validationData.class = "GalaxyWorkflow";
  }

  const structValidator = format === "native"
    ? nativeStructuralValidator()
    : format2StructuralValidator();

  const structOk = structValidator(validationData);

  if (!structOk) {
    console.error(`\nStructural validation errors (json-schema):`);
    for (const line of formatAjvErrors(structValidator)) {
      console.error(`  ${line}`);
    }
  } else {
    console.log(`Structural validation (json-schema): OK`);
  }

  // --- tool state validation ---
  if (opts.toolState === false) {
    process.exitCode = structOk ? 0 : 1;
    return;
  }

  if (!structOk) {
    process.exitCode = 1;
    return;
  }

  const cache = new ToolCache({ cacheDir: opts.cacheDir });
  await cache.index.load();

  let results: StepValidationResult[];
  if (format === "native") {
    results = await validateNativeStepsJsonSchema(data, cache, opts.toolSchemaDir, "", expansionOpts);
  } else {
    results = await validateFormat2StepsJsonSchema(data, cache, opts.toolSchemaDir, "", expansionOpts);
  }

  if (results.length === 0) {
    console.log("No tool steps to validate state for.");
    process.exitCode = 0;
    return;
  }

  let stateOk = true;
  let validated = 0;
  let skipped = 0;

  for (const r of results) {
    if (r.status === "skip") {
      skipped++;
      console.warn(`  [${r.stepLabel}] skipped — ${r.errors[0] ?? "unknown"}`);
    } else if (r.status === "fail") {
      validated++;
      stateOk = false;
      console.error(`  [${r.stepLabel}] tool_state errors (${r.toolId}):`);
      for (const line of r.errors) {
        console.error(`    ${line}`);
      }
    } else {
      validated++;
      console.log(`  [${r.stepLabel}] tool_state: OK`);
    }
  }

  console.log(`\nTool state (json-schema): ${validated} validated, ${skipped} skipped`);
  process.exitCode = stateOk ? 0 : 1;
}

// --- Native validation (json-schema) ---

export async function validateNativeStepsJsonSchema(
  data: Record<string, unknown>,
  cache: ToolCache,
  toolSchemaDir?: string,
  prefix = "",
  expansionOpts?: ExpansionOptions,
): Promise<StepValidationResult[]> {
  const expanded = await expandedNative(data, expansionOpts);
  return _validateNativeWorkflowJsonSchema(expanded, cache, toolSchemaDir, prefix);
}

async function _validateNativeWorkflowJsonSchema(
  wf: NormalizedNativeWorkflow,
  cache: ToolCache,
  toolSchemaDir: string | undefined,
  prefix: string,
): Promise<StepValidationResult[]> {
  const results: StepValidationResult[] = [];

  for (const [key, step] of Object.entries(wf.steps)) {
    const stepLabel = prefix ? `${prefix}${key}` : key;

    if (step.type === "subworkflow" && step.subworkflow) {
      const subResults = await _validateNativeWorkflowJsonSchema(
        step.subworkflow, cache, toolSchemaDir, `${stepLabel}.`,
      );
      results.push(...subResults);
      continue;
    }

    const toolId = step.tool_id;
    if (!toolId) continue;
    const toolVersion = step.tool_version ?? null;

    const result = await _validateNativeStepJsonSchema(
      step, stepLabel, toolId, toolVersion, cache, toolSchemaDir,
    );
    results.push(result);
  }

  return results;
}

async function _validateNativeStepJsonSchema(
  step: NormalizedNativeStep,
  stepLabel: string,
  toolId: string,
  toolVersion: string | null,
  cache: ToolCache,
  toolSchemaDir?: string,
): Promise<StepValidationResult> {
  const resolved = await loadCachedTool(cache, toolId, toolVersion);
  if (isResolveError(resolved)) {
    const reason = resolved.kind === "no_version"
      ? `no version for ${toolId}`
      : `${toolId} not in cache`;
    return { stepLabel, toolId, toolVersion, status: "skip", errors: [reason] };
  }

  const bundle: ToolParameterBundleModel = {
    parameters: resolved.tool.inputs as ToolParameterBundleModel["parameters"],
  };

  const replacementScan = scanForReplacements(bundle.parameters, step.tool_state as Record<string, unknown>);
  if (replacementScan === "yes") {
    return { stepLabel, toolId, toolVersion, status: "skip", errors: ["replacement parameters detected"] };
  }

  const state = structuredClone(step.tool_state) as Record<string, unknown>;
  const connections: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(step.input_connections)) {
    connections[k] = v;
  }
  injectConnectionsIntoState(bundle.parameters, state, connections);

  const validate = getOrBuildValidator(toolId, toolVersion, bundle, "workflow_step_native", toolSchemaDir);
  if (!validate) {
    return { stepLabel, toolId, toolVersion, status: "skip", errors: ["unsupported parameter types"] };
  }

  const valid = validate(state);
  if (!valid) {
    return { stepLabel, toolId, toolVersion, status: "fail", errors: formatAjvErrors(validate) };
  }
  return { stepLabel, toolId, toolVersion, status: "ok", errors: [] };
}

// --- Format2 validation (json-schema) ---

export async function validateFormat2StepsJsonSchema(
  data: Record<string, unknown>,
  cache: ToolCache,
  toolSchemaDir?: string,
  prefix = "",
  expansionOpts?: ExpansionOptions,
): Promise<StepValidationResult[]> {
  const expanded = await expandedFormat2(data, expansionOpts);
  return _validateFormat2WorkflowJsonSchema(expanded, cache, toolSchemaDir, prefix);
}

async function _validateFormat2WorkflowJsonSchema(
  wf: NormalizedFormat2Workflow,
  cache: ToolCache,
  toolSchemaDir: string | undefined,
  prefix: string,
): Promise<StepValidationResult[]> {
  const results: StepValidationResult[] = [];

  for (let i = 0; i < wf.steps.length; i++) {
    const step = wf.steps[i];
    const stepLabel = prefix ? `${prefix}${i}` : String(i);

    if (step.run && typeof step.run === "object") {
      const subResults = await _validateFormat2WorkflowJsonSchema(
        step.run as NormalizedFormat2Workflow, cache, toolSchemaDir, `${stepLabel}.`,
      );
      results.push(...subResults);
      continue;
    }

    const toolId = step.tool_id;
    if (!toolId) continue;
    const toolVersion = step.tool_version ?? null;

    const result = await _validateFormat2StepJsonSchema(
      step, stepLabel, toolId, toolVersion, cache, toolSchemaDir,
    );
    results.push(result);
  }

  return results;
}

async function _validateFormat2StepJsonSchema(
  step: NormalizedFormat2Step,
  stepLabel: string,
  toolId: string,
  toolVersion: string | null,
  cache: ToolCache,
  toolSchemaDir?: string,
): Promise<StepValidationResult> {
  const resolved = await loadCachedTool(cache, toolId, toolVersion);
  if (isResolveError(resolved)) {
    const reason = resolved.kind === "no_version"
      ? `no version for ${toolId}`
      : `${toolId} not in cache`;
    return { stepLabel, toolId, toolVersion, status: "skip", errors: [reason] };
  }

  const bundle: ToolParameterBundleModel = {
    parameters: resolved.tool.inputs as ToolParameterBundleModel["parameters"],
  };

  const rawState = step.state ?? step.tool_state ?? {};
  const state = rawState as Record<string, unknown>;

  // Level 1: base validation against workflow_step
  const baseValidate = getOrBuildValidator(toolId, toolVersion, bundle, "workflow_step", toolSchemaDir);
  if (!baseValidate) {
    return { stepLabel, toolId, toolVersion, status: "skip", errors: ["unsupported parameter types"] };
  }

  const baseValid = baseValidate(state);
  if (!baseValid) {
    return { stepLabel, toolId, toolVersion, status: "fail", errors: formatAjvErrors(baseValidate) };
  }

  // Build connections dict from step.in
  const connections: Record<string, unknown> = {};
  for (const stepInput of step.in) {
    if (stepInput.id && stepInput.source) {
      const src = stepInput.source;
      connections[stepInput.id] = Array.isArray(src) ? src : [src];
    }
  }

  // Level 2: linked validation with connections injected
  if (Object.keys(connections).length > 0) {
    const linkedState = structuredClone(state);
    const remaining = injectConnectionsIntoState(bundle.parameters, linkedState, connections);

    const unmatchedKeys = Object.keys(remaining);
    if (unmatchedKeys.length > 0) {
      return {
        stepLabel, toolId, toolVersion, status: "fail",
        errors: unmatchedKeys.map((k) => `No parameter definition matching connection key "${k}"`),
      };
    }

    const linkedValidate = getOrBuildValidator(toolId, toolVersion, bundle, "workflow_step_linked", toolSchemaDir);
    if (!linkedValidate) {
      return { stepLabel, toolId, toolVersion, status: "skip", errors: ["unsupported parameter types"] };
    }

    const linkedValid = linkedValidate(linkedState);
    if (!linkedValid) {
      return { stepLabel, toolId, toolVersion, status: "fail", errors: formatAjvErrors(linkedValidate) };
    }
  }

  return { stepLabel, toolId, toolVersion, status: "ok", errors: [] };
}
