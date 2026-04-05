/**
 * Precheck native workflow steps for stateful conversion compatibility.
 *
 * Checks whether a step's tool_state can be walked by the schema-aware
 * stateful converter, or whether it has issues (legacy replacement params,
 * legacy parameter encoding) that require falling back to schema-free
 * passthrough.
 *
 * Usage: called per-step by the stateful runner before conversion. A
 * failing precheck short-circuits `convert` and pushes a structured
 * `failureClass: "precheck"` status entry.
 *
 * Tool lookup is callback-shaped (`ToolInputsResolver`) matching the rest
 * of the stateful conversion pipeline — the caller owns tool loading and
 * version disambiguation.
 */

import type { NormalizedNativeWorkflow, NormalizedNativeStep } from "./normalized/native.js";
import type { ToolInputsResolver } from "./normalized/stateful-runner.js";
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
 * Precheck a single tool step's tool_state against its parameter inputs.
 *
 * Returns `canProcess: true` with empty reasons if the step is clean or
 * if no inputs were provided (caller falls back at conversion time).
 * Returns `canProcess: false` with reasons if legacy replacement params
 * or legacy parameter encoding is detected.
 *
 * Non-tool steps (inputs, subworkflows) always pass — they have no
 * tool_state to validate.
 */
export function precheckNativeStep(
  step: NormalizedNativeStep,
  inputs: ToolParameterModel[] | undefined,
): StepPrecheckResult {
  const stepId = String(step.id ?? "");
  const toolId = step.tool_id ?? undefined;
  const reasons: string[] = [];

  if (step.type !== "tool") {
    return { stepId, toolId, canProcess: true, skipReasons: [] };
  }
  if (inputs == null || toolId == null) {
    return { stepId, toolId, canProcess: true, skipReasons: [] };
  }

  // Legacy replacement parameters (${...}) in typed fields
  if (scanForReplacements(inputs, step.tool_state) === "yes") {
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

/**
 * Precheck every step in a native workflow using a tool inputs resolver.
 *
 * For each step calls `precheckNativeStep`. Returns a workflow-level
 * verdict (`canProcess` = all steps passed) plus per-step details, so
 * callers can still do per-step stateful conversion for clean steps.
 *
 * Passing `null` as the resolver is allowed and means "no tool inputs
 * available" — every step will pass (conversion-time fallback still runs).
 */
export function precheckNativeWorkflow(
  workflow: NormalizedNativeWorkflow,
  resolver: ToolInputsResolver | null,
): PrecheckResult {
  const stepResults: StepPrecheckResult[] = [];
  const workflowReasons: string[] = [];

  for (const [key, step] of Object.entries(workflow.steps)) {
    const inputs =
      resolver != null && step.tool_id != null
        ? resolver(step.tool_id, step.tool_version ?? null)
        : undefined;
    const stepResult = precheckNativeStep(step, inputs);
    if (stepResult.stepId === "") {
      stepResult.stepId = String(step.id ?? key);
    }
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
