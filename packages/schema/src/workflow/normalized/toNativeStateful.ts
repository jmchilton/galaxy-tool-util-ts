/**
 * Stateful format2 → native conversion.
 *
 * Wraps toNative() with a per-step state encoder that uses tool parameter
 * definitions to reverse format2 coercions (number arrays → string arrays
 * for multi-select/data_column, etc.). Falls back to schema-free passthrough
 * per step when the tool definition is unavailable or conversion fails.
 *
 * Also validates the format2 input state (pre) and the reimported native
 * state (post) against the generated Effect schemas. Precheck doesn't
 * apply in this direction — it targets legacy *native* encoding.
 *
 * Tool lookup is callback-shaped (`ToolInputsResolver`) — the caller owns
 * tool loading and version disambiguation.
 */

import { toNative } from "./toNative.js";
import type { ToNativeOptions } from "./toNative.js";
import type { NormalizedNativeWorkflow } from "./native.js";
import type { NormalizedFormat2Step } from "./format2.js";
import { encodeStateToNative } from "../stateful-convert.js";
import { validateFormat2StepState, validateNativeStepState } from "../stateful-validate.js";
import {
  makeStepConversionRunner,
  type StepConversionStatus,
  type ToolInputsResolver,
} from "./stateful-runner.js";
import type { StatefulExportResult } from "./toFormat2Stateful.js";

export interface StatefulNativeResult {
  workflow: NormalizedNativeWorkflow;
  steps: StepConversionStatus[];
}

interface NativeEncodeArgs {
  step: NormalizedFormat2Step;
  state: Record<string, unknown>;
}

/**
 * Convert format2 → native using a tool inputs resolver for schema-aware
 * state re-encoding. Per-step failures fall back to schema-free passthrough
 * and are reported with a failure class (`unknown_tool`, `pre_validation`,
 * `conversion`, `post_validation`).
 */
export function toNativeStateful(
  raw: unknown,
  toolInputsResolver: ToolInputsResolver,
): StatefulNativeResult {
  const steps: StepConversionStatus[] = [];

  const runner = makeStepConversionRunner<NativeEncodeArgs, Record<string, unknown>>({
    toolInputsResolver,
    status: steps,
    // Skip subworkflow/pause/pick_value — only plain tool steps participate
    isEligible: ({ step }) => step.run == null && (step.type == null || step.type === "tool"),
    resolveIds: ({ step }) => ({
      stepId: String(step.id ?? step.label ?? ""),
      toolId: step.tool_id ?? undefined,
      toolVersion: step.tool_version ?? null,
    }),
    preValidate: ({ state }, inputs) => {
      validateFormat2StepState(inputs, state);
    },
    convert: ({ state }, inputs) => encodeStateToNative(inputs, state),
    postValidate: (result, inputs) => {
      // Reimported native state has no input_connections context here —
      // the structural toNative pass will re-attach them. We validate the
      // raw state dict without injected connections; ConnectedValue markers
      // stripped in the format2 input won't reappear in the walker output.
      validateNativeStepState(inputs, result);
    },
  });

  const stateEncodeToNative = (step: NormalizedFormat2Step, state: Record<string, unknown>) =>
    runner({ step, state });

  const options: ToNativeOptions = { stateEncodeToNative };
  const workflow = toNative(raw, options);

  return { workflow, steps };
}

export type { StepConversionStatus, StatefulExportResult, ToolInputsResolver };
