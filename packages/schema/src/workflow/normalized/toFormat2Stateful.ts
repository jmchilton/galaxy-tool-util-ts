/**
 * Stateful native → format2 conversion.
 *
 * Wraps toFormat2() with a per-step state encoder that uses tool
 * parameter definitions to coerce scalar types, strip stale keys, and
 * route connected/runtime values into the `in` block. Falls back to
 * schema-free passthrough per step when the tool definition is
 * unavailable or conversion fails.
 */

import type { ToolParameterModel } from "../../schema/bundle-types.js";
import { toFormat2 } from "./toFormat2.js";
import type { Format2StateOverride, ToFormat2Options } from "./toFormat2.js";
import type { NormalizedFormat2Workflow } from "./format2.js";
import type { NormalizedNativeStep } from "./native.js";
import { convertStateToFormat2 } from "../stateful-convert.js";
import { makeStepConversionRunner, type StepConversionStatus } from "./stateful-runner.js";

export type { StepConversionStatus } from "./stateful-runner.js";

export interface StatefulExportResult {
  workflow: NormalizedFormat2Workflow;
  steps: StepConversionStatus[];
}

/**
 * Convert native → format2 using cached tool definitions for schema-aware
 * state re-encoding. Per-step failures fall back to schema-free passthrough
 * and are reported in the returned status array.
 */
export function toFormat2Stateful(
  raw: unknown,
  toolInputs: Map<string, ToolParameterModel[]>,
): StatefulExportResult {
  const steps: StepConversionStatus[] = [];

  const stateEncodeToFormat2 = makeStepConversionRunner<NormalizedNativeStep, Format2StateOverride>(
    {
      toolInputs,
      status: steps,
      isEligible: (step) => step.type === "tool",
      resolveIds: (step) => ({ stepId: String(step.id), toolId: step.tool_id ?? undefined }),
      convert: (step, inputs) => {
        const result = convertStateToFormat2(step, inputs);
        return { state: result.state, in: result.in };
      },
    },
  );

  const options: ToFormat2Options = { stateEncodeToFormat2 };
  const workflow = toFormat2(raw, options);

  return { workflow, steps };
}
