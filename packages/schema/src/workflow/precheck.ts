/**
 * Precheck native workflows for stateful conversion compatibility.
 *
 * Checks whether a workflow can be processed by stateful conversion, or
 * whether it has issues (legacy replacement params, legacy parameter encoding)
 * that require falling back to schema-free passthrough.
 *
 * Usage: call before attempting stateful conversion. If canProcess is false,
 * use schema-free conversion for the whole workflow (or per step).
 */

import type { NormalizedNativeWorkflow, NormalizedNativeStep } from "./normalized/native.js";
import type { ToolParameterModel } from "../schema/bundle-types.js";
import { scanForReplacements } from "./replacement-scan.js";
import { scanToolState } from "./legacy-encoding.js";

export interface StepPrecheckResult {
  stepId: string;
  toolId?: string;
  canProcess: boolean;
  skipReasons: string[];
}

export interface PrecheckResult {
  canProcess: boolean;
  skipReasons: string[];
  stepResults: StepPrecheckResult[];
}

/**
 * Precheck a native workflow for stateful conversion compatibility.
 *
 * For each tool step:
 * - If tool inputs are provided, scan for `${...}` replacement params in
 *   typed fields (→ can't process) and for legacy parameter encoding
 *   (string-encoded containers → can't process).
 * - Non-tool steps (inputs, subworkflows, etc.) are always processable.
 *
 * Returns a workflow-level verdict plus per-step details. If any step
 * can't be processed, the workflow-level canProcess is false, but the
 * caller can still do per-step stateful conversion for the clean steps.
 */
export function precheckNativeWorkflow(
  workflow: NormalizedNativeWorkflow,
  toolInputs?: Map<string, ToolParameterModel[]>,
): PrecheckResult {
  const stepResults: StepPrecheckResult[] = [];
  const workflowReasons: string[] = [];

  for (const [key, step] of Object.entries(workflow.steps)) {
    const stepResult = _precheckStep(key, step, toolInputs);
    stepResults.push(stepResult);
    if (!stepResult.canProcess) {
      for (const reason of stepResult.skipReasons) {
        workflowReasons.push(`step ${stepResult.stepId}: ${reason}`);
      }
    }
  }

  return {
    canProcess: workflowReasons.length === 0,
    skipReasons: workflowReasons,
    stepResults,
  };
}

function _precheckStep(
  stepKey: string,
  step: NormalizedNativeStep,
  toolInputs?: Map<string, ToolParameterModel[]>,
): StepPrecheckResult {
  const stepId = String(step.id ?? stepKey);
  const toolId = step.tool_id ?? undefined;
  const reasons: string[] = [];

  // Non-tool steps pass through precheck (no tool_state to validate)
  if (step.type !== "tool") {
    return { stepId, toolId, canProcess: true, skipReasons: [] };
  }

  // No tool inputs available: caller didn't provide them — treat as
  // processable (caller will fall back at conversion time if needed)
  if (toolInputs == null || toolId == null) {
    return { stepId, toolId, canProcess: true, skipReasons: [] };
  }

  const inputs = toolInputs.get(toolId);
  if (inputs == null) {
    return { stepId, toolId, canProcess: true, skipReasons: [] };
  }

  // Legacy replacement parameters (${...}) in typed fields
  const replacementClass = scanForReplacements(inputs, step.tool_state);
  if (replacementClass === "yes") {
    reasons.push("legacy replacement parameter (${...}) in typed field");
  }

  // Legacy parameter encoding (string-encoded containers)
  const encodingResult = scanToolState(inputs, step.tool_state);
  if (encodingResult.classification === "yes") {
    const details = encodingResult.hits.map((h) => `${h.parameterName}: ${h.detail}`).join("; ");
    reasons.push(`legacy parameter encoding detected (${details})`);
  }

  return {
    stepId,
    toolId,
    canProcess: reasons.length === 0,
    skipReasons: reasons,
  };
}
