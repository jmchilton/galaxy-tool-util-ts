/**
 * Workflow graph builder. Mirrors `connection_graph.py:build_workflow_graph`.
 *
 * Walks a normalized native workflow, resolves step types, extracts typed
 * inputs/outputs from `ParsedTool` definitions, and topologically orders steps.
 */

import { normalizedNative } from "@galaxy-tool-util/schema";
import { toNative } from "@galaxy-tool-util/schema";
import type { NormalizedNativeStep, NormalizedNativeWorkflow } from "@galaxy-tool-util/schema";
import type { ConditionalParameterModel, ToolParameterModel } from "@galaxy-tool-util/schema";

import type { GetToolInfo } from "./get-tool-info.js";
import type {
  ConnectionRef,
  ResolvedInput,
  ResolvedInputType,
  ResolvedOutput,
  ResolvedOutputDataType,
  ResolvedStep,
  WorkflowGraph,
} from "./types.js";
import { topsort } from "./topsort.js";

const PARAMETER_INPUT_TYPES: ReadonlySet<string> = new Set([
  "gx_text",
  "gx_integer",
  "gx_float",
  "gx_boolean",
  "gx_color",
  "gx_select",
]);

interface RawConnection {
  id: number | string;
  output_name: string;
  input_subworkflow_step_id?: number | string | null;
}

export function buildWorkflowGraph(workflow: unknown, getToolInfo: GetToolInfo): WorkflowGraph {
  const native = _coerceNormalizedNative(workflow);
  return _buildFromNormalized(native, getToolInfo);
}

function _coerceNormalizedNative(workflow: unknown): NormalizedNativeWorkflow {
  if (workflow == null || typeof workflow !== "object") {
    throw new Error("buildWorkflowGraph: workflow must be an object");
  }
  const obj = workflow as Record<string, unknown>;
  if (obj.class === "GalaxyWorkflow") {
    return toNative(obj);
  }
  // Already native-shaped (raw .ga or already normalized).
  return normalizedNative(obj);
}

function _buildFromNormalized(
  workflow: NormalizedNativeWorkflow,
  getToolInfo: GetToolInfo,
): WorkflowGraph {
  const steps: Record<string, ResolvedStep> = {};
  for (const [stepId, step] of Object.entries(workflow.steps)) {
    steps[stepId] = _resolveStep(stepId, step, getToolInfo);
  }
  const sorted = _topologicalSort(steps);
  return { steps, sortedStepIds: sorted };
}

function _resolveStep(
  stepId: string,
  step: NormalizedNativeStep,
  getToolInfo: GetToolInfo,
): ResolvedStep {
  const label = step.label ?? null;
  const stepType = step.type ?? "tool";
  let resolved: ResolvedStep;
  if (
    stepType === "data_input" ||
    stepType === "data_collection_input" ||
    stepType === "parameter_input"
  ) {
    resolved = _resolveInputStep(stepId, step, stepType);
  } else if (stepType === "tool") {
    resolved = _resolveToolStep(stepId, step, getToolInfo);
  } else if (stepType === "subworkflow") {
    resolved = _resolveSubworkflowStep(stepId, step, getToolInfo);
  } else {
    resolved = _emptyStep(stepId, null, stepType);
  }
  resolved.label = label;
  return resolved;
}

function _emptyStep(stepId: string, toolId: string | null, stepType: string): ResolvedStep {
  return {
    stepId,
    toolId,
    stepType,
    inputs: {},
    outputs: {},
    connections: {},
    subworkflowOutputMap: {},
  };
}

function _resolveInputStep(
  stepId: string,
  step: NormalizedNativeStep,
  stepType: "data_input" | "data_collection_input" | "parameter_input",
): ResolvedStep {
  const toolState = step.tool_state ?? {};
  if (stepType === "data_input") {
    return {
      ..._emptyStep(stepId, null, stepType),
      outputs: { output: { name: "output", type: "data" } },
    };
  }
  if (stepType === "data_collection_input") {
    const collectionType = (toolState.collection_type as string | undefined) ?? "list";
    return {
      ..._emptyStep(stepId, null, stepType),
      outputs: {
        output: { name: "output", type: "collection", collectionType },
      },
      declaredCollectionType: collectionType,
    };
  }
  // parameter_input
  const paramType = (toolState.parameter_type as string | undefined) ?? "text";
  return {
    ..._emptyStep(stepId, null, stepType),
    outputs: {
      output: {
        name: "output",
        type: paramType as ResolvedOutputDataType,
      },
    },
  };
}

function _resolveToolStep(
  stepId: string,
  step: NormalizedNativeStep,
  getToolInfo: GetToolInfo,
): ResolvedStep {
  const connections = _parseConnections(step);
  let inputs: Record<string, ResolvedInput> = {};
  let outputs: Record<string, ResolvedOutput> = {};

  if (step.tool_id) {
    const parsed = getToolInfo.getToolInfo(step.tool_id, step.tool_version);
    if (parsed) {
      inputs = _collectInputs(parsed.inputs as ToolParameterModel[], step.tool_state ?? {});
      outputs = _collectOutputs(parsed.outputs);
      // Python additionally calls _resolve_rules_collection_types here to
      // populate `collection_type` from a RuleSet mapping when the output
      // declares `collection_type_from_rules`. RuleSet (galaxy.util.rules_dsl)
      // is not yet ported — affected outputs stay unresolved (ANY) instead of
      // gaining a concrete type. Outputs without rules-driven types behave
      // identically to Python.
    }
  }

  if (step.when && "when" in connections) {
    inputs.when = { name: "when", statePath: "when", type: "boolean" };
  }

  return {
    stepId,
    toolId: step.tool_id ?? null,
    toolVersion: step.tool_version ?? null,
    stepType: "tool",
    inputs,
    outputs,
    connections,
    subworkflowOutputMap: {},
  };
}

function _resolveSubworkflowStep(
  stepId: string,
  step: NormalizedNativeStep,
  getToolInfo: GetToolInfo,
): ResolvedStep {
  const connections = _parseConnections(step);
  let innerGraph: WorkflowGraph | undefined;
  let outputMap: Record<string, [string, string]> = {};
  let inputs: Record<string, ResolvedInput> = {};

  if (step.subworkflow != null) {
    innerGraph = _buildFromNormalized(step.subworkflow, getToolInfo);
    outputMap = _buildSubworkflowOutputMap(step.subworkflow);
    inputs = _synthesizeSubworkflowInputs(connections, innerGraph);
  }

  if (step.when && "when" in connections) {
    inputs.when = { name: "when", statePath: "when", type: "boolean" };
  }

  return {
    stepId,
    toolId: null,
    stepType: "subworkflow",
    inputs,
    outputs: {},
    connections,
    innerGraph,
    subworkflowOutputMap: outputMap,
  };
}

function _synthesizeSubworkflowInputs(
  connections: Record<string, ConnectionRef[]>,
  innerGraph: WorkflowGraph,
): Record<string, ResolvedInput> {
  const inputs: Record<string, ResolvedInput> = {};
  for (const [inputPath, refs] of Object.entries(connections)) {
    for (const ref of refs) {
      const innerId = ref.inputSubworkflowStepId;
      if (innerId && innerId in innerGraph.steps) {
        const innerStep = innerGraph.steps[innerId];
        inputs[inputPath] = _inputFromInnerStep(innerStep, inputPath);
      }
    }
  }
  return inputs;
}

function _inputFromInnerStep(innerStep: ResolvedStep, inputPath: string): ResolvedInput {
  if (innerStep.stepType === "data_collection_input") {
    return {
      name: inputPath,
      statePath: inputPath,
      type: "collection",
      collectionType: innerStep.declaredCollectionType ?? null,
    };
  }
  if (innerStep.stepType === "data_input") {
    return { name: inputPath, statePath: inputPath, type: "data" };
  }
  if (innerStep.stepType === "parameter_input") {
    const innerOutput = innerStep.outputs.output;
    const paramType = (innerOutput?.type ?? "text") as ResolvedInputType;
    return { name: inputPath, statePath: inputPath, type: paramType };
  }
  return { name: inputPath, statePath: inputPath, type: "data" };
}

function _buildSubworkflowOutputMap(
  subworkflow: NormalizedNativeWorkflow,
): Record<string, [string, string]> {
  const result: Record<string, [string, string]> = {};
  for (const [stepId, step] of Object.entries(subworkflow.steps)) {
    for (const wo of step.workflow_outputs ?? []) {
      if (!wo.output_name) continue;
      const externalName = wo.label || `${stepId}:${wo.output_name}`;
      result[externalName] = [stepId, wo.output_name];
    }
  }
  return result;
}

function _parseConnections(step: NormalizedNativeStep): Record<string, ConnectionRef[]> {
  const result: Record<string, ConnectionRef[]> = {};
  for (const [statePath, raw] of Object.entries(step.input_connections ?? {})) {
    const conns = raw as readonly RawConnection[];
    const refs: ConnectionRef[] = [];
    for (const conn of conns) {
      const subwfId = conn.input_subworkflow_step_id;
      refs.push({
        sourceStep: String(conn.id),
        outputName: conn.output_name,
        inputSubworkflowStepId:
          subwfId !== null && subwfId !== undefined ? String(subwfId) : undefined,
      });
    }
    if (refs.length > 0) result[statePath] = refs;
  }
  return result;
}

function _collectInputs(
  params: ToolParameterModel[],
  toolState: Record<string, unknown>,
  prefix?: string,
): Record<string, ResolvedInput> {
  const result: Record<string, ResolvedInput> = {};

  for (const param of params) {
    const name = (param as { name: string }).name;
    const statePath = prefix == null ? name : `${prefix}|${name}`;

    if (param.parameter_type === "gx_data") {
      result[statePath] = {
        name,
        statePath,
        type: "data",
        multiple: param.multiple ?? false,
        optional: param.optional ?? false,
        extensions: [...(param.extensions ?? ["data"])],
      };
    } else if (param.parameter_type === "gx_data_collection") {
      result[statePath] = {
        name,
        statePath,
        type: "collection",
        collectionType: param.collection_type ?? null,
        optional: param.optional ?? false,
        extensions: [...(param.extensions ?? ["data"])],
      };
    } else if (PARAMETER_INPUT_TYPES.has(param.parameter_type)) {
      const paramType = param.parameter_type.slice(3) as ResolvedInputType;
      result[statePath] = { name, statePath, type: paramType };
    } else if (param.parameter_type === "gx_conditional") {
      const cond = param as ConditionalParameterModel;
      const condState = _asRecord(toolState[name]);
      const targetWhen = _selectWhich(cond, condState);
      if (targetWhen) {
        Object.assign(result, _collectInputs(targetWhen.parameters, condState, statePath));
      } else {
        for (const when of cond.whens) {
          Object.assign(result, _collectInputs(when.parameters, condState, statePath));
        }
      }
    } else if (param.parameter_type === "gx_repeat") {
      const innerParams = (param.parameters ?? []) as ToolParameterModel[];
      const repeatVal = toolState[name];
      const instances = Array.isArray(repeatVal) ? repeatVal : [];
      if (instances.length > 0) {
        for (let idx = 0; idx < instances.length; idx++) {
          const instance = _asRecord(instances[idx]);
          const indexedPrefix = prefix == null ? `${name}_${idx}` : `${prefix}|${name}_${idx}`;
          Object.assign(result, _collectInputs(innerParams, instance, indexedPrefix));
        }
      } else {
        Object.assign(result, _collectInputs(innerParams, {}, statePath));
      }
    } else if (param.parameter_type === "gx_section") {
      const sectionState = _asRecord(toolState[name]);
      const innerParams = (param.parameters ?? []) as ToolParameterModel[];
      Object.assign(result, _collectInputs(innerParams, sectionState, statePath));
    }
  }

  return result;
}

function _asRecord(v: unknown): Record<string, unknown> {
  if (v != null && typeof v === "object" && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return {};
}

function _selectWhich(
  cond: ConditionalParameterModel,
  state: Record<string, unknown>,
): { parameters: ToolParameterModel[] } | null {
  const testName = cond.test_parameter.name;
  const testValueRaw = state[testName];
  const testValue = testValueRaw === undefined || testValueRaw === null ? null : testValueRaw;

  if (testValue !== null) {
    for (const when of cond.whens) {
      if (_discriminatorMatches(testValue, when.discriminator)) {
        return when;
      }
    }
  }
  for (const when of cond.whens) {
    if (when.is_default_when) return when;
  }
  return null;
}

function _discriminatorMatches(value: unknown, discriminator: unknown): boolean {
  if (typeof discriminator === "boolean" && typeof value === "boolean") {
    return discriminator === value;
  }
  return String(value) === String(discriminator);
}

function _collectOutputs(rawOutputs: readonly unknown[]): Record<string, ResolvedOutput> {
  const result: Record<string, ResolvedOutput> = {};
  for (const raw of rawOutputs) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    const name = o.name as string;
    if (!name) continue;
    const type = o.type as string | undefined;
    if (type === "data") {
      result[name] = {
        name,
        type: "data",
        format: (o.format as string | null | undefined) ?? null,
        formatSource: (o.format_source as string | null | undefined) ?? null,
      };
    } else if (type === "collection") {
      const structure = (o.structure ?? {}) as Record<string, unknown>;
      result[name] = {
        name,
        type: "collection",
        collectionType: (structure.collection_type as string | null | undefined) ?? null,
        collectionTypeSource:
          (structure.collection_type_source as string | null | undefined) ?? null,
        collectionTypeFromRules:
          (structure.collection_type_from_rules as string | null | undefined) ?? null,
        structuredLike: (structure.structured_like as string | null | undefined) ?? null,
      };
    } else if (type === "text" || type === "integer" || type === "float" || type === "boolean") {
      result[name] = { name, type };
    }
  }
  return result;
}

function _topologicalSort(steps: Record<string, ResolvedStep>): string[] {
  const allIds = new Set(Object.keys(steps));
  const pairs: Array<[string, string]> = [];
  for (const [stepId, step] of Object.entries(steps)) {
    pairs.push([stepId, stepId]);
    for (const refs of Object.values(step.connections)) {
      for (const ref of refs) {
        if (allIds.has(ref.sourceStep)) {
          pairs.push([ref.sourceStep, stepId]);
        }
      }
    }
  }
  return topsort(pairs);
}
