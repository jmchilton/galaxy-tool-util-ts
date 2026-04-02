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
  type NormalizedNativeStep,
  type NormalizedNativeWorkflow,
  type NormalizedFormat2Step,
  type NormalizedFormat2Workflow,
  type ToolParameterBundleModel,
  type ExpansionOptions,
} from "@galaxy-tool-util/schema";
import * as ParseResult from "effect/ParseResult";
import * as S from "effect/Schema";
import { readFile } from "node:fs/promises";
import { dirname } from "node:path";
import * as YAML from "yaml";
import { isResolveError, loadCachedTool } from "./resolve-tool.js";
import { createDefaultResolver } from "./url-resolver.js";

export type WorkflowFormat = "format2" | "native";

export type ValidationMode = "effect" | "json-schema";

export interface ValidateWorkflowOptions {
  format?: string;
  toolState?: boolean;
  cacheDir?: string;
  mode?: ValidationMode;
  toolSchemaDir?: string;
}

function detectFormat(data: Record<string, unknown>): WorkflowFormat {
  if ("a_galaxy_workflow" in data) return "native";
  if (data.class === "GalaxyWorkflow") return "format2";
  if ("format-version" in data) return "native";
  return "format2";
}

function formatIssues(error: ParseResult.ParseError): string[] {
  const issues = ParseResult.ArrayFormatter.formatErrorSync(error);
  return issues.map((i) => `${i.path.join(".")}: ${i.message}`);
}

export interface StepValidationResult {
  stepLabel: string;
  toolId: string;
  toolVersion: string | null;
  status: "ok" | "fail" | "skip";
  errors: string[];
}

export async function runValidateWorkflow(
  filePath: string,
  opts: ValidateWorkflowOptions,
): Promise<void> {
  const raw = await readFile(filePath, "utf-8");
  let data: Record<string, unknown>;
  try {
    if (filePath.endsWith(".ga") || filePath.endsWith(".json")) {
      data = JSON.parse(raw);
    } else {
      data = YAML.parse(raw);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`Failed to parse ${filePath}: ${msg}`);
    process.exitCode = 1;
    return;
  }

  const format: WorkflowFormat =
    opts.format === "native" || opts.format === "format2"
      ? opts.format
      : detectFormat(data);

  const mode: ValidationMode = opts.mode === "json-schema" ? "json-schema" : "effect";
  console.log(`Detected format: ${format}, mode: ${mode}`);

  // Build expansion options for resolving external subworkflow references
  const workflowDirectory = dirname(filePath);
  const expansionOpts: ExpansionOptions = {
    resolver: createDefaultResolver({ workflowDirectory }),
  };

  if (mode === "json-schema") {
    const { runValidateWorkflowJsonSchema } = await import("./validate-workflow-json-schema.js");
    return runValidateWorkflowJsonSchema(data, format, opts, expansionOpts);
  }

  // --- structural validation (effect mode) ---
  const validationData = { ...data };
  if (format === "native" && !("class" in validationData)) {
    validationData.class = "NativeGalaxyWorkflow";
  } else if (format === "format2" && !("class" in validationData)) {
    validationData.class = "GalaxyWorkflow";
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const schema: S.Schema<any> =
    format === "native" ? NativeGalaxyWorkflowSchema : GalaxyWorkflowSchema;
  const decode = S.decodeUnknownEither(schema, { onExcessProperty: "ignore" });
  const structResult = decode(validationData);

  let structOk = true;
  if (structResult._tag === "Left") {
    structOk = false;
    console.error(`\nStructural validation errors:`);
    for (const line of formatIssues(structResult.left)) {
      console.error(`  ${line}`);
    }
  } else {
    console.log(`Structural validation: OK`);
  }

  // --- tool state validation (effect mode) ---
  if (opts.toolState === false) {
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

  if (results.length === 0) {
    console.log("No tool steps to validate state for.");
    process.exitCode = structOk ? 0 : 1;
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

  console.log(`\nTool state: ${validated} validated, ${skipped} skipped`);
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
    const reason = resolved.kind === "no_version"
      ? `no version for ${toolId}`
      : `${toolId} not in cache`;
    return { stepLabel, toolId, toolVersion, status: "skip", errors: [reason] };
  }

  const bundle: ToolParameterBundleModel = {
    parameters: resolved.tool.inputs as ToolParameterBundleModel["parameters"],
  };

  // Skip validation if replacement parameters (${...}) are present in typed fields
  const replacementScan = scanForReplacements(bundle.parameters, step.tool_state as Record<string, unknown>);
  if (replacementScan === "yes") {
    return { stepLabel, toolId, toolVersion, status: "skip", errors: ["replacement parameters detected"] };
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
    return { stepLabel, toolId, toolVersion, status: "skip", errors: ["unsupported parameter types"] };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const validate = S.decodeUnknownEither(fieldModel as S.Schema<any>, {
    onExcessProperty: "ignore",
  });
  const result = validate(state);

  if (result._tag === "Left") {
    return { stepLabel, toolId, toolVersion, status: "fail", errors: formatIssues(result.left) };
  }
  return { stepLabel, toolId, toolVersion, status: "ok", errors: [] };
}

// --- Format2 validation ---

async function validateFormat2Steps(
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
    const reason = resolved.kind === "no_version"
      ? `no version for ${toolId}`
      : `${toolId} not in cache`;
    return { stepLabel, toolId, toolVersion, status: "skip", errors: [reason] };
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
    return { stepLabel, toolId, toolVersion, status: "skip", errors: ["unsupported parameter types"] };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const baseValidate = S.decodeUnknownEither(baseModel as S.Schema<any>, {
    onExcessProperty: "ignore",
  });
  const baseResult = baseValidate(state);
  if (baseResult._tag === "Left") {
    return { stepLabel, toolId, toolVersion, status: "fail", errors: formatIssues(baseResult.left) };
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
        stepLabel, toolId, toolVersion, status: "fail",
        errors: unmatchedKeys.map((k) => `No parameter definition matching connection key "${k}"`),
      };
    }

    const linkedModel = createFieldModel(bundle, "workflow_step_linked");
    if (!linkedModel) {
      return { stepLabel, toolId, toolVersion, status: "skip", errors: ["unsupported parameter types"] };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const linkedValidate = S.decodeUnknownEither(linkedModel as S.Schema<any>, {
      onExcessProperty: "ignore",
    });
    const linkedResult = linkedValidate(linkedState);
    if (linkedResult._tag === "Left") {
      return { stepLabel, toolId, toolVersion, status: "fail", errors: formatIssues(linkedResult.left) };
    }
  }

  return { stepLabel, toolId, toolVersion, status: "ok", errors: [] };
}

