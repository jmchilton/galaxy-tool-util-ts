/**
 * Build a fresh workflow-step skeleton for an inserted tool.
 *
 * Two variants: `buildNativeStep` for `.ga` workflows, `buildFormat2Step` for
 * `.gxwf.yml` workflows. Both seed `tool_state` / `state` via
 * `buildMinimalToolState` so that if the minimum-state rules ever change, the
 * skeleton follows automatically.
 *
 * Defaults are deliberately uncreative: position `{0,0}`, no `input_connections`,
 * no outputs wiring. The consumer (VS Code AST inserter, CLI, etc.) is expected
 * to place and wire the step.
 */

import type { ParsedTool } from "../schema/parsed-tool.js";
import { buildMinimalToolState } from "./minimal-tool-state.js";
import type { NativeStep, StepPosition } from "./raw/native.effect.js";
import type { WorkflowStep } from "./raw/gxformat2.effect.js";

export interface StepSkeletonInputs {
  tool: ParsedTool;
  stepIndex?: number;
  label?: string;
  position?: StepPosition;
}

type FormatStepSkeletonInputs = StepSkeletonInputs & { format: "native" | "format2" };

const DEFAULT_POSITION: StepPosition = { top: 0, left: 0 };

export function buildNativeStep(inputs: StepSkeletonInputs): NativeStep {
  const { tool, stepIndex = 0, label, position = DEFAULT_POSITION } = inputs;
  const step: NativeStep = {
    id: stepIndex,
    type: "tool",
    name: tool.name,
    tool_id: tool.id,
    tool_version: tool.version,
    content_id: tool.id,
    label: label ?? null,
    annotation: null,
    errors: null,
    position,
    tool_state: buildMinimalToolState(tool),
    input_connections: {},
    inputs: [],
    outputs: [],
    workflow_outputs: [],
    post_job_actions: {},
  };
  return step;
}

export function buildFormat2Step(inputs: StepSkeletonInputs): WorkflowStep {
  const { tool, label, position = DEFAULT_POSITION } = inputs;
  const step: WorkflowStep = {
    label: label ?? tool.name,
    type: "tool",
    tool_id: tool.id,
    tool_version: tool.version,
    position,
    state: buildMinimalToolState(tool),
    in: {},
    out: [],
  };
  return step;
}

export function buildStep(inputs: FormatStepSkeletonInputs): NativeStep | WorkflowStep {
  const { format, ...rest } = inputs;
  return format === "native" ? buildNativeStep(rest) : buildFormat2Step(rest);
}
