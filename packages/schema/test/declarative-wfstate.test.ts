/**
 * Declarative workflow_state tests driven by YAML expectation files.
 *
 * Port of Galaxy's test/unit/tool_util/workflow_state/test_declarative.py.
 * Expectation files live in test/fixtures/workflow-state/expectations/.
 * Fixtures live in test/fixtures/workflow-state/fixtures/.
 */

import { describe, it, expect } from "vitest";
import * as yaml from "yaml";
import * as fs from "node:fs";
import * as path from "node:path";
import * as S from "effect/Schema";
import * as ParseResult from "effect/ParseResult";

import { createHash } from "node:crypto";
import { join } from "node:path";
import { cacheKey } from "@galaxy-tool-util/core";
import { getCacheDir, makeNodeToolCache } from "@galaxy-tool-util/core/node";

import {
  cleanWorkflow,
  createFieldModel,
  detectFormat,
  injectConnectionsIntoState,
  stripConnectedValues,
  scanForReplacements,
  scanToolState,
  normalizedFormat2,
  type NormalizedFormat2Workflow,
  type NormalizedFormat2Step,
  type ToolParameterBundleModel,
  type ToolInputsResolver,
  type ToolParameterModel,
} from "../src/index.js";

import { loadExpectations, runAssertions } from "./declarative-test-utils.js";

// --- Directories ---

const FIXTURES_DIR = path.join(import.meta.dirname, "fixtures", "workflow-state");
const EXPECTATIONS_DIR = path.join(FIXTURES_DIR, "expectations");
const WF_FIXTURES_DIR = path.join(FIXTURES_DIR, "fixtures");

// Operations that require a populated tool cache to produce meaningful results
const CACHE_DEPENDENT_OPERATIONS = new Set(["validate", "validate_clean", "clean_then_validate"]);
// Tests that may fail without the tool cache (tool-aware state stripping needs resolver)
const MAY_FAIL_WITHOUT_CACHE = new Set(["clean_format2_stale_keys_stripped"]);

function toolCacheAvailable(): boolean {
  const dir = getCacheDir();
  return fs.existsSync(dir) && fs.readdirSync(dir).some((f) => f.endsWith(".json"));
}

// --- Tool info resolution ---
// Uses the default ToolCache (~/.galaxy/tool_info_cache), mirroring Galaxy's
// build_tool_info() which creates ToolShedGetToolInfo from the user cache.

interface GetToolInfo {
  getToolInfo(toolId: string, toolVersion?: string | null): Promise<ParsedTool | null>;
}

function createToolInfo(): GetToolInfo {
  const cache = makeNodeToolCache();
  return {
    async getToolInfo(toolId: string, toolVersion?: string | null): Promise<ParsedTool | null> {
      const coords = cache.resolveToolCoordinates(toolId, toolVersion);
      // Match Galaxy's convention: stock tools without a version use "_default_"
      const version = coords.version ?? "_default_";
      const key = await cacheKey(coords.toolshedUrl, coords.trsToolId, version);
      return cache.loadCached(key);
    },
  };
}

// --- Validation helpers ---

function formatIssues(error: ParseResult.ParseError): string[] {
  const issues = ParseResult.ArrayFormatter.formatErrorSync(error);
  return issues.map((i) => `${i.path.join(".")}: ${i.message}`);
}

interface StepValidationResult {
  step: string;
  tool_id: string;
  status: "ok" | "fail" | "skip_tool_not_found" | "skip_replacement_params";
  errors: string[];
}

// --- Precheck: legacy encoding detection ---

async function precheckNativeWorkflow(
  workflowDict: Record<string, unknown>,
  toolInfo: GetToolInfo,
): Promise<{ canProcess: boolean; detail: string }> {
  const steps = workflowDict.steps as Record<string, Record<string, unknown>> | undefined;
  if (!steps) return { canProcess: true, detail: "" };

  for (const stepDef of Object.values(steps)) {
    // Recurse into subworkflows
    if (stepDef.type === "subworkflow" && stepDef.subworkflow) {
      const sub = await precheckNativeWorkflow(
        stepDef.subworkflow as Record<string, unknown>,
        toolInfo,
      );
      if (!sub.canProcess) return sub;
      continue;
    }

    const toolId = stepDef.tool_id as string | undefined;
    if (!toolId) continue;

    let toolState = stepDef.tool_state;
    if (!toolState) continue;

    // Mirror Galaxy's precheck: parse string tool_state, then scan the
    // parsed dict for per-parameter legacy encoding signals using tool info.
    if (typeof toolState === "string") {
      try {
        toolState = JSON.parse(toolState);
      } catch {
        continue;
      }
    }
    if (typeof toolState !== "object" || toolState === null) continue;

    const toolVersion = (stepDef.tool_version as string) ?? null;
    const parsedTool = await toolInfo.getToolInfo(toolId, toolVersion);
    if (!parsedTool) continue;

    const result = scanToolState(
      parsedTool.inputs as ToolParameterBundleModel["parameters"],
      toolState as Record<string, unknown>,
    );
    if (result.classification === "yes") {
      return {
        canProcess: false,
        detail: `Legacy encoding detected: ${result.hits.map((h) => h.parameterName).join(", ")}`,
      };
    }
  }
  return { canProcess: true, detail: "" };
}

// --- Native step validation ---

async function validateNativeStep(
  stepDef: Record<string, unknown>,
  stepLabel: string,
  toolInfo: GetToolInfo,
): Promise<StepValidationResult | null> {
  const toolId = stepDef.tool_id as string | undefined;
  if (!toolId) return null;
  const toolVersion = (stepDef.tool_version as string) ?? null;

  const parsedTool = await toolInfo.getToolInfo(toolId, toolVersion);
  if (!parsedTool) {
    return {
      step: stepLabel,
      tool_id: toolId,
      status: "skip_tool_not_found",
      errors: ["tool not in cache"],
    };
  }

  const bundle: ToolParameterBundleModel = {
    parameters: parsedTool.inputs as ToolParameterBundleModel["parameters"],
  };

  let toolState = stepDef.tool_state;
  if (typeof toolState === "string") {
    try {
      toolState = JSON.parse(toolState);
    } catch {
      /* keep as-is */
    }
  }
  if (!toolState || typeof toolState !== "object") {
    return {
      step: stepLabel,
      tool_id: toolId,
      status: "skip_tool_not_found",
      errors: ["no tool_state"],
    };
  }

  // Skip if replacement parameters detected
  const replacementScan = scanForReplacements(
    bundle.parameters,
    toolState as Record<string, unknown>,
  );
  if (replacementScan === "yes") {
    return {
      step: stepLabel,
      tool_id: toolId,
      status: "skip_replacement_params",
      errors: ["replacement parameters"],
    };
  }

  // Deep copy state and inject connection markers
  const state = structuredClone(toolState) as Record<string, unknown>;
  const inputConnections = (stepDef.input_connections ?? {}) as Record<string, unknown>;
  const connections: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(inputConnections)) {
    connections[key] = val;
  }
  injectConnectionsIntoState(bundle.parameters, state, connections);

  // Validate against workflow_step_native with strict excess property checking
  const fieldModel = createFieldModel(bundle, "workflow_step_native");
  if (!fieldModel) {
    return {
      step: stepLabel,
      tool_id: toolId,
      status: "skip_tool_not_found",
      errors: ["unsupported parameter types"],
    };
  }

  const validate = S.decodeUnknownEither(fieldModel as S.Schema<any>, {
    onExcessProperty: "error",
  });
  const result = validate(state);

  if (result._tag === "Left") {
    return { step: stepLabel, tool_id: toolId, status: "fail", errors: formatIssues(result.left) };
  }
  return { step: stepLabel, tool_id: toolId, status: "ok", errors: [] };
}

// --- Native workflow validation (recursive) ---

async function validateNativeWorkflow(
  workflowDict: Record<string, unknown>,
  toolInfo: GetToolInfo,
  prefix = "",
): Promise<StepValidationResult[]> {
  const results: StepValidationResult[] = [];
  const steps = workflowDict.steps as Record<string, Record<string, unknown>> | undefined;
  if (!steps) return results;

  for (const [key, stepDef] of Object.entries(steps).sort(([a], [b]) => Number(a) - Number(b))) {
    const stepLabel = prefix ? `${prefix}${key}` : key;

    if (stepDef.type === "subworkflow" && stepDef.subworkflow) {
      const subResults = await validateNativeWorkflow(
        stepDef.subworkflow as Record<string, unknown>,
        toolInfo,
        `${stepLabel}.`,
      );
      results.push(...subResults);
      continue;
    }

    const result = await validateNativeStep(stepDef, stepLabel, toolInfo);
    if (result) results.push(result);
  }
  return results;
}

// --- Format2 step validation ---

async function validateFormat2Step(
  step: NormalizedFormat2Step,
  stepLabel: string,
  toolInfo: GetToolInfo,
): Promise<StepValidationResult | null> {
  const toolId = step.tool_id;
  if (!toolId) return null;
  const toolVersion = step.tool_version ?? null;

  const parsedTool = await toolInfo.getToolInfo(toolId, toolVersion);
  if (!parsedTool) {
    return {
      step: stepLabel,
      tool_id: toolId,
      status: "skip_tool_not_found",
      errors: ["tool not in cache"],
    };
  }

  const bundle: ToolParameterBundleModel = {
    parameters: parsedTool.inputs as ToolParameterBundleModel["parameters"],
  };

  const rawState = (step.state ?? step.tool_state ?? {}) as Record<string, unknown>;
  const state = structuredClone(rawState);
  stripConnectedValues(bundle.parameters, state);

  // Base validation
  const baseModel = createFieldModel(bundle, "workflow_step");
  if (!baseModel) {
    return {
      step: stepLabel,
      tool_id: toolId,
      status: "skip_tool_not_found",
      errors: ["unsupported parameter types"],
    };
  }

  const baseValidate = S.decodeUnknownEither(baseModel as S.Schema<any>, {
    onExcessProperty: "error",
  });
  const baseResult = baseValidate(state);
  if (baseResult._tag === "Left") {
    return {
      step: stepLabel,
      tool_id: toolId,
      status: "fail",
      errors: formatIssues(baseResult.left),
    };
  }

  // Linked validation with connections
  const connections: Record<string, unknown> = {};
  for (const stepInput of step.in) {
    if (stepInput.id && stepInput.source) {
      connections[stepInput.id] = Array.isArray(stepInput.source)
        ? stepInput.source
        : [stepInput.source];
    }
  }
  if (Object.keys(connections).length > 0) {
    const linkedState = structuredClone(state);
    injectConnectionsIntoState(bundle.parameters, linkedState, connections);

    const linkedModel = createFieldModel(bundle, "workflow_step_linked");
    if (!linkedModel) {
      return {
        step: stepLabel,
        tool_id: toolId,
        status: "skip_tool_not_found",
        errors: ["unsupported parameter types"],
      };
    }

    const linkedValidate = S.decodeUnknownEither(linkedModel as S.Schema<any>, {
      onExcessProperty: "error",
    });
    const linkedResult = linkedValidate(linkedState);
    if (linkedResult._tag === "Left") {
      return {
        step: stepLabel,
        tool_id: toolId,
        status: "fail",
        errors: formatIssues(linkedResult.left),
      };
    }
  }

  return { step: stepLabel, tool_id: toolId, status: "ok", errors: [] };
}

// --- Format2 workflow validation ---

async function validateFormat2Workflow(
  workflowDict: Record<string, unknown>,
  toolInfo: GetToolInfo,
  prefix = "",
): Promise<StepValidationResult[]> {
  const results: StepValidationResult[] = [];
  const normalized = normalizedFormat2(workflowDict) as NormalizedFormat2Workflow;

  for (let i = 0; i < normalized.steps.length; i++) {
    const step = normalized.steps[i];
    const stepLabel = prefix ? `${prefix}${i}` : String(i);

    if (step.run && typeof step.run === "object") {
      const subResults = await validateFormat2Workflow(
        step.run as Record<string, unknown>,
        toolInfo,
        `${stepLabel}.`,
      );
      results.push(...subResults);
      continue;
    }

    const result = await validateFormat2Step(step, stepLabel, toolInfo);
    if (result) results.push(result);
  }
  return results;
}

// --- Operations ---

type Operation = (raw: unknown) => unknown | Promise<unknown>;

const toolInfo = createToolInfo();

async function validateOp(wfDict: unknown): Promise<unknown> {
  const workflow = structuredClone(wfDict as Record<string, unknown>);
  const format = detectFormat(workflow);

  if (format === "native") {
    // Precheck for legacy encoding
    const precheck = await precheckNativeWorkflow(workflow, toolInfo);
    if (!precheck.canProcess) {
      throw new Error(`Validation skipped: ${precheck.detail}`);
    }
  }

  // Validate all steps
  let results: StepValidationResult[];
  if (format === "native") {
    results = await validateNativeWorkflow(workflow, toolInfo);
  } else {
    results = await validateFormat2Workflow(workflow, toolInfo);
  }

  // Check for failures
  const failures = results.filter((r) => r.status === "fail");
  if (failures.length > 0) {
    const msgs = failures.map((r) => `step ${r.step} (${r.tool_id}): ${r.errors.join("; ")}`);
    throw new Error(`Validation failed:\n${msgs.join("\n")}`);
  }

  return workflow;
}

function makeToolInputsResolver(): ToolInputsResolver | undefined {
  if (!toolCacheAvailable()) return undefined;
  const cache = makeNodeToolCache();
  const cacheDir = getCacheDir();
  return (toolId: string, toolVersion: string | null) => {
    const coords = cache.resolveToolCoordinates(toolId, toolVersion);
    const version = coords.version ?? "_default_";
    // Sync hash (node:crypto) required here since ToolInputsResolver is synchronous.
    const raw = `${coords.toolshedUrl}/${coords.trsToolId}/${version}`;
    const key = createHash("sha256").update(raw).digest("hex");
    const filePath = join(cacheDir, `${key}.json`);
    if (!fs.existsSync(filePath)) return undefined;
    try {
      const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      return (data.inputs ?? []) as ToolParameterModel[];
    } catch {
      return undefined;
    }
  };
}

async function cleanOp(wfDict: unknown): Promise<unknown> {
  const workflow = structuredClone(wfDict as Record<string, unknown>);
  return (await cleanWorkflow(workflow, { toolInputsResolver: makeToolInputsResolver() })).workflow;
}

async function cleanSkipUuidOp(wfDict: unknown): Promise<unknown> {
  const workflow = structuredClone(wfDict as Record<string, unknown>);
  return (
    await cleanWorkflow(workflow, { skipUuid: true, toolInputsResolver: makeToolInputsResolver() })
  ).workflow;
}

async function validateCleanOp(wfDict: unknown): Promise<unknown> {
  // Clean an internal copy, then validate it — return original on success
  const { workflow: cleaned } = await cleanWorkflow(
    structuredClone(wfDict as Record<string, unknown>),
  );
  await validateOp(cleaned);
  return wfDict;
}

async function cleanThenValidateOp(wfDict: unknown): Promise<unknown> {
  // Mutating clean, then validate — return the cleaned workflow
  const { workflow: cleaned } = await cleanWorkflow(
    structuredClone(wfDict as Record<string, unknown>),
  );
  await validateOp(cleaned);
  return cleaned;
}

const OPERATIONS: Record<string, Operation> = {
  validate: validateOp,
  clean: cleanOp,
  clean_skip_uuid: cleanSkipUuidOp,
  validate_clean: validateCleanOp,
  clean_then_validate: cleanThenValidateOp,
};

const UNSUPPORTED_OPERATIONS = new Set<string>(["export_format2"]);

// --- Fixture loading ---

function fixtureExists(name: string): boolean {
  return fs.existsSync(path.join(WF_FIXTURES_DIR, name));
}

function loadWorkflow(name: string): unknown {
  const filePath = path.join(WF_FIXTURES_DIR, name);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Fixture not found: ${name}`);
  }
  const content = fs.readFileSync(filePath, "utf-8");
  if (name.endsWith(".ga")) {
    return JSON.parse(content);
  }
  return yaml.parse(content);
}

// --- Test runner ---

function expectationsExist(): boolean {
  return (
    fs.existsSync(EXPECTATIONS_DIR) &&
    fs.readdirSync(EXPECTATIONS_DIR).some((f) => f.endsWith(".yml"))
  );
}

describe("declarative workflow_state tests", () => {
  if (!expectationsExist()) {
    it.skip("expectations not synced (run 'make sync-wfstate-expectations')", () => {});
    return;
  }

  const ALL_CASES = loadExpectations(EXPECTATIONS_DIR);

  for (const [testId, testCase] of ALL_CASES) {
    const { fixture, operation } = testCase;
    const expectError = testCase.expect_error ?? false;
    const assertions = testCase.assertions ?? [];

    if (!fixtureExists(fixture)) {
      it.skip(`${testId} (fixture not synced: ${fixture})`, () => {});
      continue;
    }

    if (UNSUPPORTED_OPERATIONS.has(operation)) {
      it.skip(`${testId} (unsupported operation: ${operation})`, () => {});
      continue;
    }

    if (CACHE_DEPENDENT_OPERATIONS.has(operation) && !toolCacheAvailable()) {
      it.skip(`${testId} (tool cache not populated)`, () => {});
      continue;
    }

    if (MAY_FAIL_WITHOUT_CACHE.has(testId) && !toolCacheAvailable()) {
      it.fails(testId, async () => {
        const wf = await Promise.resolve(OPERATIONS[operation](loadWorkflow(fixture)));
        runAssertions(wf, assertions);
      });
      continue;
    }

    if (!(operation in OPERATIONS)) {
      it.fails(`${testId} (unknown operation: ${operation})`, () => {
        throw new Error(`Operation "${operation}" is not in OPERATIONS or UNSUPPORTED_OPERATIONS`);
      });
      continue;
    }

    it(testId, async () => {
      const raw = loadWorkflow(fixture);

      if (expectError) {
        let result: unknown;
        try {
          result = OPERATIONS[operation](raw);
        } catch {
          return;
        }
        if (result instanceof Promise) {
          await expect(result).rejects.toThrow();
        } else {
          expect.unreachable("Expected operation to throw");
        }
        return;
      }

      const wf = await Promise.resolve(OPERATIONS[operation](raw));
      runAssertions(wf, assertions);
    });
  }
});
