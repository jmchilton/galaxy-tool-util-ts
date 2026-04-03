/**
 * Native → Format2 conversion.
 *
 * Port of gxformat2/normalized/_conversion.py to_format2 + helpers.
 */

import type { NormalizedNativeWorkflow, NormalizedNativeStep } from "./native.js";
import { normalizedNative } from "./native.js";
import type {
  NormalizedFormat2Workflow,
  NormalizedFormat2Step,
  NormalizedFormat2Input,
  NormalizedFormat2Output,
  NormalizedFormat2StepInput,
  NormalizedFormat2StepOutput,
} from "./format2.js";
import { flattenCommentData } from "./comments.js";
import { UNLABELED_INPUT_PREFIX, UNLABELED_STEP_PREFIX, isUnlabeled, Labels } from "./labels.js";

// Effect schemas produce deeply-readonly types. We build plain objects
// and cast — runtime semantics are identical.

// Step types that represent workflow inputs
const INPUT_STEP_TYPES = new Set(["data_input", "data_collection_input", "parameter_input"]);

/**
 * Convert a native Galaxy workflow to normalized Format2.
 */
export function toFormat2(raw: unknown): NormalizedFormat2Workflow {
  const wf = normalizedNative(raw);
  return _buildFormat2Workflow(wf);
}

function _buildFormat2Workflow(wf: NormalizedNativeWorkflow): NormalizedFormat2Workflow {
  // Build label map: step key → label string
  const labelMap = new Map<string, string>();
  for (const [key, step] of Object.entries(wf.steps)) {
    if (step.label != null) {
      labelMap.set(String(key), step.label);
    } else if (INPUT_STEP_TYPES.has(step.type as string)) {
      labelMap.set(String(key), `${UNLABELED_INPUT_PREFIX}${step.id}`);
    } else {
      labelMap.set(String(key), `${UNLABELED_STEP_PREFIX}${step.id}`);
    }
  }

  // Build workflow outputs from step workflow_outputs
  const labels = new Labels();
  const outputParams: NormalizedFormat2Output[] = [];
  for (const step of Object.values(wf.steps)) {
    for (const wo of step.workflow_outputs) {
      const source = _toSource(wo.output_name as string, labelMap, step.id);
      const outputId = labels.ensureNewOutputLabel(wo.label as string | null);
      outputParams.push({ id: outputId, outputSource: source });
    }
  }

  // Separate inputs from non-input steps
  const inputParams: NormalizedFormat2Input[] = [];
  const fmt2Steps: NormalizedFormat2Step[] = [];

  for (const step of Object.values(wf.steps)) {
    if (INPUT_STEP_TYPES.has(step.type as string)) {
      inputParams.push(_buildInputParam(step));
    } else {
      fmt2Steps.push(_buildFormat2Step(step, labelMap));
    }
  }

  // Replace anonymous subworkflow output references
  _replaceAnonymousOutputReferences(outputParams, fmt2Steps);

  // Convert comments
  const comments = _buildFormat2Comments(wf, labelMap);

  const wfAny = wf as Record<string, unknown>;
  const result: Record<string, unknown> = {
    class: "GalaxyWorkflow",
    label: (wf.name as string) ?? null,
    doc: (wf.annotation as string) || null,
    inputs: inputParams,
    outputs: outputParams,
    steps: fmt2Steps,
    tags: wf.tags as string[],
    uuid: wf.uuid as string | undefined,
    license: wf.license ?? undefined,
    release: wf.release ?? undefined,
    unique_tools: wf.unique_tools,
  };
  if (comments) result.comments = comments;
  if (wfAny.report)
    result.report = { markdown: (wfAny.report as Record<string, unknown>).markdown };
  if (wfAny.creator) result.creator = wfAny.creator;
  return result as unknown as NormalizedFormat2Workflow;
}

// --- Input parameter building ---

function _nativeInputToFormat2Type(
  stepType: string,
  toolState: Record<string, unknown>,
): string | string[] {
  if (stepType === "data_collection_input") return "collection";
  if (stepType === "data_input") return "data";
  if (stepType === "parameter_input") {
    const nativeType = (toolState.parameter_type as string) ?? "";
    let format2Type = nativeType;
    if (nativeType === "integer") format2Type = "int";
    else if (nativeType === "text") format2Type = "string";
    if (toolState.multiple) return [format2Type];
    return format2Type;
  }
  return "data";
}

function _buildInputParam(step: NormalizedNativeStep): NormalizedFormat2Input {
  const stepId = step.label ?? `${UNLABELED_INPUT_PREFIX}${step.id}`;
  const inputType = _nativeInputToFormat2Type(step.type as string, step.tool_state);

  const result: Record<string, unknown> = { id: stepId, type: inputType };

  const ts = step.tool_state;
  for (const key of [
    "collection_type",
    "optional",
    "format",
    "default",
    "restrictions",
    "suggestions",
    "restrictOnConnections",
    "fields",
    "column_definitions",
  ]) {
    if (key in ts) {
      if (key === "format") {
        const fmt = ts[key];
        result[key] = typeof fmt === "string" ? [fmt] : fmt;
      } else {
        result[key] = ts[key];
      }
    }
  }

  if (step.annotation) result.doc = step.annotation;
  if (step.position) result.position = step.position;

  return result as unknown as NormalizedFormat2Input;
}

// --- Step identity ---

function _resolveStepIdentity(
  step: NormalizedNativeStep,
  labelMap: Map<string, string>,
): { stepId: string; displayLabel: string | undefined } {
  const rawLabel = step.label ?? labelMap.get(String(step.id));
  const stepId = rawLabel ?? String(step.id);
  const displayLabel = rawLabel && isUnlabeled(rawLabel) ? undefined : rawLabel;
  return { stepId, displayLabel };
}

// --- Step building ---

function _buildFormat2Step(
  step: NormalizedNativeStep,
  labelMap: Map<string, string>,
): NormalizedFormat2Step {
  const moduleType = step.type as string;
  if (moduleType === "subworkflow") {
    return _buildSubworkflowFormat2Step(step, labelMap);
  }
  if (moduleType === "pause") {
    return _buildPauseFormat2Step(step, labelMap);
  }
  if (moduleType === "pick_value") {
    return _buildPickValueFormat2Step(step, labelMap);
  }
  // Default: tool
  return _buildToolFormat2Step(step, labelMap);
}

function _buildToolFormat2Step(
  step: NormalizedNativeStep,
  labelMap: Map<string, string>,
): NormalizedFormat2Step {
  // User-defined tool: tool_representation with class GalaxyUserTool
  const toolRep = step.tool_representation as Record<string, unknown> | null | undefined;
  if (toolRep && toolRep.class === "GalaxyUserTool") {
    return _buildUserToolFormat2Step(step, labelMap);
  }

  const inList = _buildFormat2StepInputs(step, labelMap);
  const outList = _buildFormat2StepOutputs(step);

  // Tool state: strip __page__ and __rerun_remap_job_id__
  let toolState: Record<string, unknown> | null | undefined = null;
  const ts = { ...step.tool_state };
  delete ts.__page__;
  delete ts.__rerun_remap_job_id__;
  if (Object.keys(ts).length > 0) {
    toolState = ts;
  }

  const { stepId, displayLabel } = _resolveStepIdentity(step, labelMap);

  return {
    id: stepId,
    label: displayLabel ?? undefined,
    doc: (step.annotation as string) || undefined,
    tool_id: step.tool_id ?? undefined,
    tool_version: step.tool_version ?? undefined,
    tool_shed_repository:
      step.tool_shed_repository as NormalizedFormat2Step["tool_shed_repository"],
    in: inList,
    out: outList,
    tool_state: toolState,
    position: step.position as NormalizedFormat2Step["position"],
    when: step.when ?? undefined,
    uuid: step.uuid ?? undefined,
    errors: step.errors ?? undefined,
  };
}

function _buildUserToolFormat2Step(
  step: NormalizedNativeStep,
  labelMap: Map<string, string>,
): NormalizedFormat2Step {
  const inList = _buildFormat2StepInputs(step, labelMap);
  const outList = _buildFormat2StepOutputs(step);
  const { stepId, displayLabel } = _resolveStepIdentity(step, labelMap);

  return {
    id: stepId,
    label: displayLabel ?? undefined,
    doc: (step.annotation as string) || undefined,
    run: step.tool_representation as NormalizedFormat2Step["run"],
    in: inList,
    out: outList,
    position: step.position as NormalizedFormat2Step["position"],
  };
}

function _buildSubworkflowFormat2Step(
  step: NormalizedNativeStep,
  labelMap: Map<string, string>,
): NormalizedFormat2Step {
  const inList = _buildFormat2StepInputs(step, labelMap);
  const outList = _buildFormat2StepOutputs(step);

  let run: NormalizedFormat2Workflow | string | null | undefined = null;
  const contentSource = (step as Record<string, unknown>).content_source as string | undefined;
  if ((contentSource === "url" || contentSource === "trs_url") && step.content_id) {
    // URL/TRS reference passes through as string
    run = step.content_id as string;
  } else if (step.subworkflow != null) {
    run = _buildFormat2Workflow(step.subworkflow);
  } else if (step.content_id) {
    // Other content_id (e.g. direct reference)
    run = step.content_id as string;
  }

  const { stepId, displayLabel } = _resolveStepIdentity(step, labelMap);

  return {
    id: stepId,
    label: displayLabel ?? undefined,
    doc: (step.annotation as string) || undefined,
    run,
    in: inList,
    out: outList,
    position: step.position as NormalizedFormat2Step["position"],
    when: step.when ?? undefined,
    uuid: step.uuid ?? undefined,
  };
}

function _buildPauseFormat2Step(
  step: NormalizedNativeStep,
  labelMap: Map<string, string>,
): NormalizedFormat2Step {
  const inList = _buildFormat2StepInputs(step, labelMap);
  const { stepId, displayLabel } = _resolveStepIdentity(step, labelMap);

  return {
    id: stepId,
    label: displayLabel ?? undefined,
    doc: (step.annotation as string) || undefined,
    type: "pause",
    in: inList,
    out: [],
    position: step.position as NormalizedFormat2Step["position"],
  };
}

function _buildPickValueFormat2Step(
  step: NormalizedNativeStep,
  labelMap: Map<string, string>,
): NormalizedFormat2Step {
  const inList = _buildFormat2StepInputs(step, labelMap);
  const outList = _buildFormat2StepOutputs(step);
  const { stepId, displayLabel } = _resolveStepIdentity(step, labelMap);

  let state: Record<string, unknown> | undefined;
  if ("mode" in step.tool_state) {
    state = { mode: step.tool_state.mode };
  }

  return {
    id: stepId,
    label: displayLabel ?? undefined,
    doc: (step.annotation as string) || undefined,
    type: "pick_value",
    state,
    in: inList,
    out: outList,
    position: step.position as NormalizedFormat2Step["position"],
  };
}

// --- Step inputs from input_connections ---

function _buildFormat2StepInputs(
  step: NormalizedNativeStep,
  labelMap: Map<string, string>,
): NormalizedFormat2StepInput[] {
  const inList: NormalizedFormat2StepInput[] = [];

  // Preserve existing 'in' defaults
  const defaults = new Map<string, unknown>();
  if (step.in != null) {
    for (const [key, value] of Object.entries(step.in)) {
      if (value && typeof value === "object" && "default" in (value as Record<string, unknown>)) {
        defaults.set(key, (value as Record<string, unknown>).default);
      }
    }
  }

  for (const [inputName, inputDefs] of Object.entries(step.input_connections)) {
    const defs = Array.isArray(inputDefs) ? inputDefs : [inputDefs];
    const sources: string[] = [];
    for (const inputDef of defs) {
      const def = inputDef as Record<string, unknown>;
      const source = _toSource(def.output_name as string, labelMap, def.id as number);
      sources.push(source);
    }

    let actualName = inputName;
    let resolvedSources = sources;
    if (inputName === "__NO_INPUT_OUTPUT_NAME__") {
      actualName = "$step";
      resolvedSources = sources.map((s) =>
        s.includes("/__NO_INPUT_OUTPUT_NAME__") ? s.split("/__NO_INPUT_OUTPUT_NAME__")[0] : s,
      );
    }

    const sourceVal = resolvedSources.length === 1 ? resolvedSources[0] : resolvedSources;
    const def = defaults.get(actualName);
    defaults.delete(actualName);

    const entry: Record<string, unknown> = { id: actualName, source: sourceVal };
    if (def !== undefined) entry.default = def;
    inList.push(entry as unknown as NormalizedFormat2StepInput);
  }

  // Add remaining defaults without connections
  for (const [key, def] of defaults) {
    inList.push({ id: key, default: def });
  }

  return inList;
}

// --- Step outputs from post_job_actions ---

function _buildFormat2StepOutputs(step: NormalizedNativeStep): NormalizedFormat2StepOutput[] {
  if (!step.post_job_actions || Object.keys(step.post_job_actions).length === 0) {
    return [];
  }

  const outputsByName = new Map<string, Record<string, unknown>>();

  for (const pja of Object.values(step.post_job_actions)) {
    const actionType = pja.action_type as string;
    const outputName = pja.output_name as string;
    const actionArgs = (pja.action_arguments ?? {}) as Record<string, unknown>;

    if (!outputsByName.has(outputName)) {
      outputsByName.set(outputName, {});
    }
    const outputDict = outputsByName.get(outputName)!;

    if (actionType === "RenameDatasetAction") {
      outputDict.rename = actionArgs.newname;
    } else if (actionType === "HideDatasetAction") {
      outputDict.hide = true;
    } else if (actionType === "DeleteIntermediatesAction") {
      outputDict.delete_intermediate_datasets = true;
    } else if (actionType === "ChangeDatatypeAction") {
      outputDict.change_datatype = actionArgs.newtype;
    } else if (actionType === "TagDatasetAction") {
      outputDict.add_tags = (actionArgs.tags as string).split(",");
    } else if (actionType === "RemoveTagDatasetAction") {
      outputDict.remove_tags = (actionArgs.tags as string).split(",");
    } else if (actionType === "ColumnSetAction") {
      if (actionArgs && Object.keys(actionArgs).length > 0) {
        outputDict.set_columns = actionArgs;
      }
    }
  }

  const result: NormalizedFormat2StepOutput[] = [];
  for (const [name, props] of outputsByName) {
    result.push({ id: name, ...props } as NormalizedFormat2StepOutput);
  }
  return result;
}

// --- Source reference ---

function _toSource(outputName: string, labelMap: Map<string, string>, stepId: number): string {
  const outputLabel = labelMap.get(String(stepId)) ?? String(stepId);
  if (outputName === "output") {
    return outputLabel;
  }
  return `${outputLabel}/${outputName}`;
}

// --- Anonymous output reference rewriting ---

function _replaceAnonymousOutputReferences(
  outputParams: NormalizedFormat2Output[],
  fmt2Steps: NormalizedFormat2Step[],
): void {
  const runsByLabel = new Map<string, NormalizedFormat2Workflow>();
  for (const step of fmt2Steps) {
    const label = step.label ?? step.id;
    if (step.run && typeof step.run === "object") {
      runsByLabel.set(String(label), step.run as NormalizedFormat2Workflow);
    }
  }

  for (const out of outputParams) {
    const source = out.outputSource;
    if (!source || !source.includes("/")) continue;
    const [stepLabel, outputName] = source.split("/", 2);
    if (!outputName.includes(":")) continue;

    const [innerStepId, innerOutputName] = outputName.split(":", 2);
    const subworkflow = runsByLabel.get(stepLabel);
    if (!subworkflow) continue;

    const targetSuffix = `/${innerOutputName}`;
    for (const subOut of subworkflow.outputs) {
      const subSrc = subOut.outputSource;
      if (subSrc && subSrc.endsWith(targetSuffix)) {
        // Verify the step portion refers to the right inner step
        const subStepRef = subSrc.slice(0, -targetSuffix.length);
        if (subStepRef === innerStepId || subStepRef.endsWith(innerStepId)) {
          (out as Record<string, unknown>).outputSource = `${stepLabel}/${subOut.id}`;
          break;
        }
      }
    }
  }
}

// --- Comment conversion (native → format2) ---

function _buildFormat2Comments(
  wf: NormalizedNativeWorkflow,
  labelMap: Map<string, string>,
): Record<string, unknown>[] | undefined {
  const rawComments = (wf as Record<string, unknown>).comments;
  if (!rawComments || !Array.isArray(rawComments) || rawComments.length === 0) {
    return undefined;
  }

  const commentLabelMap = new Map<number, string>();
  for (let i = 0; i < rawComments.length; i++) {
    const c = rawComments[i] as Record<string, unknown>;
    if (c.label) {
      commentLabelMap.set(i, c.label as string);
    }
  }

  const result: Record<string, unknown>[] = [];
  for (const nativeComment of rawComments) {
    const fmt2 = flattenCommentData(nativeComment as Record<string, unknown>);

    if (fmt2.type === "frame") {
      if (fmt2.contains_steps && Array.isArray(fmt2.contains_steps)) {
        fmt2.contains_steps = (fmt2.contains_steps as (string | number)[]).map(
          (idx) => labelMap.get(String(idx)) ?? idx,
        );
      }
      if (fmt2.contains_comments && Array.isArray(fmt2.contains_comments)) {
        fmt2.contains_comments = (fmt2.contains_comments as number[]).map(
          (idx) => commentLabelMap.get(idx) ?? idx,
        );
      }
    }

    result.push(fmt2);
  }

  return result;
}
