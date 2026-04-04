/**
 * Format2 → Native conversion.
 *
 * Port of gxformat2/normalized/_conversion.py to_native + helpers.
 */

import type { NormalizedNativeWorkflow, NormalizedNativeStep } from "./native.js";
import type {
  NormalizedFormat2Workflow,
  NormalizedFormat2Step,
  NormalizedFormat2Input,
  NormalizedFormat2StepOutput,
} from "./format2.js";
import { normalizedFormat2 } from "./format2.js";
import { unflattenCommentData } from "./comments.js";
import { isUnlabeled, resolveSourceReference } from "./labels.js";

function _uuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Step type aliases: Format2 shorthand → native type
const STEP_TYPE_ALIASES: Record<string, string> = {
  input: "data_input",
  input_collection: "data_collection_input",
  parameter: "parameter_input",
};

// --- Conversion context ---

class ConversionContext {
  labels = new Map<string, number>();

  stepId(labelOrId: string | number): number {
    const key = String(labelOrId);
    if (this.labels.has(key)) return this.labels.get(key)!;
    return parseInt(key, 10);
  }

  stepOutput(value: string): [number, string] {
    const [labelOrId, outputName] = resolveSourceReference(value, this.labels);
    return [this.stepId(labelOrId), outputName];
  }

  childContext(): ConversionContext {
    return new ConversionContext();
  }
}

// --- PJA definitions ---

interface PJADef {
  actionClass: string;
  defaultVal: unknown;
  arguments: (x: unknown) => Record<string, unknown>;
}

const POST_JOB_ACTIONS: Record<string, PJADef> = {
  hide: {
    actionClass: "HideDatasetAction",
    defaultVal: false,
    arguments: () => ({}),
  },
  rename: {
    actionClass: "RenameDatasetAction",
    defaultVal: {},
    arguments: (x) => ({ newname: x }),
  },
  delete_intermediate_datasets: {
    actionClass: "DeleteIntermediatesAction",
    defaultVal: false,
    arguments: () => ({}),
  },
  change_datatype: {
    actionClass: "ChangeDatatypeAction",
    defaultVal: {},
    arguments: (x) => ({ newtype: x }),
  },
  set_columns: {
    actionClass: "ColumnSetAction",
    defaultVal: {},
    arguments: (x) => x as Record<string, unknown>,
  },
  add_tags: {
    actionClass: "TagDatasetAction",
    defaultVal: [],
    arguments: (x) => ({ tags: (x as string[]).join(",") }),
  },
  remove_tags: {
    actionClass: "RemoveTagDatasetAction",
    defaultVal: [],
    arguments: (x) => ({ tags: (x as string[]).join(",") }),
  },
};

// --- Entry point ---

export interface ToNativeOptions {
  /**
   * Per-step callback: given a format2 step and its merged pre-native
   * state dict, return a replacement native tool_state dict, or null to
   * fall back to the default passthrough.
   */
  stateEncodeToNative?: (
    step: NormalizedFormat2Step,
    state: Record<string, unknown>,
  ) => Record<string, unknown> | null;
}

/**
 * Convert a Format2 workflow to normalized native Galaxy format.
 */
export function toNative(raw: unknown, options?: ToNativeOptions): NormalizedNativeWorkflow {
  let wf: NormalizedFormat2Workflow;
  if (_isNormalizedFormat2(raw)) {
    wf = raw;
  } else {
    wf = normalizedFormat2(raw);
  }

  const ctx = new ConversionContext();
  _registerLabels(wf, ctx);
  return _buildNativeWorkflow(wf, ctx, options);
}

function _isNormalizedFormat2(raw: unknown): raw is NormalizedFormat2Workflow {
  if (raw == null || typeof raw !== "object") return false;
  const obj = raw as Record<string, unknown>;
  return obj.class === "GalaxyWorkflow" && Array.isArray(obj.inputs) && Array.isArray(obj.steps);
}

function _registerLabels(wf: NormalizedFormat2Workflow, ctx: ConversionContext): void {
  for (let i = 0; i < wf.inputs.length; i++) {
    const inp = wf.inputs[i];
    if (inp.id) ctx.labels.set(inp.id, i);
  }
  for (let j = 0; j < wf.steps.length; j++) {
    const idx = wf.inputs.length + j;
    const label = wf.steps[j].label ?? wf.steps[j].id;
    if (label) ctx.labels.set(label, idx);
  }
}

// --- Workflow building ---

function _buildNativeWorkflow(
  wf: NormalizedFormat2Workflow,
  ctx: ConversionContext,
  options?: ToNativeOptions,
): NormalizedNativeWorkflow {
  const nativeSteps: Record<string, NormalizedNativeStep> = {};

  // Input steps
  for (let i = 0; i < wf.inputs.length; i++) {
    nativeSteps[String(i)] = _buildInputStep(wf.inputs[i], i);
  }

  // Non-input steps
  const inputsOffset = wf.inputs.length;
  for (let j = 0; j < wf.steps.length; j++) {
    const orderIndex = inputsOffset + j;
    nativeSteps[String(orderIndex)] = _buildStep(wf.steps[j], orderIndex, ctx, options);
  }

  // Wire workflow outputs
  _wireWorkflowOutputs(wf.outputs, nativeSteps, ctx);

  // Comments
  const comments = _buildNativeComments(wf, ctx);

  const wfAny = wf as Record<string, unknown>;
  const result: NormalizedNativeWorkflow = {
    a_galaxy_workflow: "true",
    "format-version": "0.1",
    name: wf.label ?? "Workflow",
    annotation: wf.doc ?? "",
    tags: (wf.tags as string[]) ?? [],
    uuid: (wf.uuid as string) || _uuid(),
    license: wf.license ?? undefined,
    release: wf.release ?? undefined,
    steps: nativeSteps,
    unique_tools: wf.unique_tools,
  };

  if (comments && comments.length > 0) {
    (result as Record<string, unknown>).comments = comments;
  }
  if (wfAny.report) {
    (result as Record<string, unknown>).report = {
      markdown: (wfAny.report as Record<string, unknown>).markdown,
    };
  }
  if (wfAny.creator) {
    (result as Record<string, unknown>).creator = wfAny.creator;
  }

  return result;
}

// --- Input step building ---

function _buildInputStep(inp: NormalizedFormat2Input, orderIndex: number): NormalizedNativeStep {
  const rawLabel = inp.id || `Input ${orderIndex}`;
  const label = isUnlabeled(rawLabel) ? undefined : rawLabel;

  let inputType: string | readonly string[] | null | undefined = inp.type;
  let multiple = false;
  if (Array.isArray(inputType)) {
    if (inputType.length !== 1) {
      throw new Error("Only simple arrays of workflow inputs are currently supported");
    }
    inputType = inputType[0] as string;
    multiple = true;
  }

  const typeStr: string = (inputType as string) ?? "data";

  let stepType: NormalizedNativeStep["type"];
  if (["File", "data", "data_input"].includes(typeStr)) {
    stepType = "data_input" as NormalizedNativeStep["type"];
  } else if (["collection", "data_collection", "data_collection_input"].includes(typeStr)) {
    stepType = "data_collection_input" as NormalizedNativeStep["type"];
  } else if (["text", "string", "integer", "int", "float", "color", "boolean"].includes(typeStr)) {
    stepType = "parameter_input" as NormalizedNativeStep["type"];
  } else {
    throw new Error(`Unknown input type [${typeStr}] encountered.`);
  }

  const toolState: Record<string, unknown> = { name: rawLabel };
  if (stepType === "parameter_input") {
    let nativeType = typeStr;
    if (nativeType === "int") nativeType = "integer";
    else if (nativeType === "string") nativeType = "text";
    toolState.parameter_type = nativeType;
  }
  if (multiple) toolState.multiple = true;
  if (inp.optional != null) toolState.optional = inp.optional;
  if ((inp as Record<string, unknown>).format) {
    toolState.format = (inp as Record<string, unknown>).format;
  }
  if (inp.collection_type) toolState.collection_type = inp.collection_type;
  if (inp.default != null) toolState.default = inp.default;

  // Copy extra fields
  for (const key of [
    "restrictions",
    "suggestions",
    "restrictOnConnections",
    "fields",
    "column_definitions",
  ]) {
    if (key in (inp as Record<string, unknown>)) {
      toolState[key] = (inp as Record<string, unknown>)[key];
    }
  }

  // Handle File class defaults: move to in_ nested default
  let inField: Record<string, unknown> | undefined;
  const defaultVal = inp.default;
  if (
    defaultVal &&
    typeof defaultVal === "object" &&
    (defaultVal as Record<string, unknown>).class === "File"
  ) {
    inField = { default: { default: defaultVal } };
    delete toolState.default;
  }

  return {
    id: orderIndex,
    type: stepType,
    label: label ?? null,
    name: rawLabel,
    annotation: _joinDoc(inp.doc) ?? "",
    tool_state: toolState,
    position: _defaultPosition(inp.position, orderIndex),
    input_connections: {},
    inputs: [{ name: rawLabel, description: "" }],
    outputs: [],
    workflow_outputs: [],
    post_job_actions: {},
    in: inField,
    connected_paths: new Set(),
  };
}

// --- Step building ---

function _buildStep(
  step: NormalizedFormat2Step,
  orderIndex: number,
  ctx: ConversionContext,
  options?: ToNativeOptions,
): NormalizedNativeStep {
  const stepType = _resolveStepType(step);

  if (stepType === "tool") return _buildToolStep(step, orderIndex, ctx, options);
  if (stepType === "subworkflow") return _buildSubworkflowStep(step, orderIndex, ctx, options);
  if (stepType === "pause") return _buildPauseStep(step, orderIndex, ctx);
  if (stepType === "pick_value") return _buildPickValueStep(step, orderIndex, ctx);
  throw new Error(`Unhandled step type: ${stepType}`);
}

function _resolveStepType(step: NormalizedFormat2Step): string {
  if (step.run != null) {
    if (typeof step.run === "object") {
      const runObj = step.run as Record<string, unknown>;
      if (runObj.class === "GalaxyUserTool") return "tool";
      return "subworkflow";
    }
    if (typeof step.run === "string") return "subworkflow";
  }
  const rawType = step.type ?? "tool";
  return STEP_TYPE_ALIASES[rawType] ?? rawType;
}

function _buildToolStep(
  step: NormalizedFormat2Step,
  orderIndex: number,
  ctx: ConversionContext,
  options?: ToNativeOptions,
): NormalizedNativeStep {
  // Detect GalaxyUserTool in run field
  let toolRepresentation: Record<string, unknown> | undefined;
  if (step.run && typeof step.run === "object") {
    const runObj = step.run as Record<string, unknown>;
    if (runObj.class === "GalaxyUserTool") {
      toolRepresentation = runObj;
    }
  }

  const toolState: Record<string, unknown> = { __page__: 0 };
  const connect = _extractConnections(step);
  const runtimeInputs = step.runtime_inputs ?? [];

  // Merge state: prefer stateful callback output if provided, else
  // fall back to step.state + runtime_inputs, else step.tool_state.
  const mergedState: Record<string, unknown> = step.state
    ? { ...(step.state as Record<string, unknown>) }
    : step.tool_state != null
      ? { ...(step.tool_state as Record<string, unknown>) }
      : {};
  for (const ri of runtimeInputs) {
    mergedState[ri] = { __class__: "RuntimeValue" };
  }

  const override = options?.stateEncodeToNative?.(step, mergedState);
  if (override != null) {
    Object.assign(toolState, override);
  } else if (step.state != null || runtimeInputs.length > 0) {
    const stepState = step.state ? { ...step.state } : {};
    Object.assign(toolState, stepState);
    for (const ri of runtimeInputs) {
      toolState[ri] = { __class__: "RuntimeValue" };
    }
  } else if (step.tool_state != null) {
    Object.assign(toolState, step.tool_state);
  }

  const inputConnections = _buildInputConnections(connect, ctx);
  const postJobActions = _buildPostJobActions(step.out);
  const connectedPaths = new Set(Object.keys(inputConnections));

  const isUserDefinedTool = toolRepresentation != null;
  const toolId = isUserDefinedTool ? null : (step.tool_id ?? undefined);

  return {
    id: orderIndex,
    type: "tool",
    label: _stepLabel(step),
    name: toolId ?? (toolRepresentation?.name as string) ?? "User Defined Tool",
    annotation: step.doc ?? "",
    tool_id: toolId,
    tool_version: step.tool_version ?? undefined,
    tool_shed_repository: step.tool_shed_repository as NormalizedNativeStep["tool_shed_repository"],
    tool_state: toolState,
    tool_representation: toolRepresentation,
    tool_uuid: isUserDefinedTool ? null : (step.uuid ?? undefined),
    input_connections: inputConnections,
    post_job_actions: postJobActions,
    position: _defaultPosition(step.position, orderIndex),
    when: step.when ?? undefined,
    uuid: step.uuid ?? undefined,
    errors: step.errors ?? undefined,
    inputs: [],
    outputs: [],
    workflow_outputs: [],
    connected_paths: connectedPaths,
  };
}

function _buildSubworkflowStep(
  step: NormalizedFormat2Step,
  orderIndex: number,
  ctx: ConversionContext,
  options?: ToNativeOptions,
): NormalizedNativeStep {
  let subworkflow: NormalizedNativeWorkflow | null = null;
  let contentId: string | null = null;

  let childCtx: ConversionContext | undefined;
  if (typeof step.run === "object" && step.run != null) {
    // Inline subworkflow
    childCtx = ctx.childContext();
    const subFmt2 = step.run as NormalizedFormat2Workflow;
    _registerLabels(subFmt2, childCtx);
    subworkflow = _buildNativeWorkflow(subFmt2, childCtx, options);
  } else if (typeof step.run === "string") {
    contentId = step.run;
  }

  const connect = _extractConnections(step);
  const isSubworkflow = subworkflow != null;
  const inputConnections = _buildInputConnections(connect, ctx, isSubworkflow, childCtx);
  const postJobActions = _buildPostJobActions(step.out);
  const connectedPaths = new Set(Object.keys(inputConnections));

  return {
    id: orderIndex,
    type: "subworkflow",
    label: _stepLabel(step),
    annotation: step.doc ?? "",
    tool_state: {},
    subworkflow,
    content_id: contentId,
    input_connections: inputConnections,
    post_job_actions: postJobActions,
    position: _defaultPosition(step.position, orderIndex),
    when: step.when ?? undefined,
    uuid: step.uuid ?? undefined,
    inputs: [],
    outputs: [],
    workflow_outputs: [],
    connected_paths: connectedPaths,
  };
}

function _buildPauseStep(
  step: NormalizedFormat2Step,
  orderIndex: number,
  ctx: ConversionContext,
): NormalizedNativeStep {
  const name = step.label ?? step.id ?? "Pause for dataset review";
  const connect = _extractConnections(step);
  const inputConnections = _buildInputConnections(connect, ctx);
  const connectedPaths = new Set(Object.keys(inputConnections));

  return {
    id: orderIndex,
    type: "pause",
    label: _stepLabel(step),
    name,
    annotation: step.doc ?? "",
    tool_state: { name },
    input_connections: inputConnections,
    inputs: [{ name, description: "" }],
    outputs: [],
    workflow_outputs: [],
    post_job_actions: {},
    position: _defaultPosition(step.position, orderIndex),
    uuid: step.uuid ?? undefined,
    connected_paths: connectedPaths,
  };
}

function _buildPickValueStep(
  step: NormalizedFormat2Step,
  orderIndex: number,
  ctx: ConversionContext,
): NormalizedNativeStep {
  const name = step.label ?? step.id ?? "Pick Value";
  const toolState: Record<string, unknown> = step.state ? { ...step.state } : {};
  toolState.name = name;

  const connect = _extractConnections(step);
  const inputConnections = _buildInputConnections(connect, ctx);
  const connectedPaths = new Set(Object.keys(inputConnections));

  const numInputs = Object.keys(inputConnections).length;
  if (numInputs > 0) {
    toolState.num_inputs = Math.max(2, numInputs);
  }

  const postJobActions = _buildPostJobActions([...step.out] as NormalizedFormat2StepOutput[]);

  return {
    id: orderIndex,
    type: "pick_value" as NormalizedNativeStep["type"],
    label: _stepLabel(step),
    name,
    annotation: step.doc ?? "",
    tool_state: toolState,
    input_connections: inputConnections,
    post_job_actions: postJobActions,
    inputs: [{ name, description: "" }],
    outputs: [],
    workflow_outputs: [],
    position: _defaultPosition(step.position, orderIndex),
    uuid: step.uuid ?? undefined,
    connected_paths: connectedPaths,
  };
}

// --- Connection building ---

function _extractConnections(step: NormalizedFormat2Step): Record<string, string[]> {
  const connect: Record<string, string[]> = {};
  for (const stepInput of step.in) {
    const inputId = stepInput.id;
    if (!inputId) continue;
    const source = stepInput.source;
    if (source != null) {
      if (Array.isArray(source)) {
        connect[inputId] = [...source] as string[];
      } else {
        connect[inputId] = [source as string];
      }
    }
  }
  return connect;
}

function _buildInputConnections(
  connect: Record<string, string[]>,
  ctx: ConversionContext,
  isSubworkflow = false,
  subworkflowCtx?: ConversionContext,
): Record<string, readonly unknown[]> {
  const inputConnections: Record<string, readonly unknown[]> = {};

  for (const [key, values] of Object.entries(connect)) {
    const connectionList: Record<string, unknown>[] = [];
    for (const value of values) {
      let src = value;
      if (key === "$step") {
        src = value + "/__NO_INPUT_OUTPUT_NAME__";
      }
      const [stepId, outputName] = ctx.stepOutput(src);
      const conn: Record<string, unknown> = { id: stepId, output_name: outputName };
      if (isSubworkflow && subworkflowCtx && subworkflowCtx.labels.has(key)) {
        conn.input_subworkflow_step_id = subworkflowCtx.stepId(key);
      }
      connectionList.push(conn);
    }

    const actualKey = key === "$step" ? "__NO_INPUT_OUTPUT_NAME__" : key;
    if (connectionList.length > 0) {
      inputConnections[actualKey] = connectionList;
    }
  }

  return inputConnections;
}

// --- Post job actions ---

function _buildPostJobActions(
  outputs: readonly NormalizedFormat2StepOutput[],
): Record<
  string,
  { action_type: string; output_name: string; action_arguments?: Record<string, unknown> }
> {
  const postJobActions: Record<
    string,
    { action_type: string; output_name: string; action_arguments?: Record<string, unknown> }
  > = {};

  for (const output of outputs) {
    const outputName = output.id;
    if (!outputName) continue;

    for (const [actionKey, actionDef] of Object.entries(POST_JOB_ACTIONS)) {
      let actionValue: unknown = (output as Record<string, unknown>)[actionKey] ?? undefined;
      if (actionValue === undefined || actionValue === null) {
        actionValue = actionDef.defaultVal;
      }
      // Truthy check (matches Python behavior: empty dict/array/false → skip)
      if (_isTruthy(actionValue)) {
        const actionName = actionDef.actionClass + outputName;
        postJobActions[actionName] = {
          action_type: actionDef.actionClass,
          output_name: outputName,
          action_arguments: actionDef.arguments(actionValue),
        };
      }
    }
  }

  return postJobActions;
}

function _isTruthy(val: unknown): boolean {
  if (val === false || val === null || val === undefined) return false;
  if (Array.isArray(val)) return val.length > 0;
  if (typeof val === "object") return Object.keys(val as Record<string, unknown>).length > 0;
  return !!val;
}

// --- Workflow output wiring ---

function _wireWorkflowOutputs(
  outputs: NormalizedFormat2Workflow["outputs"],
  nativeSteps: Record<string, NormalizedNativeStep>,
  ctx: ConversionContext,
): void {
  for (const output of outputs) {
    const source = output.outputSource;
    if (!source) continue;

    const [stepIdInt, outputName] = ctx.stepOutput(source);
    const stepKey = String(stepIdInt);
    if (!(stepKey in nativeSteps)) continue;

    const rawLabel = output.label ?? output.id;
    const label = rawLabel && rawLabel.startsWith("_anonymous_output_") ? null : rawLabel;

    const workflowOutput = {
      output_name: outputName,
      label: label ?? undefined,
    };
    (nativeSteps[stepKey].workflow_outputs as unknown[]).push(workflowOutput);
  }
}

// --- Comment conversion (format2 → native) ---

function _buildNativeComments(
  wf: NormalizedFormat2Workflow,
  ctx: ConversionContext,
): Record<string, unknown>[] | undefined {
  const rawCommentsValue = (wf as Record<string, unknown>).comments;
  if (!rawCommentsValue) return undefined;

  // Normalize dict-style comments to array
  let rawComments: Record<string, unknown>[];
  if (Array.isArray(rawCommentsValue)) {
    if (rawCommentsValue.length === 0) return undefined;
    rawComments = rawCommentsValue as Record<string, unknown>[];
  } else if (typeof rawCommentsValue === "object") {
    rawComments = Object.entries(rawCommentsValue as Record<string, unknown>).map(
      ([label, comment]) => ({ ...(comment as Record<string, unknown>), label }),
    );
    if (rawComments.length === 0) return undefined;
  } else {
    return undefined;
  }

  const commentLabelMap = new Map<string, number>();
  for (let i = 0; i < rawComments.length; i++) {
    const c = rawComments[i];
    if (c.label) {
      commentLabelMap.set(c.label as string, i);
    }
  }

  const result: Record<string, unknown>[] = [];
  for (let i = 0; i < rawComments.length; i++) {
    const nativeComment = unflattenCommentData(rawComments[i] as Record<string, unknown>);
    nativeComment.id = i;

    if (nativeComment.child_steps && Array.isArray(nativeComment.child_steps)) {
      nativeComment.child_steps = (nativeComment.child_steps as (string | number)[]).map((ref) =>
        typeof ref === "string" ? ctx.stepId(ref) : ref,
      );
    }

    if (nativeComment.child_comments && Array.isArray(nativeComment.child_comments)) {
      nativeComment.child_comments = (nativeComment.child_comments as (string | number)[]).map(
        (ref) => {
          if (typeof ref === "string") {
            if (!commentLabelMap.has(ref)) {
              throw new Error(`contains_comments references unknown comment label '${ref}'`);
            }
            return commentLabelMap.get(ref)!;
          }
          return ref;
        },
      );
    }

    result.push(nativeComment);
  }

  return result;
}

// --- Helpers ---

function _stepLabel(step: NormalizedFormat2Step): string | null | undefined {
  if (step.label != null) {
    if (isUnlabeled(step.label)) return null;
    return step.label;
  }
  if (step.id && !/^\d+$/.test(step.id)) {
    if (isUnlabeled(step.id)) return null;
    return step.id;
  }
  return null;
}

function _defaultPosition(position: unknown, orderIndex: number): { left: number; top: number } {
  if (position != null) return position as { left: number; top: number };
  return { left: 10 * orderIndex, top: 10 * orderIndex };
}

function _joinDoc(doc: string | string[] | null | undefined): string | null | undefined {
  if (doc == null) return doc;
  if (Array.isArray(doc)) return doc.length > 0 ? doc.join("\n") : null;
  return doc;
}
