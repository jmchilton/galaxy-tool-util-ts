/**
 * Stateful native → format2 conversion.
 *
 * Wraps toFormat2() with a per-step state encoder that uses tool
 * parameter definitions to coerce scalar types, strip stale keys, and
 * route connected/runtime values into the `in` block. Falls back to
 * schema-free passthrough per step when the tool definition is
 * unavailable or conversion fails.
 *
 * Tool lookup is callback-shaped (`ToolInputsResolver`) matching
 * gxformat2's `ConversionOptions.state_encode_to_format2` design — the
 * caller owns tool loading and version disambiguation.
 */

import { toFormat2 } from "./toFormat2.js";
import type { Format2StateOverride, ToFormat2Options } from "./toFormat2.js";
import type { NormalizedFormat2Workflow } from "./format2.js";
import type { NormalizedNativeStep } from "./native.js";
import { convertStateToFormat2 } from "../stateful-convert.js";
import {
  makeStepConversionRunner,
  type StepConversionStatus,
  type ToolInputsResolver,
} from "./stateful-runner.js";

export type { StepConversionStatus, ToolInputsResolver } from "./stateful-runner.js";

export interface StatefulExportResult {
  workflow: NormalizedFormat2Workflow;
  steps: StepConversionStatus[];
}

/**
 * Convert native → format2 using a tool inputs resolver for schema-aware
 * state re-encoding. Per-step failures fall back to schema-free passthrough
 * and are reported in the returned status array.
 */
export function toFormat2Stateful(
  raw: unknown,
  toolInputsResolver: ToolInputsResolver,
): StatefulExportResult {
  const steps: StepConversionStatus[] = [];

  const stateEncodeToFormat2 = makeStepConversionRunner<NormalizedNativeStep, Format2StateOverride>(
    {
      toolInputsResolver,
      status: steps,
      isEligible: (step) => step.type === "tool",
      resolveIds: (step) => ({
        stepId: String(step.id),
        toolId: step.tool_id ?? undefined,
        toolVersion: step.tool_version ?? null,
      }),
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
